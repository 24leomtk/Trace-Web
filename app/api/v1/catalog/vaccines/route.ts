import { listVaccineOptions } from "@/lib/actions/catalog"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** Vaccine codebook for pickers (read-only reference data). */
export const GET = route(() => listVaccineOptions())
