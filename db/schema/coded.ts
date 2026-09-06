import { sql } from "drizzle-orm"
import {
  pgTable,
  uuid,
  text,
  date,
  integer,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { users } from "./auth"
import { hospitals } from "./hospitals"
import { medicalRecords } from "./records"
import { diagnosisCodes, medicationCodes, immunizationCodes } from "./clinical"
import { districtEnum, sexEnum, routeEnum } from "./enums"

// ---------------------------------------------------------------------------
// diagnoses  — one row per confirmed diagnosis coded from a medical record.
//
// Populated by a DB trigger on medical_records INSERT for record types:
//   outpatient_visit, emergency_visit, psychiatric_evaluation,
//   pathology_report, discharge_summary
//
// Aligns with: outpatientVisitSchema.assessment, psychiatricEvaluationSchema.diagnosis,
//              pathologyReportSchema.diagnosis
// ---------------------------------------------------------------------------

export const diagnoses = pgTable(
  "diagnoses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => medicalRecords.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    icd10Code: text("icd10_code")
      .notNull()
      .references(() => diagnosisCodes.icd10Code),
    // Facility links are cleared when a hospital is removed; coded history
    // is never deleted with it.
    hospitalId: uuid("hospital_id").references(() => hospitals.id, {
      onDelete: "set null",
    }),

    // Denormalized from users at insert time (trigger copies them) for fast analytics
    district: districtEnum("district"),
    ageBand: text("age_band"), // e.g. "0-4", "5-14" — computed by trigger from DOB
    sex: sexEnum("sex"), // copied from users.sex

    // Diagnosis narrative — free text complement to the ICD-10 code
    notes: text("notes"), // assessment text, psych diagnosis, pathology finding
    severity: text("severity"), // pathology grade or clinical severity descriptor

    diagnosedAt: date("diagnosed_at")
      .default(sql`current_date`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("diagnoses_district_date_idx").on(table.district, table.diagnosedAt),
    index("diagnoses_icd10_code_idx").on(table.icd10Code),
    index("diagnoses_profile_id_idx").on(table.profileId),
    index("diagnoses_record_id_idx").on(table.recordId),
  ]
)

// ---------------------------------------------------------------------------
// prescriptions  — one row per medication prescribed, from a medical record.
//
// Populated by a DB trigger on medical_records INSERT for record types:
//   medication_prescription, medication_administration, discharge_summary
//
// Column shape mirrors medicationPrescriptionSchema exactly, so the trigger
// can directly extract from data->>'medication', data->>'dose', etc.
// ---------------------------------------------------------------------------

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => medicalRecords.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    diagnosisId: uuid("diagnosis_id").references(() => diagnoses.id, {
      onDelete: "set null",
    }), // link to coded diagnosis if known
    medicationCode: text("medication_code")
      .notNull()
      .references(() => medicationCodes.code),

    // Direct mirrors of medicationPrescriptionSchema fields
    dose: text("dose").notNull(),
    route: routeEnum("route").notNull(),
    frequency: text("frequency"),
    duration: text("duration"),
    indication: text("indication"), // why this drug was prescribed

    quantity: numeric("quantity"),
    hospitalId: uuid("hospital_id").references(() => hospitals.id, {
      onDelete: "set null",
    }),

    // Denormalized from users at insert time (trigger)
    district: districtEnum("district"),
    ageBand: text("age_band"),

    prescribedAt: date("prescribed_at")
      .default(sql`current_date`)
      .notNull(),
    administeredAt: timestamp("administered_at", { withTimezone: true }),
    administeredBy: text("administered_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("prescriptions_district_date_idx").on(
      table.district,
      table.prescribedAt
    ),
    index("prescriptions_medication_code_idx").on(table.medicationCode),
    index("prescriptions_profile_id_idx").on(table.profileId),
    index("prescriptions_record_id_idx").on(table.recordId),
  ]
)

// ---------------------------------------------------------------------------
// immunizations  — one row per vaccine dose administered, from a medical record.
//
// Populated by a DB trigger on medical_records INSERT for record type:
//   immunization_record
//
// Aligns with immunizationRecordSchema exactly.
// ---------------------------------------------------------------------------

export const immunizations = pgTable(
  "immunizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => medicalRecords.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vaccineCode: text("vaccine_code")
      .notNull()
      .references(() => immunizationCodes.vaccineCode),
    doseNumber: integer("dose_number").notNull(),

    // Direct mirror of immunizationRecordSchema.manufacturer
    manufacturer: text("manufacturer"),

    hospitalId: uuid("hospital_id").references(() => hospitals.id, {
      onDelete: "set null",
    }),

    // Denormalized from users at insert time (trigger)
    district: districtEnum("district"),

    administeredAt: date("administered_at")
      .default(sql`current_date`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("immunizations_district_vaccine_idx").on(
      table.district,
      table.vaccineCode
    ),
    index("immunizations_profile_id_idx").on(table.profileId),
    index("immunizations_record_id_idx").on(table.recordId),
  ]
)
