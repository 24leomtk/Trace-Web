"use client";

import { useState } from "react";
import { type DateRange } from "react-day-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Check, X, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ----------  interfaces unchanged ---------- */
export interface FilterOption {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}
export interface FilterGroup {
  key: string;
  heading: string;
  options: FilterOption[];
  onSelect: (value: string) => void;
  currentValue?: string | boolean;
  isBoolean?: boolean;
}
export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
  onClear: () => void;
  colorClass?: string;
}
interface BaseFiltersCommandProps {
  title: string;
  description: string;
  filterGroups: FilterGroup[];
  activeFilters: ActiveFilter[];
  onClearAll: () => void;
  onApplyFilters: () => void;
  hasChanges: boolean;
  disabled?: boolean;
  showDateRange?: boolean;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  customContent?: React.ReactNode; // Optional custom content to render before date range
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
}: BaseFiltersCommandProps) {
  const [open, setOpen] = useState(false);
  const activeFiltersCount = activeFilters.length;

  const handleApply = () => {
    onApplyFilters();
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={`Filters${activeFiltersCount > 0 ? ` · ${activeFiltersCount} active` : ""}`}
            title="Filters"
            className="shrink-0 rounded-none bg-background transition-colors hover:bg-accent/50"
            disabled={disabled}
          >
            <div className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted-foreground" />
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
        </PopoverTrigger>

        <PopoverContent
          className="w-72 gap-0 overflow-x-hidden border-border/50 p-0 shadow-lg"
          align="start"
        >
          {/* header */}
          <div className="p-3 border-b bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-primary" />
              <h4 className="font-medium text-xs">{title}</h4>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {description}
            </p>
          </div>

          {/* scrollable list */}
          <div className="max-h-[min(20rem,calc(100vh-8rem))] overflow-y-auto p-1 overflow-x-hidden">
            {filterGroups.map((group, index) => (
              <div key={group.key}>
                <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  {group.heading}
                </div>
                {group.options.map((option) => {
                  const Icon = option.icon;
                  const selected = group.isBoolean
                    ? group.currentValue === (option.value === "true")
                    : group.currentValue === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => group.onSelect(option.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-left text-xs font-medium transition hover:bg-accent/80",
                        selected && "bg-accent/60",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-3 w-3 text-primary",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <span>{option.label}</span>
                    </button>
                  );
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
                <div className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase text-muted-foreground">
                  Date Range
                </div>
                <div className="px-2 pb-2">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={onDateRangeChange}
                    className="rounded-none border-0"
                  />
                </div>
              </>
            )}
          </div>

          {/* footer buttons */}
          <Separator className="mx-2" />
          <div className="p-2 space-y-2">
            <Button
              onClick={handleApply}
              disabled={!hasChanges}
              className="w-full justify-center text-xs font-medium h-8"
            >
              Apply Filters
            </Button>
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAll}
                className="w-full justify-center text-[10px] font-medium hover:bg-destructive/10 hover:text-destructive transition-colors h-7"
              >
                <X className="h-2.5 w-2.5 mr-1" />
                Clear all filters
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* active filter badges */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((f) => (
            <Badge
              key={f.key}
              variant="secondary"
              className={cn(
                "gap-1 text-[10px] font-medium h-5",
                f.colorClass ||
                  "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20",
              )}
            >
              {f.label}: {f.value}
              <button
                onClick={f.onClear}
                className="ml-1 hover:bg-primary/30 rounded-full p-0.5 transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
