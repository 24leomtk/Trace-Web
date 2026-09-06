import { getMyAccessGrants } from "@/lib/actions/access"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** The patient's currently active (redeemed, unrevoked, unexpired) access
 * windows — "who can see my records right now". */
export const GET = route(() => getMyAccessGrants())
