import type { RecordType } from "@/validations/record"

export type Role =
  | "PATIENT"
  | "DOCTOR"
  | "DISTRICT_ADMIN"
  | "NATIONAL_ADMIN"
  | "ADMINISTRATOR"

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

export interface DiseaseHotspot {
  label: string
  cases: number
  share: number
}

export type DiseaseStatus = "stable" | "watch" | "outbreak"

export interface DiseaseStat {
  id: string
  name: string
  totalCases: number
  weeklyCounts: number[]
  deltaPct: number
  status: DiseaseStatus
  hotspots: DiseaseHotspot[]
}

export interface AccessGrant {
  id: string
  doctorName: string
  facility: string
  grantedAt: string
  expiresAt: string
}

export interface AccessLogEntry {
  id: string
  actorName: string
  actorFacility: string
  action: "view" | "grant" | "revoke" | "emergency" | "break_glass"
  at: string
  detail?: string
}

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
