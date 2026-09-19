import type { Role } from "@/lib/types"

export type DbRole =
  | "officer"
  | "district_monitor"
  | "country_monitor"
  | "system_admin"
  | "compliance_auditor"
  | "court_liaison"
  | "insurance_portal_user"
  | "vehicle_registrar"
  | "tax_officer"
  | "tax_compliance_officer"
export type DbDistrict =
  | "balaka"
  | "blantyre"
  | "chikwawa"
  | "chiradzulu"
  | "chitipa"
  | "dedza"
  | "dowa"
  | "karonga"
  | "kasungu"
  | "likoma"
  | "lilongwe"
  | "machinga"
  | "mangochi"
  | "mchinji"
  | "mulanje"
  | "mwanza"
  | "mzimba"
  | "neno"
  | "nkhata_bay"
  | "nkhotakota"
  | "nsanje"
  | "ntcheu"
  | "ntchisi"
  | "phalombe"
  | "rumphi"
  | "salima"
  | "thyolo"
  | "zomba"

export type DbDomain = "regular" | "traffic"

const DB_TO_UI: Record<DbRole, Role> = {
  officer: "OFFICER",
  district_monitor: "DISTRICT_MONITOR",
  country_monitor: "COUNTRY_MONITOR",
  system_admin: "SYSTEM_ADMIN",
  compliance_auditor: "COMPLIANCE_AUDITOR",
  court_liaison: "COURT_LIAISON",
  insurance_portal_user: "INSURANCE_PORTAL_USER",
  vehicle_registrar: "VEHICLE_REGISTRAR",
  tax_officer: "TAX_OFFICER",
  tax_compliance_officer: "TAX_COMPLIANCE_OFFICER",
}

const UI_TO_DB: Record<Role, DbRole> = {
  OFFICER: "officer",
  DISTRICT_MONITOR: "district_monitor",
  COUNTRY_MONITOR: "country_monitor",
  SYSTEM_ADMIN: "system_admin",
  COMPLIANCE_AUDITOR: "compliance_auditor",
  COURT_LIAISON: "court_liaison",
  INSURANCE_PORTAL_USER: "insurance_portal_user",
  VEHICLE_REGISTRAR: "vehicle_registrar",
  TAX_OFFICER: "tax_officer",
  TAX_COMPLIANCE_OFFICER: "tax_compliance_officer",
}

export function toUiRole(role: string): Role {
  return DB_TO_UI[role as DbRole] ?? "OFFICER"
}

export function toDbRole(role: Role): DbRole {
  return UI_TO_DB[role]
}

/** Title-case a district enum value, e.g. "nkhata_bay" -> "Nkhata Bay". */
export function formatDistrict(district: string | null | undefined): string {
  if (!district) return ""
  return district
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/** Police roles: officer + both monitor tiers (domain-scoped, case-data access). */
export function isPoliceRole(role: Role): boolean {
  return (
    role === "OFFICER" ||
    role === "DISTRICT_MONITOR" ||
    role === "COUNTRY_MONITOR"
  )
}

/** District or country monitor — can review, escalate, and refer to court. */
export function isMonitorRole(role: Role): boolean {
  return role === "DISTRICT_MONITOR" || role === "COUNTRY_MONITOR"
}

/** Court / insurer / registry / revenue staff — scoped by organization, not branch. */
export function isExternalRole(role: Role): boolean {
  return (
    role === "COURT_LIAISON" ||
    role === "INSURANCE_PORTAL_USER" ||
    role === "VEHICLE_REGISTRAR" ||
    role === "TAX_OFFICER" ||
    role === "TAX_COMPLIANCE_OFFICER"
  )
}

/** Platform roles with no case-data access. */
export function isPlatformRole(role: Role): boolean {
  return role === "SYSTEM_ADMIN" || role === "COMPLIANCE_AUDITOR"
}

export function isAdministratorRole(role: Role): boolean {
  return role === "SYSTEM_ADMIN"
}

export const DISTRICT_OPTIONS: DbDistrict[] = [
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
]

export const DOMAIN_OPTIONS: DbDomain[] = ["regular", "traffic"]
