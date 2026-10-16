import * as z from "zod"

import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { cancelAssignment, completeAssignment } from "@/lib/actions/assignments"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  action: z.enum(["complete", "cancel"]),
})

/** `{ action: "complete" }` (assignee / in-scope monitor) or `{ action: "cancel" }` (assigner / monitor). */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  const body = parseWith(bodySchema, await parseJsonBody(request))
  if (body.action === "complete") {
    await completeAssignment(id)
  } else {
    await cancelAssignment(id)
  }
  return { ok: true }
})
