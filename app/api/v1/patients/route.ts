import { getConnectedPatients } from "@/lib/actions/access"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** The doctor's connected patients — everyone with an active access window
 * granted to the signed-in clinician. Empty list for non-doctors. */
export const GET = route(() => getConnectedPatients())
