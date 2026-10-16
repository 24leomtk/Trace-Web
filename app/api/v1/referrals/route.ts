import * as z from "zod"

import {
  ApiError,
  parseJsonBody,
  parseWith,
  queryOf,
  route,
} from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import {
  getMyReferralOutcomes,
  referCaseToCourt,
} from "@/lib/actions/access"
import { getMyReferrals } from "@/lib/actions/records"
import { courtReferralSchema } from "@/validations/admin"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  view: z.enum(["mine", "outcomes"]).optional(),
})

/**
 * - `GET ?view=mine` — court liaison's live referrals (with case files).
 * - `GET ?view=outcomes` — court liaison's outcome history.
 * - `GET` (no view, monitor) — alias for filing-officer flows; prefer
 *   `/records/{id}/referrals` for per-case grants.
 */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const query = parseWith(querySchema, queryOf(request))
  if (query.view === "outcomes") {
    return { items: await getMyReferralOutcomes() }
  }
  return { items: await getMyReferrals() }
})

/** Monitor refers a case to a court liaison. */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(courtReferralSchema, await parseJsonBody(request))
  return referCaseToCourt({
    recordId: body.recordId,
    courtLiaisonId: body.courtLiaisonId,
    reason: body.reason || undefined,
    expiresAt: body.expiresAt,
  })
})
