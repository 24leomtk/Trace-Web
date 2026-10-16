import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { voidCitation } from "@/lib/actions/citations"
import { citationVoidSchema } from "@/validations/admin"

export const dynamic = "force-dynamic"

/** Void a spoiled/duplicate ticket (monitors; stays queryable). */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(citationVoidSchema, await parseJsonBody(request))
  await voidCitation(body)
  return { ok: true }
})
