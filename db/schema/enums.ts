import { pgEnum } from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// Org structure
// ---------------------------------------------------------------------------

export const domainEnum = pgEnum("domain", ["regular", "traffic"])

// Police roles (officer/district_monitor/country_monitor) sit inside a
// domain and are scoped by branch/district as before. The other five roles
// are either cross-domain platform functions or belong to an external
// organization (court, insurer, vehicle registry) rather than a police
// branch — see organizations.ts and the scoping notes on `users`.
export const userRoleEnum = pgEnum("user_role", [
  // ── police, domain-scoped ──────────────────────────────────────────────
  "officer", // scoped to one branch
  "district_monitor", // scoped to one district
  "country_monitor", // nationwide, no branch/district
  // ── platform / cross-domain ─────────────────────────────────────────────
  "system_admin", // provisions users & branches; no case-data access at all
  "compliance_auditor", // reads the audit log only, cross-domain; no case data
  // ── external organizations (see organizations.ts) ───────────────────────
  "court_liaison", // court/prosecution staff; access limited to referred cases
  "insurance_portal_user", // insurer staff; manages their own company's policies
  "vehicle_registrar", // vehicle registry authority; maintains the vehicle registry
])

// All 28 Malawian districts (kept identical to your other system)
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

export const sexEnum = pgEnum("sex", ["male", "female", "other"])

// ---------------------------------------------------------------------------
// External organizations (not police branches)
// ---------------------------------------------------------------------------

export const organizationTypeEnum = pgEnum("organization_type", [
  "court", // court_liaison users belong here
  "insurer", // insurance_portal_user users belong here
  "vehicle_registry", // vehicle_registrar users belong here
])

// ---------------------------------------------------------------------------
// Access control (simple version — no grants, just a visibility tier)
// ---------------------------------------------------------------------------

// Who besides the reporting branch can see a record.
//   branch  -> only officers/monitors of the reporting branch
//   district-> also visible to that district's monitor (and its officers,
//              if you choose to let officers see district-level records)
//   country -> visible to country monitors too (e.g. wanted persons,
//              flagged vehicles — anything that should be searchable nationwide)
export const accessLevelEnum = pgEnum("access_level", [
  "branch",
  "district",
  "country",
])

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

// Matches keys of recordSchemas in validations/record.ts exactly.
// Split roughly regular vs traffic — see `domain` column on `records`.
export const recordTypeEnum = pgEnum("record_type", [
  // regular domain
  "missing_person",
  "wanted_person",
  "stolen_property",
  "crime_incident",
  "arrest_record",
  // traffic domain
  "missing_vehicle",
  "vehicle_offense",
  "road_accident",
  "traffic_citation",
  "vehicle_impoundment",
])

// Generic lifecycle status usable across every record type. Type-specific
// detail (e.g. "found_deceased" vs "found_alive") lives inside `data`.
export const caseStatusEnum = pgEnum("case_status", [
  "active",
  "resolved",
  "closed",
  "archived",
])

export const dangerLevelEnum = pgEnum("danger_level", [
  "low",
  "medium",
  "high",
  "extreme",
])

// Outcome of a case referred to a court_liaison — recorded by the liaison
// once known, closing the loop on court_case_access referrals.
export const courtCaseOutcomeEnum = pgEnum("court_case_outcome", [
  "pending",
  "charged",
  "withdrawn",
  "dismissed",
  "convicted",
  "acquitted",
  "other",
])

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const auditActionTypeEnum = pgEnum("audit_action_type", [
  "record_created",
  "record_viewed",
  "record_updated",
  "status_changed",
  "cross_district_access", // monitor/officer read a record outside their own district
  "cross_branch_access", // read a record outside their own branch
  "report_generated", // aggregate/analytics pull
  "court_case_referred", // a police user granted a court_liaison access to a specific record
  "court_case_viewed", // a court_liaison read a referred record
  "court_case_outcome_recorded", // a court_liaison recorded a case outcome
  "court_access_renewed", // a monitor extended a court_case_access grant's expiry
  "court_access_expired", // a court_case_access grant lapsed automatically
  "policy_entered", // an insurance_portal_user created a policy
  "policy_updated", // an insurance_portal_user updated a policy
  "payment_received", // Phase 1: fine payment recorded (any-branch receiving)
  "citation_voided", // Phase 1: monitor voided a spoiled/duplicate ticket
  "status_rejected", // Phase 2: a status transition was blocked by its guard
  "locate_reported", // Phase 3: an officer reported a locate/find/recovery
  "locate_confirmed", // Phase 3: originator/monitor confirmed the locate
  "review_added", // a monitor (or filing officer) added a review note
  "insurer_flag_lookup", // an insurance_portal_user checked a vehicle's flagged status
  "vehicle_registered", // a vehicle_registrar created/verified a vehicle record
  "user_provisioned", // a system_admin created or edited a user account
])
