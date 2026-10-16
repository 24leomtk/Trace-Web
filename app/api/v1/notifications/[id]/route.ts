import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { deleteNotification } from "@/lib/actions/notifications"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Dismiss one notification (caller's own row only). */
export const DELETE = route(async (_request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  await deleteNotification(id)
  return { ok: true }
})
