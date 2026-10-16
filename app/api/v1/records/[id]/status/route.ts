import * as z from "zod"

import {
  ApiError,
  parseJsonBody,
  parseWith,
  route,
} from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { changeStatus, getTransitionHints } from "@/lib/actions/records"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const statusBodySchema = z.object({
  status: z.enum(["active", "resolved", "closed", "archived"]),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
})

/** Status dialog options for this case (monitors; blocked targets carry reasons). */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  return getTransitionHints(id)
})

/** Change case status (monitors; reason required for non-active). */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  const body = parseWith(statusBodySchema, await parseJsonBody(request))
  await changeStatus({ id, status: body.status, reason: body.reason || undefined })
  return { ok: true }
})
