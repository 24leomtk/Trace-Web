import { listDiagnosisOptions } from "@/lib/actions/catalog"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** ICD-10 diagnosis codebook for pickers (read-only reference data). */
export const GET = route(() => listDiagnosisOptions())
