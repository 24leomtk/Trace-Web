import { pgEnum } from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// User / identity
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", [
  "patient",
  "doctor",
  "district_admin", // reads records + runs reports scoped to ONE district
  "country_admin", // reads records + runs reports for the whole country
  "administrator", // manages users, hospitals, codebooks and guidelines — no medical records access
])

export const sexEnum = pgEnum("sex", ["male", "female", "other"])

// All 28 Malawian districts (snake_case for PG enum compatibility)
export const districtEnum = pgEnum("district", [
  "balaka",
  "blantyre",
  "chikwawa",
  "chiradzulu",
  "chitipa",
  "dedza",
  "dowa",
  "karonga",
  "kasungu",
  "likoma",
  "lilongwe",
  "machinga",
  "mangochi",
  "mchinji",
  "mulanje",
  "mwanza",
  "mzimba",
  "neno",
  "nkhata_bay",
  "nkhotakota",
  "nsanje",
  "ntcheu",
  "ntchisi",
  "phalombe",
  "rumphi",
  "salima",
  "thyolo",
  "zomba",
])

// ---------------------------------------------------------------------------
// Medical records
// ---------------------------------------------------------------------------

// Matches keys of recordSchemas in validations/record.ts exactly
export const recordTypeEnum = pgEnum("record_type", [
  "outpatient_visit",
  "emergency_visit",
  "inpatient_admission",
  "lab_test_result",
  "imaging_report",
  "pathology_report",
  "medication_prescription",
  "medication_administration",
  "surgical_procedure",
  "nursing_notes",
  "intake_output_chart",
  "immunization_record",
  "screening_test",
  "psychiatric_evaluation",
  "discharge_summary",
  "referral_record",
])

// ---------------------------------------------------------------------------
// Clinical / prescription
// ---------------------------------------------------------------------------

export const routeEnum = pgEnum("route", ["ORAL", "IV", "IM", "SC", "TOPICAL"])

export const urgencyEnum = pgEnum("urgency", ["LOW", "MEDIUM", "HIGH"])

export const triageLevelEnum = pgEnum("triage_level", [
  "RED",
  "YELLOW",
  "GREEN",
])

// ---------------------------------------------------------------------------
// Diagnosis / analytics
// ---------------------------------------------------------------------------

// How urgently a single confirmed case warrants a surveillance response
export const diagnosisThreatLevelEnum = pgEnum("diagnosis_threat_level", [
  "none", // not infectious/notifiable
  "moderate", // routine; cluster concern only
  "high", // respond promptly; a few cases raise concern
  "critical", // notifiable/epidemic-prone; even one warrants immediate action
])

// ---------------------------------------------------------------------------
// Access control / audit
// ---------------------------------------------------------------------------

export const accessActionTypeEnum = pgEnum("access_action_type", [
  "code_issued", // patient generated a doctor-access code
  "code_redeemed", // doctor entered a valid code, access activated
  "code_expired",
  "code_revoked",
  "foreign_access", // a doctor read records via an active grant
  "admin_access", // a district/country admin read raw records
  "emergency_access", // break-glass override, reason required
  "analytics_report_access", // an admin pulled an aggregate report
])
