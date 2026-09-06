"use server"

import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  accessGrants,
  accounts,
  actions,
  diagnosisCodes,
  hospitals,
  immunizationCodes,
  medicalRecords,
  medicationCodes,
  standardTreatmentGuidelines,
  users,
} from "@/db/schema"
import { requireUser } from "@/lib/session"
import { toDbRole } from "@/lib/roles"
import {
  createManagedUserSchema,
  diagnosisCodeSchema,
  hospitalSchema,
  immunizationCodeSchema,
  medicationCodeSchema,
  treatmentGuidelineSchema,
  updateManagedUserSchema,
  type CreateManagedUserInput,
  type DiagnosisCodeInput,
  type HospitalInput,
  type ImmunizationCodeInput,
  type ImportPatientRow,
  type MedicationCodeInput,
  type TreatmentGuidelineInput,
  type UpdateManagedUserInput,
} from "@/validations/admin"

export async function requireAdministrator() {
  const user = await requireUser()
  if (user.role !== "ADMINISTRATOR") {
    throw new Error("Only administrators can manage users and reference data.")
  }
  return user
}

function emptyToUndefined(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined
  return value.trim()
}

function tempEmailFor(phone: string): string {
  return `${phone}@phone.chipatala.health.mw`
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/** Postgres FK violation (23503) means live clinical history still points at
 * the row — surface that instead of a raw database error. */
function friendlyReferenceError(error: unknown, what: string): Error {
  const code = (error as { code?: string } | null)?.code
  if (code === "23503") {
    return new Error(
      `That ${what} is still referenced by clinical history and cannot be removed.`
    )
  }
  return error instanceof Error ? error : new Error("Could not delete.")
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface ManagedUserRow {
  id: string
  name: string
  phone: string
  role: string
  nationalId: string | null
  dateOfBirth: string | null
  sex: string | null
  district: string | null
  hospitalId: string | null
  hospitalName: string | null
  medicalLicenseNo: string | null
  createdAt: string
}

export interface ListUsersParams {
  query?: string
  role?: string
  includePatients?: boolean
  page?: number
  pageSize?: number
}

export async function listManagedUsers(
  params: ListUsersParams = {}
): Promise<{ users: ManagedUserRow[]; total: number }> {
  await requireAdministrator()
  const {
    query = "",
    role = "all",
    includePatients = false,
    page = 0,
    pageSize = 10,
  } = params

  const conditions: Array<ReturnType<typeof eq> | ReturnType<typeof ilike> | ReturnType<typeof or> | ReturnType<typeof ne> | ReturnType<typeof inArray> | ReturnType<typeof sql>> = []

  if (!includePatients) {
    conditions.push(ne(users.role, "patient"))
  }
  if (role && role !== "all") {
    conditions.push(eq(users.role, role as "patient" | "doctor" | "district_admin" | "country_admin" | "administrator"))
  }
  const q = query.trim()
  if (q) {
    conditions.push(
      or(
        ilike(users.name, `%${q}%`),
        ilike(users.phoneNumber, `%${q}%`),
        ilike(users.nationalId, `%${q}%`)
      )!
    )
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const offset = Math.max(0, page) * pageSize

  // Owner connection bypasses RLS — access is gated by requireAdministrator.
  const [totalRows, rows] = await Promise.all([
    db.select({ value: count() }).from(users).where(where),
    db
      .select({
        id: users.id,
        name: users.name,
        phoneNumber: users.phoneNumber,
        role: users.role,
        nationalId: users.nationalId,
        dateOfBirth: users.dateOfBirth,
        sex: users.sex,
        district: users.district,
        hospitalId: users.hospitalId,
        medicalLicenseNo: users.medicalLicenseNo,
        createdAt: users.createdAt,
        hospitalName: hospitals.name,
      })
      .from(users)
      .leftJoin(hospitals, eq(users.hospitalId, hospitals.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset),
  ])

  return {
    total: totalRows[0]?.value ?? 0,
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phoneNumber ?? "",
      role: r.role,
      nationalId: r.nationalId,
      dateOfBirth: r.dateOfBirth,
      sex: r.sex,
      district: r.district,
      hospitalId: r.hospitalId,
      hospitalName: r.hospitalName,
      medicalLicenseNo: r.medicalLicenseNo,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
  }
}

export async function createManagedUser(input: CreateManagedUserInput) {
  await requireAdministrator()
  const parsed = createManagedUserSchema.parse(input)

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phoneNumber, parsed.phoneNumber))
    .limit(1)
  if (existing.length > 0) {
    throw new Error("That phone number is already registered.")
  }

  const nationalId = emptyToUndefined(parsed.nationalId)
  if (nationalId) {
    const dup = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.nationalId, nationalId))
      .limit(1)
    if (dup.length > 0) {
      throw new Error("That national ID is already registered.")
    }
  }

  const id = newId("user")
  const dob = emptyToUndefined(parsed.dateOfBirth)
  const hospitalId = emptyToUndefined(parsed.hospitalId)

  await db.insert(users).values({
    id,
    name: parsed.name.trim(),
    email: tempEmailFor(parsed.phoneNumber),
    emailVerified: false,
    phoneNumber: parsed.phoneNumber,
    phoneNumberVerified: true,
    nationalId: nationalId ?? null,
    dateOfBirth: dob ?? null,
    sex: parsed.sex ?? null,
    district: (emptyToUndefined(parsed.district) ?? null) as never,
    role: toDbRole(parsed.role) as never,
    hospitalId: (hospitalId ?? null) as never,
    medicalLicenseNo: emptyToUndefined(parsed.medicalLicenseNo) ?? null,
    emergencyInfo: {},
  })
  await db.insert(accounts).values({
    id: newId("account"),
    issuer: "phone",
    accountId: parsed.phoneNumber,
    providerId: "phone",
    userId: id,
  })

  return { id }
}

export async function updateManagedUser(input: UpdateManagedUserInput) {
  await requireAdministrator()
  const parsed = updateManagedUserSchema.parse(input)

  const patch: Partial<typeof users.$inferInsert> = {}
  if (parsed.name !== undefined) patch.name = parsed.name.trim()
  if (parsed.phoneNumber !== undefined) {
    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phoneNumber, parsed.phoneNumber), ne(users.id, parsed.id)))
      .limit(1)
    if (clash.length > 0) throw new Error("That phone number is already registered.")
    patch.phoneNumber = parsed.phoneNumber
    patch.email = tempEmailFor(parsed.phoneNumber)
  }
  if (parsed.role !== undefined) patch.role = toDbRole(parsed.role) as never
  if (parsed.nationalId !== undefined) patch.nationalId = emptyToUndefined(parsed.nationalId) ?? null
  if (parsed.dateOfBirth !== undefined) patch.dateOfBirth = emptyToUndefined(parsed.dateOfBirth) ?? null
  if (parsed.sex !== undefined) patch.sex = parsed.sex ?? null
  if (parsed.district !== undefined) patch.district = (emptyToUndefined(parsed.district) ?? null) as never
  if (parsed.hospitalId !== undefined) patch.hospitalId = (emptyToUndefined(parsed.hospitalId) ?? null) as never
  if (parsed.medicalLicenseNo !== undefined)
    patch.medicalLicenseNo = emptyToUndefined(parsed.medicalLicenseNo) ?? null

  await db.update(users).set(patch).where(eq(users.id, parsed.id))
  if (parsed.phoneNumber !== undefined) {
    await db
      .update(accounts)
      .set({ accountId: parsed.phoneNumber })
      .where(and(eq(accounts.userId, parsed.id), eq(accounts.providerId, "phone")))
  }
  return { id: parsed.id }
}

export async function deleteManagedUser(id: string) {
  const admin = await requireAdministrator()
  if (id === admin.id) throw new Error("You cannot delete your own administrator account.")
  // Dependent rows cascade (records, facts, grants, audit) or detach
  // (authorship) via the FK delete actions — one delete is enough.
  await db.delete(users).where(eq(users.id, id))
  return { id }
}

export interface UserDeletePreview {
  recordCount: number
  grantCount: number
  auditCount: number
}

/** Counts everything tied to a user so the delete dialog can spell it out. */
export async function getUserDeletePreview(id: string): Promise<UserDeletePreview> {
  await requireAdministrator()
  const [[records], [grants], [audit]] = await Promise.all([
    db.select({ value: count() }).from(medicalRecords).where(eq(medicalRecords.profileId, id)),
    db
      .select({ value: count() })
      .from(accessGrants)
      .where(or(eq(accessGrants.profileId, id), eq(accessGrants.doctorId, id))),
    db
      .select({ value: count() })
      .from(actions)
      .where(or(eq(actions.profileId, id), eq(actions.actorId, id))),
  ])
  return {
    recordCount: records?.value ?? 0,
    grantCount: grants?.value ?? 0,
    auditCount: audit?.value ?? 0,
  }
}

export interface ImportResult {
  created: number
  skipped: number
  errors: Array<{ row: number; phone: string; reason: string }>
}

/** Bulk-provisions patient accounts from validated Excel rows. Staff roles are never imported. */
export async function importPatientUsers(rows: ImportPatientRow[]): Promise<ImportResult> {
  await requireAdministrator()
  const result: ImportResult = { created: 0, skipped: 0, errors: [] }

  const phones = rows.map((r) => r.phoneNumber)
  const existingRows =
    phones.length > 0
      ? await db
          .select({ phoneNumber: users.phoneNumber })
          .from(users)
          .where(inArray(users.phoneNumber, phones))
      : []
  const taken = new Set((existingRows.map((r) => r.phoneNumber).filter(Boolean) ?? []) as string[])
  const seenInFile = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const parsed = raw as ImportPatientRow
    const rowNumber = i + 2 // header is row 1
    if (seenInFile.has(parsed.phoneNumber) || taken.has(parsed.phoneNumber)) {
      result.skipped += 1
      result.errors.push({ row: rowNumber, phone: parsed.phoneNumber, reason: "Phone already registered." })
      continue
    }
    seenInFile.add(parsed.phoneNumber)

    const nationalId = emptyToUndefined(parsed.nationalId)
    if (nationalId) {
      const dup = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.nationalId, nationalId))
        .limit(1)
      if (dup.length > 0) {
        result.skipped += 1
        result.errors.push({ row: rowNumber, phone: parsed.phoneNumber, reason: "National ID already registered." })
        continue
      }
    }

    try {
      const id = newId("user")
      await db.insert(users).values({
        id,
        name: parsed.name.trim(),
        email: tempEmailFor(parsed.phoneNumber),
        emailVerified: false,
        phoneNumber: parsed.phoneNumber,
        phoneNumberVerified: true,
        nationalId: nationalId ?? null,
        dateOfBirth: emptyToUndefined(parsed.dateOfBirth) ?? null,
        sex: parsed.sex ?? null,
        district: (emptyToUndefined(parsed.district) ?? null) as never,
        role: "patient",
        emergencyInfo: {},
      })
      await db.insert(accounts).values({
        id: newId("account"),
        issuer: "phone",
        accountId: parsed.phoneNumber,
        providerId: "phone",
        userId: id,
      })
      taken.add(parsed.phoneNumber)
      result.created += 1
    } catch (error) {
      result.skipped += 1
      result.errors.push({
        row: rowNumber,
        phone: parsed.phoneNumber,
        reason: error instanceof Error ? error.message : "Could not import this row.",
      })
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Hospitals
// ---------------------------------------------------------------------------

export async function listHospitals(query = "") {
  await requireAdministrator()
  const q = query.trim()
  const rows = await db
    .select()
    .from(hospitals)
    .where(q ? or(ilike(hospitals.name, `%${q}%`), ilike(hospitals.location, `%${q}%`)) : undefined)
    .orderBy(asc(hospitals.name))
  return rows.map((h) => ({
    id: h.id,
    name: h.name,
    district: h.district,
    location: h.location,
    contactPhone: h.contactPhone,
  }))
}

export async function upsertHospital(input: HospitalInput) {
  await requireAdministrator()
  const parsed = hospitalSchema.parse(input)
  if (parsed.id) {
    await db
      .update(hospitals)
      .set({
        name: parsed.name.trim(),
        district: parsed.district as never,
        location: emptyToUndefined(parsed.location) ?? null,
        contactPhone: emptyToUndefined(parsed.contactPhone) ?? null,
      })
      .where(eq(hospitals.id, parsed.id))
    return { id: parsed.id }
  }
  const [row] = await db
    .insert(hospitals)
    .values({
      name: parsed.name.trim(),
      district: parsed.district as never,
      location: emptyToUndefined(parsed.location) ?? null,
      contactPhone: emptyToUndefined(parsed.contactPhone) ?? null,
    })
    .returning({ id: hospitals.id })
  return { id: row.id }
}

export async function deleteHospital(id: string) {
  await requireAdministrator()
  // Staff are unassigned (SET NULL) and record facility links cleared —
  // history is never deleted with the building.
  await db.delete(hospitals).where(eq(hospitals.id, id))
  return { id }
}

export interface HospitalDeletePreview {
  staffCount: number
  recordCount: number
}

/** Counts everything tied to a hospital so the delete dialog can spell it out. */
export async function getHospitalDeletePreview(id: string): Promise<HospitalDeletePreview> {
  await requireAdministrator()
  const [[staff], [records]] = await Promise.all([
    db
      .select({ value: count() })
      .from(users)
      .where(eq(users.hospitalId, id as never)),
    db
      .select({ value: count() })
      .from(medicalRecords)
      .where(eq(medicalRecords.hospitalId, id)),
  ])
  return { staffCount: staff?.value ?? 0, recordCount: records?.value ?? 0 }
}

// ---------------------------------------------------------------------------
// Diagnosis / medication / immunization codes
// ---------------------------------------------------------------------------

export async function listDiagnosisCodes(query = "") {
  await requireAdministrator()
  const q = query.trim()
  const rows = await db
    .select()
    .from(diagnosisCodes)
    .where(
      q
        ? or(
            ilike(diagnosisCodes.icd10Code, `%${q}%`),
            ilike(diagnosisCodes.name, `%${q}%`)
          )
        : undefined
    )
    .orderBy(asc(diagnosisCodes.name))
    .limit(200)
  return rows
}

export async function upsertDiagnosisCode(input: DiagnosisCodeInput) {
  await requireAdministrator()
  const parsed = diagnosisCodeSchema.parse(input)
  await db
    .insert(diagnosisCodes)
    .values({
      icd10Code: parsed.icd10Code.trim().toUpperCase(),
      name: parsed.name.trim(),
      description: parsed.description.trim(),
      isInfectious: parsed.isInfectious,
      threatLevel: (parsed.threatLevel ?? null) as never,
    })
    .onConflictDoUpdate({
      target: diagnosisCodes.icd10Code,
      set: {
        name: parsed.name.trim(),
        description: parsed.description.trim(),
        isInfectious: parsed.isInfectious,
        threatLevel: (parsed.threatLevel ?? null) as never,
      },
    })
  return { code: parsed.icd10Code.trim().toUpperCase() }
}

export async function deleteDiagnosisCode(code: string) {
  await requireAdministrator()
  try {
    await db.delete(diagnosisCodes).where(eq(diagnosisCodes.icd10Code, code))
  } catch (error) {
    throw friendlyReferenceError(error, "diagnosis code")
  }
  return { code }
}

export async function listMedicationCodes(query = "") {
  await requireAdministrator()
  const q = query.trim()
  const rows = await db
    .select()
    .from(medicationCodes)
    .where(
      q
        ? or(ilike(medicationCodes.code, `%${q}%`), ilike(medicationCodes.name, `%${q}%`))
        : undefined
    )
    .orderBy(asc(medicationCodes.name))
    .limit(200)
  return rows
}

export async function upsertMedicationCode(input: MedicationCodeInput) {
  await requireAdministrator()
  const parsed = medicationCodeSchema.parse(input)
  const code = parsed.code.trim().toUpperCase()
  await db
    .insert(medicationCodes)
    .values({
      code,
      name: parsed.name.trim(),
      category: emptyToUndefined(parsed.category) ?? null,
    })
    .onConflictDoUpdate({
      target: medicationCodes.code,
      set: {
        name: parsed.name.trim(),
        category: emptyToUndefined(parsed.category) ?? null,
      },
    })
  return { code }
}

export async function deleteMedicationCode(code: string) {
  await requireAdministrator()
  try {
    await db.delete(medicationCodes).where(eq(medicationCodes.code, code))
  } catch (error) {
    throw friendlyReferenceError(error, "medication")
  }
  return { code }
}

export async function listImmunizationCodes(query = "") {
  await requireAdministrator()
  const q = query.trim()
  const rows = await db
    .select()
    .from(immunizationCodes)
    .where(
      q
        ? or(
            ilike(immunizationCodes.vaccineCode, `%${q}%`),
            ilike(immunizationCodes.name, `%${q}%`)
          )
        : undefined
    )
    .orderBy(asc(immunizationCodes.name))
    .limit(200)
  return rows
}

export async function upsertImmunizationCode(input: ImmunizationCodeInput) {
  await requireAdministrator()
  const parsed = immunizationCodeSchema.parse(input)
  const code = parsed.vaccineCode.trim().toUpperCase()
  await db
    .insert(immunizationCodes)
    .values({ vaccineCode: code, name: parsed.name.trim() })
    .onConflictDoUpdate({
      target: immunizationCodes.vaccineCode,
      set: { name: parsed.name.trim() },
    })
  return { code }
}

export async function deleteImmunizationCode(code: string) {
  await requireAdministrator()
  try {
    await db.delete(immunizationCodes).where(eq(immunizationCodes.vaccineCode, code))
  } catch (error) {
    throw friendlyReferenceError(error, "vaccine")
  }
  return { code }
}

// ---------------------------------------------------------------------------
// Standard treatment guidelines
// ---------------------------------------------------------------------------

export async function listTreatmentGuidelines(query = "") {
  await requireAdministrator()
  const q = query.trim()
  const rows = await db
    .select({
      icd10Code: standardTreatmentGuidelines.icd10Code,
      medicationCode: standardTreatmentGuidelines.medicationCode,
      isFirstLine: standardTreatmentGuidelines.isFirstLine,
      diagnosisName: diagnosisCodes.name,
      medicationName: medicationCodes.name,
    })
    .from(standardTreatmentGuidelines)
    .leftJoin(diagnosisCodes, eq(standardTreatmentGuidelines.icd10Code, diagnosisCodes.icd10Code))
    .leftJoin(medicationCodes, eq(standardTreatmentGuidelines.medicationCode, medicationCodes.code))
    .where(
      q
        ? or(
            ilike(standardTreatmentGuidelines.icd10Code, `%${q}%`),
            ilike(standardTreatmentGuidelines.medicationCode, `%${q}%`),
            ilike(diagnosisCodes.name, `%${q}%`),
            ilike(medicationCodes.name, `%${q}%`)
          )
        : undefined
    )
    .orderBy(asc(standardTreatmentGuidelines.icd10Code))
    .limit(200)
  return rows
}

export async function upsertTreatmentGuideline(input: TreatmentGuidelineInput) {
  await requireAdministrator()
  const parsed = treatmentGuidelineSchema.parse(input)
  const icd10Code = parsed.icd10Code.trim().toUpperCase()
  const medicationCode = parsed.medicationCode.trim().toUpperCase()
  await db
    .insert(standardTreatmentGuidelines)
    .values({ icd10Code, medicationCode, isFirstLine: parsed.isFirstLine })
    .onConflictDoUpdate({
      target: [standardTreatmentGuidelines.icd10Code, standardTreatmentGuidelines.medicationCode],
      set: { isFirstLine: parsed.isFirstLine },
    })
  return { icd10Code, medicationCode }
}

export async function deleteTreatmentGuideline(icd10Code: string, medicationCode: string) {
  await requireAdministrator()
  await db
    .delete(standardTreatmentGuidelines)
    .where(
      and(
        eq(standardTreatmentGuidelines.icd10Code, icd10Code),
        eq(standardTreatmentGuidelines.medicationCode, medicationCode)
      )
    )
  return { icd10Code, medicationCode }
}
