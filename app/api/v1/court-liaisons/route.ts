import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { listCourtLiaisons } from "@/lib/actions/access"

export const dynamic = "force-dynamic"

/** Active court-liaison accounts (monitors — referral target picker). */
export const GET = route(async () => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  return { items: await listCourtLiaisons() }
})
