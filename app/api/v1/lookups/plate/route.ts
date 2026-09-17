import * as z from "zod"

import { plateLookupFast, plateLookupKey } from "@/lib/actions/access"
import { ApiError, parseWith, queryOf, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"

export const dynamic = "force-dynamic"

const plateQuerySchema = z.object({
  plate: z.string().trim().min(1).max(32),
})

/**
 * F6 ANPR-ready flag check (Phase 3) + N4 key auth: session cookie/bearer as
 * usual, or `X-API-Key: trace_…` / `?api_key=trace_…` for machines.
 * → `{ flagged, reasons }` (reasons police-only, always `[]` for insurers).
 */
export const GET = route(async (request: Request) => {
  const query = parseWith(plateQuerySchema, queryOf(request))
  const viewer = await getCurrentUser()
  if (viewer) return plateLookupFast(query.plate)
  const raw =
    request.headers.get("x-api-key")?.trim() ||
    new URL(request.url).searchParams.get("api_key")?.trim()
  if (!raw) throw new ApiError(401, "You must be signed in.")
  return plateLookupKey(raw, query.plate)
})
