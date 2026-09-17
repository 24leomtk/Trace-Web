"use server"

import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/db"
import {
  branches,
  caseAssignments,
  records,
  users,
} from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { describeRecord } from "@/lib/record-view"
import { writeAuditTx } from "@/lib/server/audit"
import { canViewRecord } from "@/lib/visibility"
import { assignmentSchema } from "@/validations/admin"
import type { RecordType } from "@/validations/record"
import {
  getViewerScope,
  type ViewerScope,
} from "@/lib/actions/records"
import { notifyUser } from "@/lib/actions/notifications"

function isMonitor(scope: ViewerScope): boolean {
  return scope.role === "DISTRICT_MONITOR" || scope.role === "COUNTRY_MONITOR"
}

function isPolice(scope: ViewerScope): boolean {
  return (
    scope.role === "OFFICER" ||
    scope.role === "DISTRICT_MONITOR" ||
    scope.role === "COUNTRY_MONITOR"
  )
}

interface AssigneeScope {
  id: string
  name: string
  role: string
  domain: string | null
  branchDistrict: string | null
  district: string | null
}

/** Assignee must be active police whose own scope intersects the record. */
async function eligibleAssignee(
  record: typeof records.$inferSelect,
  assigneeId: string
): Promise<AssigneeScope> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      domain: users.domain,
      district: users.district,
      isActive: users.isActive,
      branchDistrict: branches.district,
    })
    .from(users)
    .leftJoin(branches, eq(users.branchId, branches.id))
    .where(eq(users.id, assigneeId))
    .limit(1)
  if (!row || !row.isActive) throw new Error("Assignee not found.")
  if (
    row.role !== "officer" &&
    row.role !== "district_monitor" &&
    row.role !== "country_monitor"
  ) {
    throw new Error("Tasks can only go to police users.")
  }
  const domain = row.domain
  if (domain !== record.domain) {
    throw new Error("Assignee is in the other domain.")
  }
  if (row.role === "officer" && row.branchDistrict !== record.district) {
    throw new Error("That officer is outside this case's district.")
  }
  if (row.role === "district_monitor" && row.district !== record.district) {
    throw new Error("That monitor is outside this case's district.")
  }
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    domain,
    branchDistrict: row.branchDistrict,
    district: row.district,
  }
}

export interface AssignmentItem {
  id: string
  recordId: string
  recordTitle: string
  state: string
  note: string | null
  dueAt: string | null
  assigneeId: string
  assigneeName: string
  assignedByName: string
  createdAt: string
}

async function toAssignmentItem(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  row: typeof caseAssignments.$inferSelect
): Promise<AssignmentItem> {
  const [record] = await tx
    .select({ recordType: records.recordType, data: records.data })
    .from(records)
    .where(eq(records.id, row.recordId))
    .limit(1)
  const [assignee] = await tx
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.assigneeId))
    .limit(1)
  const [assigner] = await tx
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.assignedBy))
    .limit(1)
  const title = record
    ? describeRecord(
        record.recordType as RecordType,
        (record.data ?? {}) as Record<string, unknown>
      ).title
    : "Case"
  return {
    id: row.id,
    recordId: row.recordId,
    recordTitle: title,
    state: row.state,
    note: row.note,
    dueAt: row.dueAt?.toISOString() ?? null,
    assigneeId: row.assigneeId,
    assigneeName: assignee?.name ?? "Unknown",
    assignedByName: assigner?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  }
}

/** Monitor assigns a case to one officer/monitor with an optional due date. */
export async function assignCase(input: {
  recordId: string
  assigneeId: string
  dueAt?: string
  note?: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (!isMonitor(scope)) throw new Error("Only monitors assign tasks.")
  const parsed = assignmentSchema.safeParse(input)
  if (!parsed.success) throw new Error("The assignment didn't pass validation.")

  return withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, parsed.data.recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    if (!canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    const assignee = await eligibleAssignee(record, parsed.data.assigneeId)
    const [duplicate] = await tx
      .select({ id: caseAssignments.id })
      .from(caseAssignments)
      .where(
        and(
          eq(caseAssignments.recordId, record.id),
          eq(caseAssignments.assigneeId, assignee.id),
          eq(caseAssignments.state, "open")
        )
      )
      .limit(1)
    if (duplicate) {
      throw new Error(`${assignee.name} already has this case open.`)
    }
    const [created] = await tx
      .insert(caseAssignments)
      .values({
        recordId: record.id,
        assigneeId: assignee.id,
        assignedBy: scope.id,
        note: parsed.data.note?.trim() || undefined,
        dueAt: parsed.data.dueAt ? new Date(`${parsed.data.dueAt}T23:59:59.999Z`) : undefined,
        state: "open",
      })
      .returning({ id: caseAssignments.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      recordId: record.id,
      reason: `Task assigned to ${assignee.name}${parsed.data.dueAt ? `, due ${parsed.data.dueAt}` : ""}.`,
    })
    if (assignee.id !== scope.id) {
      await notifyUser(tx, {
        userId: assignee.id,
        type: "review_added",
        recordId: record.id,
        message: `New task from ${scope.name}${parsed.data.dueAt ? `, due ${parsed.data.dueAt}` : ""}.`,
      })
    }
    return { id: created.id }
  })
}

/** The current user's queue — open tasks first, then recent history. */
export async function listMyAssignments(): Promise<{
  open: AssignmentItem[]
  recent: AssignmentItem[]
}> {
  const scope = await getViewerScope()
  if (!isPolice(scope)) throw new Error("Police users only.")
  return withUserCtx(scope.id, async (tx) => {
    const openRows = await tx
      .select()
      .from(caseAssignments)
      .where(
        and(
          eq(caseAssignments.assigneeId, scope.id),
          eq(caseAssignments.state, "open")
        )
      )
      .orderBy(asc(caseAssignments.dueAt), desc(caseAssignments.createdAt))
      .limit(50)
    const recentRows = await tx
      .select()
      .from(caseAssignments)
      .where(
        and(
          eq(caseAssignments.assigneeId, scope.id),
          inArray(caseAssignments.state, ["done", "cancelled"])
        )
      )
      .orderBy(desc(caseAssignments.createdAt))
      .limit(10)
    return {
      open: await Promise.all(openRows.map((row) => toAssignmentItem(tx, row))),
      recent: await Promise.all(recentRows.map((row) => toAssignmentItem(tx, row))),
    }
  })
}

/** Everyone tasked on one case — same gate as the review thread. */
export async function listRecordAssignments(
  recordId: string
): Promise<AssignmentItem[]> {
  const scope = await getViewerScope()
  return withUserCtx(scope.id, async (tx) => {
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    if (!canViewRecord(scope, record)) {
      throw new Error("That case is outside your scope.")
    }
    const rows = await tx
      .select()
      .from(caseAssignments)
      .where(eq(caseAssignments.recordId, recordId))
      .orderBy(desc(caseAssignments.createdAt))
      .limit(50)
    return Promise.all(rows.map((row) => toAssignmentItem(tx, row)))
  })
}

/** Assignee (or an in-scope monitor) marks their task done. */
export async function completeAssignment(assignmentId: string): Promise<void> {
  const scope = await getViewerScope()
  await withUserCtx(scope.id, async (tx) => {
    const [assignment] = await tx
      .select()
      .from(caseAssignments)
      .where(eq(caseAssignments.id, assignmentId))
      .limit(1)
    if (!assignment || assignment.state !== "open") {
      throw new Error("Task not found.")
    }
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, assignment.recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    const mine = assignment.assigneeId === scope.id
    if (!mine && !(isMonitor(scope) && canViewRecord(scope, record))) {
      throw new Error("That task is not yours.")
    }
    await tx
      .update(caseAssignments)
      .set({ state: "done", completedAt: new Date() })
      .where(eq(caseAssignments.id, assignment.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      recordId: record.id,
      reason: `Task completed by ${scope.name}.`,
    })
    for (const userId of [assignment.assignedBy, record.reportedBy]) {
      if (userId && userId !== scope.id) {
        await notifyUser(tx, {
          userId,
          type: "review_added",
          recordId: record.id,
          message: `Task completed by ${scope.name}.`,
        })
      }
    }
  })
}

/** Assigner (or an in-scope monitor) withdraws an open task. */
export async function cancelAssignment(assignmentId: string): Promise<void> {
  const scope = await getViewerScope()
  await withUserCtx(scope.id, async (tx) => {
    const [assignment] = await tx
      .select()
      .from(caseAssignments)
      .where(eq(caseAssignments.id, assignmentId))
      .limit(1)
    if (!assignment || assignment.state !== "open") {
      throw new Error("Task not found.")
    }
    const [record] = await tx
      .select()
      .from(records)
      .where(eq(records.id, assignment.recordId))
      .limit(1)
    if (!record) throw new Error("Record not found.")
    const mine = assignment.assignedBy === scope.id
    if (!mine && !(isMonitor(scope) && canViewRecord(scope, record))) {
      throw new Error("Only the assigner or a monitor in scope can cancel.")
    }
    await tx
      .update(caseAssignments)
      .set({ state: "cancelled" })
      .where(eq(caseAssignments.id, assignment.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      recordId: record.id,
      reason: `Task cancelled by ${scope.name}.`,
    })
    if (assignment.assigneeId !== scope.id) {
      await notifyUser(tx, {
        userId: assignment.assigneeId,
        type: "review_added",
        recordId: record.id,
        message: `Your task was cancelled by ${scope.name}.`,
      })
    }
  })
}

export interface AssignableUser {
  id: string
  name: string
  role: string
  detail: string
}

/** Police users a monitor may task — district-scoped, domain-matched. */
export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const scope = await getViewerScope()
  if (!isMonitor(scope)) throw new Error("Monitors only.")
  return withUserCtx(scope.id, async (tx) => {
    const rows = await tx
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        domain: users.domain,
        district: users.district,
        branchName: branches.name,
        branchDistrict: branches.district,
      })
      .from(users)
      .leftJoin(branches, eq(users.branchId, branches.id))
      .where(and(eq(users.isActive, true), eq(users.domain, scope.domain!)))
      .limit(200)
    return rows
      .filter((row) => {
        if (
          row.role !== "officer" &&
          row.role !== "district_monitor" &&
          row.role !== "country_monitor"
        ) {
          return false
        }
        if (scope.role === "COUNTRY_MONITOR") return true
        if (row.role === "officer") return row.branchDistrict === scope.district
        if (row.role === "district_monitor") return row.district === scope.district
        return true
      })
      .map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        detail:
          row.role === "officer"
            ? (row.branchName ?? "No branch")
            : (row.district?.replace(/_/g, " ") ?? row.role),
      }))
      .slice(0, 100)
  })
}
