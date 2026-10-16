import * as z from "zod"

import { ApiError, parseWith, queryOf, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { findCitationByTicket } from "@/lib/actions/citations"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  ticket: z.string().trim().min(1).max(64),
})

/** Resolve a uniform ticket number to its receival state. */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const query = parseWith(querySchema, queryOf(request))
  return findCitationByTicket(query.ticket)
})
