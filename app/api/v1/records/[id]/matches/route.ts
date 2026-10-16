import * as z from "zod"

import { ApiError, parseWith, queryOf, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import {
  findMatchCandidates,
  listMatchesForRecord,
} from "@/lib/actions/matches"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const querySchema = z.object({
  view: z.enum(["matches", "candidates"]).default("matches"),
})

/** Live matches (`?view=matches`, default) or link candidates (`?view=candidates`). */
export const GET = route(async (request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  const query = parseWith(querySchema, queryOf(request))
  if (query.view === "candidates") {
    return { items: await findMatchCandidates(id) }
  }
  return { items: await listMatchesForRecord(id) }
})
