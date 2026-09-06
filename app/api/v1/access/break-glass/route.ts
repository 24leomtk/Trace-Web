import * as z from "zod"

import { breakGlassAccess } from "@/lib/actions/access"
import { parseJsonBody, parseWith, route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  patientId: z.string().uuid(),
  // A real reason is required and is written to the audit log.
  reason: z.string().min(10),
})

/** Break-glass override: 24h full-history access without a code, always
 * flagged for administrator review. */
export const POST = route(async (request: Request) => {
  const body = parseWith(bodySchema, await parseJsonBody(request))
  return breakGlassAccess(body)
})
