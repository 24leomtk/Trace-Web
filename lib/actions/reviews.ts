"use server"

import { and, desc, eq } from "drizzle-orm"

import { caseReviews, courtCaseAccess, records, users } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { writeAuditTx } from "@/lib/server/audit"
import { getViewerScope } from "@/lib/actions/records"
import { canViewRecord } from "@/lib/visibility"
import { notifyUser } from "@/lib/actions/notifications"

export interface ReviewItem {
  id: string
  reviewerName: string
  note: string
  createdAt: string
}

/** Follow-up notes on a case — append-only, never an edit of the case itself. */
export async function listReviews(recordId: string): Promise<ReviewItem[]> {
  const scope = await getViewerScope()
  return withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    let allowed = canViewRecord(scope, record)
    if (!allowed && scope.role === "COURT_LIAISON") {
      const now = new Date()
      const grants = await tx
        .select({
          revokedAt: courtCaseAccess.revokedAt,
          expiresAt: courtCaseAccess.expiresAt,
        })
        .from(courtCaseAccess)
        .where(
          and(
            eq(courtCaseAccess.recordId, recordId),
            eq(courtCaseAccess.courtLiaisonId, scope.id)
          )
        )
      allowed = grants.some(
        (grant) => !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > now)
      )
    }
    if (!allowed) throw new Error("You don't have access to this record.")
    const rows = await tx
      .select({ review: caseReviews, reviewerName: users.name })
      .from(caseReviews)
      .leftJoin(users, eq(caseReviews.reviewerId, users.id))
      .where(eq(caseReviews.recordId, recordId))
      .orderBy(desc(caseReviews.createdAt))
      .limit(50)
    return rows.map((row) => ({
      id: row.review.id,
      reviewerName: row.reviewerName ?? "Unknown",
      note: row.review.note,
      createdAt: row.review.createdAt.toISOString(),
    }))
  })
}

export async function addReview({
  recordId,
  note,
}: {
  recordId: string
  note: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  const text = note.trim()
  if (text.length < 2) throw new Error("Write a review note first.")
  if (text.length > 2000) throw new Error("Review notes are capped at 2000 characters.")
  return withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    const isMonitor =
      scope.role === "DISTRICT_MONITOR" || scope.role === "COUNTRY_MONITOR"
    const isFiler = record.reportedBy === scope.id
    if (!isMonitor && !isFiler) {
      throw new Error("Only monitors or the filing officer can add review notes.")
    }
    if (!canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    const [review] = await tx
      .insert(caseReviews)
      .values({ recordId, reviewerId: scope.id, note: text })
      .returning({ id: caseReviews.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "review_added",
      recordId,
      reason: "Review note added.",
    })
    if (record.reportedBy !== scope.id) {
      await notifyUser(tx, {
        userId: record.reportedBy,
        type: "review_added",
        recordId,
        message: `${scope.name} added a review note on your case.`,
      })
    }
    return { id: review.id }
  })
}
