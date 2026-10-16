import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { scheduleCitationCourt } from "@/lib/actions/citations"
import { citationCourtScheduleSchema } from "@/validations/admin"

export const dynamic = "force-dynamic"

/** Schedule (or reschedule) a citation's court appearance (monitors). */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(citationCourtScheduleSchema, await parseJsonBody(request))
  await scheduleCitationCourt({
    recordId: body.recordId,
    courtDate: body.courtDate,
    courtId: body.courtId || undefined,
  })
  return { ok: true }
})
