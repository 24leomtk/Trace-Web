import { listDiseaseOptions } from "@/lib/actions/analytics"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** Infectious diseases under surveillance, for analytics pickers. */
export const GET = route(() => listDiseaseOptions())
