/**
 * Chipatala Registry — Mobile API types
 * -------------------------------------
 * Standalone, zero-dependency types for the React Native (Expo) app.
 * Copy this file into the mobile project (e.g. `types/api.ts`) — it has no
 * imports, so it compiles anywhere.
 *
 * Keep in sync with the server-side sources of truth:
 *   - `lib/types.ts`          (shared domain types)
 *   - `lib/actions/*`         (endpoint return shapes)
 *   - `validations/record.ts` (per-record-type payloads)
 *
 * Reference: `docs/mobile-api.md`
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type Role = "PATIENT" | "DOCTOR" | "DISTRICT_ADMIN" | "NATIONAL_ADMIN"

export type Tone =
  | "emerald"
  | "sky"
  | "violet"
  | "amber"
  | "rose"
  | "pink"
  | "indigo"
  | "cyan"
  | "teal"
  | "lime"
  | "fuchsia"
  | "orange"
  | "blue"
  | "red"
  | "slate"

export interface EmergencyContact {
  name: string
  phone: string
  relation?: string
}

export interface EmergencyInfo {
  bloodType?: string
  allergies?: string[]
  chronicConditions?: string[]
  emergencyContact?: EmergencyContact
}

/** `GET /api/v1/me` response. */
export interface User {
  id: string
  name: string
  phone: string
  role: Role
  nationalId?: string
  dateOfBirth?: string
  sex?: "male" | "female" | "other"
  district?: string
  facility?: string
  licenseNumber?: string
  emergencyInfo?: EmergencyInfo
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

/** Cursor-paginated list responses (currently `GET /api/v1/records`). */
export interface Page<T> {
  items: T[]
  /** Offset for the next request; `null` when there are no more pages. */
  nextCursor: number | null
}

/** Returned by endpoints whose action produces no data
 * (e.g. `DELETE /api/v1/access/grants/{id}`). */
export interface OkResponse {
  ok: true
}

/** Body of every non-2xx response. `details` only appears on 422 validation
 * failures. */
export interface ApiErrorBody {
  error: string
  details?: { issues: Array<{ path: string; message: string }> }
}

/** `GET /api/v1/health` response. */
export interface HealthResponse {
  ok: true
  service: string
  version: number
  time: string
}

// ---------------------------------------------------------------------------
// Medical records
// ---------------------------------------------------------------------------

export type RecordType =
  | "outpatient_visit"
  | "emergency_visit"
  | "inpatient_admission"
  | "lab_test_result"
  | "imaging_report"
  | "pathology_report"
  | "medication_prescription"
  | "medication_administration"
  | "surgical_procedure"
  | "nursing_notes"
  | "intake_output_chart"
  | "immunization_record"
  | "screening_test"
  | "psychiatric_evaluation"
  | "discharge_summary"
  | "referral_record"

export type Route = "ORAL" | "IV" | "IM" | "SC" | "TOPICAL"

export type Urgency = "LOW" | "MEDIUM" | "HIGH"

export type TriageLevel = "RED" | "YELLOW" | "GREEN"

// — Typed payload per record type (POST /records `data` field) ————————

export interface OutpatientVisitData {
  diagnosis_id?: string
  icd10_code?: string
  visit_type: "OUTPATIENT"
  chief_complaint: string
  history_of_present_illness: string
  physical_exam: { bp: string; pulse: string; temperature: string }
  assessment: string
  plan: string
}

export interface EmergencyVisitData {
  visit_type: "EMERGENCY"
  arrival_mode: string
  triage_level: TriageLevel
  presenting_symptoms: string[]
  initial_interventions: string[]
}

export interface InpatientAdmissionData {
  admission_reason: string
  /** `YYYY-MM-DD` */
  admission_date: string
  ward: string
  bed_number: string
  attending_physician: string
}

export interface LabTestResultData {
  test_name: string
  specimen: string
  results: Array<{
    parameter: string
    value: string
    unit: string
    reference_range: string
  }>
  /** `YYYY-MM-DD` */
  performed_at: string
}

export interface ImagingReportData {
  modality: string
  body_part: string
  findings: string
  impression: string
  radiologist: string
}

export interface PathologyReportData {
  diagnosis_id?: string
  icd10_code?: string
  specimen_type: string
  site: string
  histological_findings: string
  diagnosis: string
  grade: string
}

export interface MedicationPrescriptionData {
  diagnosis_id?: string
  prescription_id?: string
  medication_code?: string
  medication: string
  dose: string
  route: Route
  frequency: string
  duration: string
  indication: string
}

export interface MedicationAdministrationData {
  medication: string
  dose: string
  route: Route
  /** `YYYY-MM-DDTHH:MM:SSZ` */
  administered_at: string
  administered_by: string
}

export interface SurgicalProcedureData {
  procedure_name: string
  /** `YYYY-MM-DD` */
  procedure_date: string
  surgeon: string
  anesthesia: string
  complications?: string
}

export interface NursingNotesData {
  shift: string
  observations: string
  vital_signs: { bp: string; pulse: string }
  notes: string
}

export interface IntakeOutputChartData {
  intake: { oral: string; iv: string }
  output: { urine: string }
  net_balance: string
}

export interface ImmunizationRecordData {
  immunization_id?: string
  vaccine_code?: string
  vaccine: string
  dose_number: number
  manufacturer: string
  /** `YYYY-MM-DD` */
  administered_at: string
}

export interface ScreeningTestData {
  screening_type: string
  result: string
  recommended_follow_up: string
}

export interface PsychiatricEvaluationData {
  diagnosis_id?: string
  icd10_code?: string
  presenting_problem: string
  mental_status_exam: {
    mood: string
    affect: string
    thought_process: string
  }
  diagnosis: string
  risk_assessment: string
}

export interface DischargeSummaryData {
  diagnosis_id?: string
  icd10_code?: string
  /** `YYYY-MM-DD` */
  admission_date: string
  /** `YYYY-MM-DD` */
  discharge_date: string
  final_diagnosis: string
  treatments_given: string[]
  discharge_medications: string[]
  follow_up_instructions: string
}

export interface ReferralRecordData {
  referred_to: string
  reason: string
  urgency: Urgency
}

/** Record type → payload type. */
export interface RecordDataMap {
  outpatient_visit: OutpatientVisitData
  emergency_visit: EmergencyVisitData
  inpatient_admission: InpatientAdmissionData
  lab_test_result: LabTestResultData
  imaging_report: ImagingReportData
  pathology_report: PathologyReportData
  medication_prescription: MedicationPrescriptionData
  medication_administration: MedicationAdministrationData
  surgical_procedure: SurgicalProcedureData
  nursing_notes: NursingNotesData
  intake_output_chart: IntakeOutputChartData
  immunization_record: ImmunizationRecordData
  screening_test: ScreeningTestData
  psychiatric_evaluation: PsychiatricEvaluationData
  discharge_summary: DischargeSummaryData
  referral_record: ReferralRecordData
}

export type RecordData = RecordDataMap[RecordType]

export interface RecordAuthor {
  name: string
  role: Role
}

export type AttachmentKind = "pdf" | "image" | "lab"

export interface AttachmentMeta {
  id: string
  name: string
  sizeBytes: number
  kind: AttachmentKind
  url?: string
}

export interface RecordBadge {
  label: string
  tone: Tone
}

/** An item of `GET /api/v1/records` `items`. */
export interface MedicalRecord {
  id: string
  patientId: string
  recordedAt: string
  type: RecordType
  title: string
  summary: string
  author: RecordAuthor
  facility: string
  badges: RecordBadge[]
  attachments: AttachmentMeta[]
}

// ---------------------------------------------------------------------------
// Medical records — requests
// ---------------------------------------------------------------------------

/** Query params for `GET /api/v1/records`. */
export interface RecordsQuery {
  /** Omit for the signed-in patient's own history; doctors pass the patient id. */
  patientId?: string
  cursor?: number
  limit?: number
  type?: RecordType
  /** `YYYY-MM-DD` */
  dateFrom?: string
  /** `YYYY-MM-DD` */
  dateTo?: string
}

/** `GET /api/v1/records` response. */
export type RecordsPage = Page<MedicalRecord>

export interface AttachmentInput {
  /** Display-only on the web; not persisted. */
  name?: string
  url: string
  publicId: string
  fileType: string
  fileSizeBytes: number
}

/** `POST /api/v1/records` body. Discriminated on `type`, so `data` narrows
 * automatically — e.g. `body.type === "lab_test_result"` ⇒
 * `body.data.test_name`. */
export type CreateRecordBody = {
  [K in RecordType]: {
    patientId: string
    type: K
    data: RecordDataMap[K]
    attachments?: AttachmentInput[]
  }
}[RecordType]

/** `POST /api/v1/records` response. */
export interface CreateRecordResponse {
  id: string
}

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

/** `POST /api/v1/access/codes` body — window length once redeemed
 * (5 min – 24 h). */
export interface CreateAccessCodeBody {
  durationSeconds: number
}

/** `POST /api/v1/access/codes` response. */
export interface IssueCodeResponse {
  code: string
}

/** `GET /api/v1/access/grants` item — an active window on the patient's data. */
export interface AccessGrant {
  id: string
  doctorName: string
  facility: string
  grantedAt: string
  expiresAt: string
}

/** `GET /api/v1/access/log` item — the patient-side audit trail. */
export interface AccessLogEntry {
  id: string
  actorName: string
  actorFacility: string
  action: "view" | "grant" | "revoke" | "emergency" | "break_glass"
  at: string
  detail?: string
}

/** `POST /api/v1/access/redeem` body. */
export interface RedeemCodeBody {
  code: string
}

/** Patient summary — `POST /access/redeem` response and `GET /patients` item. */
export interface PatientSummary {
  id: string
  name: string
  phone: string
  sex: "F" | "M"
  age: number
  lastVisitAt: string
  primaryCondition: string
  accessExpiresAt?: string
}

/** `POST /api/v1/access/break-glass` body. */
export interface BreakGlassBody {
  patientId: string
  reason: string
}

/** `POST /api/v1/access/break-glass` response. */
export interface BreakGlassResponse {
  patientId: string
}

// ---------------------------------------------------------------------------
// Emergency info
// ---------------------------------------------------------------------------

/** `PUT /api/v1/me/emergency-info` body. */
export interface UpdateEmergencyInfoBody {
  bloodType?: string
  allergies?: string[]
  chronicConditions?: string[]
  emergencyContact?: EmergencyContact
}

/** `GET /api/v1/emergency-lookup` query params. */
export interface EmergencyLookupQuery {
  nationalId?: string
  phone?: string
}

/** `GET /api/v1/emergency-lookup` response (`null` when nothing matches). */
export interface EmergencyLookupEntry {
  userId: string
  name: string
  nationalId: string
  phone: string
  dateOfBirth: string
  sex: "F" | "M"
  district: string
  emergencyInfo: EmergencyInfo
}

// ---------------------------------------------------------------------------
// Uploads (direct-to-Cloudinary images)
// ---------------------------------------------------------------------------

/** `GET /api/v1/uploads/credentials` response. */
export interface UploadCredentials {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
}

// ---------------------------------------------------------------------------
// Catalog (read-only reference data)
// ---------------------------------------------------------------------------

/** `GET /api/v1/catalog/diagnoses` item. */
export interface DiagnosisOption {
  icd10Code: string
  name: string
  description: string
}

/** `GET /api/v1/catalog/medications` item. */
export interface MedicationOption {
  code: string
  name: string
  category: string | null
}

/** `GET /api/v1/catalog/vaccines` item. */
export interface VaccineOption {
  vaccineCode: string
  name: string
}

/** `GET /api/v1/catalog/diseases` item. */
export interface DiseaseOption {
  id: string
  name: string
  status: string
}

// ---------------------------------------------------------------------------
// Analytics (admin reports, district-scoped server-side)
// ---------------------------------------------------------------------------

export interface AnalyticsMetric {
  label: string
  value: string
  deltaPct?: number
}

export interface AnalyticsBreakdownRow {
  label: string
  count: number
  share: number
}

export interface DiseaseHotspot {
  label: string
  cases: number
  share: number
}

export type DiseaseStatus = "stable" | "watch" | "outbreak"

/** `GET /api/v1/analytics/diseases` item. */
export interface DiseaseStat {
  id: string
  name: string
  totalCases: number
  weeklyCounts: number[]
  deltaPct: number
  status: DiseaseStatus
  hotspots: DiseaseHotspot[]
}

/** `GET /api/v1/analytics/feed` item. */
export interface AnalyticsEntry {
  id: string
  date: string
  scopeLabel: string
  title: string
  description: string
  metrics: AnalyticsMetric[]
  breakdown?: AnalyticsBreakdownRow[]
  severity: "info" | "warning" | "critical"
}
