import * as z from "zod"

import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { getRecord, updateRecord } from "@/lib/actions/records"

export const dynamic = "force-dynamic"

const updateBodySchema = z.object({
  data: z.record(z.string(), z.unknown()),
})

/** Single case — same visibility gate as the web detail screen. */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await getCurrentUser()
    if (!viewer) throw new ApiError(401, "You must be signed in.")
    const { id } = await params
    return getRecord(id)
  }
)

/** Edit an active case's typed payload (filer or in-scope monitor). */
export const PATCH = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await getCurrentUser()
    if (!viewer) throw new ApiError(401, "You must be signed in.")
    const { id } = await params
    const body = parseWith(updateBodySchema, await parseJsonBody(request))
    await updateRecord({ id, data: body.data })
    return { ok: true }
  }
)
