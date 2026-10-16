import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { proposeMatch } from "@/lib/actions/matches"
import { matchProposeSchema } from "@/validations/matches"

export const dynamic = "force-dynamic"

/** Propose a link between two readable records. */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(matchProposeSchema, await parseJsonBody(request))
  return proposeMatch(body)
})
