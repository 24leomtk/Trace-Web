"use server"

import { and, desc, eq, gt, ne, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  accessGrants,
  actions,
  diagnoses,
  diagnosisCodes,
  hospitals,
  medicalRecords,
  users,
} from "@/db/schema"
import { withUserCtx, type DbTransaction } from "@/lib/db-context"
import { formatDistrict } from "@/lib/roles"
import { mapEmergencyInfo, requireUser } from "@/lib/session"
import { writeAuditTx } from "@/lib/server/audit"
import type {
  AccessGrant,
  AccessLogEntry,
  EmergencyLookupEntry,
  PatientSummary,
} from "@/lib/types"

const CODE_PREFIX = "CR-MW"
const BREAK_GLASS_DURATION_SECONDS = 24 * 60 * 60

type Tx = DbTransaction

function generateAccessCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const block = (length: number) =>
    Array.from(
      { length },
      () => alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join("")
  return `${CODE_PREFIX}-${block(4)}-${block(4)}`
}

function sexToSummarySex(sex: string | null): "F" | "M" {
  return sex === "female" ? "F" : "M"
}

function ageFromDob(dob: string | null): number {
  if (!dob) return 0
  const born = new Date(`${dob}T00:00:00Z`)
  return Math.max(
    0,
    Math.floor((Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000))
  )
}

async function latestVisitFor(
  tx: Tx,
  patientId: string
): Promise<string | null> {
  const [row] = await tx
    .select({ createdAt: medicalRecords.createdAt })
    .from(medicalRecords)
    .where(eq(medicalRecords.profileId, patientId))
    .orderBy(desc(medicalRecords.createdAt))
    .limit(1)
  return row?.createdAt.toISOString() ?? null
}

async function primaryConditionFor(
  tx: Tx,
  patientId: string
): Promise<string | null> {
  const [row] = await tx
    .select({ name: diagnosisCodes.name })
    .from(diagnoses)
    .innerJoin(
      diagnosisCodes,
      eq(diagnoses.icd10Code, diagnosisCodes.icd10Code)
    )
    .where(eq(diagnoses.profileId, patientId))
    .orderBy(desc(diagnoses.diagnosedAt), desc(diagnoses.createdAt))
    .limit(1)
  return row?.name ?? null
}

async function activeExpiryFor(
  tx: Tx,
  patientId: string
): Promise<Date | null> {
  const [row] = await tx
    .select({ expiresAt: accessGrants.expiresAt })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.profileId, patientId),
        eq(accessGrants.isUsed, true),
        eq(accessGrants.isRevoked, false),
        gt(accessGrants.expiresAt, new Date())
      )
    )
    .orderBy(desc(accessGrants.expiresAt))
    .limit(1)
  return row?.expiresAt ?? null
}

async function getPatientSummaryById(
  tx: Tx,
  patientId: string
): Promise<PatientSummary | null> {
  const [row] = await tx
    .select({
      id: users.id,
      name: users.name,
      phone: users.phoneNumber,
      sex: users.sex,
      dob: users.dateOfBirth,
    })
    .from(users)
    .where(and(eq(users.id, patientId), eq(users.role, "patient")))
    .limit(1)

  if (!row) return null

  const [lastVisit, primaryCondition, accessExpiresAt] = [
    await latestVisitFor(tx, patientId),
    await primaryConditionFor(tx, patientId),
    await activeExpiryFor(tx, patientId),
  ]

  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    sex: sexToSummarySex(row.sex),
    age: ageFromDob(row.dob),
    lastVisitAt: lastVisit ?? new Date().toISOString(),
    primaryCondition: primaryCondition ?? "No coded diagnosis yet",
    accessExpiresAt: accessExpiresAt?.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Patient side — issuing and revoking access codes
// ---------------------------------------------------------------------------

export async function createAccessGrant({
  durationSeconds,
}: {
  durationSeconds: number
}): Promise<{ code: string }> {
  const user = await requireUser()
  if (user.role !== "PATIENT" && user.role !== "ADMINISTRATOR") {
    throw new Error("Only patients and administrators can issue access codes.")
  }

  const duration = Math.min(
    Math.max(Math.round(durationSeconds), 300),
    BREAK_GLASS_DURATION_SECONDS
  )

  // Codes are issued unclaimed (doctor_id null); the clinician who presents
  // the code claims it on redemption.
  return withUserCtx(user.id, async (tx) => {
    const [grant] = await tx
      .insert(accessGrants)
      .values({
        profileId: user.id,
        doctorId: null,
        issuedBy: user.id,
        code: generateAccessCode(),
        durationSeconds: duration,
      })
      .returning({ code: accessGrants.code })

    await writeAuditTx(tx, {
      profileId: user.id,
      actorId: user.id,
      actionType: "code_issued",
      reason: `Access code generated (${Math.round(duration / 60)} min window once redeemed).`,
    })

    return { code: grant.code }
  })
}

export async function getMyAccessGrants(): Promise<AccessGrant[]> {
  const user = await requireUser()

  return withUserCtx(user.id, async (tx) => {
    const rows = await tx
      .select({
        id: accessGrants.id,
        doctorName: users.name,
        hospitalName: hospitals.name,
        usedAt: accessGrants.usedAt,
        createdAt: accessGrants.createdAt,
        expiresAt: accessGrants.expiresAt,
      })
      .from(accessGrants)
      .innerJoin(users, eq(accessGrants.doctorId, users.id))
      .leftJoin(hospitals, eq(users.hospitalId, hospitals.id))
      .where(
        and(
          eq(accessGrants.profileId, user.id),
          eq(accessGrants.isUsed, true),
          eq(accessGrants.isRevoked, false),
          gt(accessGrants.expiresAt, new Date()),
          ne(accessGrants.profileId, accessGrants.doctorId)
        )
      )
      .orderBy(desc(accessGrants.usedAt))

    return rows.map((row) => ({
      id: row.id,
      doctorName: row.doctorName,
      facility: row.hospitalName ?? "Independent practice",
      grantedAt: (row.usedAt ?? row.createdAt).toISOString(),
      expiresAt: row.expiresAt!.toISOString(),
    }))
  })
}

export async function revokeAccessGrant(grantId: string): Promise<void> {
  const user = await requireUser()

  await withUserCtx(user.id, async (tx) => {
    const [grant] = await tx
      .select()
      .from(accessGrants)
      .where(eq(accessGrants.id, grantId))
      .limit(1)

    if (!grant || grant.profileId !== user.id) {
      throw new Error("That access window wasn't found.")
    }
    if (grant.isRevoked) return

    const [doctor] = grant.doctorId
      ? await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, grant.doctorId))
          .limit(1)
      : []

    await tx
      .update(accessGrants)
      .set({ isRevoked: true })
      .where(eq(accessGrants.id, grantId))

    await writeAuditTx(tx, {
      profileId: user.id,
      actorId: user.id,
      actionType: "code_revoked",
      reason: `Access revoked by the record owner${doctor ? ` (${doctor.name})` : ""}.`,
    })
  })
}

// ---------------------------------------------------------------------------
// Patient side — the audit trail ("Who viewed your records")
// ---------------------------------------------------------------------------

export async function getMyAccessLog(): Promise<AccessLogEntry[]> {
  const user = await requireUser()

  return withUserCtx(user.id, async (tx) => {
    const rows = await tx
      .select({
        id: sql<string>`"actions"."id"::text`,
        actionType: actions.actionType,
        actorName: actions.doctorName,
        hospitalName: actions.hospitalName,
        reason: actions.reason,
        hasGrantId: actions.accessGrantId,
        createdAt: actions.createdAt,
      })
      .from(actions)
      .where(
        and(
          eq(actions.profileId, user.id),
          ne(actions.actionType, "code_issued")
        )
      )
      .orderBy(desc(actions.createdAt))
      .limit(50)

    return rows.map((row) => {
      let action: AccessLogEntry["action"] = "view"
      if (row.actionType === "code_redeemed") action = "grant"
      else if (row.actionType === "code_revoked") action = "revoke"
      else if (row.actionType === "emergency_access")
        action = row.hasGrantId ? "break_glass" : "emergency"

      return {
        id: row.id,
        actorName: row.actorName ?? "Unknown viewer",
        actorFacility: row.hospitalName ?? "",
        action,
        at: row.createdAt.toISOString(),
        detail:
          row.reason ??
          (row.actionType === "admin_access"
            ? "Administrative record review."
            : undefined),
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Doctor side — redeeming codes, break-glass, connected patients
// ---------------------------------------------------------------------------

export type RedeemResult =
  | { ok: true; patient: PatientSummary }
  | { ok: false; error: string }

export async function redeemAccessCode(
  rawCode: string
): Promise<RedeemResult> {
  const user = await requireUser()
  if (user.role !== "DOCTOR") {
    throw new Error("Only clinicians can redeem access codes.")
  }

  const code = rawCode.trim().toUpperCase()

  return withUserCtx(user.id, async (tx) => {
    // Call the SECURITY DEFINER function — it bypasses RLS for the
    // UPDATE + INSERT that plain app_user cannot safely do, while still
    // reading app.current_user_id for the actor identity.
    let grant: {
      id: string
      profile_id: string
      expires_at: string
    }

    try {
      const result = await tx.execute(sql`
        select
          id::text,
          profile_id,
          expires_at
        from public.redeem_access_code(
          ${code},
          ${user.name},
          ${user.licenseNumber ?? null},
          ${user.facility ?? null},
          ${user.district ?? null}
        )
      `)
      const rows = (result as unknown as { rows: Record<string, unknown>[] })
        .rows
      grant = rows[0] as typeof grant
    } catch (err) {
      // Map machine-readable Postgres error codes to user-facing messages.
      const pg = err as { code?: string; message?: string }
      if (pg.code === "P0001") {
        return {
          ok: false,
          error: "That code isn't valid — ask your patient for a fresh one.",
        }
      }
      if (pg.code === "P0002") {
        return { ok: false, error: "The patient for that code could not be found." }
      }
      // Truly unexpected — re-throw so it logs as a 500.
      throw err
    }

    // Now that doctor_id is set, RLS (app_can_read_patient) grants us access
    // to read the patient's summary row.
    const summary = await getPatientSummaryById(tx, grant.profile_id)
    if (!summary) {
      return { ok: false, error: "The patient for that code could not be found." }
    }

    return {
      ok: true,
      patient: {
        ...summary,
        accessExpiresAt: new Date(grant.expires_at).toISOString(),
      },
    }
  })
}

export interface BreakGlassResult {
  patientId: string
}

export async function breakGlassAccess({
  patientId,
  reason,
}: {
  patientId: string
  reason: string
}): Promise<BreakGlassResult> {
  const user = await requireUser()
  if (user.role !== "DOCTOR") {
    throw new Error("Only clinicians can open break-glass access.")
  }

  const trimmedReason = reason.trim()
  if (trimmedReason.length < 10) {
    throw new Error("A meaningful reason is required for break-glass access.")
  }

  const now = new Date()
  return withUserCtx(user.id, async (tx) => {
    const [patient] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, patientId), eq(users.role, "patient")))
      .limit(1)
    if (!patient) throw new Error("No patient found with those details.")

    const [grant] = await tx
      .insert(accessGrants)
      .values({
        profileId: patientId,
        doctorId: user.id,
        issuedBy: user.id,
        code: `BG-${generateAccessCode()}`,
        durationSeconds: BREAK_GLASS_DURATION_SECONDS,
        isUsed: true,
        usedAt: now,
        expiresAt: new Date(
          now.getTime() + BREAK_GLASS_DURATION_SECONDS * 1000
        ),
      })
      .returning({ id: accessGrants.id })

    await writeAuditTx(tx, {
      profileId: patientId,
      actorId: user.id,
      actionType: "emergency_access",
      accessGrantId: grant.id,
      reason: `Break-glass override — ${trimmedReason}`,
      doctorName: user.name,
      medicalLicenseNo: user.licenseNumber ?? null,
      hospitalName: user.facility ?? null,
      district: user.district ?? null,
    })

    return { patientId }
  })
}

export async function getConnectedPatients(): Promise<PatientSummary[]> {
  const user = await requireUser()
  if (user.role !== "DOCTOR") return []

  return withUserCtx(user.id, async (tx) => {
    const rows = await tx
      .selectDistinct({ patientId: accessGrants.profileId })
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.doctorId, user.id),
          eq(accessGrants.isUsed, true),
          eq(accessGrants.isRevoked, false),
          gt(accessGrants.expiresAt, new Date())
        )
      )

    const summaries = []
    for (const row of rows) {
      const summary = await getPatientSummaryById(tx, row.patientId)
      if (summary) summaries.push(summary)
    }
    return summaries
  })
}

// ---------------------------------------------------------------------------
// Professional side — emergency info lookup (no code needed, always logged)
// ---------------------------------------------------------------------------

export async function emergencyLookup({
  nationalId,
  phoneNumber,
}: {
  nationalId?: string | null
  phoneNumber?: string | null
}): Promise<EmergencyLookupEntry | null> {
  const user = await requireUser()
  if (user.role === "PATIENT") {
    throw new Error("Emergency lookup is for clinicians and administrators.")
  }

  const id = nationalId?.trim() || null
  const phone = phoneNumber?.trim() || null
  if (!id && !phone) return null

  // Delegates to the SECURITY DEFINER public.emergency_lookup() function:
  // staff-only, bypasses RLS for the minimal emergency columns, and writes
  // its own audit line (including for misses).
  return withUserCtx(user.id, async (tx) => {
    const result = await tx.execute(sql`
      select
        e.user_id::text as user_id,
        e.name,
        e.national_id,
        e.phone_number::text as phone_number,
        e.date_of_birth::text as date_of_birth,
        e.sex::text as sex,
        e.district::text as district,
        e.emergency_info
      from public.emergency_lookup(${id}, ${phone}, null) as e
      limit 1
    `)

    const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows
    const row = rows[0]
    if (!row) return null

    return {
      userId: String(row.user_id),
      name: String(row.name),
      nationalId: row.national_id == null ? "" : String(row.national_id),
      phone: row.phone_number == null ? "" : String(row.phone_number),
      dateOfBirth:
        row.date_of_birth == null ? "" : String(row.date_of_birth).slice(0, 10),
      sex: sexToSummarySex(row.sex == null ? null : String(row.sex)),
      district: formatDistrict(
        row.district == null ? null : String(row.district)
      ),
      emergencyInfo: mapEmergencyInfo(
        (row.emergency_info ?? {}) as Parameters<typeof mapEmergencyInfo>[0]
      ),
    }
  })
}

export async function updateMyEmergencyInfo(input: {
  bloodType?: string
  allergies?: string[]
  chronicConditions?: string[]
  emergencyContact?: {
    name: string
    phone: string
    relation?: string
  }
}): Promise<void> {
  const user = await requireUser()
  if (user.role !== "PATIENT" && user.role !== "ADMINISTRATOR") {
    throw new Error("Only patients and administrators can update their emergency information.")
  }

  const rawEmergencyInfo = {
    blood_type: input.bloodType?.trim() || undefined,
    allergies: input.allergies?.filter(Boolean) ?? [],
    chronic_conditions: input.chronicConditions?.filter(Boolean) ?? [],
    emergency_contact_name: input.emergencyContact?.name?.trim() || undefined,
    emergency_contact_phone: input.emergencyContact?.phone?.trim() || undefined,
    emergency_contact_relation:
      input.emergencyContact?.relation?.trim() || undefined,
  }

  await withUserCtx(user.id, async (tx) => {
    await tx
      .update(users)
      .set({
        emergencyInfo: rawEmergencyInfo,
      })
      .where(eq(users.id, user.id))
  })
}
