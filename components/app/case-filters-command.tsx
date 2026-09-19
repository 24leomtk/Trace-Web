"use client"

import { useEffect, useState } from "react"
import { type DateRange } from "react-day-picker"
import {
  ArchiveIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  FileCheckIcon,
  ListFilterIcon,
} from "lucide-react"

import {
  RECORD_TYPE_META,
  RECORD_TYPE_ORDER,
} from "@/lib/record-meta"
import { fromDateKey, toDateKey } from "@/lib/format"
import type { CaseStatus } from "@/lib/types"
import type { RecordType } from "@/validations/record"
import {
  ActiveFilterBadges,
  BaseFiltersCommand,
  type ActiveFilter,
} from "@/components/base-filters-command"
import {
  EMPTY_CASE_FILTERS,
  useHomeView,
} from "@/providers/home-view-context"
import { useUser } from "@/providers/user-context"

const STATUS_OPTIONS: {
  value: CaseStatus
  label: string
  icon: typeof ArchiveIcon
}[] = [
  { value: "active", label: "Active", icon: CircleDotIcon },
  { value: "resolved", label: "Resolved", icon: CheckCircle2Icon },
  { value: "closed", label: "Closed", icon: FileCheckIcon },
  { value: "archived", label: "Archived", icon: ArchiveIcon },
]

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
  caseFilters: ReturnType<typeof useHomeView>["caseFilters"],
  setCaseFilters: ReturnType<typeof useHomeView>["setCaseFilters"]
): ActiveFilter[] {
  const activeFilters: ActiveFilter[] = []
  if (caseFilters.type) {
    activeFilters.push({
      key: "type",
      label: "Type",
      value: RECORD_TYPE_META[caseFilters.type].label,
      onClear: () => setCaseFilters({ ...caseFilters, type: null }),
    })
  }
  if (caseFilters.status) {
    activeFilters.push({
      key: "status",
      label: "Status",
      value:
        STATUS_OPTIONS.find((option) => option.value === caseFilters.status)
          ?.label ?? caseFilters.status,
      onClear: () => setCaseFilters({ ...caseFilters, status: null }),
    })
  }
  if (caseFilters.from || caseFilters.to) {
    activeFilters.push({
      key: "date",
      label: "Filed",
      value: [caseFilters.from, caseFilters.to].filter(Boolean).join(" → "),
      onClear: () =>
        setCaseFilters({ ...caseFilters, from: null, to: null }),
    })
  }
  return activeFilters
}

/** Full-width badges row for the applied case filters (context-owned). */
export function CaseFilterBadges() {
  const { caseFilters, setCaseFilters } = useHomeView()
  return (
    <ActiveFilterBadges
      filters={buildActiveFilters(caseFilters, setCaseFilters)}
    />
  )
}

/**
 * Case feed filters built on the shared BaseFiltersCommand — staged
 * type/status picks plus a filed-date range, applied together. Rendered
 * next to the feed search box (not in the floating nav).
 */
export function CaseFiltersCommand({
  showBadges = true,
}: {
  showBadges?: boolean
}) {
  const { user } = useUser()
  const { caseFilters, setCaseFilters } = useHomeView()

  const [draftType, setDraftType] = useState<string>(
    caseFilters.type ?? ""
  )
  const [draftStatus, setDraftStatus] = useState<string>(
    caseFilters.status ?? ""
  )
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    rangeFromFilters(caseFilters.from, caseFilters.to)
  )

  useEffect(() => {
    setDraftType(caseFilters.type ?? "")
    setDraftStatus(caseFilters.status ?? "")
    setDraftRange(rangeFromFilters(caseFilters.from, caseFilters.to))
  }, [caseFilters])

  const draftFrom = draftRange?.from ? toDateKey(draftRange.from) : null
  const draftTo = draftRange?.to ? toDateKey(draftRange.to) : null
  const hasChanges =
    draftType !== (caseFilters.type ?? "") ||
    draftStatus !== (caseFilters.status ?? "") ||
    draftFrom !== caseFilters.from ||
    draftTo !== caseFilters.to

  const types = RECORD_TYPE_ORDER.filter(
    (type) => !user.domain || RECORD_TYPE_META[type].domain === user.domain
  )

  const activeFilters = buildActiveFilters(caseFilters, setCaseFilters)

  return (
    <BaseFiltersCommand
      title="Filter cases"
      description="Narrow the feed by type, status, or filed date."
      filterGroups={[
        {
          key: "status",
          heading: "Status",
          currentValue: draftStatus,
          onSelect: (value) =>
            setDraftStatus(value === draftStatus ? "" : value),
          options: [
            { value: "", label: "All statuses", icon: ListFilterIcon },
            ...STATUS_OPTIONS,
          ],
        },
        {
          key: "type",
          heading: "Case type",
          currentValue: draftType,
          onSelect: (value) =>
            setDraftType(value === draftType ? "" : value),
          options: [
            { value: "", label: "All types", icon: ListFilterIcon },
            ...types.map((type: RecordType) => ({
              value: type,
              label: RECORD_TYPE_META[type].label,
              icon: RECORD_TYPE_META[type].icon,
            })),
          ],
        },
      ]}
      activeFilters={activeFilters}
      onClearAll={() => {
        setDraftType("")
        setDraftStatus("")
        setDraftRange(undefined)
        setCaseFilters({ ...EMPTY_CASE_FILTERS })
      }}
      onApplyFilters={() =>
        setCaseFilters({
          type: (draftType || null) as RecordType | null,
          status: (draftStatus || null) as CaseStatus | null,
          from: draftFrom,
          to: draftTo,
        })
      }
      hasChanges={hasChanges}
      showDateRange
      dateRange={draftRange}
      onDateRangeChange={setDraftRange}
      showBadges={showBadges}
    />
  )
}
