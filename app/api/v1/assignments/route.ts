import * as z from "zod"

import {
  ApiError,
  parseJsonBody,
  parseWith,
  queryOf,
  route,
} from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import {
  assignCase,
  listAssignableUsers,
  listMyAssignments,
} from "@/lib/actions/assignments"
import { assignmentSchema } from "@/validations/admin"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  view: z.enum(["mine", "assignable"]).default("mine"),
})

/** `?view=mine` (default) — my task queue; `?view=assignable` — users a monitor may task. */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const query = parseWith(querySchema, queryOf(request))
  if (query.view === "assignable") {
    return { items: await listAssignableUsers() }
  }
  return listMyAssignments()
})

/** Monitor assigns a case to one officer/monitor. */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(assignmentSchema, await parseJsonBody(request))
  return assignCase({
    recordId: body.recordId,
    assigneeId: body.assigneeId,
    dueAt: body.dueAt || undefined,
    note: body.note || undefined,
  })
})
