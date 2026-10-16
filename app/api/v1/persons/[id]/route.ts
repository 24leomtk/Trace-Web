import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { getPerson } from "@/lib/actions/persons"

export const dynamic = "force-dynamic"

/** Person profile + linked cases + features + biometrics summary. */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await getCurrentUser()
    if (!viewer) throw new ApiError(401, "You must be signed in.")
    const { id } = await params
    return getPerson(id)
  }
)
