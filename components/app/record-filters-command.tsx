"use client"

import { useState } from "react"
import { type DateRange } from "react-day-picker"
import { LayoutGridIcon, SlidersHorizontalIcon } from "lucide-react"

import { formatDateKey, toDateKey } from "@/lib/format"
import { RECORD_TYPE_META, RECORD_TYPE_ORDER } from "@/lib/record-meta"
import type { RecordType } from "@/validations/record"
import { useIsLargeScreen } from "@/hooks/use-media-query"
import {
  type ActiveFilter,
  BaseFiltersCommand,
  type FilterGroup,
} from "@/components/app/base-filters-command"
import { Button } from "@/components/ui/button"
import { useHomeView } from "@/providers/home-view-context"

const ALL_TYPES = "all"

function rangeSignature(range?: { from?: Date; to?: Date }) {
  return `${range?.from ? toDateKey(range.from) : ""}|${range?.to ? toDateKey(range.to) : ""}`
}

function rangeLabel(range: { from?: Date; to?: Date }) {
  if (!range.from) return ""
  if (!range.to) return formatDateKey(toDateKey(range.from))
  return `${formatDateKey(toDateKey(range.from))} – ${formatDateKey(toDateKey(range.to))}`
}

export function RecordFiltersCommand() {
  const isLarge = useIsLargeScreen()
  const { recordFilters, setRecordFilters } = useHomeView()
  const [open, setOpen] = useState(false)
  const [draftType, setDraftType] = useState<string>(ALL_TYPES)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>()

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraftType(recordFilters.type ?? ALL_TYPES)
      setDraftRange(
        recordFilters.from || recordFilters.to
          ? { from: recordFilters.from, to: recordFilters.to }
          : undefined
      )
    }
    setOpen(next)
  }

  function clearAll() {
    setRecordFilters({ type: null })
    setDraftType(ALL_TYPES)
    setDraftRange(undefined)
  }

  const activeCount =
    (recordFilters.type ? 1 : 0) +
    (recordFilters.from || recordFilters.to ? 1 : 0)

  const hasChanges =
    draftType !== (recordFilters.type ?? ALL_TYPES) ||
    rangeSignature(draftRange) !== rangeSignature(recordFilters)

  function apply() {
    setRecordFilters({
      type: draftType === ALL_TYPES ? null : (draftType as RecordType),
      from: draftRange?.from,
      to: draftRange?.to,
    })
    setOpen(false)
  }

  const filterGroups: FilterGroup[] = [
    {
      key: "type",
      heading: "Record type",
      currentValue: draftType,
      onSelect: (value) =>
        setDraftType((prev) => (prev === value ? ALL_TYPES : value)),
      options: [
        { value: ALL_TYPES, label: "All record types", icon: LayoutGridIcon },
        ...RECORD_TYPE_ORDER.map((type) => ({
          value: type as string,
          label: RECORD_TYPE_META[type].label,
          icon: RECORD_TYPE_META[type].icon,
        })),
      ],
    },
  ]

  const activeFilters: ActiveFilter[] = []
  if (recordFilters.type) {
    activeFilters.push({
      key: "type",
      label: "Type",
      value: RECORD_TYPE_META[recordFilters.type].shortLabel,
      onClear: () => setRecordFilters({ ...recordFilters, type: null }),
    })
  }
  if (recordFilters.from || recordFilters.to) {
    activeFilters.push({
      key: "dates",
      label: "Dates",
      value: rangeLabel(recordFilters),
      onClear: () =>
        setRecordFilters({ ...recordFilters, from: undefined, to: undefined }),
    })
  }

  return (
    <BaseFiltersCommand
      title="Filter timeline"
      description="Narrow records by type and date range."
      filterGroups={filterGroups}
      activeFilters={activeFilters}
      onClearAll={clearAll}
      onApplyFilters={apply}
      hasChanges={hasChanges}
      showDateRange
      dateRange={draftRange}
      onDateRangeChange={setDraftRange}
      showActiveFilterBadges={false}
      open={open}
      onOpenChange={handleOpenChange}
      contentSide={isLarge ? "left" : "top"}
      contentAlign="center"
      trigger={
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={
            activeCount > 0
              ? `Filter records (${activeCount} active)`
              : "Filter records"
          }
          className="relative size-10 rounded-full text-muted-foreground hover:text-foreground"
        >
          <SlidersHorizontalIcon className="size-5" />
          {activeCount > 0 && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
          )}
        </Button>
      }
    />
  )
}
