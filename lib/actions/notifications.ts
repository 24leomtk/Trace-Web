"use server"

import { and, desc, eq } from "drizzle-orm"

import { notifications } from "@/db/schema"
import { withUserCtx, type DbTransaction } from "@/lib/db-context"
import { requireUser } from "@/lib/session"

export type NotificationType =
  | "referral_received"
  | "referral_updated"
  | "outcome_recorded"
  | "status_changed"
  | "review_added"
  | "task_assigned"
  | "task_updated"
  | "payment_received"
  | "verification_needed"
  | "approval_needed"

/** Insert a notification inside an existing transaction (no RLS surprises —
 * the policy allows police/liaison/system actors to notify). */
export async function notifyUser(
  tx: DbTransaction,
  input: {
    userId: string
    type: NotificationType
    recordId?: string
    message: string
  }
): Promise<void> {
  if (!input.userId) return
  try {
    await tx.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      recordId: input.recordId,
      message: input.message,
    })
  } catch (error) {
    console.error("[notify] failed to queue notification", error)
  }
}

export interface NotificationItem {
  id: string
  type: string
  recordId: string | null
  message: string
  isRead: boolean
  createdAt: string
}

export async function listNotifications(limit = 30): Promise<NotificationItem[]> {
  const user = await requireUser()
  return withUserCtx(user.id, async (tx) => {
    const rows = await tx
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      recordId: row.recordId,
      message: row.message,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    }))
  })
}

export async function unreadNotificationCount(): Promise<number> {
  const user = await requireUser()
  return withUserCtx(user.id, async (tx) => {
    const rows = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(eq(notifications.userId, user.id), eq(notifications.isRead, false))
      )
      .limit(100)
    return rows.length
  })
}

export async function markNotificationRead(id: string): Promise<void> {
  const user = await requireUser()
  await withUserCtx(user.id, async (tx) => {
    await tx
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
  })
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser()
  await withUserCtx(user.id, async (tx) => {
    await tx
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, user.id))
  })
}

/** Dismiss a notification — deletes only the caller's own row. */
export async function deleteNotification(id: string): Promise<void> {
  const user = await requireUser()
  await withUserCtx(user.id, async (tx) => {
    await tx
      .delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
  })
}
