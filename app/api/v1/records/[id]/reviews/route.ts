import * as z from "zod"

import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { addReview, listReviews } from "@/lib/actions/reviews"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  note: z.string().trim().min(2).max(2000),
})

/** Follow-up notes thread on a case (append-only). */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  return { items: await listReviews(id) }
})

export const POST = route(async (request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  const body = parseWith(bodySchema, await parseJsonBody(request))
  return addReview({ recordId: id, note: body.note })
})
