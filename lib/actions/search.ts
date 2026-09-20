"use server"

import { searchCitations, type CitationSearchHit } from "@/lib/actions/citations"
import { searchPersons, type PersonSearchFilters } from "@/lib/actions/persons"
import { getViewerScope } from "@/lib/actions/records"
import { searchVehicles } from "@/lib/actions/vehicles"

/**
 * F5 unified search (Phase 1) — one call for the lookup page's
 * "vehicle & person search" section. Wraps the existing scoped
 * `searchVehicles` / `searchPersons` so authorization, RLS scoping, and
 * audit behaviour stay identical; this only normalises the query once and
 * runs both in parallel.
 *
 * Phase 6: police results also carry citation hits (ticket / violation /
 * plate) so a counter finds the ticket to receipt without branch-feed
 * access.
 */
export async function unifiedSearch(
  query: string,
  limit = 10,
  personFilters: PersonSearchFilters = {}
) {
  const scope = await getViewerScope()
  const allowed =
    scope.role === "OFFICER" ||
    scope.role === "DISTRICT_MONITOR" ||
    scope.role === "COUNTRY_MONITOR" ||
    scope.role === "INSURANCE_PORTAL_USER" ||
    scope.role === "VEHICLE_REGISTRAR"
  if (!allowed) throw new Error("Your role can't search.")
  const q = query.trim()
  if (!q) return { vehicles: [], persons: [], citations: [] }

  const isPolice =
    scope.role === "OFFICER" ||
    scope.role === "DISTRICT_MONITOR" ||
    scope.role === "COUNTRY_MONITOR"

  const [vehicles, persons, citations] = await Promise.all([
    scope.role === "VEHICLE_REGISTRAR" || scope.role === "INSURANCE_PORTAL_USER"
      ? searchVehicles(q, limit)
      : searchVehicles(q, limit).catch(() => []),
    scope.role === "OFFICER" ||
    scope.role === "DISTRICT_MONITOR" ||
    scope.role === "COUNTRY_MONITOR"
      ? searchPersons(q, limit, personFilters).catch(() => [])
      : Promise.resolve([]),
    isPolice
      ? searchCitations(q, limit).catch(
          (): CitationSearchHit[] => []
        )
      : Promise.resolve([]),
  ])
  return { vehicles, persons, citations }
}
