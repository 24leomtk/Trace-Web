import * as z from "zod"

import { ApiError, parseWith, queryOf, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { searchVehicles } from "@/lib/actions/vehicles"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

/** Vehicle search by plate. */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const query = parseWith(querySchema, queryOf(request))
  return { items: await searchVehicles(query.q, query.limit) }
})
