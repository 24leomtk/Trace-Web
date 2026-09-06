import { getAnalyticsFeed } from "@/lib/actions/analytics"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** Aggregate report feed (volumes, resolution rates, accident trends,
 * citations) scoped to the viewer's domain and district. Monitors only. */
export const GET = route(() => getAnalyticsFeed())
