"use client"

import { useEffect, useState } from "react"
import { ListFilterIcon } from "lucide-react"

import {
  ActiveFilterBadges,
  BaseFiltersCommand,
  type ActiveFilter,
} from "@/components/base-filters-command"

export interface ListFilterOption {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface ListFilterProps {
  title: string
  description: string
  heading: string
  allLabel: string
  options: ListFilterOption[]
  /** Applied value ("all" = no filter). Owned by the parent list. */
  value: string
  onChange: (value: string) => void
  /** Hide badges here when the parent renders ListFilterBadges full-width. */
  showBadges?: boolean
}

/**
 * Single-group staged filter on BaseFiltersCommand: draft locally, commit
 * on Apply. Pair with ListFilterBadges for the search-row layout:
 * trigger beside the search box, badges full-width below.
 */
export function ListFilter({
  title,
  description,
  heading,
  allLabel,
  options,
  value,
  onChange,
  showBadges = true,
}: ListFilterProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const activeFilters: ActiveFilter[] =
    value === "all"
      ? []
      : [
          {
            key: heading,
            label: heading,
            value:
              options.find((option) => option.value === value)?.label ?? value,
            onClear: () => onChange("all"),
          },
        ]

  return (
    <BaseFiltersCommand
      title={title}
      description={description}
      filterGroups={[
        {
          key: heading,
          heading,
          currentValue: draft,
          onSelect: (next) => setDraft(next === draft ? "all" : next),
          options: [
            { value: "all", label: allLabel, icon: ListFilterIcon },
            ...options,
          ],
        },
      ]}
      activeFilters={activeFilters}
      onClearAll={() => {
        setDraft("all")
        onChange("all")
      }}
      onApplyFilters={() => onChange(draft)}
      hasChanges={draft !== value}
      showBadges={showBadges}
    />
  )
}

/** Full-width badges row for the applied value of a ListFilter. */
export function ListFilterBadges({
  heading,
  options,
  value,
  onChange,
}: {
  heading: string
  options: ListFilterOption[]
  value: string
  onChange: (value: string) => void
}) {
  if (value === "all") return null
  const label =
    options.find((option) => option.value === value)?.label ?? value
  const badges: ActiveFilter[] = [
    {
      key: heading,
      label: heading,
      value: label,
      onClear: () => onChange("all"),
    },
  ]
  return <ActiveFilterBadges filters={badges} />
}
