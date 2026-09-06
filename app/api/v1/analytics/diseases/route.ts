import { getDiseaseStats } from "@/lib/actions/analytics"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** Per-disease surveillance stats scoped to the viewer's jurisdiction
 * (district admins see their district, national admins see the country). */
export const GET = route(() => getDiseaseStats())
