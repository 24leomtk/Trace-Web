import * as z from "zod"

import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import {
  checkPhoneAvailable,
  syncPhoneAfterChange,
} from "@/lib/actions/account"

export const dynamic = "force-dynamic"

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("check"),
    phone: z.string().trim().regex(/^\+265\d{9}$/, "Only Malawian numbers (+265, 9 digits)."),
  }),
  z.object({
    action: z.literal("sync"),
    phone: z.string().trim().regex(/^\+265\d{9}$/, "Only Malawian numbers (+265, 9 digits)."),
  }),
])

/**
 * Self-service number change helpers (call after the better-auth OTP flow):
 * - `{ action: "check", phone }` — availability pre-check before sending OTP.
 * - `{ action: "sync", phone }` — post-verification email/login sync.
 */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(bodySchema, await parseJsonBody(request))
  if (body.action === "check") {
    await checkPhoneAvailable(body.phone)
  } else {
    await syncPhoneAfterChange(body.phone)
  }
  return { ok: true }
})
