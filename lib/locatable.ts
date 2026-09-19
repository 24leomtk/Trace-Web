/** Record types with a locate → confirm → clear lifecycle (Phase 3). */
export const LOCATABLE_TYPES = [
  "wanted_person",
  "missing_person",
  "missing_vehicle",
  "stolen_property",
] as const

export type LocatableType = (typeof LOCATABLE_TYPES)[number]

export function isLocatable(recordType: string): boolean {
  return (LOCATABLE_TYPES as readonly string[]).includes(recordType)
}
