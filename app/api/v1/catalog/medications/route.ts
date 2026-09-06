import { listMedicationOptions } from "@/lib/actions/catalog"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** Medication formulary codebook for pickers (read-only reference data). */
export const GET = route(() => listMedicationOptions())
