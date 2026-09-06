import * as z from "zod"

export const managedRoleOptions = [
  "PATIENT",
  "DOCTOR",
  "DISTRICT_ADMIN",
  "NATIONAL_ADMIN",
  "ADMINISTRATOR",
] as const

export type ManagedRole = (typeof managedRoleOptions)[number]

const phoneSchema = z
  .string()
  .regex(/^\+265\d{9}$/, "Phone must be a Malawian number like +265991234567.")

const districtSchema = z
  .string()
  .min(1)
  .regex(/^[a-z_]+$/, "District must be a snake_case enum value.")
  .optional()

export const createManagedUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phoneNumber: phoneSchema,
  role: z.enum(managedRoleOptions),
  nationalId: z.string().trim().min(1).max(32).optional().or(z.literal("")),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD.")
    .optional()
    .or(z.literal("")),
  sex: z.enum(["male", "female", "other"]).optional(),
  district: districtSchema,
  hospitalId: z.string().uuid().optional().or(z.literal("")),
  medicalLicenseNo: z.string().trim().max(64).optional().or(z.literal("")),
})

export type CreateManagedUserInput = z.output<typeof createManagedUserSchema>

export const updateManagedUserSchema = createManagedUserSchema
  .partial()
  .extend({ id: z.string().min(1) })

export type UpdateManagedUserInput = z.output<typeof updateManagedUserSchema>

/** One row from the patient Excel import. Only patients may be imported. */
export const importPatientRowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phoneNumber: phoneSchema,
  nationalId: z.string().trim().min(1).max(32).optional().or(z.literal("")),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD.")
    .optional()
    .or(z.literal("")),
  sex: z.enum(["male", "female", "other"]).optional(),
  district: districtSchema,
})

export type ImportPatientRow = z.output<typeof importPatientRowSchema>

export const hospitalSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(200),
  district: z.string().min(1).regex(/^[a-z_]+$/),
  location: z.string().trim().max(300).optional().or(z.literal("")),
  contactPhone: z
    .string()
    .regex(/^\+265\d{9}$/, "Contact must be like +265991234567.")
    .optional()
    .or(z.literal("")),
})

export type HospitalInput = z.output<typeof hospitalSchema>

export const diagnosisCodeSchema = z.object({
  icd10Code: z.string().trim().min(1).max(16),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(1000),
  isInfectious: z.boolean().default(false),
  threatLevel: z.enum(["none", "moderate", "high", "critical"]).nullable().optional(),
})

export type DiagnosisCodeInput = z.output<typeof diagnosisCodeSchema>

export const medicationCodeSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().max(120).optional().or(z.literal("")),
})

export type MedicationCodeInput = z.output<typeof medicationCodeSchema>

export const immunizationCodeSchema = z.object({
  vaccineCode: z.string().trim().min(1).max(32),
  name: z.string().trim().min(2).max(200),
})

export type ImmunizationCodeInput = z.output<typeof immunizationCodeSchema>

export const treatmentGuidelineSchema = z.object({
  icd10Code: z.string().trim().min(1).max(16),
  medicationCode: z.string().trim().min(1).max(32),
  isFirstLine: z.boolean().default(true),
})

export type TreatmentGuidelineInput = z.output<typeof treatmentGuidelineSchema>
