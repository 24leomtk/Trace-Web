import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { listRecordAssignments } from "@/lib/actions/assignments"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Everyone tasked on one case. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  return { items: await listRecordAssignments(id) }
})
