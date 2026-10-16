import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { listDormantLocates } from "@/lib/actions/locate"

export const dynamic = "force-dynamic"

/** Locates awaiting confirmation in scope, oldest first (monitors). */
export const GET = route(async () => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  return { items: await listDormantLocates() }
})
