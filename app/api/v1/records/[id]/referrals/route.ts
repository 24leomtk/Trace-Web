import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { liveCourtReferralsFor } from "@/lib/actions/access"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Live court grants on one case (monitors). */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  return { items: await liveCourtReferralsFor(id) }
})
