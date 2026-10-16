import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { getReconciliationSummary } from "@/lib/actions/citations"

export const dynamic = "force-dynamic"

/** Daily money reconciliation for monitors (per-receiver totals + exceptions). */
export const GET = route(async () => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  return getReconciliationSummary()
})
