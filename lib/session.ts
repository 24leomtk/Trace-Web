import { headers } from "next/headers"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { branches, organizations, users } from "@/db/schema"
import { auth } from "@/lib/auth"
import { formatDistrict, toUiRole } from "@/lib/roles"
import type { Domain, User } from "@/lib/types"

type UserRow = typeof users.$inferSelect & {
  branchName: string | null
  branchDomain: Domain | null
  branchDistrict: string | null
  organizationName: string | null
}

export function mapUserRow(row: UserRow): User {
  const uiRole = toUiRole(row.role)
  const district =
    formatDistrict(row.district ?? row.branchDistrict) || undefined
  const domain = (row.domain ?? row.branchDomain ?? undefined) as
    | Domain
    | undefined
  const posting =
    row.branchName && row.branchDomain
      ? `${row.branchName} (${row.branchDomain === "regular" ? "Regular" : "Traffic"})`
      : (row.organizationName ??
        (uiRole === "SYSTEM_ADMIN"
          ? "TRACE Administration"
          : uiRole === "COMPLIANCE_AUDITOR"
            ? "Compliance Oversight"
            : undefined))
  return {
    id: row.id,
    name: row.name,
    phone: row.phoneNumber ?? "",
    role: uiRole,
    badgeNumber: row.badgeNumber ?? undefined,
    domain,
    branchId: row.branchId ?? undefined,
    branchName: row.branchName ?? undefined,
    district,
    organizationId: row.organizationId ?? undefined,
    organizationName: row.organizationName ?? undefined,
    posting,
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  const [row] = await db
    .select({
      user: users,
      branchName: branches.name,
      branchDomain: branches.domain,
      branchDistrict: branches.district,
      organizationName: organizations.name,
    })
    .from(users)
    .leftJoin(branches, eq(users.branchId, branches.id))
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.id, userId))
    .limit(1)

  if (!row) return null
  return mapUserRow({ ...row.user, ...row })
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
