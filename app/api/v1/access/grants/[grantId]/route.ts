import { revokeAccessGrant } from "@/lib/actions/access"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** Patient revokes one of their active access windows early. */
export const DELETE = route(
  async (
    _request: Request,
    context: { params: Promise<{ grantId: string }> }
  ) => {
    const { grantId } = await context.params
    await revokeAccessGrant(grantId)
    return { ok: true }
  }
)
