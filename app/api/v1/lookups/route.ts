import * as z from "zod"

import {
  checkPlateFlag,
  checkWantedByNationalId,
  insurerPlateLookup,
} from "@/lib/actions/access"
import {
  ApiError,
  parseJsonBody,
  parseWith,
  route,
} from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"

export const dynamic = "force-dynamic"

const lookupBodySchema = z.discriminatedUnion("check", [
  z.object({ check: z.literal("wanted"), nationalId: z.string().min(1) }),
  z.object({ check: z.literal("plate"), plateNumber: z.string().min(1) }),
])

/** Read-only safety lookups — minimal detail, always audited. */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(lookupBodySchema, await parseJsonBody(request))

  if (body.check === "wanted") {
    return checkWantedByNationalId(body.nationalId)
  }
  if (viewer.role === "INSURANCE_PORTAL_USER") {
    return insurerPlateLookup(body.plateNumber)
  }
  return checkPlateFlag(body.plateNumber)
})
