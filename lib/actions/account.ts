"use server"

import { and, eq, ne } from "drizzle-orm"

import { db } from "@/db"
import { sessions, users } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { writeAuditTx } from "@/lib/server/audit"
import { requireUser } from "@/lib/session"
import { tempEmailFor } from "@/lib/format"

function normalizePhone(phone: string): string {
  return phone.trim()
}

function assertMalawianPhone(phone: string): void {
  if (!/^\+265\d{9}$/.test(phone)) {
    throw new Error("Only Malawian numbers (+265, 9 digits) are accepted.")
  }
}

/**
 * Availability check before sending a change-of-number OTP. The plugin
 * itself rejects taken numbers at verify time — this gives a clear error
 * up front instead of after the user types a code.
 */
export async function checkPhoneAvailable(phone: string): Promise<void> {
  const user = await requireUser()
  const normalized = normalizePhone(phone)
  assertMalawianPhone(normalized)
  if (normalized === user.phone) {
    throw new Error("That is already your phone number.")
  }
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phoneNumber, normalized), ne(users.id, user.id)))
    .limit(1)
  if (taken) {
    throw new Error("That number is already registered to another account.")
  }
}

/**
 * Post-verification sync for a self-service phone change. Call AFTER
 * `authClient.phoneNumber.verify({ updatePhoneNumber: true })` succeeds —
 * the plugin moves `phone_number` itself; this keeps the derived login
 * email (`<phone>@phone.trace.mw`) in step and records the change.
 */
export async function syncPhoneAfterChange(phone: string): Promise<void> {
  const user = await requireUser()
  const normalized = normalizePhone(phone)
  assertMalawianPhone(normalized)
  await withUserCtx(user.id, async (tx) => {
    const [row] = await tx
      .select({ phoneNumber: users.phoneNumber })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
    if (!row) throw new Error("Account not found.")
    if (row.phoneNumber !== normalized) {
      throw new Error(
        "Number not verified yet — enter the code sent to the new number first."
      )
    }
    await tx
      .update(users)
      .set({ email: tempEmailFor(normalized), updatedAt: new Date() })
      .where(eq(users.id, user.id))
    await writeAuditTx(tx, {
      actorId: user.id,
      actionType: "user_provisioned",
      reason: `Changed own phone number to ${normalized}.`,
    })
  })
}

/**
 * Self-service account deletion. A hard delete is impossible — case rows,
 * reviews, referrals and the audit trail reference this user — so deletion
 * means deactivation plus wiping every session, exactly like an admin
 * deactivation. History is kept for audit; the number can only be
 * reactivated by a system administrator.
 */
export async function deleteMyAccount(): Promise<void> {
  const user = await requireUser()
  await withUserCtx(user.id, async (tx) => {
    await tx
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, user.id))
    await tx.delete(sessions).where(eq(sessions.userId, user.id))
    await writeAuditTx(tx, {
      actorId: user.id,
      actionType: "user_provisioned",
      reason: `Deleted own account (${user.name}).`,
    })
  })
}
