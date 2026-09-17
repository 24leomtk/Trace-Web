import type { RecordType } from "@/validations/record"

export type Role =
  | "OFFICER"
  | "DISTRICT_MONITOR"
  | "COUNTRY_MONITOR"
  | "SYSTEM_ADMIN"
  | "COMPLIANCE_AUDITOR"
  | "COURT_LIAISON"
  | "INSURANCE_PORTAL_USER"
  | "VEHICLE_REGISTRAR"

export type Domain = "regular" | "traffic"

export type AccessLevel = "branch" | "district" | "country"

export type CaseStatus = "active" | "resolved" | "closed" | "archived"

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

export interface User {
  id: string
  name: string
  phone: string
  role: Role
  badgeNumber?: string
  // Police scope: officer -> branchId (+ domain); district monitor -> district
  // (+ domain); country monitor -> domain only. District derived from branch
  // for officers; stored for district monitors.
  domain?: Domain
  branchId?: string
  branchName?: string
  district?: string
  // External scope: the organization this user belongs to.
  organizationId?: string
  organizationName?: string
  // Human-readable posting label, e.g. "Lilongwe Central (Regular)" or
  // "Blantyre Magistrate Court".
  posting?: string
}

export interface RecordAuthor {
  name: string
  role: Role
}

export type AttachmentKind = "pdf" | "image" | "lab" | "video" | "audio" | "doc"

export interface AttachmentMeta {
  id: string
  name: string
  sizeBytes: number
  kind: AttachmentKind
  url?: string
  /** SHA-256 of the uploaded bytes (absent on legacy rows). */
  fileHash?: string
  /** ISO timestamp until which the file is retained. */
  retentionUntil?: string
}

export interface RecordBadge {
  label: string
  tone: Tone
}

export interface TraceRecord {
  id: string
  recordType: RecordType
  domain: Domain
  branchId: string
  branchName?: string
  district: string
  vehicleId?: string
  personId?: string
  accessLevel: AccessLevel
  status: CaseStatus
  reportedBy: string
  createdAt: string
  updatedAt: string
  title: string
  summary: string
  author: RecordAuthor
  badges: RecordBadge[]
  attachments: AttachmentMeta[]
}

export interface VehicleSummary {
  id: string
  plateNumber: string
  make?: string
  model?: string
  color?: string
  isFlagged: boolean
  isVerified: boolean
  activeCases: number
}

export interface PersonSummary {
  id: string
  fullName: string
  nationalId?: string
  homeDistrict?: string
  linkedCases: number
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
  /** Stable key for drill-down (e.g. a RecordType) — labels are display-only. */
  key?: string
}

export interface AnalyticsSeriesPoint {
  label: string
  value: number
}

export interface AnalyticsEntry {
  id: string
  date: string
  scopeLabel: string
  title: string
  description: string
  metrics: AnalyticsMetric[]
  breakdown?: AnalyticsBreakdownRow[]
  /** U6 time series (oldest → newest) for trend charts. */
  series?: AnalyticsSeriesPoint[]
  severity: "info" | "warning" | "critical"
}

export interface CourtReferralSummary {
  id: string
  recordId: string
  recordTitle: string
  liaisonName: string
  reason?: string
  expiresAt?: string
  outcome: string
  revokedAt?: string
}

export interface AccessLogEntry {
  id: string
  actorName: string
  action: string
  at: string
  detail?: string
}
