import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { getCitationLedger } from "@/lib/actions/citations"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Full fine ledger for one citation (payments, balance, court date). */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  return getCitationLedger(id)
})
