"use server"

import { and, desc, eq } from "drizzle-orm"

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
import { canViewRecord } from "@/lib/visibility"
import {
  citationCourtScheduleSchema,
  citationPaymentSchema,
} from "@/validations/admin"
import { getViewerScope, type ViewerScope } from "@/lib/actions/records"
import { notifyUser } from "@/lib/actions/notifications"

function isMonitor(scope: ViewerScope): boolean {
  return scope.role === "DISTRICT_MONITOR" || scope.role === "COUNTRY_MONITOR"
}

/** Reporter or an in-scope monitor — the same rule the old paid-toggle used. */
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
  receivedByName: string | null
  createdAt: string
}

export interface CitationLedger {
  recordId: string
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
      payments.push({
        id: row.id,
        amount: Number(row.amount),
        receiptNo: row.receiptNo,
        note: row.note,
        receivedByName: receiver?.name ?? null,
        createdAt: row.createdAt.toISOString(),
      })
    }

    const data = (record.data ?? {}) as Record<string, unknown>
    const fine = projection.fineAmount != null ? Number(projection.fineAmount) : null
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0)
    return {
      recordId,
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
 * Record a fine payment. Partial payments allowed; overpayments rejected;
 * `is_paid` is recomputed from the ledger total (F3).
 */
export async function recordCitationPayment(input: {
  recordId: string
  amount: number
  receiptNo?: string
  note?: string
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
    if (!canManageCitation(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    const [projection] = await tx
      .select()
      .from(trafficCitations)
      .where(eq(trafficCitations.recordId, record.id))
      .limit(1)
    if (!projection) throw new Error("Citation not found.")

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
    const [payment] = await tx
      .insert(citationPayments)
      .values({
        recordId: record.id,
        amount: String(parsed.data.amount),
        receiptNo,
        note: parsed.data.note?.trim() || undefined,
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
      actionType: "record_updated",
      recordId: record.id,
      reason: `Fine payment MWK ${parsed.data.amount.toLocaleString()} received (${receiptNo}). Balance ${citationBalance(fine, totalPaid)?.toLocaleString() ?? "unknown"}.`,
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
