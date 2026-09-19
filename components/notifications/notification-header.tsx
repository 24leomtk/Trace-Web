"use client"

import { useEffect, useState } from "react"
import {
  ActivityIcon,
  BellIcon,
  GavelIcon,
  InboxIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SearchIcon,
  StampIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  BaseFiltersCommand,
  type ActiveFilter,
} from "@/components/base-filters-command"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type NotificationTab = "all" | "unread"

export interface TraceNotificationFilters {
  type?: string
}

interface NotificationHeaderProps {
  activeTab: NotificationTab
  isSearchMode: boolean
  searchInput: string
  filters: TraceNotificationFilters
  hasActiveFilters: boolean
  onTabChange: (tab: NotificationTab) => void
  onSearchToggle: () => void
  onSearchInputChange: (value: string) => void
  onFiltersChange: (filters: TraceNotificationFilters) => void
  onResetFilters: () => void
}

const TYPE_OPTIONS = [
  { value: "referral_received", label: "Referral received", icon: InboxIcon },
  { value: "referral_updated", label: "Referral updated", icon: RefreshCwIcon },
  { value: "outcome_recorded", label: "Outcome recorded", icon: GavelIcon },
  { value: "status_changed", label: "Status changed", icon: ActivityIcon },
  { value: "review_added", label: "Review added", icon: MessageSquareIcon },
  { value: "task_assigned", label: "Task assigned", icon: InboxIcon },
  { value: "task_updated", label: "Task updated", icon: ActivityIcon },
  { value: "payment_received", label: "Payment received", icon: RefreshCwIcon },
  { value: "verification_needed", label: "Verification needed", icon: BellIcon },
  { value: "approval_needed", label: "Approval needed", icon: StampIcon },
]

export function NotificationHeader({
  activeTab,
  isSearchMode,
  searchInput,
  filters,
  hasActiveFilters,
  onTabChange,
  onSearchToggle,
  onSearchInputChange,
  onFiltersChange,
  onResetFilters,
}: NotificationHeaderProps) {
  const [draftType, setDraftType] = useState<string | undefined>(filters.type)

  useEffect(() => {
    setDraftType(filters.type)
  }, [filters.type])

  const hasChanges = (draftType ?? "") !== (filters.type ?? "")

  const activeFilters: ActiveFilter[] = filters.type
    ? [
        {
          key: "type",
          label: "Type",
          value:
            TYPE_OPTIONS.find((option) => option.value === filters.type)
              ?.label ?? filters.type.replace(/_/g, " "),
          onClear: () => onFiltersChange({ ...filters, type: undefined }),
        },
      ]
    : []

  return (
    <div className="space-y-2 px-3 py-2">
      {!isSearchMode ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex bg-muted/50 p-1">
            {(["all", "unread"] as NotificationTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className={cn(
                  "px-3 py-1 text-xs font-medium capitalize transition-all duration-200",
                  activeTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "all" ? "Inbox" : "Unread"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <BaseFiltersCommand
              title="Filter notifications"
              description="Narrow by notification type."
              filterGroups={[
                {
                  key: "type",
                  heading: "Type",
                  currentValue: draftType ?? "",
                  onSelect: (value) =>
                    setDraftType(value === draftType ? undefined : value),
                  options: [
                    { value: "", label: "All types", icon: BellIcon },
                    ...TYPE_OPTIONS,
                  ],
                },
              ]}
              activeFilters={activeFilters}
              onClearAll={() => {
                setDraftType(undefined)
                onResetFilters()
              }}
              onApplyFilters={() =>
                onFiltersChange({ ...filters, type: draftType || undefined })
              }
              hasChanges={hasChanges}
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={onSearchToggle}
              aria-label="Search notifications"
              className="h-8 w-8 transition-colors hover:bg-muted"
            >
              <SearchIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex animate-in items-center gap-2 duration-200 fade-in slide-in-from-top-1">
          <div className="relative flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search notifications…"
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              className="h-8 bg-muted/30 pr-3 pl-8 text-xs transition-colors focus-visible:bg-background"
              autoFocus
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSearchToggle}
            className="h-8 px-2 text-xs hover:bg-muted"
          >
            Cancel
          </Button>
        </div>
      )}
      {hasActiveFilters && isSearchMode && (
        <p className="text-[10px] text-muted-foreground">
          Type filter active — clear it to search everything.
        </p>
      )}
    </div>
  )
}
