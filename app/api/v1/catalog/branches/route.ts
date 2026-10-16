import * as z from "zod"

import { ApiError, parseWith, queryOf, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { listBranchOptions } from "@/lib/actions/catalog"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  domain: z.enum(["regular", "traffic"]),
})

/** Filing branch picker (RLS-scoped to the viewer). */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const query = parseWith(querySchema, queryOf(request))
  return { items: await listBranchOptions(query.domain) }
})
