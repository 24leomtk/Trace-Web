import { ApiError, route } from "@/lib/api/http"
import { getRecord } from "@/lib/actions/records"
import { getCurrentUser } from "@/lib/session"

export const dynamic = "force-dynamic"

/** Single case — same visibility gate as the web detail screen. */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await getCurrentUser()
    if (!viewer) throw new ApiError(401, "You must be signed in.")
    const { id } = await params
    return getRecord(id)
  }
)
