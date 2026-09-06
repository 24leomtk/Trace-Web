import * as z from "zod"

import { redeemAccessCode } from "@/lib/actions/access"
import { parseJsonBody, parseWith, route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  code: z.string().min(4),
})

/** Doctor redeems a patient's access code — starts the access window and
 * returns the patient summary. */
export const POST = route(async (request: Request) => {
  const body = parseWith(bodySchema, await parseJsonBody(request))
  return redeemAccessCode(body.code)
})
