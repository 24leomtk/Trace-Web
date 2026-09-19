"use server"

import { eq } from "drizzle-orm"

import { impoundCustody, records, users } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { writeAuditTx } from "@/lib/server/audit"
import { canViewRecord } from "@/lib/visibility"
import {
  custodyHoldSchema,
  custodyReleaseSchema,
  ownerNoticeSchema,
} from "@/validations/admin"
import { getViewerScope, type ViewerScope } from "@/lib/actions/records"
import { notifyUser } from "@/lib/actions/notifications"

function isMonitor(scope: ViewerScope): boolean {
  return scope.role === "DISTRICT_MONITOR" || scope.role === "COUNTRY_MONITOR"
}

function isPolice(scope: ViewerScope): boolean {
  return (
    scope.role === "OFFICER" ||
    scope.role === "DISTRICT_MONITOR" ||
    scope.role === "COUNTRY_MONITOR"
  )
}

function monitorInScope(
  scope: ViewerScope,
  record: typeof records.$inferSelect
): boolean {
  return (
    isMonitor(scope) &&
    record.domain === scope.domain &&
    (scope.role === "COUNTRY_MONITOR"
      ? record.accessLevel === "country"
      : record.district === scope.district)
  )
}

export interface CustodyState {
  recordId: string
  hasHold: boolean
  towCompany: string | null
  lotLocation: string | null
  bay: string | null
  holdAuthorityName: string | null
  holdBasis: string | null
  holdPlacedAt: string | null
  ownerNotifiedAt: string | null
  released: boolean
  releasedAt: string | null
  recipientName: string | null
  feesSnapshot: number | null
  canPlaceHold: boolean
  canRelease: boolean
  releaseHint: string | null
}

/** Custody card state for one impoundment — police with case-file access. */
export async function getCustodyState(recordId: string): Promise<CustodyState> {
  const scope = await getViewerScope()
  if (!isPolice(scope)) throw new Error("Police users only.")
  return withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    if (record.recordType !== "vehicle_impoundment") {
      throw new Error("Custody applies to impoundments.")
    }
    if (!canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    const [custody] = await tx
      .select()
      .from(impoundCustody)
      .where(eq(impoundCustody.recordId, record.id))
      .limit(1)
    const [authority] = custody?.holdAuthorityId
      ? await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, custody.holdAuthorityId))
          .limit(1)
      : []
    const isFiler = record.reportedBy === scope.id
    const canPlaceHold =
      !custody?.holdPlacedAt && (isFiler || monitorInScope(scope, record))
    const isHoldAuthority =
      !!custody?.holdAuthorityId && custody.holdAuthorityId === scope.id
    const canRelease =
      !!custody?.holdPlacedAt &&
      !custody.releaseAt &&
      (isHoldAuthority || monitorInScope(scope, record))
    return {
      recordId,
      hasHold: !!custody?.holdPlacedAt,
      towCompany: custody?.towCompany ?? null,
      lotLocation: custody?.lotLocation ?? null,
      bay: custody?.bay ?? null,
      holdAuthorityName: authority?.name ?? null,
      holdBasis: custody?.holdBasis ?? null,
      holdPlacedAt: custody?.holdPlacedAt
        ? custody.holdPlacedAt.toISOString()
        : null,
      ownerNotifiedAt: custody?.ownerNotifiedAt
        ? custody.ownerNotifiedAt.toISOString()
        : null,
      released: !!custody?.releaseAt,
      releasedAt: custody?.releaseAt ? custody.releaseAt.toISOString() : null,
      recipientName: custody?.recipientName ?? null,
      feesSnapshot:
        custody?.feesSnapshot != null ? Number(custody.feesSnapshot) : null,
      canPlaceHold,
      canRelease,
      releaseHint:
        custody?.holdPlacedAt && !custody.releaseAt && !canRelease
          ? `Only ${authority?.name ?? "the hold authority"} or a monitor can release this vehicle.`
          : null,
    }
  })
}

/**
 * Order the hold. Filing officer or in-scope monitor. Tow chain falls back
 * to what was captured at filing. Hold fields are set once, never changed.
 */
export async function placeHold(input: {
  recordId: string
  holdBasis: string
  towCompany?: string
  lotLocation?: string
  bay?: string
}): Promise<void> {
  const scope = await getViewerScope()
  if (!isPolice(scope)) throw new Error("Police users only.")
  const parsed = custodyHoldSchema.safeParse(input)
  if (!parsed.success) throw new Error("Give the legal basis (min 10 characters).")
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, parsed.data.recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    if (record.recordType !== "vehicle_impoundment") {
      throw new Error("Holds apply to impoundments.")
    }
    const isFiler = record.reportedBy === scope.id
    if (!isFiler && !monitorInScope(scope, record)) {
      throw new Error("Only the filing officer or a monitor places holds.")
    }
    const [existing] = await tx
      .select()
      .from(impoundCustody)
      .where(eq(impoundCustody.recordId, record.id))
      .limit(1)
    if (existing?.holdPlacedAt) throw new Error("Hold already placed.")
    const payload = (record.data ?? {}) as Record<string, unknown>
    const str = (key: string) =>
      typeof payload[key] === "string" && payload[key].trim()
        ? (payload[key] as string).trim()
        : undefined
    const now = new Date()
    if (existing) {
      await tx
        .update(impoundCustody)
        .set({
          towCompany: parsed.data.towCompany?.trim() || str("tow_company") || existing.towCompany,
          lotLocation: parsed.data.lotLocation?.trim() || str("lot_location") || existing.lotLocation,
          bay: parsed.data.bay?.trim() || str("bay") || existing.bay,
          holdAuthorityId: scope.id,
          holdBasis: parsed.data.holdBasis.trim(),
          holdPlacedAt: now,
          updatedAt: now,
        })
        .where(eq(impoundCustody.recordId, record.id))
    } else {
      await tx.insert(impoundCustody).values({
        recordId: record.id,
        towCompany: parsed.data.towCompany?.trim() || str("tow_company"),
        lotLocation: parsed.data.lotLocation?.trim() || str("lot_location"),
        bay: parsed.data.bay?.trim() || str("bay"),
        holdAuthorityId: scope.id,
        holdBasis: parsed.data.holdBasis.trim(),
        holdPlacedAt: now,
      })
    }
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "hold_placed",
      recordId: record.id,
      reason: `Hold ordered: ${parsed.data.holdBasis.trim().slice(0, 200)}`,
    })
    if (record.reportedBy !== scope.id) {
      await notifyUser(tx, {
        userId: record.reportedBy,
        type: "status_changed",
        recordId: record.id,
        message: `${scope.name} ordered a hold — release needs their signature or a monitor's.`,
      })
    }
  })
}

/**
 * Authorize release — dual signature. Hold authority or in-scope monitor
 * only; the lot executes but never authorizes. Set once, never changed.
 */
export async function authorizeRelease(input: {
  recordId: string
  recipientName: string
  recipientIdChecked: string
  feesSnapshot?: number
}): Promise<void> {
  const scope = await getViewerScope()
  if (!isPolice(scope)) throw new Error("Police users only.")
  const parsed = custodyReleaseSchema.safeParse(input)
  if (!parsed.success) throw new Error("Name the recipient and the ID checked.")
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, parsed.data.recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    const [custody] = await tx
      .select()
      .from(impoundCustody)
      .where(eq(impoundCustody.recordId, record.id))
      .limit(1)
    if (!custody?.holdPlacedAt) throw new Error("No hold to release.")
    if (custody.releaseAt) throw new Error("Already released.")
    const isHoldAuthority = custody.holdAuthorityId === scope.id
    if (!isHoldAuthority && !monitorInScope(scope, record)) {
      const [authority] = custody.holdAuthorityId
        ? await tx
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, custody.holdAuthorityId))
            .limit(1)
        : []
      throw new Error(
        `Only ${authority?.name ?? "the hold authority"} or a monitor can release this vehicle.`
      )
    }
    const now = new Date()
    await tx
      .update(impoundCustody)
      .set({
        releaseAuthId: scope.id,
        releaseAt: now,
        recipientName: parsed.data.recipientName.trim(),
        recipientIdChecked: parsed.data.recipientIdChecked.trim(),
        feesSnapshot:
          parsed.data.feesSnapshot != null
            ? String(parsed.data.feesSnapshot)
            : undefined,
        updatedAt: now,
      })
      .where(eq(impoundCustody.recordId, record.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "hold_released",
      recordId: record.id,
      reason: `Released to ${parsed.data.recipientName.trim()} (ID: ${parsed.data.recipientIdChecked.trim()}).`,
    })
    const notifyIds = new Set<string>()
    if (custody.holdAuthorityId) notifyIds.add(custody.holdAuthorityId)
    if (record.reportedBy !== scope.id) notifyIds.add(record.reportedBy)
    notifyIds.delete(scope.id)
    for (const userId of notifyIds) {
      await notifyUser(tx, {
        userId,
        type: "status_changed",
        recordId: record.id,
        message: `${scope.name} authorized release to ${parsed.data.recipientName.trim()}.`,
      })
    }
  })
}

/** Timestamp owner/lienholder notification (repeatable — letter, visit, call). */
export async function recordOwnerNotice(recordId: string): Promise<void> {
  const scope = await getViewerScope()
  if (!isPolice(scope)) throw new Error("Police users only.")
  const parsed = ownerNoticeSchema.safeParse({ recordId })
  if (!parsed.success) throw new Error("Invalid record.")
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, parsed.data.recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    const [custody] = await tx
      .select()
      .from(impoundCustody)
      .where(eq(impoundCustody.recordId, record.id))
      .limit(1)
    if (!custody?.holdPlacedAt) throw new Error("Place the hold first.")
    const isFiler = record.reportedBy === scope.id
    const isHoldAuthority = custody.holdAuthorityId === scope.id
    if (!isFiler && !isHoldAuthority && !monitorInScope(scope, record)) {
      throw new Error("Only the filer, hold authority, or a monitor records notice.")
    }
    const now = new Date()
    await tx
      .update(impoundCustody)
      .set({
        ownerNotifiedAt: now,
        ownerNotifiedBy: scope.id,
        updatedAt: now,
      })
      .where(eq(impoundCustody.recordId, record.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "owner_notified",
      recordId: record.id,
      reason: `Owner/lienholder notified by ${scope.name}.`,
    })
  })
}
