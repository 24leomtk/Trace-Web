import * as z from "zod"

// ---------------------------------------------------------------------------
// N3 NamUs-inspired biometrics (TRACE-scoped). Fingerprint sets and DNA
// samples live on the person profile. Everything except person_id is
// optional — a branch intake records what it has; AFIS/lab references are
// filled in later, never required up front.
// ---------------------------------------------------------------------------

export const fingerprintQualityOptions = [
  "poor",
  "fair",
  "good",
  "excellent",
] as const

export const fingerprintSchema = z.object({
  personId: z.uuid(),
  referenceNo: z.string().trim().max(64).optional().or(z.literal("")),
  quality: z.enum(fingerprintQualityOptions).optional(),
  dateProcessed: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date processed must be YYYY-MM-DD.")
    .optional()
    .or(z.literal("")),
  afisReference: z.string().trim().max(64).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
})

export type FingerprintInput = z.output<typeof fingerprintSchema>

export const dnaSampleTypeOptions = [
  "reference",
  "family_reference",
  "direct",
  "elimination",
] as const

export const dnaStatusOptions = [
  "collected",
  "sent",
  "processed",
  "destroyed",
] as const

export const dnaSampleSchema = z.object({
  personId: z.uuid(),
  sampleType: z.enum(dnaSampleTypeOptions).optional(),
  labName: z.string().trim().max(200).optional().or(z.literal("")),
  labReference: z.string().trim().max(64).optional().or(z.literal("")),
  status: z.enum(dnaStatusOptions).default("collected"),
  relationshipToSubject: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal("")),
  collectedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Collected date must be YYYY-MM-DD.")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
})

export type DnaSampleInput = z.output<typeof dnaSampleSchema>

export const dnaStatusUpdateSchema = z.object({
  sampleId: z.uuid(),
  status: z.enum(dnaStatusOptions),
})

export type DnaStatusUpdateInput = z.output<typeof dnaStatusUpdateSchema>
