"use server"

import { and, desc, eq, ne } from "drizzle-orm"

import { db } from "@/db"
import { records, users } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { RECORD_TYPE_META } from "@/lib/record-meta"
import { writeAuditTx } from "@/lib/server/audit"
import { canViewRecord } from "@/lib/visibility"
import {
  dispositionSchema,
  locateReportSchema,
} from "@/validations/admin"
import type { RecordType } from "@/validations/record"
import { getViewerScope, type ViewerScope } from "@/lib/actions/records"
import { notifyUser } from "@/lib/actions/notifications"

/** Record types with a locate → confirm → clear lifecycle (Phase 3). */
export const LOCATABLE_TYPES = [
  "wanted_person",
  "missing_person",
  "missing_vehicle",
  "stolen_property",
] as const

export type LocatableType = (typeof LOCATABLE_TYPES)[number]

export function isLocatable(recordType: string): boolean {
  return (LOCATABLE_TYPES as readonly string[]).includes(recordType)
}

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

export interface LocateState {
  recordId: string
  locateState: string
  place: string | null
  note: string | null
  byName: string | null
  at: string | null
  disposition: string | null
  canReport: boolean
  canConfirm: boolean
  confirmHint: string | null
}

/** Locate card state for one record — police with case-file access. */
export async function getLocateState(recordId: string): Promise<LocateState> {
  const scope = await getViewerScope()
  if (!isPolice(scope)) throw new Error("Police users only.")
  return withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    if (!canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    const [locator] = record.locateBy
      ? await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, record.locateBy))
          .limit(1)
      : []
    const isOriginator =
      scope.role === "OFFICER" && scope.branchId === record.branchId
    const canConfirm =
      record.locateState === "located" &&
      record.locateBy !== scope.id &&
      (isOriginator || monitorInScope(scope, record))
    return {
      recordId,
      locateState: record.locateState,
      place: record.locatePlace,
      note: record.locateNote,
      byName: locator?.name ?? null,
      at: record.locateAt ? record.locateAt.toISOString() : null,
      disposition: record.disposition,
      canReport:
        isLocatable(record.recordType) && record.locateState !== "confirmed",
      canConfirm,
      confirmHint:
        record.locateState === "located" && !canConfirm
          ? record.locateBy === scope.id
            ? "You reported this locate — the originating branch or a monitor confirms it."
            : "Only the originating branch or a monitor confirms locates."
          : null,
    }
  })
}

/**
 * Report a locate / find / recovery. Any in-scope police user, any branch —
 * the finder is usually NOT the originator. Never clears the case; that
 * needs confirmLocate by a different human.
 */
export async function reportLocate(input: {
  recordId: string
  place: string
  note: string
}): Promise<void> {
  const scope = await getViewerScope()
  if (!isPolice(scope)) throw new Error("Police users only.")
  const parsed = locateReportSchema.safeParse(input)
  if (!parsed.success) throw new Error("Say where, and what happened (min 10 chars).")
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, parsed.data.recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    if (!isLocatable(record.recordType)) {
      throw new Error("Locates apply to wanted/missing/property cases.")
    }
    if (!canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    if (record.locateState === "confirmed") {
      throw new Error("Locate already confirmed — resolve the case instead.")
    }
    await tx
      .update(records)
      .set({
        locateState: "located",
        locateBy: scope.id,
        locateAt: new Date(),
        locatePlace: parsed.data.place.trim(),
        locateNote: parsed.data.note.trim(),
        updatedAt: new Date(),
      })
      .where(eq(records.id, record.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "locate_reported",
      recordId: record.id,
      reason: `Locate at ${parsed.data.place.trim()}: ${parsed.data.note.trim().slice(0, 200)}`,
    })
    if (record.reportedBy !== scope.id) {
      await notifyUser(tx, {
        userId: record.reportedBy,
        type: "status_changed",
        recordId: record.id,
        message: `${scope.name} reported a locate — confirm it to unblock resolving.`,
      })
    }
  })
}

/**
 * Confirm a locate. Originating-branch officer or in-scope monitor, and
 * never the locator (approver ≠ reporter). Unblocks → resolved.
 */
export async function confirmLocate(recordId: string): Promise<void> {
  const scope = await getViewerScope()
  if (!isPolice(scope)) throw new Error("Police users only.")
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    if (record.locateState !== "located") {
      throw new Error("Nothing to confirm — no locate reported.")
    }
    if (record.locateBy === scope.id) {
      throw new Error("You reported this locate — someone else must confirm it.")
    }
    const isOriginator =
      scope.role === "OFFICER" && scope.branchId === record.branchId
    if (!isOriginator && !monitorInScope(scope, record)) {
      throw new Error("Only the originating branch or a monitor confirms locates.")
    }
    await tx
      .update(records)
      .set({ locateState: "confirmed", updatedAt: new Date() })
      .where(eq(records.id, record.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "locate_confirmed",
      recordId: record.id,
      reason: `Locate confirmed by ${scope.name}. Case may now resolve.`,
    })
    const notifyIds = new Set<string>()
    if (record.locateBy) notifyIds.add(record.locateBy)
    if (record.reportedBy !== scope.id) notifyIds.add(record.reportedBy)
    notifyIds.delete(scope.id)
    for (const userId of notifyIds) {
      await notifyUser(tx, {
        userId,
        type: "status_changed",
        recordId: record.id,
        message: `Locate confirmed by ${scope.name} — the case can now resolve.`,
      })
    }
  })
}

/** Custodian disposition for stolen-property cases (held/returned/destroyed/auctioned). */
export async function recordDisposition(input: {
  recordId: string
  disposition: "held" | "returned" | "destroyed" | "auctioned"
}): Promise<void> {
  const scope = await getViewerScope()
  const parsed = dispositionSchema.safeParse(input)
  if (!parsed.success) throw new Error("Pick a valid disposition.")
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, parsed.data.recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    if (record.recordType !== "stolen_property") {
      throw new Error("Dispositions apply to stolen-property cases.")
    }
    const isFiler = record.reportedBy === scope.id
    if (!isFiler && !monitorInScope(scope, record)) {
      throw new Error("Only the filer or a monitor records disposition.")
    }
    await tx
      .update(records)
      .set({ disposition: parsed.data.disposition, updatedAt: new Date() })
      .where(eq(records.id, record.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      recordId: record.id,
      reason: `Property disposition → ${parsed.data.disposition}.`,
    })
  })
}

export interface DormantLocate {
  recordId: string
  recordType: string
  typeLabel: string
  place: string | null
  locatorName: string | null
  locatedAt: string
  daysWaiting: number
}

/**
 * Locates awaiting confirmation in scope, oldest first (monitors). The
 * "finding isn't closing" queue — anything here blocks its case resolving.
 */
export async function listDormantLocates(): Promise<DormantLocate[]> {
  const scope = await getViewerScope()
  if (!isMonitor(scope)) throw new Error("Monitors only.")
  if (!scope.domain) throw new Error("Your account has no domain.")
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.locateState, "located"), ne(records.status, "archived")))
    .orderBy(desc(records.locateAt))
    .limit(200)
  const now = Date.now()
  const items: DormantLocate[] = []
  for (const row of rows) {
    if (row.domain !== scope.domain) continue
    if (scope.role === "DISTRICT_MONITOR" && row.district !== scope.district) {
      continue
    }
    if (scope.role === "COUNTRY_MONITOR" && row.accessLevel !== "country") {
      // Country monitors confirm via district monitors for non-national
      // cases — still list them so nothing goes stale unseen.
    }
    const [locator] = row.locateBy
      ? await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, row.locateBy))
          .limit(1)
      : []
    const at = row.locateAt ? row.locateAt.getTime() : now
    items.push({
      recordId: row.id,
      recordType: row.recordType,
      typeLabel:
        RECORD_TYPE_META[row.recordType as RecordType]?.label ??
        row.recordType.replace(/_/g, " "),
      place: row.locatePlace,
      locatorName: locator?.name ?? null,
      locatedAt: row.locateAt ? row.locateAt.toISOString() : new Date().toISOString(),
      daysWaiting: Math.max(0, Math.floor((now - at) / 86_400_000)),
    })
    if (items.length >= 50) break
  }
  return items.sort((a, b) => b.daysWaiting - a.daysWaiting)
}
