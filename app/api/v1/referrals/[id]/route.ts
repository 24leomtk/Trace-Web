import * as z from "zod"

import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import {
  recordCourtOutcome,
  renewCourtAccess,
  revokeCourtAccess,
} from "@/lib/actions/access"
import { courtOutcomeOptions } from "@/validations/admin"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("renew") }),
  z.object({ action: z.literal("revoke") }),
  z.object({
    action: z.literal("outcome"),
    outcome: z.enum(courtOutcomeOptions),
    outcomeNotes: z.string().trim().max(2000).optional(),
  }),
])

/**
 * Referral lifecycle:
 * - `{ action: "renew" }` / `{ action: "revoke" }` (monitors)
 * - `{ action: "outcome", outcome, outcomeNotes? }` (court liaison)
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  const body = parseWith(bodySchema, await parseJsonBody(request))
  if (body.action === "renew") {
    await renewCourtAccess(id)
  } else if (body.action === "revoke") {
    await revokeCourtAccess(id)
  } else {
    await recordCourtOutcome({
      referralId: id,
      outcome: body.outcome,
      outcomeNotes: body.outcomeNotes,
    })
  }
  return { ok: true }
})
