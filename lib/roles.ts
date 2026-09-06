import type { Role } from "@/lib/types"

export type DbRole =
  | "patient"
  | "doctor"
  | "district_admin"
  | "country_admin"
  | "administrator"
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

const DB_TO_UI: Record<DbRole, Role> = {
  patient: "PATIENT",
  doctor: "DOCTOR",
  district_admin: "DISTRICT_ADMIN",
  country_admin: "NATIONAL_ADMIN",
  administrator: "ADMINISTRATOR",
}

const UI_TO_DB: Record<Role, DbRole> = {
  PATIENT: "patient",
  DOCTOR: "doctor",
  DISTRICT_ADMIN: "district_admin",
  NATIONAL_ADMIN: "country_admin",
  ADMINISTRATOR: "administrator",
}

export function toUiRole(role: string): Role {
  return DB_TO_UI[role as DbRole] ?? "PATIENT"
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

export function isStaffRole(role: Role): boolean {
  return role === "DISTRICT_ADMIN" || role === "NATIONAL_ADMIN"
}

export function isAdministratorRole(role: Role): boolean {
  return role === "ADMINISTRATOR"
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
