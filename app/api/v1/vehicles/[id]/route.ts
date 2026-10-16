import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { getVehicle } from "@/lib/actions/vehicles"

export const dynamic = "force-dynamic"

/** Vehicle detail + linked cases + tax rows. */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await getCurrentUser()
    if (!viewer) throw new ApiError(401, "You must be signed in.")
    const { id } = await params
    return getVehicle(id)
  }
)
