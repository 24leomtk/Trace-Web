"use server"

import { and, desc, eq, ilike, or } from "drizzle-orm"

import { db } from "@/db"
import {
  branches,
  citationPayments,
  courtCaseAccess,
  organizations,
  records,
  trafficCitations,
  users,
  vehicles,
} from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { citationBalance, generateReceiptNo, isCitationPaid } from "@/lib/format"
import { writeAuditTx } from "@/lib/server/audit"
import { canViewRecord, escapeLike } from "@/lib/visibility"
import {
  citationCourtScheduleSchema,
  citationPaymentSchema,
  citationVoidSchema,
} from "@/validations/admin"
import { getViewerScope, type ViewerScope } from "@/lib/actions/records"
import { notifyUser } from "@/lib/actions/notifications"

function isMonitor(scope: ViewerScope): boolean {
  return scope.role === "DISTRICT_MONITOR" || scope.role === "COUNTRY_MONITOR"
}

/** Reporter or an in-scope monitor — the old paid-toggle rule (kept for court scheduling). */
function canManageCitation(
  scope: ViewerScope,
  record: typeof records.$inferSelect
): boolean {
  if (record.reportedBy === scope.id) return true
  return (
    isMonitor(scope) &&
    record.domain === scope.domain &&
    (scope.role === "COUNTRY_MONITOR"
      ? record.accessLevel === "country"
      : record.district === scope.district)
  )
}

/**
 * Phase 1 (records review R2): any active police user in the same domain
 * can RECEIVE a payment — branch/district gates do not apply to money.
 * Reading the case file still follows `canViewRecord`; finding the ticket
 * to receipt follows `findCitationByTicket` (ticket-number lookup).
 */
function canReceivePayment(
  scope: ViewerScope,
  record: typeof records.$inferSelect
): boolean {
  if (
    scope.role !== "OFFICER" &&
    scope.role !== "DISTRICT_MONITOR" &&
    scope.role !== "COUNTRY_MONITOR"
  ) {
    return false
  }
  return record.domain === scope.domain
}

/** Live (unexpired, unrevoked) court grant — mirrors records.ts's gate. */
async function hasLiveGrant(recordId: string, liaisonId: string): Promise<boolean> {
  const grants = await db
    .select({
      revokedAt: courtCaseAccess.revokedAt,
      expiresAt: courtCaseAccess.expiresAt,
    })
    .from(courtCaseAccess)
    .where(
      and(
        eq(courtCaseAccess.recordId, recordId),
        eq(courtCaseAccess.courtLiaisonId, liaisonId)
      )
    )
  const now = new Date()
  return grants.some(
    (grant) => !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > now)
  )
}

export interface CitationPaymentRow {
  id: string
  amount: number
  receiptNo: string
  note: string | null
  payerName: string | null
  paymentMethod: string | null
  channel: string | null
  receivingBranchName: string | null
  receivedByName: string | null
  createdAt: string
}

export interface CitationLedger {
  recordId: string
  ticketNumber: string | null
  statuteCode: string | null
  dueDate: string | null
  voidedAt: string | null
  voidReason: string | null
  plateNumber: string | null
  violationType: string
  driverName: string | null
  location: string | null
  dateIssued: string | null
  fineAmount: number | null
  totalPaid: number
  balance: number | null
  isPaid: boolean
  courtDate: string | null
  courtId: string | null
  courtName: string | null
  payments: CitationPaymentRow[]
}

/** Full ledger for one citation — police in scope, or a liaison with a live grant. */
export async function getCitationLedger(recordId: string): Promise<CitationLedger> {
  const scope = await getViewerScope()
  const [record] = await db
    .select()
    .from(records)
    .where(eq(records.id, recordId))
    .limit(1)
  if (!record || record.recordType !== "traffic_citation") {
    throw new Error("Citation not found.")
  }
  const allowed =
    canViewRecord(scope, record) ||
    (scope.role === "COURT_LIAISON" && (await hasLiveGrant(recordId, scope.id)))
  if (!allowed) throw new Error("That case is outside your scope.")

  return withUserCtx(scope.id, async (tx) => {
    const [projection] = await tx
      .select()
      .from(trafficCitations)
      .where(eq(trafficCitations.recordId, recordId))
      .limit(1)
    if (!projection) throw new Error("Citation not found.")

    const [vehicle] = projection.vehicleId
      ? await tx
          .select({ plateNumber: vehicles.plateNumber })
          .from(vehicles)
          .where(eq(vehicles.id, projection.vehicleId))
          .limit(1)
      : []
    const [court] = projection.courtId
      ? await tx
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, projection.courtId))
          .limit(1)
      : []

    const rows = await tx
      .select({
        id: citationPayments.id,
        amount: citationPayments.amount,
        receiptNo: citationPayments.receiptNo,
        note: citationPayments.note,
        payerName: citationPayments.payerName,
        paymentMethod: citationPayments.paymentMethod,
        channel: citationPayments.channel,
        receivingBranchId: citationPayments.receivingBranchId,
        receivedBy: citationPayments.receivedBy,
        createdAt: citationPayments.createdAt,
      })
      .from(citationPayments)
      .where(eq(citationPayments.recordId, recordId))
      .orderBy(desc(citationPayments.createdAt))

    const payments: CitationPaymentRow[] = []
    for (const row of rows) {
      const [receiver] = row.receivedBy
        ? await tx
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, row.receivedBy))
            .limit(1)
        : []
      const [receivingBranch] = row.receivingBranchId
        ? await tx
            .select({ name: branches.name })
            .from(branches)
            .where(eq(branches.id, row.receivingBranchId))
            .limit(1)
        : []
      payments.push({
        id: row.id,
        amount: Number(row.amount),
        receiptNo: row.receiptNo,
        note: row.note,
        payerName: row.payerName,
        paymentMethod: row.paymentMethod,
        channel: row.channel,
        receivingBranchName: receivingBranch?.name ?? null,
        receivedByName: receiver?.name ?? null,
        createdAt: row.createdAt.toISOString(),
      })
    }

    const data = (record.data ?? {}) as Record<string, unknown>
    const fine = projection.fineAmount != null ? Number(projection.fineAmount) : null
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0)
    return {
      recordId,
      ticketNumber: projection.ticketNumber ?? null,
      statuteCode: projection.statuteCode ?? null,
      dueDate: projection.dueDate ?? null,
      voidedAt: projection.voidedAt ? projection.voidedAt.toISOString() : null,
      voidReason: projection.voidReason ?? null,
      plateNumber:
        vehicle?.plateNumber ??
        (typeof data.plate_number === "string" ? data.plate_number : null),
      violationType: projection.violationType,
      driverName: typeof data.driver_name === "string" ? data.driver_name : null,
      location: typeof data.location === "string" ? data.location : null,
      dateIssued: typeof data.date_issued === "string" ? data.date_issued : null,
      fineAmount: fine,
      totalPaid,
      balance: citationBalance(fine, totalPaid),
      isPaid: projection.isPaid,
      courtDate: projection.courtDate ?? null,
      courtId: projection.courtId ?? null,
      courtName: court?.name ?? null,
      payments,
    }
  })
}

/** Courts available for scheduling (police roles only). */
export async function listCourtOptions(): Promise<{ id: string; name: string }[]> {
  const scope = await getViewerScope()
  if (
    scope.role !== "OFFICER" &&
    scope.role !== "DISTRICT_MONITOR" &&
    scope.role !== "COUNTRY_MONITOR"
  ) {
    throw new Error("Police users only.")
  }
  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.orgType, "court"))
    .orderBy(organizations.name)
    .limit(100)
}

/**
 * Record a fine payment. Phase 1: any in-domain officer/monitor can receive
 * (cross-branch by design); the issuer receipting their own ticket needs a
 * named countersign. Partial payments allowed; overpayments rejected;
 * `is_paid` is recomputed from the ledger total (F3).
 */
export async function recordCitationPayment(input: {
  recordId: string
  amount: number
  receiptNo?: string
  note?: string
  payerName: string
  paymentMethod: "cash" | "mobile" | "bank"
  channel?: "counter" | "mobile" | "clerk"
  receivingBranchId?: string
  countersignedBy?: string
}): Promise<{ receiptNo: string; balance: number | null; isPaid: boolean }> {
  const scope = await getViewerScope()
  const parsed = citationPaymentSchema.safeParse(input)
  if (!parsed.success) throw new Error("The payment didn't pass validation.")

  return withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, parsed.data.recordId))
      .limit(1)
    if (!record || record.recordType !== "traffic_citation") {
      throw new Error("Citation not found.")
    }
    if (!canReceivePayment(scope, record)) {
      throw new Error("Only police users in the same domain can receive payments.")
    }
    // Issuer ≠ receiver: the filing officer cannot receipt their own ticket
    // alone — prevents silent self-clearing (Platte County lesson).
    if (record.reportedBy === scope.id && !parsed.data.countersignedBy?.trim()) {
      throw new Error(
        "You filed this ticket — name a countersigning officer/monitor to receipt it."
      )
    }
    const [projection] = await tx
      .select()
      .from(trafficCitations)
      .where(eq(trafficCitations.recordId, record.id))
      .limit(1)
    if (!projection) throw new Error("Citation not found.")
    if (projection.voidedAt) throw new Error("This ticket was voided — no payments accepted.")

    // Resolve the receiving branch: officers stamp their own branch;
    // monitors may receipt on behalf of another in-scope branch counter.
    let receivingBranchId: string | null = null
    if (scope.role === "OFFICER") {
      if (!scope.branchId) throw new Error("Your account has no branch.")
      receivingBranchId = scope.branchId
    } else if (parsed.data.receivingBranchId) {
      const [branch] = await tx
        .select({ id: branches.id, domain: branches.domain, district: branches.district })
        .from(branches)
        .where(eq(branches.id, parsed.data.receivingBranchId))
        .limit(1)
      if (!branch || branch.domain !== scope.domain) {
        throw new Error("That receiving branch is outside your scope.")
      }
      if (scope.role === "DISTRICT_MONITOR" && branch.district !== scope.district) {
        throw new Error("That receiving branch is outside your district.")
      }
      receivingBranchId = branch.id
    }

    const fine = projection.fineAmount != null ? Number(projection.fineAmount) : null
    const existing = await tx
      .select({ amount: citationPayments.amount })
      .from(citationPayments)
      .where(eq(citationPayments.recordId, record.id))
    const alreadyPaid = existing.reduce((sum, row) => sum + Number(row.amount), 0)
    const balance = citationBalance(fine, alreadyPaid)
    if (balance != null && parsed.data.amount > balance) {
      throw new Error(
        `That exceeds the outstanding balance of MWK ${balance.toLocaleString()}.`
      )
    }

    const receiptNo =
      parsed.data.receiptNo?.trim() || generateReceiptNo()
    const countersign = parsed.data.countersignedBy?.trim()
    const [payment] = await tx
      .insert(citationPayments)
      .values({
        recordId: record.id,
        amount: String(parsed.data.amount),
        receiptNo,
        note:
          (parsed.data.note?.trim() &&
            (countersign
              ? `${parsed.data.note.trim()} (countersigned: ${countersign})`
              : parsed.data.note.trim())) ||
          (countersign ? `Countersigned: ${countersign}` : undefined),
        payerName: parsed.data.payerName.trim(),
        paymentMethod: parsed.data.paymentMethod,
        channel: parsed.data.channel ?? "counter",
        receivingBranchId: receivingBranchId ?? undefined,
        receivedBy: scope.id,
      })
      .returning({ id: citationPayments.id })
    if (!payment) throw new Error("Payment failed.")

    const totalPaid = alreadyPaid + parsed.data.amount
    const paid = isCitationPaid(fine, totalPaid)
    await tx
      .update(trafficCitations)
      .set({ isPaid: paid })
      .where(eq(trafficCitations.recordId, record.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "payment_received",
      recordId: record.id,
      reason: `Fine payment MWK ${parsed.data.amount.toLocaleString()} from ${parsed.data.payerName.trim()} via ${parsed.data.paymentMethod} (${receiptNo}). Balance ${citationBalance(fine, totalPaid)?.toLocaleString() ?? "unknown"}.`,
    })
    if (record.reportedBy !== scope.id) {
      await notifyUser(tx, {
        userId: record.reportedBy,
        type: "status_changed",
        recordId: record.id,
        message: `Payment of MWK ${parsed.data.amount.toLocaleString()} received on citation (${receiptNo}).`,
      })
    }
    return { receiptNo, balance: citationBalance(fine, totalPaid), isPaid: paid }
  })
}

export interface CitationSearchHit {
  recordId: string
  ticketNumber: string | null
  plateNumber: string | null
  violationType: string
  isPaid: boolean
  district: string
}

/**
 * Phase 6: ticket/violation search for the unified lookup. Same-domain
 * police, any branch — finding a ticket to receipt must not require
 * branch-feed access. Backed by the ticket_number trigram index.
 */
export async function searchCitations(
  query: string,
  limit = 10
): Promise<CitationSearchHit[]> {
  const scope = await getViewerScope()
  if (
    scope.role !== "OFFICER" &&
    scope.role !== "DISTRICT_MONITOR" &&
    scope.role !== "COUNTRY_MONITOR"
  ) {
    throw new Error("Police users only.")
  }
  if (!scope.domain) return []
  const domain = scope.domain
  const q = query.trim().toUpperCase()
  if (!q) return []
  const pattern = `%${escapeLike(q)}%`
  return withUserCtx(scope.id, async (tx) => {
    const conditions = [
      eq(records.domain, domain),
      or(
        ilike(trafficCitations.ticketNumber, pattern),
        ilike(trafficCitations.violationType, pattern),
        ilike(vehicles.plateNumber, pattern)
      ),
    ]
    if (scope.role === "DISTRICT_MONITOR" && scope.district) {
      conditions.push(eq(records.district, scope.district as never))
    }
    const rows = await tx
      .select({
        recordId: records.id,
        ticketNumber: trafficCitations.ticketNumber,
        plateNumber: vehicles.plateNumber,
        violationType: trafficCitations.violationType,
        isPaid: trafficCitations.isPaid,
        district: records.district,
      })
      .from(trafficCitations)
      .innerJoin(records, eq(trafficCitations.recordId, records.id))
      .leftJoin(vehicles, eq(trafficCitations.vehicleId, vehicles.id))
      .where(and(...conditions))
      .orderBy(desc(records.createdAt))
      .limit(limit)
    return rows.map((row) => ({
      ...row,
      district: row.district as string,
    }))
  })
}

/**
 * Phase 1: find a citation by uniform ticket number from any branch counter.
 * Returns the record id when the viewer may receipt it (same-domain police).
 * Audited as a lookup, not a case-file read.
 */
export async function findCitationByTicket(
  ticketNumber: string
): Promise<{ recordId: string; plateNumber: string | null; balance: number | null; isPaid: boolean }> {
  const scope = await getViewerScope()
  if (
    scope.role !== "OFFICER" &&
    scope.role !== "DISTRICT_MONITOR" &&
    scope.role !== "COUNTRY_MONITOR"
  ) {
    throw new Error("Police users only.")
  }
  const ticket = ticketNumber.trim().toUpperCase()
  if (!ticket) throw new Error("Enter a ticket number.")
  return withUserCtx(scope.id, async (tx) => {
    const [projection] = await tx
      .select()
      .from(trafficCitations)
      .where(eq(trafficCitations.ticketNumber, ticket))
      .limit(1)
    if (!projection) throw new Error("No citation with that ticket number.")
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, projection.recordId))
      .limit(1)
    if (!record || !canReceivePayment(scope, record)) {
      throw new Error("That citation is outside your domain.")
    }
    const [vehicle] = projection.vehicleId
      ? await tx
          .select({ plateNumber: vehicles.plateNumber })
          .from(vehicles)
          .where(eq(vehicles.id, projection.vehicleId))
          .limit(1)
      : []
    const rows = await tx
      .select({ amount: citationPayments.amount })
      .from(citationPayments)
      .where(eq(citationPayments.recordId, record.id))
    const totalPaid = rows.reduce((sum, row) => sum + Number(row.amount), 0)
    const fine = projection.fineAmount != null ? Number(projection.fineAmount) : null
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_viewed",
      recordId: record.id,
      reason: `Ticket lookup ${ticket} for receiving.`,
    })
    return {
      recordId: record.id,
      plateNumber: vehicle?.plateNumber ?? null,
      balance: citationBalance(fine, totalPaid),
      isPaid: projection.isPaid,
    }
  })
}

/** Phase 1: void a spoiled/duplicate ticket (monitor-only, stays queryable). */
export async function voidCitation(input: {
  recordId: string
  reason: string
}): Promise<void> {
  const scope = await getViewerScope()
  if (!isMonitor(scope)) throw new Error("Only monitors void tickets.")
  const parsed = citationVoidSchema.safeParse(input)
  if (!parsed.success) throw new Error("Give a reason (min 10 characters).")
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, parsed.data.recordId))
      .limit(1)
    if (!record || record.recordType !== "traffic_citation") {
      throw new Error("Citation not found.")
    }
    if (!canManageCitation(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    await tx
      .update(trafficCitations)
      .set({
        voidedAt: new Date(),
        voidReason: parsed.data.reason.trim(),
        voidBy: scope.id,
      })
      .where(eq(trafficCitations.recordId, record.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "citation_voided",
      recordId: record.id,
      reason: `Ticket voided: ${parsed.data.reason.trim()}`,
    })
  })
}

/** Monitor schedules (or reschedules) the court appearance for a citation. */
export async function scheduleCitationCourt(input: {
  recordId: string
  courtDate: string
  courtId?: string
}): Promise<void> {
  const scope = await getViewerScope()
  if (scope.role !== "DISTRICT_MONITOR" && scope.role !== "COUNTRY_MONITOR") {
    throw new Error("Only monitors schedule court dates.")
  }
  const parsed = citationCourtScheduleSchema.safeParse(input)
  if (!parsed.success) throw new Error("The court date didn't pass validation.")

  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, parsed.data.recordId))
      .limit(1)
    if (!record || record.recordType !== "traffic_citation") {
      throw new Error("Citation not found.")
    }
    if (!canManageCitation(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    let courtName: string | null = null
    if (parsed.data.courtId) {
      const [court] = await tx
        .select({ id: organizations.id, orgType: organizations.orgType, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, parsed.data.courtId))
        .limit(1)
      if (!court || court.orgType !== "court") {
        throw new Error("That is not a court organization.")
      }
      courtName = court.name
    }
    await tx
      .update(trafficCitations)
      .set({
        courtDate: parsed.data.courtDate,
        courtId: parsed.data.courtId || null,
      })
      .where(eq(trafficCitations.recordId, record.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      recordId: record.id,
      reason: `Court date → ${parsed.data.courtDate}${courtName ? ` at ${courtName}` : ""}.`,
    })
    if (record.reportedBy !== scope.id) {
      await notifyUser(tx, {
        userId: record.reportedBy,
        type: "status_changed",
        recordId: record.id,
        message: `Court date set to ${parsed.data.courtDate}${courtName ? ` at ${courtName}` : ""}.`,
      })
    }
  })
}

export interface ReconciliationDayTotal {
  date: string
  receiverName: string
  count: number
  total: number
}

export interface ReconciliationException {
  recordId: string
  ticketNumber: string | null
  plateNumber: string | null
  issuedAt: string
  daysWaiting: number
  balance: number | null
}

export interface ReconciliationVoid {
  recordId: string
  ticketNumber: string | null
  reason: string | null
  voidAt: string | null
}

export interface ReconciliationPaid {
  recordId: string
  ticketNumber: string | null
  plateNumber: string | null
  issuedAt: string
  fineAmount: number | null
  totalPaid: number
  balance: number | null
}

export interface ReconciliationUnpaid {
  recordId: string
  ticketNumber: string | null
  plateNumber: string | null
  issuedAt: string
  daysWaiting: number
  balance: number | null
  overdue: boolean
}

export interface ReconciliationSummary {
  totals: ReconciliationDayTotal[]
  undeposited: ReconciliationException[]
  unpaid: ReconciliationUnpaid[]
  paid: ReconciliationPaid[]
  voids: ReconciliationVoid[]
}

/**
 * Phase 2: daily money reconciliation for monitors. Per-receiver day totals
 * (what each counter took in) plus exceptions: citations issued >5 days ago
 * with no payment and no court outcome, and recent voids. District monitors
 * see their district; country monitors see the domain nationwide.
 */
export async function getReconciliationSummary(): Promise<ReconciliationSummary> {
  const scope = await getViewerScope()
  if (!isMonitor(scope)) throw new Error("Monitors only.")
  if (!scope.domain) throw new Error("Your account has no domain.")

  return withUserCtx(scope.id, async (tx) => {
    // All citations in scope with their records (capped — pilot-scale scan).
    const rows = await tx
      .select({
        recordId: records.id,
        district: records.district,
        status: records.status,
        createdAt: records.createdAt,
        ticketNumber: trafficCitations.ticketNumber,
        fineAmount: trafficCitations.fineAmount,
        isPaid: trafficCitations.isPaid,
        voidedAt: trafficCitations.voidedAt,
        voidReason: trafficCitations.voidReason,
        vehicleId: trafficCitations.vehicleId,
      })
      .from(trafficCitations)
      .innerJoin(records, eq(records.id, trafficCitations.recordId))
      .orderBy(desc(records.createdAt))
      .limit(2000)

    // Domain/district gate in JS (records.domain isn't join-filtered above
    // to keep the query portable across RLS policies).

    const recordRows = await tx
      .select({
        id: records.id,
        domain: records.domain,
        district: records.district,
      })
      .from(records)
    const recordById = new Map(recordRows.map((r) => [r.id, r]))
    const keep = (recordId: string) => {
      const rec = recordById.get(recordId)
      if (!rec || rec.domain !== scope.domain) return false
      if (scope.role === "DISTRICT_MONITOR" && rec.district !== scope.district) {
        return false
      }
      return true
    }
    const inScopeRows = rows.filter((row) => keep(row.recordId))

    // Payments for in-scope citations.
    const recordIds = new Set(inScopeRows.map((row) => row.recordId))
    const paymentRows =
      recordIds.size === 0
        ? []
        : await tx
            .select({
              recordId: citationPayments.recordId,
              amount: citationPayments.amount,
              receiptNo: citationPayments.receiptNo,
              receivedBy: citationPayments.receivedBy,
              createdAt: citationPayments.createdAt,
            })
            .from(citationPayments)
            .orderBy(desc(citationPayments.createdAt))
            .limit(5000)
    const scopedPayments = paymentRows.filter((p) => recordIds.has(p.recordId))

    const receiverNames = new Map<string, string>()
    for (const p of scopedPayments) {
      if (p.receivedBy && !receiverNames.has(p.receivedBy)) {
        const [u] = await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, p.receivedBy))
          .limit(1)
        receiverNames.set(p.receivedBy, u?.name ?? "Unknown")
      }
    }

    const totalsMap = new Map<string, ReconciliationDayTotal>()
    for (const p of scopedPayments) {
      const date = p.createdAt.toISOString().slice(0, 10)
      const receiverName = p.receivedBy
        ? (receiverNames.get(p.receivedBy) ?? "Unknown")
        : "Unknown"
      const key = `${date}::${receiverName}`
      const entry = totalsMap.get(key) ?? { date, receiverName, count: 0, total: 0 }
      entry.count += 1
      entry.total = Math.round((entry.total + Number(p.amount)) * 100) / 100
      totalsMap.set(key, entry)
    }
    const totals = [...totalsMap.values()].sort((a, b) =>
      b.date.localeCompare(a.date)
    ).slice(0, 60)

    const paidIds = new Set(scopedPayments.map((p) => p.recordId))
    const paidTotalByRecord = new Map<string, number>()
    for (const p of scopedPayments) {
      paidTotalByRecord.set(
        p.recordId,
        Math.round(
          ((paidTotalByRecord.get(p.recordId) ?? 0) + Number(p.amount)) * 100
        ) / 100
      )
    }
    const now = Date.now()
    const FIVE_DAYS = 5 * 86_400_000
    const undeposited: ReconciliationException[] = []
    const unpaid: ReconciliationUnpaid[] = []
    const paid: ReconciliationPaid[] = []
    // Plate lookup in bulk to keep the board fast.
    const vehicleIds = [...new Set(inScopeRows.map((r) => r.vehicleId).filter(Boolean))] as string[]
    const plateByVehicle = new Map<string, string>()
    for (const vid of vehicleIds.slice(0, 500)) {
      const [vehicle] = await tx
        .select({ id: vehicles.id, plateNumber: vehicles.plateNumber })
        .from(vehicles)
        .where(eq(vehicles.id, vid))
        .limit(1)
      if (vehicle) plateByVehicle.set(vehicle.id, vehicle.plateNumber)
    }
    for (const row of inScopeRows) {
      const plate = row.vehicleId ? (plateByVehicle.get(row.vehicleId) ?? null) : null
      const totalPaid = paidTotalByRecord.get(row.recordId) ?? 0
      const fine = row.fineAmount != null ? Number(row.fineAmount) : null
      const age = now - row.createdAt.getTime()
      const daysWaiting = Math.floor(age / 86_400_000)
      if (row.voidedAt) continue
      if (row.isPaid || (fine != null && totalPaid >= fine && totalPaid > 0)) {
        paid.push({
          recordId: row.recordId,
          ticketNumber: row.ticketNumber ?? null,
          plateNumber: plate,
          issuedAt: row.createdAt.toISOString(),
          fineAmount: fine,
          totalPaid,
          balance: fine != null ? Math.max(0, Math.round((fine - totalPaid) * 100) / 100) : null,
        })
        if (paid.length >= 200) {
          // keep scanning for unpaid below? no — both lists share the loop,
          // so only cap paid here and continue filling unpaid.
        }
        continue
      }
      if (paidIds.has(row.recordId)) continue
      unpaid.push({
        recordId: row.recordId,
        ticketNumber: row.ticketNumber ?? null,
        plateNumber: plate,
        issuedAt: row.createdAt.toISOString(),
        daysWaiting,
        balance: fine,
        overdue: age >= FIVE_DAYS,
      })
      if (!row.isPaid && !paidIds.has(row.recordId) && age >= FIVE_DAYS && undeposited.length < 100) {
        undeposited.push({
          recordId: row.recordId,
          ticketNumber: row.ticketNumber ?? null,
          plateNumber: plate,
          issuedAt: row.createdAt.toISOString(),
          daysWaiting,
          balance: fine,
        })
      }
      if (unpaid.length >= 200 && undeposited.length >= 100) break
    }

    const voids: ReconciliationVoid[] = inScopeRows
      .filter((row) => row.voidedAt)
      .slice(0, 50)
      .map((row) => ({
        recordId: row.recordId,
        ticketNumber: row.ticketNumber ?? null,
        reason: row.voidReason ?? null,
        voidAt: row.voidedAt ? row.voidedAt.toISOString() : null,
      }))

    return {
      totals,
      undeposited,
      unpaid: unpaid.slice(0, 200),
      paid: paid.slice(0, 200),
      voids,
    }
  })
}
