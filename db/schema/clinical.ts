import {
  pgTable,
  text,
  boolean,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core"
import { diagnosisThreatLevelEnum } from "./enums"

// ---------------------------------------------------------------------------
// ICD-10 diagnosis codes
// ---------------------------------------------------------------------------

export const diagnosisCodes = pgTable("diagnosis_codes", {
  icd10Code: text("icd10_code").primaryKey(),
  description: text("description").notNull(),
  name: text("name").notNull(),
  isInfectious: boolean("is_infectious").default(false).notNull(),
  threatLevel: diagnosisThreatLevelEnum("threat_level"),
})

// ---------------------------------------------------------------------------
// Medication codes (formulary)
// ---------------------------------------------------------------------------

export const medicationCodes = pgTable("medication_codes", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
})

// ---------------------------------------------------------------------------
// Immunization / vaccine codes
// ---------------------------------------------------------------------------

export const immunizationCodes = pgTable("immunization_codes", {
  vaccineCode: text("vaccine_code").primaryKey(),
  name: text("name").notNull(),
})

// Recommended age (in days) per dose for each vaccine. Schedule rows belong
// to their vaccine and go with it.
export const immunizationSchedule = pgTable(
  "immunization_schedule",
  {
    vaccineCode: text("vaccine_code")
      .notNull()
      .references(() => immunizationCodes.vaccineCode, { onDelete: "cascade" }),
    doseNumber: integer("dose_number").notNull(),
    recommendedAgeDays: integer("recommended_age_days").notNull(),
  },
  (table) => [primaryKey({ columns: [table.vaccineCode, table.doseNumber] })]
)

// ---------------------------------------------------------------------------
// Standard treatment guidelines. Links belong to their codes and go with
// them; historical facts in diagnoses/prescriptions/immunizations keep
// pointing at codes and therefore block code deletion while referenced.
// ---------------------------------------------------------------------------

export const standardTreatmentGuidelines = pgTable(
  "standard_treatment_guidelines",
  {
    icd10Code: text("icd10_code")
      .notNull()
      .references(() => diagnosisCodes.icd10Code, { onDelete: "cascade" }),
    medicationCode: text("medication_code")
      .notNull()
      .references(() => medicationCodes.code, { onDelete: "cascade" }),
    isFirstLine: boolean("is_first_line").default(true).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.icd10Code, table.medicationCode] }),
  ]
)
