import * as z from "zod"

import { ApiError, parseWith, queryOf, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { flaggedVehicleWatchlist } from "@/lib/actions/access"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

/** Every currently-flagged plate in scope (police). */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const query = parseWith(querySchema, queryOf(request))
  return { items: await flaggedVehicleWatchlist(query.limit) }
})
