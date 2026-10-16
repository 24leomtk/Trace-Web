import * as z from "zod"

import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import {
  authorizeRelease,
  getCustodyState,
  placeHold,
  recordOwnerNotice,
} from "@/lib/actions/custody"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("hold"),
    holdBasis: z.string().trim().min(10).max(500),
    towCompany: z.string().trim().max(120).optional(),
    lotLocation: z.string().trim().max(200).optional(),
    bay: z.string().trim().max(40).optional(),
  }),
  z.object({
    action: z.literal("release"),
    recipientName: z.string().trim().min(2).max(120),
    recipientIdChecked: z.string().trim().min(2).max(120),
    feesSnapshot: z.number().nonnegative().max(100_000_000).optional(),
  }),
  z.object({ action: z.literal("owner-notice") }),
])

/** Custody card state for one impoundment. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  return getCustodyState(id)
})

/**
 * Custody transitions:
 * - `{ action: "hold", holdBasis, ... }`
 * - `{ action: "release", recipientName, recipientIdChecked, feesSnapshot? }`
 * - `{ action: "owner-notice" }`
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  const body = parseWith(bodySchema, await parseJsonBody(request))
  if (body.action === "hold") {
    await placeHold({
      recordId: id,
      holdBasis: body.holdBasis,
      towCompany: body.towCompany,
      lotLocation: body.lotLocation,
      bay: body.bay,
    })
  } else if (body.action === "release") {
    await authorizeRelease({
      recordId: id,
      recipientName: body.recipientName,
      recipientIdChecked: body.recipientIdChecked,
      feesSnapshot: body.feesSnapshot,
    })
  } else {
    await recordOwnerNotice(id)
  }
  return { ok: true }
})
