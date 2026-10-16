// DEMO-COMPETITION-ONLY — delete before production / after the competition.
// Exposes seeded test phone numbers so judges can sign in without receiving
// a real SMS. Removed by `node scripts/revert-competition-demo.mjs`.
import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm"

import { db } from "@/db"
import { users, userRoleEnum } from "@/db/schema"

export const dynamic = "force-dynamic"

// DEMO-COMPETITION-ONLY — dialog page size.
const DEFAULT_PAGE_SIZE = 6
const MAX_PAGE_SIZE = 50

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // `role=all` (or absent/invalid) means no role filter.
  const rawRole = searchParams.get("role")
  const role =
    rawRole && (userRoleEnum.enumValues as string[]).includes(rawRole)
      ? rawRole
      : null
  const page = Math.max(
    0,
    Number.parseInt(searchParams.get("page") ?? "0", 10) || 0
  )
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE)
  )

  const filters = [isNotNull(users.phoneNumber)]
  if (role) filters.push(eq(users.role, role as never))
  const where = and(...filters)

  const orderBy = [
    // false < true, so every non-officer sorts before officers
    sql`(${users.role} = 'officer')`,
    users.role,
    asc(users.id),
  ]

  const [{ total }] = await db
    .select({ total: count() })
    .from(users)
    .where(where)

  const rows = await db
    .select({
      name: users.name,
      phoneNumber: users.phoneNumber,
      role: users.role,
      domain: users.domain,
    })
    .from(users)
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset(page * pageSize)

  const roles = await db
    .select({ role: users.role, total: count() })
    .from(users)
    .where(isNotNull(users.phoneNumber))
    .groupBy(users.role)
    .orderBy(users.role)

  return Response.json({
    numbers: rows.filter((r) => r.phoneNumber),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    roles,
    note: "Competition demo only — sign in with any of these numbers, then read the code on the verify page.",
  })
}
