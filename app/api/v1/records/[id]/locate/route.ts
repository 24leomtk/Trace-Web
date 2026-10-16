import * as z from "zod"

import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import {
  confirmLocate,
  getLocateState,
  recordDisposition,
  reportLocate,
} from "@/lib/actions/locate"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("report"),
    place: z.string().trim().min(2).max(300),
    note: z.string().trim().min(10).max(2000),
  }),
  z.object({ action: z.literal("confirm") }),
  z.object({
    action: z.literal("disposition"),
    disposition: z.enum(["held", "returned", "destroyed", "auctioned"]),
  }),
])

/** Locate card state for one record. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  return getLocateState(id)
})

/**
 * Locate transitions:
 * - `{ action: "report", place, note }`
 * - `{ action: "confirm" }` (originating branch / monitor, not the reporter)
 * - `{ action: "disposition", disposition }` (stolen-property only)
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  const body = parseWith(bodySchema, await parseJsonBody(request))
  if (body.action === "report") {
    await reportLocate({ recordId: id, place: body.place, note: body.note })
  } else if (body.action === "confirm") {
    await confirmLocate(id)
  } else {
    await recordDisposition({ recordId: id, disposition: body.disposition })
  }
  return { ok: true }
})
