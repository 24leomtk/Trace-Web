import * as z from "zod"

export const managedRoleOptions = [
  "OFFICER",
  "DISTRICT_MONITOR",
  "COUNTRY_MONITOR",
  "SYSTEM_ADMIN",
  "COMPLIANCE_AUDITOR",
  "COURT_LIAISON",
  "INSURANCE_PORTAL_USER",
  "VEHICLE_REGISTRAR",
] as const

export type ManagedRole = (typeof managedRoleOptions)[number]

export const domainOptions = ["regular", "traffic"] as const

const phoneSchema = z
  .string()
  .regex(/^\+265\d{9}$/, "Phone must be a Malawian number like +265991234567.")

const districtSchema = z
  .string()
  .min(1)
  .regex(/^[a-z_]+$/, "District must be a snake_case enum value.")
  .optional()

const uuidOrEmpty = z.uuid().optional().or(z.literal(""))

// Scope rules (enforced in action code, see lib/actions/admin.ts):
//   OFFICER               -> domain + branchId required
//   DISTRICT_MONITOR      -> domain + district required
//   COUNTRY_MONITOR       -> domain required
//   SYSTEM_ADMIN / COMPLIANCE_AUDITOR -> no domain/branch/district/organization
//   COURT_LIAISON / INSURANCE_PORTAL_USER / VEHICLE_REGISTRAR -> organizationId required
export const createManagedUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phoneNumber: phoneSchema,
  role: z.enum(managedRoleOptions),
  badgeNumber: z.string().trim().max(32).optional().or(z.literal("")),
  domain: z.enum(domainOptions).optional(),
  branchId: uuidOrEmpty,
  district: districtSchema,
  organizationId: uuidOrEmpty,
})

export type CreateManagedUserInput = z.output<typeof createManagedUserSchema>

export const updateManagedUserSchema = createManagedUserSchema
  .partial()
  .extend({ id: z.string().min(1) })

export type UpdateManagedUserInput = z.output<typeof updateManagedUserSchema>

export const branchSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(200),
  domain: z.enum(domainOptions),
  district: z
    .string()
    .min(1)
    .regex(/^[a-z_]+$/),
  location: z.string().trim().max(300).optional().or(z.literal("")),
  contactPhone: z
    .string()
    .regex(/^\+265\d{9}$/, "Contact must be like +265991234567.")
    .optional()
    .or(z.literal("")),
})

export type BranchInput = z.output<typeof branchSchema>

export const organizationTypeOptions = [
  "court",
  "insurer",
  "vehicle_registry",
] as const

export const organizationSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(200),
  orgType: z.enum(organizationTypeOptions),
  district: z
    .string()
    .min(1)
    .regex(/^[a-z_]+$/)
    .optional()
    .or(z.literal("")),
  contactPhone: z
    .string()
    .regex(/^\+265\d{9}$/, "Contact must be like +265991234567.")
    .optional()
    .or(z.literal("")),
  contactEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
})

export type OrganizationInput = z.output<typeof organizationSchema>

export const vehicleSchema = z.object({
  plateNumber: z.string().trim().min(1).max(32),
  make: z.string().trim().max(80).optional().or(z.literal("")),
  model: z.string().trim().max(80).optional().or(z.literal("")),
  year: z.number().int().min(1900).max(2100).optional(),
  color: z.string().trim().max(40).optional().or(z.literal("")),
  chassisNumber: z.string().trim().max(64).optional().or(z.literal("")),
  engineNumber: z.string().trim().max(64).optional().or(z.literal("")),
  ownerName: z.string().trim().max(120).optional().or(z.literal("")),
  ownerNationalId: z.string().trim().max(32).optional().or(z.literal("")),
  ownerPhone: z
    .string()
    .regex(/^\+265\d{9}$/, "Owner phone must be like +265991234567.")
    .optional()
    .or(z.literal("")),
  ownerDistrict: districtSchema,
})

export type VehicleInput = z.output<typeof vehicleSchema>

export const personSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  nationalId: z.string().trim().max(32).optional().or(z.literal("")),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD.")
    .optional()
    .or(z.literal("")),
  sex: z.enum(["male", "female", "other"]).optional(),
  homeDistrict: districtSchema,
  distinguishingFeatures: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal("")),
})

export type PersonInput = z.output<typeof personSchema>

export const insurancePolicySchema = z.object({
  vehicleId: z.uuid(),
  policyNumber: z.string().trim().min(1).max(64),
  coverageType: z.string().trim().max(64).optional().or(z.literal("")),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isActive: z.boolean().default(true),
  externalReference: z.string().trim().max(128).optional().or(z.literal("")),
})

export type InsurancePolicyInput = z.output<typeof insurancePolicySchema>

export const courtReferralSchema = z.object({
  recordId: z.uuid(),
  courtLiaisonId: z.string().min(1),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export type CourtReferralInput = z.output<typeof courtReferralSchema>

export const courtOutcomeOptions = [
  "pending",
  "charged",
  "withdrawn",
  "dismissed",
  "convicted",
  "acquitted",
  "other",
] as const

export const courtOutcomeSchema = z.object({
  referralId: z.uuid(),
  outcome: z.enum(courtOutcomeOptions),
  outcomeNotes: z.string().trim().max(2000).optional().or(z.literal("")),
})

export type CourtOutcomeInput = z.output<typeof courtOutcomeSchema>

// F3 fine ledger: payments are positive, receipted, and capped above any
// realistic Malawian traffic fine so typos (extra zeros) fail loudly.
export const citationPaymentSchema = z.object({
  recordId: z.uuid(),
  amount: z.number().positive().max(100_000_000),
  receiptNo: z.string().trim().max(64).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
})

export type CitationPaymentInput = z.output<typeof citationPaymentSchema>

// F3 court scheduling: monitors set the appearance date (today or future)
// and optionally the court organization.
export const citationCourtScheduleSchema = z.object({
  recordId: z.uuid(),
  courtDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => value >= new Date().toISOString().slice(0, 10), {
      message: "Court date cannot be in the past.",
    }),
  courtId: z.uuid().optional().or(z.literal("")),
})

export type CitationCourtScheduleInput = z.output<
  typeof citationCourtScheduleSchema
>

// F4 e-Brief: fixed brief-item labels keep the statement checklist
// comparable across referrals.
export const referralDocumentLabels = [
  "charge_sheet",
  "witness_statement",
  "exhibit_photo",
  "id_document",
  "medical_report",
  "other",
] as const

export const referralDocumentSchema = z.object({
  referralId: z.string().uuid(),
  label: z.enum(referralDocumentLabels),
  url: z.string().min(1).max(2000),
  storagePath: z.string().min(1).max(500),
  fileType: z.string().min(1).max(120),
  fileHash: z.string().min(1).max(128).optional().or(z.literal("")),
})

export type ReferralDocumentInput = z.output<typeof referralDocumentSchema>

// F9 tasking: monitors assign a case to one officer/monitor with an optional
// due date (today or future) and note.
export const assignmentSchema = z.object({
  recordId: z.string().uuid(),
  assigneeId: z.string().min(1),
  dueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => value >= new Date().toISOString().slice(0, 10), {
      message: "Due date cannot be in the past.",
    })
    .optional()
    .or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
})

export type AssignmentInput = z.output<typeof assignmentSchema>
