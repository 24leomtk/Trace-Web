import * as z from "zod"

import { emergencyLookup } from "@/lib/actions/access"
import { parseWith, queryOf, route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  nationalId: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
})

/** Emergency info lookup by national ID or phone — staff only, always
 * audited (including misses) by the SECURITY DEFINER DB function. Returns
 * `null` when nothing matches. */
export const GET = route(async (request: Request) => {
  const query = parseWith(querySchema, queryOf(request))
  return emergencyLookup({
    nationalId: query.nationalId ?? null,
    phoneNumber: query.phone ?? null,
  })
})
