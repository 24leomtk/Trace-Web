import { getAnalyticsFeed } from "@/lib/actions/analytics"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** Aggregate report feed (outbreaks, treatment gaps, immunization coverage)
 * scoped to the viewer's jurisdiction. Admin-only on the web app. */
export const GET = route(() => getAnalyticsFeed())
