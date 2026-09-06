import { headers } from "next/headers"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { hospitals, users } from "@/db/schema"
import { auth } from "@/lib/auth"
import { formatDistrict, toUiRole, isStaffRole } from "@/lib/roles"
import type { EmergencyInfo, User } from "@/lib/types"

type DbEmergencyInfo = {
  blood_type?: string
  allergies?: string[]
  chronic_conditions?: string[]
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relation?: string
}

type UserRow = typeof users.$inferSelect & {
  hospitalName: string | null
}

export function mapEmergencyInfo(raw: DbEmergencyInfo): EmergencyInfo {
  const contact =
    raw.emergency_contact_name && raw.emergency_contact_phone
      ? {
          name: raw.emergency_contact_name,
          phone: raw.emergency_contact_phone,
          relation: raw.emergency_contact_relation,
        }
      : undefined
  return {
    bloodType: raw.blood_type,
    allergies: raw.allergies ?? [],
    chronicConditions: raw.chronic_conditions ?? [],
    emergencyContact: contact,
  }
}

export function mapUserRow(row: UserRow): User {
  const uiRole = toUiRole(row.role)
  return {
    id: row.id,
    name: row.name,
    phone: row.phoneNumber ?? "",
    role: uiRole,
    nationalId: row.nationalId ?? undefined,
    dateOfBirth: row.dateOfBirth ?? undefined,
    sex: row.sex ?? undefined,
    district: formatDistrict(row.district) || undefined,
    facility:
      row.hospitalName ??
      (isStaffRole(uiRole)
        ? `${formatDistrict(row.district) || "National"} Health Office`
        : uiRole === "ADMINISTRATOR"
          ? "Registry Administration"
          : undefined),
    licenseNumber: row.medicalLicenseNo ?? undefined,
    emergencyInfo: mapEmergencyInfo(row.emergencyInfo),
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  const [row] = await db
    .select({ user: users, hospitalName: hospitals.name })
    .from(users)
    .leftJoin(hospitals, eq(users.hospitalId, hospitals.id))
    .where(eq(users.id, userId))
    .limit(1)

  if (!row) return null
  return mapUserRow({ ...row.user, hospitalName: row.hospitalName })
}

/** Full app user for the current session, or null when signed out. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  return getUserById(session.user.id)
}

/** Same as getCurrentUser but throws — for actions that must be authenticated. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")
  return user
}
