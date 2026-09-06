"use client"

import { useState } from "react"
import { Check, X, Settings2 } from "lucide-react"
import { type DateRange } from "react-day-picker"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"

/* ----------  interfaces unchanged ---------- */
export interface FilterOption {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}
export interface FilterGroup {
  key: string
  heading: string
  options: FilterOption[]
  onSelect: (value: string) => void
  currentValue?: string | boolean
  isBoolean?: boolean
}
export interface ActiveFilter {
  key: string
  label: string
  value: string
  onClear: () => void
  colorClass?: string
}
interface BaseFiltersCommandProps {
  title: string
  description: string
  filterGroups: FilterGroup[]
  activeFilters: ActiveFilter[]
  onClearAll: () => void
  onApplyFilters: () => void
  hasChanges: boolean
  disabled?: boolean
  showDateRange?: boolean
  dateRange?: DateRange
  onDateRangeChange?: (range: DateRange | undefined) => void
  customContent?: React.ReactNode // Optional custom content to render before date range
  trigger?: React.ReactNode
  contentSide?: "top" | "right" | "bottom" | "left"
  contentAlign?: "start" | "center" | "end"
  showActiveFilterBadges?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/* ----------  component ---------- */
export function BaseFiltersCommand({
  title,
  description,
  filterGroups,
  activeFilters,
  onClearAll,
  onApplyFilters,
  hasChanges,
  disabled,
  showDateRange = false,
  dateRange,
  onDateRangeChange,
  customContent,
  trigger,
  contentSide = "bottom",
  contentAlign = "start",
  showActiveFilterBadges = true,
  open: openProp,
  onOpenChange,
}: BaseFiltersCommandProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const activeFiltersCount = activeFilters.length

  const handleApply = () => {
    onApplyFilters()
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {trigger ?? (
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="bg-background transition-colors hover:bg-accent/50"
              disabled={disabled}
            >
              <div className="flex items-center gap-2">
                <Settings2 className="text-muted-foreground" />
                {activeFiltersCount > 0 && (
                  <Badge
                    variant="default"
                    className="h-5 px-1.5 text-xs font-semibold"
                  >
                    {activeFiltersCount}
                  </Badge>
                )}
              </div>
            </Button>
          )}
        </PopoverTrigger>

        <PopoverContent
          side={contentSide}
          align={contentAlign}
          className="z-60 w-72 overflow-x-hidden rounded-2xl border-border/50 p-0 shadow-lg"
        >
          {/* header */}
          <div className="border-b p-3">
            <div className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-primary" />
              <h4 className="text-xs font-medium">{title}</h4>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {description}
            </p>
          </div>

          {/* scrollable list */}
          <div className="max-h-[min(20rem,calc(100vh-8rem))] overflow-x-hidden overflow-y-auto p-1">
            {filterGroups.map((group, index) => (
              <div key={group.key}>
                <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase">
                  {group.heading}
                </div>
                {group.options.map((option) => {
                  const Icon = option.icon
                  const selected = group.isBoolean
                    ? group.currentValue === (option.value === "true")
                    : group.currentValue === option.value
                  return (
                    <button
                      key={option.value}
                      onClick={() => group.onSelect(option.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-medium transition hover:bg-accent/80",
                        selected && "bg-accent/60"
                      )}
                    >
                      <Check
                        className={cn(
                          "h-3 w-3 text-primary",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <span>{option.label}</span>
                    </button>
                  )
                })}
                {index < filterGroups.length - 1 && (
                  <Separator className="mx-2 mt-2" />
                )}
              </div>
            ))}

            {/* custom content section */}
            {customContent && (
              <>
                {filterGroups.length > 0 && <Separator className="mx-2 my-2" />}
                <div className="px-2 py-2">{customContent}</div>
              </>
            )}

            {/* date range section */}
            {showDateRange && onDateRangeChange && (
              <>
                <Separator className="mx-2 my-2" />
                <div className="px-2 pt-1 pb-2 text-[10px] font-semibold text-muted-foreground uppercase">
                  Date Range
                </div>
                <div className="px-2 pb-2">
                  <Calendar
                    mode="range"
                    disabled={{ after: new Date() }}
                    selected={dateRange}
                    onSelect={onDateRangeChange}
                    className="rounded-md border-0"
                  />
                </div>
              </>
            )}
          </div>

          {/* footer buttons */}
          <Separator className="mx-2" />
          <div className="space-y-2 p-2">
            <Button
              onClick={handleApply}
              disabled={!hasChanges}
              className="h-8 w-full justify-center text-xs font-medium"
            >
              Apply Filters
            </Button>
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAll}
                className="h-7 w-full justify-center text-[10px] font-medium transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="mr-1 h-2.5 w-2.5" />
                Clear all filters
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* active filter badges */}
      {showActiveFilterBadges && activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((f) => (
            <Badge
              key={f.key}
              variant="secondary"
              className={cn(
                "h-5 gap-1 text-[10px] font-medium",
                f.colorClass ||
                  "border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
              )}
            >
              {f.label}: {f.value}
              <button
                onClick={f.onClear}
                className="ml-1 rounded-full p-0.5 transition-colors hover:bg-primary/30"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
