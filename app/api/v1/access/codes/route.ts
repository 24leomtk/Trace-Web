import * as z from "zod"

import { createAccessGrant } from "@/lib/actions/access"
import { parseJsonBody, parseWith, route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  // Lifetime of the access window once a clinician redeems the code.
  // Matches the action's clamp range: 5 minutes .. 24 hours.
  durationSeconds: z.number().int().min(300).max(86400),
})

/** Patient issues a fresh access code. */
export const POST = route(async (request: Request) => {
  const body = parseWith(bodySchema, await parseJsonBody(request))
  return createAccessGrant(body)
})
