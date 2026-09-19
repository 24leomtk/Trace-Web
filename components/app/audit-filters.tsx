"use client"

import { useEffect, useState } from "react"
import { type DateRange } from "react-day-picker"
import { ListFilterIcon, ScrollTextIcon } from "lucide-react"

import { fromDateKey, toDateKey } from "@/lib/format"
import {
  ActiveFilterBadges,
  BaseFiltersCommand,
  type ActiveFilter,
} from "@/components/base-filters-command"

export interface AuditFilterValue {
  action: string
  from: string | null
  to: string | null
}

export const EMPTY_AUDIT_FILTERS: AuditFilterValue = {
  action: "all",
  from: null,
  to: null,
}

function rangeFromFilters(
  from: string | null,
  to: string | null
): DateRange | undefined {
  if (!from && !to) return undefined
  return {
    from: from ? fromDateKey(from) : undefined,
    to: to ? fromDateKey(to) : undefined,
  }
}

function buildActiveFilters(
  value: AuditFilterValue,
  actions: string[],
  onChange: (value: AuditFilterValue) => void
): ActiveFilter[] {
  const badges: ActiveFilter[] = []
  if (value.action !== "all") {
    badges.push({
      key: "action",
      label: "Action",
      value: actions.includes(value.action)
        ? value.action.replace(/_/g, " ")
        : value.action,
      onClear: () => onChange({ ...value, action: "all" }),
    })
  }
  if (value.from || value.to) {
    badges.push({
      key: "date",
      label: "Date",
      value: [value.from, value.to].filter(Boolean).join(" → "),
      onClear: () => onChange({ ...value, from: null, to: null }),
    })
  }
  return badges
}

/** Full-width badges row for the applied audit filters (parent-owned). */
export function AuditFilterBadges({
  value,
  actions,
  onChange,
}: {
  value: AuditFilterValue
  actions: string[]
  onChange: (value: AuditFilterValue) => void
}) {
  return (
    <ActiveFilterBadges filters={buildActiveFilters(value, actions, onChange)} />
  )
}

/**
 * Audit trail filters on the shared BaseFiltersCommand — staged action
 * pick plus a date range, applied together. Action options come from the
 * loaded entries so only real actions are offered.
 */
export function AuditFilters({
  value,
  actions,
  onChange,
  showBadges = true,
}: {
  value: AuditFilterValue
  actions: string[]
  onChange: (value: AuditFilterValue) => void
  showBadges?: boolean
}) {
  const [draftAction, setDraftAction] = useState(value.action)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    rangeFromFilters(value.from, value.to)
  )

  useEffect(() => {
    setDraftAction(value.action)
    setDraftRange(rangeFromFilters(value.from, value.to))
  }, [value.action, value.from, value.to])

  const draftFrom = draftRange?.from ? toDateKey(draftRange.from) : null
  const draftTo = draftRange?.to ? toDateKey(draftRange.to) : null
  const hasChanges =
    draftAction !== value.action ||
    draftFrom !== value.from ||
    draftTo !== value.to

  return (
    <BaseFiltersCommand
      title="Filter audit log"
      description="Narrow by action or date."
      filterGroups={[
        {
          key: "action",
          heading: "Action",
          currentValue: draftAction,
          onSelect: (next) =>
            setDraftAction(next === draftAction ? "all" : next),
          options: [
            { value: "all", label: "All actions", icon: ListFilterIcon },
            ...actions.map((action) => ({
              value: action,
              label: action.replace(/_/g, " "),
              icon: ScrollTextIcon,
            })),
          ],
        },
      ]}
      activeFilters={buildActiveFilters(value, actions, onChange)}
      onClearAll={() => {
        setDraftAction("all")
        setDraftRange(undefined)
        onChange({ ...EMPTY_AUDIT_FILTERS })
      }}
      onApplyFilters={() =>
        onChange({ action: draftAction, from: draftFrom, to: draftTo })
      }
      hasChanges={hasChanges}
      showDateRange
      dateRange={draftRange}
      onDateRangeChange={setDraftRange}
      showBadges={showBadges}
    />
  )
}

/** Client-side predicate for the applied audit filters. */
export function matchesAuditFilters(
  entry: { action: string; at: string },
  value: AuditFilterValue
): boolean {
  if (value.action !== "all" && entry.action !== value.action) return false
  const at = new Date(entry.at).getTime()
  if (Number.isNaN(at)) return false
  if (value.from) {
    const from = fromDateKey(value.from)
    if (from && at < from.getTime()) return false
  }
  if (value.to) {
    const to = fromDateKey(value.to)
    if (to) {
      to.setHours(23, 59, 59, 999)
      if (at > to.getTime()) return false
    }
  }
  return true
}
