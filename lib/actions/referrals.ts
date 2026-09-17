"use server"

import { and, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import {
  courtCaseAccess,
  personsOfInterest,
  records,
  referralDocuments,
  users,
  vehicles,
} from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { describeRecord } from "@/lib/record-view"
import { referralSla } from "@/lib/format"
import { writeAuditTx } from "@/lib/server/audit"
import { canViewRecord } from "@/lib/visibility"
import { referralDocumentSchema } from "@/validations/admin"
import type { RecordType } from "@/validations/record"
import {
  getRecord,
  getViewerScope,
  type ViewerScope,
} from "@/lib/actions/records"
import { notifyUser } from "@/lib/actions/notifications"

function isMonitor(scope: ViewerScope): boolean {
  return scope.role === "DISTRICT_MONITOR" || scope.role === "COUNTRY_MONITOR"
}

async function grantRecord(referralId: string) {
  const [grant] = await db
    .select()
    .from(courtCaseAccess)
    .where(eq(courtCaseAccess.id, referralId))
    .limit(1)
  if (!grant) throw new Error("Referral not found.")
  const [record] = await db
    .select()
    .from(records)
    .where(eq(records.id, grant.recordId))
    .limit(1)
  if (!record) throw new Error("Record not found.")
  return { grant, record }
}

/** May this viewer open this referral's bundle? (Mirrors getRecord's gate.) */
async function assertBundleAccess(
  scope: ViewerScope,
  grant: typeof courtCaseAccess.$inferSelect,
  record: typeof records.$inferSelect
): Promise<void> {
  if (scope.role === "COURT_LIAISON") {
    if (grant.courtLiaisonId !== scope.id) {
      throw new Error("That referral is not yours.")
    }
    if (grant.revokedAt || (grant.expiresAt && grant.expiresAt <= new Date())) {
      throw new Error("That referral has expired.")
    }
    return
  }
  if (!isMonitor(scope) || !canViewRecord(scope, record)) {
    throw new Error("That case is outside your scope.")
  }
}

export interface ReferralDocumentRow {
  id: string
  label: string
  url: string
  createdAt: string
}

export interface ReferralBundle {
  referralId: string
  reason: string | null
  expiresAt: string | null
  outcome: string
  outcomeNotes: string | null
  referredAt: string
  firstViewedAt: string | null
  liaisonName: string
  recordTitle: string
  recordSummary: string
  personName: string | null
  vehiclePlate: string | null
  documents: ReferralDocumentRow[]
}

/**
 * F4 e-Brief bundle — the referred record plus its structured exhibits in
 * one pane. Reading through getRecord keeps the gate + viewed-audit +
 * first-view stamp identical to opening the case directly.
 */
export async function getReferralBundle(referralId: string): Promise<ReferralBundle> {
  const scope = await getViewerScope()
  const { grant, record } = await grantRecord(referralId)
  await assertBundleAccess(scope, grant, record)
  const trace = await getRecord(record.id)

  return withUserCtx(scope.id, async (tx) => {
    const docs = await tx
      .select({
        id: referralDocuments.id,
        label: referralDocuments.label,
        url: referralDocuments.url,
        createdAt: referralDocuments.createdAt,
      })
      .from(referralDocuments)
      .where(eq(referralDocuments.referralId, referralId))
      .orderBy(desc(referralDocuments.createdAt))
    const [liaison] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, grant.courtLiaisonId))
      .limit(1)
    const [person] = trace.personId
      ? await tx
          .select({ fullName: personsOfInterest.fullName })
          .from(personsOfInterest)
          .where(eq(personsOfInterest.id, trace.personId))
          .limit(1)
      : []
    const [vehicle] = trace.vehicleId
      ? await tx
          .select({ plateNumber: vehicles.plateNumber })
          .from(vehicles)
          .where(eq(vehicles.id, trace.vehicleId))
          .limit(1)
      : []
    return {
      referralId: grant.id,
      reason: grant.reason,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      outcome: grant.outcome,
      outcomeNotes: grant.outcomeNotes,
      referredAt: grant.createdAt.toISOString(),
      firstViewedAt: grant.firstViewedAt?.toISOString() ?? null,
      liaisonName: liaison?.name ?? "Unknown",
      recordTitle: trace.title,
      recordSummary: trace.summary,
      personName: person?.fullName ?? null,
      vehiclePlate: vehicle?.plateNumber ?? null,
      documents: docs.map((doc) => ({
        ...doc,
        createdAt: doc.createdAt.toISOString(),
      })),
    }
  })
}

/** Monitor attaches a brief document (tranche) to a referral. */
export async function addReferralDocument(input: {
  referralId: string
  label: string
  url: string
  storagePath: string
  fileType: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (!isMonitor(scope)) throw new Error("Only monitors add brief documents.")
  const parsed = referralDocumentSchema.safeParse(input)
  if (!parsed.success) throw new Error("The document didn't pass validation.")

  return withUserCtx(scope.id, async (tx) => {
    const { grant, record } = await grantRecord(parsed.data.referralId)
    if (!canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    const [doc] = await tx
      .insert(referralDocuments)
      .values({
        referralId: grant.id,
        label: parsed.data.label,
        url: parsed.data.url,
        storagePath: parsed.data.storagePath,
        fileType: parsed.data.fileType,
        uploadedBy: scope.id,
      })
      .returning({ id: referralDocuments.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "court_case_referred",
      recordId: record.id,
      reason: `Brief document added: ${parsed.data.label}.`,
    })
    await notifyUser(tx, {
      userId: grant.courtLiaisonId,
      type: "referral_updated",
      recordId: record.id,
      message: `New brief document (${parsed.data.label.replace(/_/g, " ")}) from ${scope.name}.`,
    })
    return { id: doc.id }
  })
}

/** Monitor removes a brief document (e.g. wrong file attached). */
export async function removeReferralDocument(documentId: string): Promise<void> {
  const scope = await getViewerScope()
  if (!isMonitor(scope)) throw new Error("Only monitors remove brief documents.")
  await withUserCtx(scope.id, async (tx) => {
    const [doc] = await tx
      .select()
      .from(referralDocuments)
      .where(eq(referralDocuments.id, documentId))
      .limit(1)
    if (!doc) return
    const { grant, record } = await grantRecord(doc.referralId)
    if (!canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    await tx.delete(referralDocuments).where(eq(referralDocuments.id, doc.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "court_case_referred",
      recordId: record.id,
      reason: `Brief document removed: ${doc.label}.`,
    })
  })
}

export interface ReferralSlaItem {
  referralId: string
  recordId: string
  recordTitle: string
  liaisonName: string
  outcome: string
  expiresAt: string | null
  daysSinceReferral: number
  daysToView: number | null
  daysToOutcome: number | null
  viewOverdue: boolean
  outcomeOverdue: boolean
}

export interface ReferralSlaReport {
  total: number
  unviewed: number
  overdueView: number
  overdueOutcome: number
  avgDaysToView: number | null
  avgDaysToOutcome: number | null
  items: ReferralSlaItem[]
}

/** F4 monitor report — referral timeliness in the viewer's scope. */
export async function getReferralSla(): Promise<ReferralSlaReport> {
  const scope = await getViewerScope()
  if (!isMonitor(scope)) throw new Error("Monitors only.")

  return withUserCtx(scope.id, async (tx) => {
    const grants = await tx
      .select()
      .from(courtCaseAccess)
      .orderBy(desc(courtCaseAccess.createdAt))
      .limit(200)

    const items: ReferralSlaItem[] = []
    for (const grant of grants) {
      if (grant.revokedAt) continue
      const [record] = await tx
        .select()
        .from(records)
        .where(eq(records.id, grant.recordId))
        .limit(1)
      if (!record || !canViewRecord(scope, record)) continue
      const [liaison] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, grant.courtLiaisonId))
        .limit(1)
      const sla = referralSla(
        grant.createdAt.toISOString(),
        grant.firstViewedAt?.toISOString() ?? null,
        grant.outcomeRecordedAt?.toISOString() ?? null
      )
      const view = describeRecord(
        record.recordType as RecordType,
        (record.data ?? {}) as Record<string, unknown>
      )
      items.push({
        referralId: grant.id,
        recordId: record.id,
        recordTitle: view.title,
        liaisonName: liaison?.name ?? "Unknown",
        outcome: grant.outcome,
        expiresAt: grant.expiresAt?.toISOString() ?? null,
        ...sla,
      })
      if (items.length >= 100) break
    }

    const viewed = items.map((item) => item.daysToView).filter((d): d is number => d != null)
    const decided = items
      .map((item) => item.daysToOutcome)
      .filter((d): d is number => d != null)
    return {
      total: items.length,
      unviewed: items.filter((item) => item.daysToView == null).length,
      overdueView: items.filter((item) => item.viewOverdue).length,
      overdueOutcome: items.filter((item) => item.outcomeOverdue).length,
      avgDaysToView: viewed.length > 0 ? viewed.reduce((a, b) => a + b, 0) / viewed.length : null,
      avgDaysToOutcome:
        decided.length > 0 ? decided.reduce((a, b) => a + b, 0) / decided.length : null,
      items,
    }
  })
}
