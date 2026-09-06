import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"

export const dynamic = "force-dynamic"

/** The signed-in user's profile (same shape the web app renders). */
export const GET = route(async () => {
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "You must be signed in.")
  return user
})
