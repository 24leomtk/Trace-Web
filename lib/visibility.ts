import type { AccessLevel, Domain, Role } from "@/lib/types"

/** Minimal scope shape for permission checks — raw enum values, never display text. */
export interface VisibilityScope {
  role: Role
  domain: Domain | null
  branchId: string | null
  /** Officer's district, derived from their branch. */
  branchDistrict: string | null
  /** District monitor's own district. */
  district: string | null
}

/** Minimal record shape for permission checks. */
export interface VisibilityRecord {
  domain: string
  branchId: string
  district: string
  accessLevel: AccessLevel
  reportedBy: string
}

/** Can this police viewer open this record directly? (Court grants handled separately.) */
export function canViewRecord(
  scope: VisibilityScope,
  record: VisibilityRecord
): boolean {
  if (scope.role === "OFFICER") {
    if (record.domain !== scope.domain) return false
    if (record.branchId === scope.branchId) return true
    // Escalated records: district-level in own district, country-level domain-wide.
    if (record.accessLevel === "district") {
      return record.district === (scope.branchDistrict ?? scope.district)
    }
    if (record.accessLevel === "country") return true
    return false
  }
  if (scope.role === "DISTRICT_MONITOR") {
    return record.domain === scope.domain && record.district === scope.district
  }
  if (scope.role === "COUNTRY_MONITOR") {
    // Aggregates + escalated-to-country only (no raw branch-level reads).
    return record.domain === scope.domain && record.accessLevel === "country"
  }
  // System admin, auditor, and external roles have no direct case access.
  return false
}

/** True when the read stays inside the viewer's own narrow scope (officer reading
 * their own branch). Everything else is "outside my own scope" and gets logged. */
export function isOwnScopeRead(
  scope: VisibilityScope,
  record: VisibilityRecord
): boolean {
  return scope.role === "OFFICER" && record.branchId === scope.branchId
}

/** Escape SQL LIKE wildcards in user search input (% _ and the escape char). */
export function escapeLike(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

/** A policy is effectively live only within its coverage window. */
export function isPolicyLive(policy: {
  isActive: boolean
  startDate: string
  endDate: string
  today?: string
}): boolean {
  const today = policy.today ?? new Date().toISOString().slice(0, 10)
  return policy.isActive && policy.startDate <= today && today <= policy.endDate
}

export interface TaxLiveness {
  isPaid: boolean
  isWaived: boolean
  isExempt: boolean
  dueDate: string
  today?: string
}

/** Settled means paid, waived, or exempt — nothing left to collect. */
export function isTaxSettled(tax: TaxLiveness): boolean {
  return tax.isPaid || tax.isWaived || tax.isExempt
}

/** Overdue means past due with a live balance (derived, never stored). */
export function isTaxOverdue(tax: TaxLiveness): boolean {
  const today = tax.today ?? new Date().toISOString().slice(0, 10)
  return !isTaxSettled(tax) && tax.dueDate < today
}

/** Due within 30 days with a live balance — the "due soon" queue. */
export function isTaxDueSoon(tax: TaxLiveness): boolean {
  const today = tax.today ?? new Date().toISOString().slice(0, 10)
  if (isTaxSettled(tax) || tax.dueDate < today) return false
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + 30)
  return tax.dueDate <= horizon.toISOString().slice(0, 10)
}
