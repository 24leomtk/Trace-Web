"use server"

import { and, desc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  actions,
  branches,
  courtCaseAccess,
  insurancePolicies,
  organizations,
  personsOfInterest,
  records,
  referralDocuments,
  users,
  vehicleCases,
  vehicles,
  wantedPersonCases,
} from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { verifyApiKey } from "@/lib/actions/apikeys"
import { normalizePlate } from "@/lib/format"
import { describeRecord } from "@/lib/record-view"
import { toUiRole } from "@/lib/roles"
import { requireUser } from "@/lib/session"
import { writeAudit, writeAuditTx } from "@/lib/server/audit"
import type { AccessLogEntry, Domain } from "@/lib/types"
import type { RecordType } from "@/validations/record"
import {
  courtOutcomeSchema,
  courtReferralSchema,
} from "@/validations/admin"
import { getViewerScope, type ViewerScope } from "@/lib/actions/records"
import { canViewRecord } from "@/lib/visibility"
import { notifyUser } from "@/lib/actions/notifications"

// ---------------------------------------------------------------------------
// Court referrals — monitors refer a specific case to a specific liaison.
// Default grant: 90 days, renewable by a monitor, unlimited renewals.
// ---------------------------------------------------------------------------

const REFERRAL_DEFAULT_DAYS = 90

// ---------------------------------------------------------------------------
// Lookup throttling — safety checks are unauthenticated-enumeration risks
// (probing IDs to discover who/what is flagged), so bulk probing is capped
// and every attempt is already audit-logged by the callers below.
// ---------------------------------------------------------------------------

const LOOKUP_ACTION_TYPES = [
  "cross_branch_access",
  "cross_district_access",
  "insurer_flag_lookup",
] as const

export async function checkLookupThrottle(actorId: string): Promise<void> {
  const windows = [
    { ms: 60_000, max: 20, label: ">20/min" },
    { ms: 3_600_000, max: 300, label: ">300/hr" },
  ]
  for (const window of windows) {
    const rows = await db
      .select({ id: actions.id })
      .from(actions)
      .where(
        and(
          eq(actions.actorId, actorId),
          inArray(actions.actionType, [...LOOKUP_ACTION_TYPES]),
          gte(actions.createdAt, new Date(Date.now() - window.ms))
        )
      )
      .limit(window.max + 1)
    if (rows.length > window.max) {
      await writeAudit({
        actorId,
        actionType: "cross_branch_access",
        reason: `THROTTLED: lookup rate limit exceeded (${window.label}).`,
      })
      throw new Error("Too many lookups — slow down and try again later.")
    }
  }
}

function recordTitle(recordType: string, data: Record<string, unknown>): string {
  return describeRecord(recordType as RecordType, data).title
}

export async function referCaseToCourt(input: {
  recordId: string
  courtLiaisonId: string
  reason?: string
  expiresAt?: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (scope.role !== "DISTRICT_MONITOR" && scope.role !== "COUNTRY_MONITOR") {
    throw new Error("Only monitors can refer cases to court.")
  }
  const parsed = courtReferralSchema.safeParse({
    ...input,
    expiresAt:
      input.expiresAt ??
      new Date(Date.now() + REFERRAL_DEFAULT_DAYS * 86400000)
        .toISOString()
        .slice(0, 10),
  })
  if (!parsed.success) throw new Error("The referral didn't pass validation.")

  return withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, parsed.data.recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    if (!canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }

    const [liaison] = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, parsed.data.courtLiaisonId))
      .limit(1)
    if (!liaison || liaison.role !== "court_liaison") {
      throw new Error("Referrals can only go to a court liaison account.")
    }

    const [grant] = await tx
      .insert(courtCaseAccess)
      .values({
        recordId: record.id,
        courtLiaisonId: liaison.id,
        referredBy: scope.id,
        reason: parsed.data.reason || undefined,
        expiresAt: new Date(`${parsed.data.expiresAt}T23:59:59.999Z`),
      })
      .returning({ id: courtCaseAccess.id })

    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "court_case_referred",
      recordId: record.id,
      reason: parsed.data.reason || "Referred for prosecution.",
    })
    await notifyUser(tx, {
      userId: liaison.id,
      type: "referral_received",
      recordId: record.id,
      message: `New referral from ${scope.name}: ${recordTitle(record.recordType, (record.data ?? {}) as Record<string, unknown>)}.`,
    })
    return { id: grant.id }
  })
}

export async function renewCourtAccess(referralId: string): Promise<void> {
  const scope = await getViewerScope()
  if (scope.role !== "DISTRICT_MONITOR" && scope.role !== "COUNTRY_MONITOR") {
    throw new Error("Only monitors can renew court access.")
  }
  await withUserCtx(scope.id, async (tx) => {
    const [grant] = await tx
      .select()
      .from(courtCaseAccess)
      .where(eq(courtCaseAccess.id, referralId))
      .limit(1)
    if (!grant || grant.revokedAt) throw new Error("Referral not found.")
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, grant.recordId))
      .limit(1)
    if (!record || !canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    await tx
      .update(courtCaseAccess)
      .set({
        expiresAt: new Date(Date.now() + REFERRAL_DEFAULT_DAYS * 86400000),
        renewedAt: new Date(),
        renewalCount: (grant.renewalCount ?? 0) + 1,
      })
      .where(eq(courtCaseAccess.id, referralId))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "court_access_renewed",
      recordId: grant.recordId,
    })
    await notifyUser(tx, {
      userId: grant.courtLiaisonId,
      type: "referral_updated",
      recordId: grant.recordId,
      message: `Your access was renewed for 90 days by ${scope.name}.`,
    })
  })
}

export async function revokeCourtAccess(referralId: string): Promise<void> {
  const scope = await getViewerScope()
  if (scope.role !== "DISTRICT_MONITOR" && scope.role !== "COUNTRY_MONITOR") {
    throw new Error("Only monitors can revoke court access.")
  }
  await withUserCtx(scope.id, async (tx) => {
    const [grant] = await tx
      .select()
      .from(courtCaseAccess)
      .where(eq(courtCaseAccess.id, referralId))
      .limit(1)
    if (!grant || grant.revokedAt) return
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, grant.recordId))
      .limit(1)
    if (!record || !canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    await tx
      .update(courtCaseAccess)
      .set({ revokedAt: new Date() })
      .where(eq(courtCaseAccess.id, referralId))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "court_access_renewed",
      recordId: grant.recordId,
      reason: "Court access revoked early.",
    })
    await notifyUser(tx, {
      userId: grant.courtLiaisonId,
      type: "referral_updated",
      recordId: grant.recordId,
      message: `Your access was revoked by ${scope.name}.`,
    })
  })
}

export async function recordCourtOutcome(input: {
  referralId: string
  outcome: string
  outcomeNotes?: string
}): Promise<void> {
  const scope = await getViewerScope()
  if (scope.role !== "COURT_LIAISON") {
    throw new Error("Only court liaisons record outcomes.")
  }
  const parsed = courtOutcomeSchema.safeParse(input)
  if (!parsed.success) throw new Error("The outcome didn't pass validation.")

  await withUserCtx(scope.id, async (tx) => {
    const [grant] = await tx
      .select()
      .from(courtCaseAccess)
      .where(eq(courtCaseAccess.id, parsed.data.referralId))
      .limit(1)
    if (!grant || grant.courtLiaisonId !== scope.id || grant.revokedAt) {
      throw new Error("Referral not found.")
    }
    // Outcomes often land after access lapses — recording stays open on
    // expired-but-unrevoked grants so the loop can still close.
    const late = grant.expiresAt != null && grant.expiresAt <= new Date()
    await tx
      .update(courtCaseAccess)
      .set({
        outcome: parsed.data.outcome as typeof grant.outcome,
        outcomeNotes: parsed.data.outcomeNotes || undefined,
        outcomeRecordedBy: scope.id,
        outcomeRecordedAt: new Date(),
      })
      .where(eq(courtCaseAccess.id, grant.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "court_case_outcome_recorded",
      recordId: grant.recordId,
      reason: late
        ? `Outcome: ${parsed.data.outcome} (recorded after grant expiry).`
        : `Outcome: ${parsed.data.outcome}.`,
    })
    await notifyUser(tx, {
      userId: grant.referredBy,
      type: "outcome_recorded",
      recordId: grant.recordId,
      message: `Outcome recorded by the court: ${parsed.data.outcome}.`,
    })
  })
}

// ---------------------------------------------------------------------------
// Safety lookups — read-only, minimal, always audited. No full case files.
// ---------------------------------------------------------------------------

export interface WantedCheckResult {
  wanted: boolean
  // Minimal detail only: enough to act safely, not the case file.
  dangerLevel?: string
  district?: string
}

/** Cross-domain check: "is this national ID wanted?" */
export async function checkWantedByNationalId(
  nationalId: string
): Promise<WantedCheckResult> {
  const scope = await getViewerScope()
  if (scope.role !== "OFFICER" && scope.role !== "DISTRICT_MONITOR" && scope.role !== "COUNTRY_MONITOR") {
    throw new Error("Safety lookups are for police users.")
  }
  const id = nationalId.trim()
  if (!id) return { wanted: false }
  await checkLookupThrottle(scope.id)
  return withUserCtx(scope.id, async (tx) => {
    // Indexed path: person row (national_id is indexed) -> active wanted
    // projections (person_id is indexed) -> live parent record.
    const [person] = await tx
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(eq(personsOfInterest.nationalId, id))
      .limit(1)
    if (person) {
      const indexed = await tx
        .select({
          recordId: wantedPersonCases.recordId,
          dangerLevel: wantedPersonCases.dangerLevel,
          district: wantedPersonCases.district,
        })
        .from(wantedPersonCases)
        .innerJoin(records, eq(wantedPersonCases.recordId, records.id))
        .where(
          and(
            eq(wantedPersonCases.personId, person.id),
            eq(wantedPersonCases.status, "active"),
            eq(records.status, "active"),
            eq(records.recordType, "wanted_person")
          )
        )
        .limit(1)
      if (indexed.length > 0) {
        const hit = indexed[0]
        await writeAuditTx(tx, {
          actorId: scope.id,
          actionType: "cross_branch_access",
          recordId: hit.recordId,
          reason: "Wanted check (national ID): MATCH.",
        })
        return {
          wanted: true,
          dangerLevel: hit.dangerLevel ?? undefined,
          district: hit.district ?? undefined,
        }
      }
    }
    // Fallback: records filed with a national ID but no person link yet.
    // Bounded scan — person linking at filing time keeps this rare.
    const wanted = await tx
      .select({ id: records.id, district: records.district, data: records.data })
      .from(records)
      .where(and(eq(records.recordType, "wanted_person"), eq(records.status, "active")))
      .limit(50)
    const match = wanted.find((row) => {
      const d = (row.data ?? {}) as Record<string, unknown>
      return (
        (typeof d.national_id === "string" && d.national_id.trim() === id) ||
        (person != null &&
          typeof d.person_id === "string" &&
          d.person_id === person.id)
      )
    })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "cross_branch_access",
      recordId: match?.id,
      reason: `Wanted check (national ID): ${match ? "MATCH" : "no match"}.`,
    })
    if (!match) return { wanted: false }
    const d = (match.data ?? {}) as Record<string, unknown>
    return {
      wanted: true,
      dangerLevel: typeof d.danger_level === "string" ? d.danger_level : undefined,
      district: match.district,
    }
  })
}

export interface FlagCheckResult {
  flagged: boolean
}

/** "Is this plate flagged?" — single indexed lookup, boolean only. */
export async function checkPlateFlag(plateNumber: string): Promise<FlagCheckResult> {
  const scope = await getViewerScope()
  if (
    scope.role !== "OFFICER" &&
    scope.role !== "DISTRICT_MONITOR" &&
    scope.role !== "COUNTRY_MONITOR"
  ) {
    throw new Error("Safety lookups are for police users.")
  }
  const plate = plateNumber.trim().toUpperCase()
  if (!plate) return { flagged: false }
  await checkLookupThrottle(scope.id)
  return withUserCtx(scope.id, async (tx) => {
    const [vehicle] = await tx
      .select({ id: vehicles.id, isFlagged: vehicles.isFlagged })
      .from(vehicles)
      .where(eq(vehicles.plateNumber, plate))
      .limit(1)
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "cross_branch_access",
      vehicleId: vehicle?.id,
      reason: `Plate flag check ${plate}: ${vehicle?.isFlagged ? "FLAGGED" : "clear"}.`,
    })
    return { flagged: vehicle?.isFlagged ?? false }
  })
}

/** Insurer self-serve: flag-only lookup on any plate, scoped to own org. */
export async function insurerPlateLookup(
  plateNumber: string
): Promise<FlagCheckResult> {  const scope = await getViewerScope()
  if (scope.role !== "INSURANCE_PORTAL_USER" || !scope.organizationId) {
    throw new Error("Insurer portal users only.")
  }
  const plate = plateNumber.trim().toUpperCase()
  if (!plate) return { flagged: false }
  await checkLookupThrottle(scope.id)
  return withUserCtx(scope.id, async (tx) => {
    const [vehicle] = await tx
      .select({ id: vehicles.id, isFlagged: vehicles.isFlagged })
      .from(vehicles)
      .where(eq(vehicles.plateNumber, plate))
      .limit(1)
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "insurer_flag_lookup",
      vehicleId: vehicle?.id,
      reason: `Insurer flag lookup ${plate}.`,
    })
    return { flagged: vehicle?.isFlagged ?? false }
  })
}

/** Insurer: read-only list of their own organization's policies. */
export async function getMyPolicies() {  const scope = await getViewerScope()
  if (scope.role !== "INSURANCE_PORTAL_USER" || !scope.organizationId) {
    throw new Error("Insurer portal users only.")
  }
  return withUserCtx(scope.id, async (tx) => {
    return tx
      .select({
        id: insurancePolicies.id,
        vehicleId: insurancePolicies.vehicleId,
        plateNumber: vehicles.plateNumber,
        policyNumber: insurancePolicies.policyNumber,
        coverageType: insurancePolicies.coverageType,
        startDate: insurancePolicies.startDate,
        endDate: insurancePolicies.endDate,
        isActive: insurancePolicies.isActive,
      })
      .from(insurancePolicies)
      .innerJoin(vehicles, eq(insurancePolicies.vehicleId, vehicles.id))
      .where(eq(insurancePolicies.insurerId, scope.organizationId!))
      .orderBy(desc(insurancePolicies.createdAt))
      .limit(100)
  })
}

export interface PlateLookupResult {
  flagged: boolean
  /** Active case classes behind the flag (police only; always [] for insurers). */
  reasons: string[]
}

/**
 * F6 ANPR-ready lookup (Phase 3) — single indexed read plus the active case
 * classes, throttled and audited like every other safety check. Powers both
 * the `GET /api/v1/lookups/plate` reader endpoint and the lookup page.
 */
export async function plateLookupFast(plateNumber: string): Promise<PlateLookupResult> {
  const scope = await getViewerScope()
  return plateLookupCore(scope, plateNumber)
}

/**
 * N4 machine variant (Phase 3) — same lookup authenticated by API key
 * instead of session. The key acts as its bound user: role gates, scope,
 * throttle, and audit apply unchanged.
 */
export async function plateLookupKey(
  rawKey: string,
  plateNumber: string
): Promise<PlateLookupResult> {
  const { userId, scopes } = await verifyApiKey(rawKey)
  if (!scopes.includes("plate:read")) {
    throw new Error("That API key lacks the plate:read scope.")
  }
  const scope = await scopeById(userId)
  return plateLookupCore(scope, plateNumber)
}

/** Scope for a known user id without a session (trusted: key-verified). */
async function scopeById(userId: string) {
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
    .where(eq(users.id, userId))
    .limit(1)
  if (!row) throw new Error("That API key was not found.")
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

async function plateLookupCore(
  scope: ViewerScope,
  plateNumber: string
): Promise<PlateLookupResult> {
  const isInsurer = scope.role === "INSURANCE_PORTAL_USER" && scope.organizationId
  const isPolice =
    scope.role === "OFFICER" ||
    scope.role === "DISTRICT_MONITOR" ||
    scope.role === "COUNTRY_MONITOR"
  if (!isInsurer && !isPolice) {
    throw new Error("Plate lookups are for police users and insurer portal users.")
  }
  const plate = normalizePlate(plateNumber)
  if (!plate) return { flagged: false, reasons: [] }
  await checkLookupThrottle(scope.id)
  return withUserCtx(scope.id, async (tx) => {
    const [vehicle] = await tx
      .select({ id: vehicles.id, isFlagged: vehicles.isFlagged })
      .from(vehicles)
      .where(eq(vehicles.plateNumber, plate))
      .limit(1)
    const reasonRows = vehicle
      ? await tx
          .select({ caseType: vehicleCases.caseType })
          .from(vehicleCases)
          .where(
            and(
              eq(vehicleCases.vehicleId, vehicle.id),
              eq(vehicleCases.status, "active")
            )
          )
          .limit(10)
      : []
    const reasons = isPolice
      ? [...new Set(reasonRows.map((row) => row.caseType))]
      : []
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: isInsurer ? "insurer_flag_lookup" : "cross_branch_access",
      vehicleId: vehicle?.id,
      reason: `Fast plate lookup ${plate}: ${vehicle?.isFlagged ? "FLAGGED" : "clear"}.`,
    })
    return { flagged: vehicle?.isFlagged ?? false, reasons }
  })
}

export interface FlaggedVehicleRow {
  vehicleId: string
  plateNumber: string
  district: string | null
  /** Oldest active case date (YYYY-MM-DD) — the review-age anchor. */
  since: string
  caseTypes: string[]
}

/**
 * F6 flagged watchlist (Phase 3) — every currently-flagged plate in scope
 * with how long it has been flagged. Read-only review discipline: flags
 * clear automatically when their cases close.
 */
export async function flaggedVehicleWatchlist(
  limit = 50
): Promise<FlaggedVehicleRow[]> {
  const scope = await getViewerScope()
  const isPolice =
    scope.role === "OFFICER" ||
    scope.role === "DISTRICT_MONITOR" ||
    scope.role === "COUNTRY_MONITOR"
  if (!isPolice) throw new Error("Police users only.")
  const district =
    scope.role === "OFFICER"
      ? (scope.branchDistrict ?? scope.district)
      : scope.role === "DISTRICT_MONITOR"
        ? scope.district
        : null
  return withUserCtx(scope.id, async (tx) => {
    const districtFilter = district
      ? and(
          eq(vehicles.isFlagged, true),
          eq(vehicleCases.district, district as never)
        )
      : eq(vehicles.isFlagged, true)
    const rows = await tx
      .select({
        vehicleId: vehicles.id,
        plateNumber: vehicles.plateNumber,
        district: sql<string | null>`min(${vehicleCases.district})`,
        since: sql<string>`to_char(min(${vehicleCases.createdAt}), 'YYYY-MM-DD')`,
        caseTypes: sql<string[]>`array_agg(distinct ${vehicleCases.caseType})`,
      })
      .from(vehicles)
      .innerJoin(
        vehicleCases,
        and(
          eq(vehicleCases.vehicleId, vehicles.id),
          eq(vehicleCases.status, "active")
        )
      )
      .where(districtFilter)
      .groupBy(vehicles.id, vehicles.plateNumber)
      .orderBy(sql`min(${vehicleCases.createdAt})`)
      .limit(Math.min(Math.max(limit, 1), 100))
    return rows.map((row) => ({
      vehicleId: row.vehicleId,
      plateNumber: row.plateNumber,
      district: row.district,
      since: row.since,
      caseTypes: (row.caseTypes ?? []).filter(Boolean),
    }))
  })
}

// ---------------------------------------------------------------------------
// Audit log viewer — scoped per role. Auditors see the log only (no drill-down).
// ---------------------------------------------------------------------------

export async function getAuditLog(limit = 50): Promise<AccessLogEntry[]> {
  const user = await requireUser()
  const scope = await getViewerScope()
  const allowed =
    scope.role === "DISTRICT_MONITOR" ||
    scope.role === "COUNTRY_MONITOR" ||
    scope.role === "SYSTEM_ADMIN" ||
    scope.role === "COMPLIANCE_AUDITOR"
  if (!allowed) throw new Error("Your role can't view the audit log.")

  return withUserCtx(user.id, async (tx) => {
    const rows = await tx
      .select({
        id: actions.id,
        actorId: actions.actorId,
        actionType: actions.actionType,
        recordId: actions.recordId,
        vehicleId: actions.vehicleId,
        reason: actions.reason,
        createdAt: actions.createdAt,
      })
      .from(actions)
      .orderBy(desc(actions.createdAt))
      .limit(scope.role === "DISTRICT_MONITOR" ? 200 : limit)

    const actorIds = [...new Set(rows.map((row) => row.actorId))]

    // Resolve actor names inside the same tx for RLS consistency.
    const names = new Map<string, string>()
    for (const actorId of actorIds) {
      const [found] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, actorId))
        .limit(1)
      names.set(actorId, found?.name ?? "Unknown")
    }

    let filtered = rows
    if (scope.role === "DISTRICT_MONITOR") {
      // District-only: keep entries touching own-district records + own actions.
      const recordIds = rows
        .map((row) => row.recordId)
        .filter((id): id is string => Boolean(id))
      const recordDistricts = new Map<string, string>()
      for (const recordId of [...new Set(recordIds)]) {
        const [rec] = await tx
          .select({ district: records.district })
          .from(records)
          .where(eq(records.id, recordId))
          .limit(1)
        if (rec) recordDistricts.set(recordId, rec.district)
      }
      filtered = rows.filter(
        (row) =>
          row.actorId === scope.id ||
          (row.recordId && recordDistricts.get(row.recordId) === scope.district)
      )
    }

    return filtered.slice(0, limit).map((row) => ({
      id: row.id,
      actorName: names.get(row.actorId) ?? "Unknown",
      action: row.actionType,
      at: row.createdAt.toISOString(),
      detail: row.reason ?? undefined,
    }))
  })
}

/** Court liaison: outcome history on their own referrals. */
export async function getMyReferralOutcomes() {
  const scope = await getViewerScope()
  if (scope.role !== "COURT_LIAISON") throw new Error("Court liaisons only.")
  return withUserCtx(scope.id, async (tx) => {
    const grants = await tx
      .select()
      .from(courtCaseAccess)
      .where(eq(courtCaseAccess.courtLiaisonId, scope.id))
      .orderBy(desc(courtCaseAccess.createdAt))
      .limit(100)
    return grants.map((grant) => ({
      id: grant.id,
      recordId: grant.recordId,
      outcome: grant.outcome,
      outcomeNotes: grant.outcomeNotes,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      revokedAt: grant.revokedAt?.toISOString() ?? null,
    }))
  })
}

export async function listCourtLiaisons() {
  const scope = await getViewerScope()
  if (scope.role !== "DISTRICT_MONITOR" && scope.role !== "COUNTRY_MONITOR") {
    throw new Error("Monitors only.")
  }
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      organizationId: users.organizationId,
      orgName: organizations.name,
    })
    .from(users)
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(
      and(eq(users.role, "court_liaison"), eq(users.isActive, true))
    )
    .limit(100)
  return rows
}

export async function liveCourtReferralsFor(recordId: string) {
  const scope = await getViewerScope()
  if (scope.role !== "DISTRICT_MONITOR" && scope.role !== "COUNTRY_MONITOR") {
    throw new Error("Monitors only.")
  }
  return withUserCtx(scope.id, async (tx) => {
    const grants = await tx
      .select()
      .from(courtCaseAccess)
      .where(
        and(
          eq(courtCaseAccess.recordId, recordId),
          isNull(courtCaseAccess.revokedAt),
          gt(courtCaseAccess.expiresAt, new Date())
        )
      )
    const out = []
    for (const grant of grants) {
      const [liaison] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, grant.courtLiaisonId))
        .limit(1)
      const docs = await tx
        .select({ id: referralDocuments.id })
        .from(referralDocuments)
        .where(eq(referralDocuments.referralId, grant.id))
        .limit(50)
      out.push({
        id: grant.id,
        liaisonName: liaison?.name ?? "Unknown",
        reason: grant.reason,
        expiresAt: grant.expiresAt?.toISOString() ?? null,
        referredAt: grant.createdAt.toISOString(),
        firstViewedAt: grant.firstViewedAt?.toISOString() ?? null,
        documentsCount: docs.length,
        outcome: grant.outcome,
        renewalCount: grant.renewalCount,
      })
    }
    return out
  })
}
