import * as z from "zod"

import { ApiError, parseWith, queryOf, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { unifiedSearch } from "@/lib/actions/search"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

/** F5 unified lookup: vehicles + persons + citations in one call. */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const query = parseWith(querySchema, queryOf(request))
  return unifiedSearch(query.q, query.limit)
})
