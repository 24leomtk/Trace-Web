/**
 * TRACE — Mobile API types
 *
 * Standalone, zero-dependency mirror of the `/api/v1` contract.
 * Copy into the mobile app and keep in sync with:
 *   - `lib/types.ts` (User, TraceRecord, AnalyticsEntry)
 *   - `validations/record.ts` (per-type `data` payloads)
 *   - `app/api/v1/*` (endpoint shapes)
 *
 * Reference: `docs/mobile-api.md`
 */

// ── Roles & scope ──────────────────────────────────────────────────────────

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

export interface User {
  id: string
  name: string
  phone: string
  role: Role
  badgeNumber?: string
  domain?: Domain
  branchId?: string
  branchName?: string
  district?: string
  organizationId?: string
  organizationName?: string
  posting?: string
}

// ── Case records ───────────────────────────────────────────────────────────

export type RecordType =
  | "missing_person"
  | "wanted_person"
  | "stolen_property"
  | "crime_incident"
  | "arrest_record"
  | "missing_vehicle"
  | "vehicle_offense"
  | "road_accident"
  | "traffic_citation"
  | "vehicle_impoundment"

export interface MissingPersonData {
  person_id?: string
  full_name: string
  national_id?: string
  age?: number
  sex?: "male" | "female" | "other"
  last_seen_location: string
  last_seen_date: string // YYYY-MM-DD
  distinguishing_features?: string
  reporter_name: string
  reporter_relationship: string
  reporter_contact: string
}

export interface WantedPersonData {
  person_id?: string
  full_name: string
  national_id?: string
  offense: string
  danger_level: "low" | "medium" | "high" | "extreme"
  warrant_number?: string
  last_known_location?: string
  description: string
}

export interface StolenPropertyData {
  item_description: string
  category: string
  estimated_value?: number
  serial_number?: string
  location_stolen: string
  date_stolen: string // YYYY-MM-DD
  owner_name: string
  owner_contact: string
}

export interface CrimeIncidentData {
  incident_type: string
  description: string
  location: string
  date_occurred: string // YYYY-MM-DD
  victims?: string[]
  witnesses?: string[]
  linked_person_ids?: string[]
}

export interface ArrestRecordData {
  person_id?: string
  full_name: string
  national_id?: string
  charges: string[]
  arrest_location: string
  arrest_date: string // YYYY-MM-DD
  arresting_officer: string
  linked_wanted_record_id?: string
}

export interface MissingVehicleData {
  plate_number: string
  make?: string
  model?: string
  color?: string
  last_seen_location: string
  last_seen_date: string // YYYY-MM-DD
  reporter_name: string
  reporter_contact: string
}

export interface VehicleOffenseData {
  plate_number: string
  offense_type: string
  description: string
  location: string
  date_occurred: string // YYYY-MM-DD
  linked_crime_record_id?: string
}

export interface RoadAccidentData {
  location: string
  accident_date: string // YYYY-MM-DD
  description: string
  cause?: string
  vehicles_involved: { plate_number: string; role?: string }[]
  fatalities?: number
  injuries?: number
}

export interface TrafficCitationData {
  plate_number: string
  driver_name?: string
  driver_license_no?: string
  violation_type: string
  fine_amount: number
  location: string
  date_issued: string // YYYY-MM-DD
}

export interface VehicleImpoundmentData {
  plate_number: string
  reason: string
  impound_location: string
  impounded_date: string // YYYY-MM-DD
  release_conditions?: string
}

export type RecordData =
  | MissingPersonData
  | WantedPersonData
  | StolenPropertyData
  | CrimeIncidentData
  | ArrestRecordData
  | MissingVehicleData
  | VehicleOffenseData
  | RoadAccidentData
  | TrafficCitationData
  | VehicleImpoundmentData

export interface RecordBadge {
  label: string
  tone: string
}

export interface AttachmentMeta {
  id: string
  name: string
  sizeBytes: number
  kind: "pdf" | "image" | "lab" | "video" | "audio" | "doc"
  url?: string
  /** SHA-256 of the uploaded bytes (absent on legacy rows). */
  fileHash?: string
  /** ISO timestamp until which the file is retained. */
  retentionUntil?: string
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
  author: { name: string; role: Role }
  badges: RecordBadge[]
  attachments: AttachmentMeta[]
  /** Precise coordinates when captured at filing (null otherwise). */
  geo?: { latitude: number; longitude: number } | null
}

export interface Page<T> {
  items: T[]
  nextCursor: number | null
}

export type RecordsPage = Page<TraceRecord>

/** `GET /records` query. */
export interface RecordsQuery {
  cursor?: number
  limit?: number
  type?: RecordType
  status?: CaseStatus
  scope?: "all" | "mine" | "district" | "country"
}

export interface AttachmentInput {
  name?: string
  url: string
  publicId: string
  fileType: string
  fileSizeBytes: number
}

/** `POST /records` body. */
export interface CreateRecordBody {
  type: RecordType
  data: RecordData
  accessLevel?: AccessLevel
  branchId?: string // monitors only; officers file under their own branch
  attachments?: AttachmentInput[]
}

export interface CreateRecordResponse {
  id: string
}

// ── Safety lookups ─────────────────────────────────────────────────────────

/** `POST /lookups` body. */
export type SafetyLookupBody =
  | { check: "wanted"; nationalId: string }
  | { check: "plate"; plateNumber: string }

export interface WantedCheckResult {
  wanted: boolean
  dangerLevel?: string
  district?: string
}

export interface FlagCheckResult {
  flagged: boolean
}

/** `GET /lookups/plate?plate=` — ANPR-ready check (reasons police-only). */
export interface PlateLookupResult {
  flagged: boolean
  reasons: string[]
}

// ── Analytics ──────────────────────────────────────────────────────────────

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
  /** Time series (oldest → newest) for trend charts. */
  series?: AnalyticsSeriesPoint[]
  severity: "info" | "warning" | "critical"
}

// ── Notifications ────────────────────────────────────────────────────────

/** `GET /notifications` response. */
export interface NotificationList {
  unread: number
  items: NotificationItem[]
}

export interface NotificationItem {
  id: string
  type: string
  recordId: string | null
  message: string
  isRead: boolean
  createdAt: string
}

/** `GET /notifications` query. */
export interface NotificationsQuery {
  limit?: number
}

/** `POST /notifications` body. */
export type MarkNotificationsReadBody = { id: string } | { all: true }

// ── Misc ───────────────────────────────────────────────────────────────────

export interface UploadCredentials {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
}

export interface HealthResponse {
  ok: boolean
}

export interface OkResponse {
  ok: true
}

export interface ApiErrorBody {
  error: string
  details?: unknown
}
