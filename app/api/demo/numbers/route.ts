// DEMO-COMPETITION-ONLY — delete before production / after the competition.
// Exposes seeded test phone numbers so judges can sign in without receiving
// a real SMS. Removed by `node scripts/revert-competition-demo.mjs`.
import { asc, isNotNull, sql } from "drizzle-orm"

import { db } from "@/db"
import { users } from "@/db/schema"

export const dynamic = "force-dynamic"

export async function GET() {
  const rows = await db
    .select({
      name: users.name,
      phoneNumber: users.phoneNumber,
      role: users.role,
    })
    .from(users)
    .where(isNotNull(users.phoneNumber))
    .orderBy(
      // false < true, so every non-officer sorts before officers
      sql`(${users.role} = 'officer')`,
      users.role,
      asc(users.id)
    )

  return Response.json({
    numbers: rows.filter((r) => r.phoneNumber),
    note: "Competition demo only — sign in with any of these numbers, then read the code on the verify page.",
  })
}
