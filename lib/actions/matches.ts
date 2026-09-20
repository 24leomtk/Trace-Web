"use server"

import { and, desc, eq, ilike, ne, or } from "drizzle-orm"

import { db } from "@/db"
import {
  missingPersonCases,
  personCaseMatches,
  records,
  unclaimedPersonCases,
} from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { writeAuditTx } from "@/lib/server/audit"
import { canViewRecord, escapeLike, type VisibilityRecord } from "@/lib/visibility"
import {
  matchProposeSchema,
  matchReviewSchema,
} from "@/validations/matches"
import { getViewerScope, type ViewerScope } from "@/lib/actions/records"

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

function canWorkMatches(role: string): boolean {
  return role === "OFFICER" || role === "DISTRICT_MONITOR" || role === "COUNTRY_MONITOR"
}

function isMonitorRole(role: string): boolean {
  return role === "DISTRICT_MONITOR" || role === "COUNTRY_MONITOR"
}

function toVisibility(record: typeof records.$inferSelect): VisibilityRecord {
  return {
    domain: record.domain,
    branchId: record.branchId,
    district: record.district,
    accessLevel: record.accessLevel,
    reportedBy: record.reportedBy,
  }
}

async function requireReadableRecord(
  scope: ViewerScope,
  tx: DbTx,
  id: string
): Promise<typeof records.$inferSelect> {
  const [record] = await tx.select().from(records).where(eq(records.id, id)).limit(1)
  if (!record) throw new Error("Record not found.")
  if (!canViewRecord(scope, toVisibility(record))) {
    throw new Error("You don't have access to one of these records.")
  }
  return record
}

async function existingLiveMatch(tx: DbTx, a: string, b: string) {
  const [found] = await tx
    .select({ id: personCaseMatches.id })
    .from(personCaseMatches)
    .where(
      and(
        or(
          and(
            eq(personCaseMatches.recordIdA, a),
            eq(personCaseMatches.recordIdB, b)
          ),
          and(
            eq(personCaseMatches.recordIdA, b),
            eq(personCaseMatches.recordIdB, a)
          )
        ),
        ne(personCaseMatches.matchType, "excluded")
      )
    )
    .limit(1)
  return found ?? null
}

/** Propose a link between two records (officer+, both records readable). */
export async function proposeMatch(input: {
  recordIdA: string
  recordIdB: string
  score?: number
  reason: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (!canWorkMatches(scope.role)) throw new Error("Your role can't propose matches.")
  const parsed = matchProposeSchema.safeParse(input)
  if (!parsed.success) throw new Error("The match details didn't pass validation.")
  const data = parsed.data
  if (data.recordIdA === data.recordIdB) {
    throw new Error("A record can't match itself.")
  }

  return withUserCtx(scope.id, async (tx) => {
    await requireReadableRecord(scope, tx, data.recordIdA)
    await requireReadableRecord(scope, tx, data.recordIdB)
    if (await existingLiveMatch(tx, data.recordIdA, data.recordIdB)) {
      throw new Error("These records already have a live match.")
    }
    const [row] = await tx
      .insert(personCaseMatches)
      .values({
        recordIdA: data.recordIdA,
        recordIdB: data.recordIdB,
        matchType: "possible",
        score: data.score !== undefined ? String(data.score) : undefined,
        reason: data.reason.trim(),
        proposedBy: scope.id,
      })
      .returning({ id: personCaseMatches.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "match_proposed",
      recordId: data.recordIdA,
      reason: `Possible match proposed with ${data.recordIdB}.`,
    })
    return { id: row.id }
  })
}

/**
 * Review a proposed match (monitor-only, maker-checker: the reviewer must
 * differ from the proposer and must be able to view both records).
 */
export async function reviewMatch(input: {
  matchId: string
  decision: "confirmed" | "excluded"
  reason?: string
}): Promise<void> {
  const scope = await getViewerScope()
  if (!isMonitorRole(scope.role)) throw new Error("Only monitors can review matches.")
  const parsed = matchReviewSchema.safeParse(input)
  if (!parsed.success) throw new Error("The review didn't pass validation.")

  await withUserCtx(scope.id, async (tx) => {
    const [match] = await tx
      .select()
      .from(personCaseMatches)
      .where(eq(personCaseMatches.id, parsed.data.matchId))
      .limit(1)
    if (!match) throw new Error("Match not found.")
    if (match.matchType !== "possible") {
      throw new Error("This match has already been reviewed.")
    }
    if (match.proposedBy === scope.id) {
      throw new Error("The reviewer must differ from the proposer.")
    }
    await requireReadableRecord(scope, tx, match.recordIdA)
    await requireReadableRecord(scope, tx, match.recordIdB)
    await tx
      .update(personCaseMatches)
      .set({
        matchType: parsed.data.decision,
        reviewedBy: scope.id,
        reviewedAt: new Date(),
      })
      .where(eq(personCaseMatches.id, match.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType:
        parsed.data.decision === "confirmed" ? "match_confirmed" : "match_excluded",
      recordId: match.recordIdA,
      reason:
        parsed.data.reason?.trim() ||
        (parsed.data.decision === "confirmed"
          ? "Match confirmed on review."
          : "Match ruled out on review."),
    })
  })
}

export interface RecordMatchView {
  id: string
  matchType: string
  score: string | null
  reason: string | null
  otherRecordId: string
  otherRecordType: string
  otherDistrict: string
  otherStatus: string
  createdAt: string
}

/** All live matches touching a record (viewer must view the record). */
export async function listMatchesForRecord(recordId: string): Promise<RecordMatchView[]> {
  const scope = await getViewerScope()
  if (!canWorkMatches(scope.role)) throw new Error("Your role can't open matches.")
  return withUserCtx(scope.id, async (tx) => {
    await requireReadableRecord(scope, tx, recordId)
    const rows = await tx
      .select()
      .from(personCaseMatches)
      .where(
        or(
          eq(personCaseMatches.recordIdA, recordId),
          eq(personCaseMatches.recordIdB, recordId)
        )
      )
      .orderBy(desc(personCaseMatches.createdAt))
    const out: RecordMatchView[] = []
    for (const row of rows) {
      const otherId = row.recordIdA === recordId ? row.recordIdB : row.recordIdA
      const [other] = await tx
        .select({
          recordType: records.recordType,
          district: records.district,
          status: records.status,
        })
        .from(records)
        .where(eq(records.id, otherId))
        .limit(1)
      if (!other) continue
      out.push({
        id: row.id,
        matchType: row.matchType,
        score: row.score,
        reason: row.reason,
        otherRecordId: otherId,
        otherRecordType: other.recordType,
        otherDistrict: other.district,
        otherStatus: other.status,
        createdAt: row.createdAt.toISOString(),
      })
    }
    return out
  })
}

export interface MatchCandidate {
  recordId: string
  recordType: string
  name: string
  district: string
  status: string
  reason: string
}

/**
 * Heuristic candidates for a missing↔unclaimed link. Explicit non-goal: no
 * ML scorer — same person profile, else same district + name similarity.
 * Creating the link is always a human decision (proposeMatch).
 */
export async function findMatchCandidates(recordId: string): Promise<MatchCandidate[]> {
  const scope = await getViewerScope()
  if (!canWorkMatches(scope.role)) throw new Error("Your role can't search matches.")
  return withUserCtx(scope.id, async (tx) => {
    const record = await requireReadableRecord(scope, tx, recordId)
    const wantMissing = record.recordType === "unclaimed_person"
    const wantUnclaimed = record.recordType === "missing_person"
    if (!wantMissing && !wantUnclaimed) return []

    const [probe] = await tx
      .select({
        personId: wantUnclaimed
          ? missingPersonCases.personId
          : unclaimedPersonCases.personId,
        name: wantUnclaimed
          ? missingPersonCases.fullName
          : unclaimedPersonCases.deceasedName,
      })
      .from(wantUnclaimed ? missingPersonCases : unclaimedPersonCases)
      .where(
        eq(
          wantUnclaimed ? missingPersonCases.recordId : unclaimedPersonCases.recordId,
          recordId
        )
      )
      .limit(1)
    if (!probe) return []

    const candidates = new Map<string, MatchCandidate>()
    // 1. Same person profile — strongest signal.
    if (probe.personId) {
      const table = wantUnclaimed ? unclaimedPersonCases : missingPersonCases
      const linked = await tx
        .select({
          recordId: table.recordId,
          personId: table.personId,
          district: table.district,
          status: table.status,
        })
        .from(table)
        .where(eq(table.personId, probe.personId))
        .limit(10)
      for (const row of linked) {
        if (row.recordId === recordId) continue
        const [full] = await tx
          .select()
          .from(records)
          .where(eq(records.id, row.recordId))
          .limit(1)
        if (!full || !canViewRecord(scope, toVisibility(full))) continue
        if (await existingLiveMatch(tx, recordId, row.recordId)) continue
        candidates.set(row.recordId, {
          recordId: row.recordId,
          recordType: full.recordType,
          name: probe.name ?? "Unknown",
          district: row.district ?? "",
          status: row.status,
          reason: "Same person profile linked to both records.",
        })
      }
    }
    // 2. Same district + name similarity (first-token match).
    if (candidates.size < 10) {
      const firstToken = (probe.name ?? "").trim().split(/\s+/)[0] ?? ""
      if (firstToken.length >= 2) {
        const table = wantUnclaimed ? unclaimedPersonCases : missingPersonCases
        const nameCol = wantUnclaimed
          ? unclaimedPersonCases.deceasedName
          : missingPersonCases.fullName
        const similar = await tx
          .select({
            recordId: table.recordId,
            district: table.district,
            status: table.status,
          })
          .from(table)
          .where(ilike(nameCol, `%${escapeLike(firstToken)}%`))
          .limit(20)
        for (const row of similar) {
          if (row.recordId === recordId || candidates.has(row.recordId)) continue
          if (row.district !== record.district) continue
          if (row.status !== "active") continue
          const [full] = await tx
            .select()
            .from(records)
            .where(eq(records.id, row.recordId))
            .limit(1)
          if (!full || !canViewRecord(scope, toVisibility(full))) continue
          if (await existingLiveMatch(tx, recordId, row.recordId)) continue
          candidates.set(row.recordId, {
            recordId: row.recordId,
            recordType: full.recordType,
            name: `${firstToken} (name similarity)`,
            district: row.district ?? "",
            status: row.status,
            reason: "Same district with a similar name — verify before proposing.",
          })
          if (candidates.size >= 10) break
        }
      }
    }
    return [...candidates.values()]
  })
}
