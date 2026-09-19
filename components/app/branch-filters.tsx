"use client"

import { useEffect, useState } from "react"
import { Building2Icon, CarFrontIcon, ListFilterIcon, MapPinIcon } from "lucide-react"

import { DISTRICT_OPTIONS, formatDistrict } from "@/lib/roles"
import {
  ActiveFilterBadges,
  BaseFiltersCommand,
  type ActiveFilter,
} from "@/components/base-filters-command"

export interface BranchFilterValue {
  domain: string
  district: string
}

export const EMPTY_BRANCH_FILTERS: BranchFilterValue = {
  domain: "all",
  district: "all",
}

const DOMAIN_OPTIONS = [
  { value: "regular", label: "Regular", icon: Building2Icon },
  { value: "traffic", label: "Traffic", icon: CarFrontIcon },
]

const DISTRICT_FILTER_OPTIONS = DISTRICT_OPTIONS.map((district) => ({
  value: district,
  label: formatDistrict(district),
  icon: MapPinIcon,
}))

function buildActiveFilters(
  value: BranchFilterValue,
  onChange: (value: BranchFilterValue) => void
): ActiveFilter[] {
  const badges: ActiveFilter[] = []
  if (value.domain !== "all") {
    badges.push({
      key: "domain",
      label: "Domain",
      value:
        DOMAIN_OPTIONS.find((option) => option.value === value.domain)
          ?.label ?? value.domain,
      onClear: () => onChange({ ...value, domain: "all" }),
    })
  }
  if (value.district !== "all") {
    badges.push({
      key: "district",
      label: "District",
      value: formatDistrict(value.district),
      onClear: () => onChange({ ...value, district: "all" }),
    })
  }
  return badges
}

/** Full-width badges row for the applied branch filters (parent-owned). */
export function BranchFilterBadges({
  value,
  onChange,
}: {
  value: BranchFilterValue
  onChange: (value: BranchFilterValue) => void
}) {
  return <ActiveFilterBadges filters={buildActiveFilters(value, onChange)} />
}

/**
 * Branch directory filters on the shared BaseFiltersCommand — staged
 * domain + district picks, applied together.
 */
export function BranchFilters({
  value,
  onChange,
  showBadges = true,
}: {
  value: BranchFilterValue
  onChange: (value: BranchFilterValue) => void
  showBadges?: boolean
}) {
  const [draftDomain, setDraftDomain] = useState(value.domain)
  const [draftDistrict, setDraftDistrict] = useState(value.district)

  useEffect(() => {
    setDraftDomain(value.domain)
    setDraftDistrict(value.district)
  }, [value.domain, value.district])

  const hasChanges =
    draftDomain !== value.domain || draftDistrict !== value.district

  return (
    <BaseFiltersCommand
      title="Filter branches"
      description="Narrow by domain or district."
      filterGroups={[
        {
          key: "domain",
          heading: "Domain",
          currentValue: draftDomain,
          onSelect: (next) =>
            setDraftDomain(next === draftDomain ? "all" : next),
          options: [
            { value: "all", label: "All domains", icon: ListFilterIcon },
            ...DOMAIN_OPTIONS,
          ],
        },
        {
          key: "district",
          heading: "District",
          currentValue: draftDistrict,
          onSelect: (next) =>
            setDraftDistrict(next === draftDistrict ? "all" : next),
          options: [
            { value: "all", label: "All districts", icon: ListFilterIcon },
            ...DISTRICT_FILTER_OPTIONS,
          ],
        },
      ]}
      activeFilters={buildActiveFilters(value, onChange)}
      onClearAll={() => {
        setDraftDomain("all")
        setDraftDistrict("all")
        onChange({ ...EMPTY_BRANCH_FILTERS })
      }}
      onApplyFilters={() =>
        onChange({ domain: draftDomain, district: draftDistrict })
      }
      hasChanges={hasChanges}
      showBadges={showBadges}
    />
  )
}
