"use server"

import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm"

import { db } from "@/db"
import {
  accidentVehicles,
  accidents,
  branches,
  courtCaseAccess,
  idempotencyKeys,
  missingPersonCases,
  recordAttachments,
  records,
  trafficCitations,
  users,
  vehicleCases,
  vehicles,
  wantedPersonCases,
} from "@/db/schema"
import { withUserCtx, type DbTransaction } from "@/lib/db-context"
import { domainForRecordType } from "@/lib/record-meta"
import { describeRecord } from "@/lib/record-view"
import { toUiRole } from "@/lib/roles"
import { requireUser } from "@/lib/session"
import { defaultRetentionUntil, fileKindFromMime } from "@/lib/format"
import { writeAudit, writeAuditTx } from "@/lib/server/audit"
import {
  canViewRecord,
  isOwnScopeRead,
  type VisibilityScope,
} from "@/lib/visibility"
import type {
  AccessLevel,
  AttachmentKind,
  CaseStatus,
  Domain,
  Role,
  TraceRecord,
} from "@/lib/types"
import { recordSchemas, type RecordType } from "@/validations/record"
import { notifyUser } from "@/lib/actions/notifications"

export interface Page<T> {
  items: T[]
  nextCursor: number | null
}

export interface UploadedAttachment {
  name: string
  url: string
  publicId: string
  fileType: string
  fileSizeBytes: number
  /** N2 SHA-256 of the uploaded bytes (absent on legacy/mobile-old rows). */
  fileHash?: string
}

export interface ViewerScope extends VisibilityScope {
  id: string
  name: string
  role: Role
  district: string | null
  organizationId: string | null
}

/** Raw (unformatted) scope for permission checks — never use display fields. */
export async function getViewerScope(): Promise<ViewerScope> {
  const sessionUser = await requireUser()
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      domain: users.domain,
      branchId: users.branchId,
      district: users.district,
      organizationId: users.organizationId,
      branchDistrict: branches.district,
      branchDomain: branches.domain,
    })
    .from(users)
    .leftJoin(branches, eq(users.branchId, branches.id))
    .where(eq(users.id, sessionUser.id))
    .limit(1)
  if (!row) throw new Error("Account not found.")
  return {
    id: row.id,
    name: row.name,
    role: toUiRole(row.role),
    domain: (row.domain ?? row.branchDomain ?? null) as Domain | null,
    branchId: row.branchId,
    branchDistrict: row.branchDistrict,
    district: row.district,
    organizationId: row.organizationId,
  }
}

type RecordRow = typeof records.$inferSelect

function isMonitor(scope: ViewerScope): boolean {
  return scope.role === "DISTRICT_MONITOR" || scope.role === "COUNTRY_MONITOR"
}

/** Live (unexpired, unrevoked) court grant for this liaison + record? */
async function hasLiveGrant(
  recordId: string,
  liaisonId: string
): Promise<boolean> {
  const [grant] = await db
    .select({ id: courtCaseAccess.id })
    .from(courtCaseAccess)
    .where(
      and(
        eq(courtCaseAccess.recordId, recordId),
        eq(courtCaseAccess.courtLiaisonId, liaisonId)
      )
    )
    .limit(1)
  if (!grant) return false
  const [full] = await db
    .select({
      revokedAt: courtCaseAccess.revokedAt,
      expiresAt: courtCaseAccess.expiresAt,
    })
    .from(courtCaseAccess)
    .where(eq(courtCaseAccess.id, grant.id))
    .limit(1)
  if (!full || full.revokedAt) return false
  if (full.expiresAt && full.expiresAt <= new Date()) return false
  return true
}

/** Live liaison grants on a record (for status-change notifications). */
async function liveLiaisonIds(recordId: string): Promise<string[]> {
  const grants = await db
    .select({
      liaisonId: courtCaseAccess.courtLiaisonId,
      revokedAt: courtCaseAccess.revokedAt,
      expiresAt: courtCaseAccess.expiresAt,
    })
    .from(courtCaseAccess)
    .where(eq(courtCaseAccess.recordId, recordId))
  const now = new Date()
  return grants
    .filter((grant) => !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > now))
    .map((grant) => grant.liaisonId)
}

function str(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  return typeof value === "string" ? value.trim() : ""
}

/** Parse a local `yyyy-mm-dd` filter key into a Date (end-of-day when `end`). */
function parseDateKey(
  key: string | undefined,
  end = false
): Date | null {
  if (!key) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim())
  if (!match) return null
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    end ? 23 : 0,
    end ? 59 : 0,
    end ? 59 : 0,
    end ? 999 : 0
  )
  return Number.isNaN(date.getTime()) ? null : date
}

/** Find-or-create an ad-hoc vehicle row for a plate (is_verified: false). */
async function resolveVehicleByPlate(tx: DbTransaction, plate: string) {
  const normalized = plate.trim().toUpperCase()
  if (!normalized) return null
  const [existing] = await tx
    .select()
    .from(vehicles)
    .where(eq(vehicles.plateNumber, normalized))
    .limit(1)
  if (existing) return existing
  const [created] = await tx
    .insert(vehicles)
    .values({ plateNumber: normalized })
    .returning()
  return created
}

/** A vehicle is flagged while an active missing/offense/impound case points at it. */
async function refreshVehicleFlag(
  tx: DbTransaction,
  vehicleId: string
): Promise<void> {
  const rows = await tx
    .select({ id: vehicleCases.id })
    .from(vehicleCases)
    .where(
      and(
        eq(vehicleCases.vehicleId, vehicleId),
        eq(vehicleCases.status, "active"),
        inArray(vehicleCases.caseType, [
          "missing_vehicle",
          "vehicle_offense",
          "vehicle_impoundment",
        ])
      )
    )
    .limit(1)
  await tx
    .update(vehicles)
    .set({ isFlagged: rows.length > 0, updatedAt: new Date() })
    .where(eq(vehicles.id, vehicleId))
}

/** Write the coded projection rows for a record (kept in app code, not triggers). */
async function writeCodedProjections(
  tx: DbTransaction,
  record: RecordRow,
  data: Record<string, unknown>
): Promise<void> {
  // Clear stale projections for this record, then rewrite.
  // Snapshot the citation row first (F3): monitor-set court scheduling and
  // the derived paid flag must survive rewrites — the delete below wipes it.
  const [priorCitation] =
    record.recordType === "traffic_citation"
      ? await tx
          .select({
            ticketNumber: trafficCitations.ticketNumber,
            statuteCode: trafficCitations.statuteCode,
            dueDate: trafficCitations.dueDate,
            voidedAt: trafficCitations.voidedAt,
            voidReason: trafficCitations.voidReason,
            voidBy: trafficCitations.voidBy,
            courtDate: trafficCitations.courtDate,
            courtId: trafficCitations.courtId,
            isPaid: trafficCitations.isPaid,
          })
          .from(trafficCitations)
          .where(eq(trafficCitations.recordId, record.id))
          .limit(1)
      : []
  await tx.delete(missingPersonCases).where(eq(missingPersonCases.recordId, record.id))
  await tx.delete(wantedPersonCases).where(eq(wantedPersonCases.recordId, record.id))
  await tx.delete(vehicleCases).where(eq(vehicleCases.recordId, record.id))
  await tx.delete(trafficCitations).where(eq(trafficCitations.recordId, record.id))
  const [accident] = await tx
    .select({ id: accidents.id })
    .from(accidents)
    .where(eq(accidents.recordId, record.id))
    .limit(1)
  if (accident) await tx.delete(accidents).where(eq(accidents.id, accident.id))

  switch (record.recordType) {
    case "missing_person": {
      await tx.insert(missingPersonCases).values({
        recordId: record.id,
        personId: record.personId ?? undefined,
        fullName: str(data, "full_name"),
        age: typeof data.age === "number" ? data.age : undefined,
        lastSeenLocation: str(data, "last_seen_location") || undefined,
        lastSeenDate: str(data, "last_seen_date") || undefined,
        district: record.district,
        status: record.status,
      })
      break
    }
    case "wanted_person": {
      const danger = str(data, "danger_level")
      await tx.insert(wantedPersonCases).values({
        recordId: record.id,
        personId: record.personId ?? undefined,
        fullName: str(data, "full_name"),
        offense: str(data, "offense"),
        dangerLevel: (["low", "medium", "high", "extreme"] as const).includes(
          danger as "low"
        )
          ? (danger as "low" | "medium" | "high" | "extreme")
          : undefined,
        district: record.district,
        status: record.status,
      })
      break
    }
    case "missing_vehicle":
    case "vehicle_offense":
    case "vehicle_impoundment": {
      const plate = str(data, "plate_number")
      if (plate && record.vehicleId) {
        await tx.insert(vehicleCases).values({
          recordId: record.id,
          vehicleId: record.vehicleId,
          caseType: record.recordType,
          plateNumber: plate.trim().toUpperCase(),
          district: record.district,
          status: record.status,
        })
        await refreshVehicleFlag(tx, record.vehicleId)
      }
      break
    }
    case "road_accident": {
      const [row] = await tx
        .insert(accidents)
        .values({
          recordId: record.id,
          accidentDate: str(data, "accident_date"),
          location: str(data, "location"),
          district: record.district,
          fatalities: typeof data.fatalities === "number" ? data.fatalities : 0,
          injuries: typeof data.injuries === "number" ? data.injuries : 0,
          status: record.status,
        })
        .returning({ id: accidents.id })
      const involved = Array.isArray(data.vehicles_involved)
        ? (data.vehicles_involved as Array<Record<string, unknown>>)
        : []
      for (const entry of involved) {
        const plate = typeof entry.plate_number === "string" ? entry.plate_number : ""
        if (!plate.trim()) continue
        const vehicle = await resolveVehicleByPlate(tx, plate)
        if (!vehicle) continue
        await tx.insert(accidentVehicles).values({
          accidentId: row.id,
          vehicleId: vehicle.id,
          role: typeof entry.role === "string" ? entry.role : undefined,
        })
      }
      break
    }
    case "traffic_citation": {
      // Preserved from the pre-delete snapshot above (F3 + Phase 1).
      // Ticket numbers are stable for life: keep the existing one, or mint
      // one for legacy rows that predate Phase 1.
      const { generateTicketNo } = await import("@/lib/format")
      await tx.insert(trafficCitations).values({
        recordId: record.id,
        vehicleId: record.vehicleId ?? undefined,
        violationType: str(data, "violation_type"),
        fineAmount: typeof data.fine_amount === "number" ? String(data.fine_amount) : undefined,
        isPaid: priorCitation?.isPaid ?? false,
        ticketNumber: priorCitation?.ticketNumber ?? generateTicketNo(),
        statuteCode:
          (typeof data.statute_code === "string" && data.statute_code.trim()) ||
          priorCitation?.statuteCode ||
          undefined,
        dueDate:
          (typeof data.due_date === "string" && data.due_date) ||
          priorCitation?.dueDate ||
          undefined,
        voidedAt: priorCitation?.voidedAt ?? undefined,
        voidReason: priorCitation?.voidReason ?? undefined,
        voidBy: priorCitation?.voidBy ?? undefined,
        courtDate: priorCitation?.courtDate ?? undefined,
        courtId: priorCitation?.courtId ?? undefined,
        district: record.district,
      })
      break
    }
    default:
      break
  }
}

async function toTraceRecord(
  tx: DbTransaction,
  record: RecordRow
): Promise<TraceRecord> {
  const [reporter] = record.reportedBy
    ? await tx
        .select({ name: users.name, role: users.role })
        .from(users)
        .where(eq(users.id, record.reportedBy))
        .limit(1)
    : []
  const [branch] = await tx
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.id, record.branchId))
    .limit(1)
  const attachments = await tx
    .select()
    .from(recordAttachments)
    .where(eq(recordAttachments.recordId, record.id))
  const view = describeRecord(
    record.recordType as RecordType,
    (record.data ?? {}) as Record<string, unknown>
  )
  const payload = (record.data ?? {}) as Record<string, unknown>
  const latitude =
    typeof payload.latitude === "number" ? payload.latitude : null
  const longitude =
    typeof payload.longitude === "number" ? payload.longitude : null
  return {
    id: record.id,
    recordType: record.recordType as RecordType,
    domain: record.domain as Domain,
    branchId: record.branchId,
    branchName: branch?.name,
    district: record.district,
    vehicleId: record.vehicleId ?? undefined,
    personId: record.personId ?? undefined,
    accessLevel: record.accessLevel as AccessLevel,
    status: record.status as CaseStatus,
    reportedBy: record.reportedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    title: view.title,
    summary: view.summary,
    author: {
      name: reporter?.name ?? "Unknown officer",
      role: reporter ? toUiRole(reporter.role) : "OFFICER",
    },
    badges: view.badges,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.storagePath.split("/").pop() ?? "file",
      sizeBytes: attachment.fileSizeBytes ?? 0,
      kind: kindForAttachment(attachment.fileType),
      url: attachment.url,
      fileHash: attachment.fileHash ?? undefined,
      retentionUntil: attachment.retentionUntil?.toISOString(),
    })),
    geo:
      latitude != null && longitude != null
        ? { latitude, longitude }
        : null,
  }
}

/** N2 MIME → display kind (legacy rows predate stored kinds). */
function kindForAttachment(fileType: string): AttachmentKind {
  const type = fileType.toLowerCase()
  if (type.startsWith("image/")) return "image"
  if (type === "application/pdf") return "pdf"
  if (type.startsWith("video/")) return "video"
  if (type.startsWith("audio/")) return "audio"
  if (type.includes("forensic") || type.includes("lab")) return "lab"
  return "doc"
}

// ---------------------------------------------------------------------------
// Listing + detail (police roles; liaisons read via live grants)
// ---------------------------------------------------------------------------

interface ListRecordsInput {
  cursor?: number
  limit?: number
  type?: RecordType
  status?: CaseStatus
  /**
   * Feed scope tab (U1) — narrows the caller's already-visible feed without
   * ever widening it. Defaults to "all" (previous behaviour).
   *   officer:          mine = own branch, district = district-level in own
   *                     district, country = country-level domain-wide.
   *   district_monitor: mine = filed by me, district = all in district, country
   *                     = country-level in district.
   *   country_monitor:  mine = filed by me, district = all (= country feed,
   *                     no district), country = all country-level.
   */
  scope?: "all" | "mine" | "district" | "country"
  /** Free-text search over the derived title/summary/badges/type. */
  query?: string
  /** Filed-date window (local `yyyy-mm-dd` keys, inclusive). */
  from?: string
  to?: string
}

export async function listRecords({
  cursor = 0,
  limit = 10,
  type,
  status,
  scope: requestedScope = "all",
  query = "",
  from,
  to,
}: ListRecordsInput = {}): Promise<Page<TraceRecord>> {
  const scope = await getViewerScope()
  if (
    scope.role !== "OFFICER" &&
    scope.role !== "DISTRICT_MONITOR" &&
    scope.role !== "COUNTRY_MONITOR"
  ) {
    throw new Error("Your role does not have a case feed.")
  }

  return withUserCtx(scope.id, async (tx) => {
    // Visibility is pushed into the query — no in-memory filtering, so
    // pagination is stable and unreadable rows never leave the database.
    const filters = []
    if (type) filters.push(eq(records.recordType, type))
    if (status) filters.push(eq(records.status, status))
    const fromDate = parseDateKey(from)
    const toDate = parseDateKey(to, true)
    if (fromDate) filters.push(gte(records.createdAt, fromDate))
    if (toDate) filters.push(lte(records.createdAt, toDate))

    let visibility
    if (scope.role === "OFFICER") {
      const ownDistrict = scope.branchDistrict ?? scope.district
      visibility = and(
        eq(records.domain, scope.domain!),
        or(
          eq(records.branchId, scope.branchId!),
          and(
            eq(records.accessLevel, "district"),
            eq(records.district, ownDistrict as never)
          ),
          eq(records.accessLevel, "country")
        )
      )
    } else if (scope.role === "DISTRICT_MONITOR") {
      visibility = and(
        eq(records.domain, scope.domain!),
        eq(records.district, scope.district as never)
      )
    } else {
      visibility = and(
        eq(records.domain, scope.domain!),
        eq(records.accessLevel, "country")
      )
    }

    // U1 scope tabs — narrowing only, intersected with the visibility above so
    // a tab can never widen what the role is allowed to see.
    if (requestedScope === "mine") {
      if (scope.role === "OFFICER") {
        filters.push(eq(records.branchId, scope.branchId!))
      } else {
        filters.push(eq(records.reportedBy, scope.id))
      }
    } else if (requestedScope === "district") {
      if (scope.role === "OFFICER") {
        filters.push(eq(records.accessLevel, "district"))
        filters.push(
          eq(records.district, (scope.branchDistrict ?? scope.district) as never)
        )
      }
      // District/country monitors: district tab = whole district feed, which
      // is already `visibility` — no extra filter needed.
    } else if (requestedScope === "country") {
      if (scope.role === "OFFICER") {
        filters.push(eq(records.accessLevel, "country"))
      } else if (scope.role === "DISTRICT_MONITOR") {
        filters.push(eq(records.accessLevel, "country"))
      }
      // Country monitors: country tab = whole feed — no extra filter needed.
    }

    const q = query.trim().toLowerCase()

    // Free-text search runs over the derived title/summary (stored payload
    // shapes differ per type, so filtering happens after `toTraceRecord`).
    // The candidate window is capped to keep search bounded; pagination then
    // slices the filtered array so cursors stay stable while searching.
    if (q) {
      const SEARCH_WINDOW = 300
      const rows = await tx
        .select()
        .from(records)
        .where(filters.length > 0 ? and(visibility, ...filters) : visibility)
        .orderBy(desc(records.createdAt), desc(records.id))
        .limit(SEARCH_WINDOW)
      const all: TraceRecord[] = []
      for (const row of rows) all.push(await toTraceRecord(tx, row))
      const filtered = all.filter((item) =>
        [
          item.title,
          item.summary,
          item.recordType.replace(/_/g, " "),
          item.status,
          item.branchName ?? "",
          item.author.name,
          ...item.badges.map((badge) => badge.label),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      const page = filtered.slice(cursor, cursor + limit)
      return {
        items: page,
        nextCursor:
          cursor + limit < filtered.length ? cursor + limit : null,
      }
    }

    const rows = await tx
      .select()
      .from(records)
      .where(filters.length > 0 ? and(visibility, ...filters) : visibility)
      .orderBy(desc(records.createdAt), desc(records.id))
      .limit(limit + 1)
      .offset(cursor)

    const page = rows.length > limit ? rows.slice(0, limit) : rows
    const items: TraceRecord[] = []
    for (const row of page) items.push(await toTraceRecord(tx, row))
    return {
      items,
      nextCursor: rows.length > limit ? cursor + limit : null,
    }
  })
}

export async function getRecord(id: string): Promise<TraceRecord> {
  const scope = await getViewerScope()
  // Owner-connection read for the gate decision itself; the RLS-scoped
  // transaction below does the actual data return.
  const [record] = await db.select().from(records).where(eq(records.id, id)).limit(1)
  if (!record) throw new Error("Record not found.")

  if (scope.role === "COURT_LIAISON") {
    if (!(await hasLiveGrant(id, scope.id))) {
      await writeAudit({
        actorId: scope.id,
        actionType: "court_case_viewed",
        recordId: id,
        reason: "DENIED: no live referral grants access to this case.",
      })
      throw new Error("You don't have access to this record.")
    }
    return withUserCtx(scope.id, async (tx) => {
      const [row] = await tx.select().from(records).where(eq(records.id, id)).limit(1)
      if (!row) throw new Error("Record not found.")
      await writeAuditTx(tx, {
        actorId: scope.id,
        actionType: "court_case_viewed",
        recordId: id,
      })
      // F4 SLA: stamp the liaison's first view once (web + mobile share this path).
      await tx
        .update(courtCaseAccess)
        .set({ firstViewedAt: new Date() })
        .where(
          and(
            eq(courtCaseAccess.recordId, id),
            eq(courtCaseAccess.courtLiaisonId, scope.id),
            isNull(courtCaseAccess.firstViewedAt)
          )
        )
      return toTraceRecord(tx, row)
    })
  }

  if (!canViewRecord(scope, record)) {
    await writeAudit({
      actorId: scope.id,
      actionType: "cross_branch_access",
      recordId: id,
      reason: `DENIED: attempted ${record.district}/${record.accessLevel} ${record.recordType} outside own scope.`,
    })
    throw new Error("You don't have access to this record.")
  }

  return withUserCtx(scope.id, async (tx) => {
    const [row] = await tx.select().from(records).where(eq(records.id, id)).limit(1)
    if (!row) throw new Error("Record not found.")
    // Reads inside the viewer's own narrow scope (officer, own branch) are
    // routine work and stay unlogged; everything wider is audited.
    if (!isOwnScopeRead(scope, row)) {
      const crossedBranch = scope.role === "OFFICER" && row.branchId !== scope.branchId
      const crossedDistrict =
        crossedBranch && row.district !== (scope.branchDistrict ?? scope.district)
      await writeAuditTx(tx, {
        actorId: scope.id,
        actionType: crossedDistrict
          ? "cross_district_access"
          : crossedBranch
            ? "cross_branch_access"
            : "record_viewed",
        recordId: row.id,
        reason: crossedBranch ? "Opened a record outside own branch." : undefined,
      })
    }
    return toTraceRecord(tx, row)
  })
}

/** Raw typed payload for the edit form (same gate as getRecord). */
export async function getRecordData(id: string): Promise<Record<string, unknown>> {
  const scope = await getViewerScope()
  const [record] = await db.select().from(records).where(eq(records.id, id)).limit(1)
  if (!record) throw new Error("Record not found.")
  const allowed =
    scope.role === "COURT_LIAISON"
      ? await hasLiveGrant(id, scope.id)
      : canViewRecord(scope, record)
  if (!allowed) {
    await writeAudit({
      actorId: scope.id,
      actionType: "cross_branch_access",
      recordId: id,
      reason: "DENIED: attempted payload read outside own scope.",
    })
    throw new Error("You don't have access to this record.")
  }
  return withUserCtx(scope.id, async (tx) => {
    if (!isOwnScopeRead(scope, record)) {
      await writeAuditTx(tx, {
        actorId: scope.id,
        actionType: "record_viewed",
        recordId: id,
        reason: "Opened the payload for editing.",
      })
    }
    const [row] = await tx.select().from(records).where(eq(records.id, id)).limit(1)
    if (!row) throw new Error("Record not found.")
    return (row.data ?? {}) as Record<string, unknown>
  })
}

// ---------------------------------------------------------------------------
// Creation (officer / monitor, own domain only)
// ---------------------------------------------------------------------------

/** Can this viewer file a record of this type? Creation is locked to own domain. */
function canCreateType(scope: ViewerScope, type: RecordType): boolean {
  if (scope.role !== "OFFICER" && !isMonitor(scope)) return false
  return domainForRecordType(type) === scope.domain
}

/** Resolve the branch a new record files under, enforcing scope. */
async function resolveFilingBranch(
  scope: ViewerScope,
  requestedBranchId?: string | null
): Promise<{ branchId: string; district: string }> {
  if (scope.role === "OFFICER") {
    if (!scope.branchId || !scope.branchDistrict) {
      throw new Error("Your account is not attached to a branch.")
    }
    return { branchId: scope.branchId, district: scope.branchDistrict }
  }
  if (scope.role === "DISTRICT_MONITOR") {
    if (!requestedBranchId) {
      throw new Error("Choose a branch in your district to file under.")
    }
    const [branch] = await db
      .select()
      .from(branches)
      .where(eq(branches.id, requestedBranchId))
      .limit(1)
    if (!branch || branch.district !== scope.district || branch.domain !== scope.domain) {
      throw new Error("That branch is outside your district.")
    }
    return { branchId: branch.id, district: branch.district }
  }
  // Country monitor — national bulletins filed under any branch in their domain.
  if (!requestedBranchId) throw new Error("Choose a branch to file under.")
  const [branch] = await db
    .select()
    .from(branches)
    .where(eq(branches.id, requestedBranchId))
    .limit(1)
  if (!branch || branch.domain !== scope.domain) {
    throw new Error("That branch is outside your domain.")
  }
  return { branchId: branch.id, district: branch.district }
}

interface CreateRecordInput {
  type: RecordType
  data: Record<string, unknown>
  accessLevel?: AccessLevel
  branchId?: string
  attachments?: UploadedAttachment[]
  /**
   * F2 offline safety: web retries send the same key per filing attempt, so a
   * flaky connection can't file twice. Replays return the original response.
   */
  idempotencyKey?: string
}

export async function createRecord({
  type,
  data,
  accessLevel = "branch",
  branchId,
  attachments = [],
  idempotencyKey,
}: CreateRecordInput): Promise<{ id: string; idempotentReplay?: boolean }> {
  const scope = await getViewerScope()
  if (!canCreateType(scope, type)) {
    await writeAudit({
      actorId: scope.id,
      actionType: "record_viewed",
      reason: `DENIED: attempted to file ${type} outside own domain.`,
    })
    throw new Error("You can't file this type of record.")
  }

  const schema = recordSchemas[type]
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new Error("The record payload didn't pass validation.")
  }
  const payload = parsed.data as Record<string, unknown>

  const level: AccessLevel = accessLevel
  if (!["branch", "district", "country"].includes(level)) {
    throw new Error("Invalid access level.")
  }

  const filing = await resolveFilingBranch(scope, branchId)

  // F2 replay: a retried attempt returns the original filing, not a duplicate.
  const key = idempotencyKey?.trim()
  if (key) {
    const [stored] = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.userId, scope.id))
      )
      .limit(1)
    if (stored) {
      return { ...(stored.response as { id: string }), idempotentReplay: true }
    }
  }

  return withUserCtx(scope.id, async (tx) => {
    // Link person when the payload references a known profile.
    const personId =
      typeof payload.person_id === "string" && payload.person_id
        ? (payload.person_id as string)
        : undefined
    // Link (or ad-hoc create) the vehicle when a plate is present.
    let vehicleId: string | undefined
    const plate =
      typeof payload.plate_number === "string" ? payload.plate_number : ""
    if (plate.trim()) {
      const vehicle = await resolveVehicleByPlate(tx, plate)
      vehicleId = vehicle?.id
    }

    const [inserted] = await tx
      .insert(records)
      .values({
        recordType: type,
        domain: domainForRecordType(type),
        reportedBy: scope.id,
        branchId: filing.branchId,
        district: filing.district as RecordRow["district"],
        vehicleId,
        personId,
        accessLevel: level,
        status: "active",
        data: payload,
      })
      .returning()

    await writeCodedProjections(tx, inserted, payload)

    if (attachments.length > 0) {
      // N2: server-side allowlist (the client checks too, but uploads are
      // direct-to-Cloudinary so the gate must live here as well).
      for (const attachment of attachments) {
        if (!fileKindFromMime(attachment.fileType)) {
          throw new Error(
            `Files of type "${attachment.fileType || "unknown"}" are not accepted.`
          )
        }
      }
      const retainedUntil = new Date(defaultRetentionUntil())
      await tx.insert(recordAttachments).values(
        attachments.map((attachment) => ({
          recordId: inserted.id,
          url: attachment.url,
          storagePath: attachment.publicId,
          fileType: attachment.fileType,
          fileHash: attachment.fileHash,
          fileSizeBytes:
            Number.isFinite(attachment.fileSizeBytes) && attachment.fileSizeBytes >= 0
              ? Math.floor(attachment.fileSizeBytes)
              : undefined,
          retentionUntil: retainedUntil,
          uploadedBy: scope.id,
        }))
      )
    }

    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_created",
      recordId: inserted.id,
    })
    const result = { id: inserted.id }
    if (key) {
      try {
        await tx.insert(idempotencyKeys).values({
          key,
          userId: scope.id,
          statusCode: 200,
          response: result,
        })
      } catch {
        // Key raced (parallel retry): the case was still filed exactly once
        // by this transaction; the duplicate response simply isn't cached.
      }
    }
    return result
  })
}

// ---------------------------------------------------------------------------
// Updates, status, access level, reassignment
// ---------------------------------------------------------------------------

export async function updateRecord({
  id,
  data,
}: {
  id: string
  data: Record<string, unknown>
}): Promise<void> {
  const scope = await getViewerScope()
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx.select().from(records).where(eq(records.id, id)).limit(1)
    if (!record) throw new Error("Record not found.")
    if (!canViewRecord(scope, record)) {
      await writeAudit({
        actorId: scope.id,
        actionType: "record_viewed",
        recordId: id,
        reason: "DENIED: attempted edit outside own scope.",
      })
      throw new Error("You don't have access to this record.")
    }

    const isFiler = record.reportedBy === scope.id
    const monitorInScope =
      isMonitor(scope) &&
      record.domain === scope.domain &&
      (scope.role === "COUNTRY_MONITOR"
        ? record.accessLevel === "country"
        : record.district === scope.district)

    if (record.status !== "active") {
      // After active: content is locked; use status/notes flows instead.
      throw new Error("Only active records can be edited. Change status or add a follow-up note instead.")
    }
    if (!isFiler && !monitorInScope) {
      throw new Error("Only the filing officer or a monitor in scope can edit this record.")
    }

    const schema = recordSchemas[record.recordType as RecordType]
    const parsed = schema.safeParse(data)
    if (!parsed.success) throw new Error("The record payload didn't pass validation.")

    await tx
      .update(records)
      .set({ data: parsed.data as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(records.id, id))
    const [updated] = await tx.select().from(records).where(eq(records.id, id)).limit(1)
    await writeCodedProjections(tx, updated, parsed.data as Record<string, unknown>)
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      recordId: id,
      reason: isFiler ? "Filing officer edit." : "Monitor reviewed change.",
    })
  })
}

export async function changeStatus({
  id,
  status,
  reason,
}: {
  id: string
  status: CaseStatus
  reason?: string
}): Promise<void> {
  const scope = await getViewerScope()
  if (!isMonitor(scope)) throw new Error("Only monitors can change case status.")
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx.select().from(records).where(eq(records.id, id)).limit(1)
    if (!record) throw new Error("Record not found.")
    const inScope =
      record.domain === scope.domain &&
      (scope.role === "COUNTRY_MONITOR"
        ? record.accessLevel === "country"
        : record.district === scope.district)
    if (!inScope) {
      await writeAudit({
        actorId: scope.id,
        actionType: "record_viewed",
        recordId: id,
        reason: "DENIED: attempted status change outside own scope.",
      })
      throw new Error("That case is outside your scope.")
    }
    await tx
      .update(records)
      .set({ status, updatedAt: new Date() })
      .where(eq(records.id, id))
    // Keep coded projections + flag in sync with the new status.
    const [updated] = await tx.select().from(records).where(eq(records.id, id)).limit(1)
    await writeCodedProjections(tx, updated, (updated.data ?? {}) as Record<string, unknown>)
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "status_changed",
      recordId: id,
      reason: reason ?? `Status → ${status}.`,
    })
    // Notify the filing officer and any liaison with a live referral.
    const view = describeRecord(
      updated.recordType as RecordType,
      (updated.data ?? {}) as Record<string, unknown>
    )
    if (updated.reportedBy !== scope.id) {
      await notifyUser(tx, {
        userId: updated.reportedBy,
        type: "status_changed",
        recordId: id,
        message: `Status of "${view.title}" changed to ${status} by ${scope.name}.`,
      })
    }
    for (const liaisonId of await liveLiaisonIds(id)) {
      await notifyUser(tx, {
        userId: liaisonId,
        type: "status_changed",
        recordId: id,
        message: `Status of referred case "${view.title}" changed to ${status}.`,
      })
    }
  })
}

export async function setAccessLevel({
  id,
  level,
}: {
  id: string
  level: AccessLevel
}): Promise<void> {
  const scope = await getViewerScope()
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx.select().from(records).where(eq(records.id, id)).limit(1)
    if (!record) throw new Error("Record not found.")

    if (scope.role === "OFFICER") {
      if (record.reportedBy !== scope.id) {
        throw new Error("Officers can only set the access level on records they filed.")
      }
      // Officers may widen their own record; pulling back down is monitor-only.
      const order = { branch: 0, district: 1, country: 2 } as const
      if (order[level] < order[record.accessLevel as AccessLevel]) {
        throw new Error("De-escalation is a monitor action.")
      }
    } else if (scope.role === "DISTRICT_MONITOR") {
      if (record.domain !== scope.domain || record.district !== scope.district) {
        throw new Error("That case is outside your district.")
      }
    } else if (scope.role === "COUNTRY_MONITOR") {
      if (record.domain !== scope.domain) throw new Error("That case is outside your domain.")
      if (level !== "country") throw new Error("Country monitors can only escalate to country.")
    } else {
      throw new Error("Your role can't change access levels.")
    }

    await tx
      .update(records)
      .set({ accessLevel: level, updatedAt: new Date() })
      .where(eq(records.id, id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      recordId: id,
      reason: `Access level → ${level}.`,
    })
  })
}

/** District monitor moves a case to another branch in the same district. */
export async function reassignRecord({
  id,
  branchId,
}: {
  id: string
  branchId: string
}): Promise<void> {
  const scope = await getViewerScope()
  if (scope.role !== "DISTRICT_MONITOR") {
    throw new Error("Only district monitors can reassign cases.")
  }
  await withUserCtx(scope.id, async (tx) => {
    const [record] = await tx.select().from(records).where(eq(records.id, id)).limit(1)
    if (!record) throw new Error("Record not found.")
    if (record.domain !== scope.domain || record.district !== scope.district) {
      throw new Error("That case is outside your district.")
    }
    const [branch] = await tx
      .select()
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1)
    if (!branch || branch.district !== scope.district || branch.domain !== scope.domain) {
      throw new Error("Cases can only move within your district and domain.")
    }
    if (branch.id === record.branchId) return
    await tx
      .update(records)
      .set({ branchId: branch.id, updatedAt: new Date() })
      .where(eq(records.id, id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      recordId: id,
      reason: `Reassigned to ${branch.name}.`,
    })
  })
}

/** Cases referred to the current court liaison. Listing is not audited —
 * only opening a case (via getRecord) writes court_case_viewed. */
export async function getMyReferrals(): Promise<
  {
    referralId: string
    expiresAt: string | null
    outcome: string
    outcomeRecordedAt: string | null
    record: TraceRecord
  }[]
> {
  const scope = await getViewerScope()
  if (scope.role !== "COURT_LIAISON") throw new Error("Court liaisons only.")
  return withUserCtx(scope.id, async (tx) => {
    const now = new Date()
    const grants = await tx
      .select()
      .from(courtCaseAccess)
      .where(eq(courtCaseAccess.courtLiaisonId, scope.id))
    const live = grants.filter(
      (grant) =>
        !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > now)
    )
    const out: {
      referralId: string
      expiresAt: string | null
      outcome: string
      outcomeRecordedAt: string | null
      record: TraceRecord
    }[] = []
    for (const grant of live) {
      const [record] = await tx
        .select()
        .from(records)
        .where(eq(records.id, grant.recordId))
        .limit(1)
      if (!record) continue
      out.push({
        referralId: grant.id,
        expiresAt: grant.expiresAt?.toISOString() ?? null,
        outcome: grant.outcome,
        outcomeRecordedAt: grant.outcomeRecordedAt?.toISOString() ?? null,
        record: await toTraceRecord(tx, record),
      })
    }
    return out
  })
}
