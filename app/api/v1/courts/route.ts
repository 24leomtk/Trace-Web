import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { listCourtOptions } from "@/lib/actions/citations"

export const dynamic = "force-dynamic"

/** Courts available for scheduling (police). */
export const GET = route(async () => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  return { items: await listCourtOptions() }
})
