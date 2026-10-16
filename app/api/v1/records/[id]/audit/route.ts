import { ApiError, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { getRecordAuditLog } from "@/lib/actions/access"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Per-record activity trail (monitors / admins / auditors). */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  return { items: await getRecordAuditLog(id) }
})
