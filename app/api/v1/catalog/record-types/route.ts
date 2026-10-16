import * as z from "zod"

import { ApiError, parseWith, queryOf, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { listRecordTypeOptions } from "@/lib/actions/catalog"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  domain: z.enum(["regular", "traffic"]).optional(),
})

/** The 10 case types, grouped by domain — drives the filing UI. */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const query = parseWith(querySchema, queryOf(request))
  return { items: await listRecordTypeOptions(query.domain) }
})
