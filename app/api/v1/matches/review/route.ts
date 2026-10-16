import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { reviewMatch } from "@/lib/actions/matches"
import { matchReviewSchema } from "@/validations/matches"

export const dynamic = "force-dynamic"

/** Review a proposed match (monitor, maker-checker). */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(matchReviewSchema, await parseJsonBody(request))
  await reviewMatch(body)
  return { ok: true }
})
