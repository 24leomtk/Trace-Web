import * as z from "zod"

import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import {
  linkCasePerson,
  reassignRecord,
  setAccessLevel,
} from "@/lib/actions/records"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const accessBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("access-level"),
    level: z.enum(["branch", "district", "country"]),
  }),
  z.object({ action: z.literal("reassign"), branchId: z.string().uuid() }),
  z.object({ action: z.literal("link-person"), personId: z.string().uuid().nullable() }),
])

/**
 * Case-scope mutations:
 * - `{ action: "access-level", level }` — widen/escalate visibility.
 * - `{ action: "reassign", branchId }` — district monitors move within district.
 * - `{ action: "link-person", personId }` — link/unlink (`null`) a profile.
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  const body = parseWith(accessBodySchema, await parseJsonBody(request))
  if (body.action === "access-level") {
    await setAccessLevel({ id, level: body.level })
  } else if (body.action === "reassign") {
    await reassignRecord({ id, branchId: body.branchId })
  } else {
    await linkCasePerson({ id, personId: body.personId })
  }
  return { ok: true }
})
