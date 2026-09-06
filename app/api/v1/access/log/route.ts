import { getMyAccessLog } from "@/lib/actions/access"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** The patient's audit trail — every non-own access to their records. */
export const GET = route(() => getMyAccessLog())
