// DEMO-COMPETITION-ONLY — delete before production / after the competition.
// Returns the latest unexpired OTP for a phone number so judges can complete
// sign-in without receiving a real SMS. Removed by
// `node scripts/revert-competition-demo.mjs`.
import { and, desc, eq, gt } from "drizzle-orm"

import { db } from "@/db"
import { verifications } from "@/db/schema"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get("phone")?.trim()
  if (!phone) {
    return Response.json({ error: "Missing ?phone=" }, { status: 400 })
  }

  // Order by createdAt desc to match better-auth's own lookup
  // (findVerificationValue sorts by createdAt desc, limit 1), so the code
  // shown is always the one that will actually verify — including after
  // a Resend or a wrong-code retry (which recreates the row).
  const rows = await db
    .select({
      value: verifications.value,
      expiresAt: verifications.expiresAt,
    })
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, phone),
        gt(verifications.expiresAt, new Date())
      )
    )
    .orderBy(desc(verifications.createdAt))
    .limit(1)

  if (rows.length === 0) {
    return Response.json(
      { code: null, message: "No active code for this number yet. Tap Resend." },
      { status: 404 }
    )
  }

  // better-auth stores OTPs as "<code>:<attempts>" — strip the suffix.
  const code = rows[0].value.split(":")[0]
  return Response.json({ code, expiresAt: rows[0].expiresAt })
}
