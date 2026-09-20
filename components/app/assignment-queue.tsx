"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckIcon,
  ClockIcon,
  MinusIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  completeAssignment,
  listMyAssignments,
} from "@/lib/actions/assignments"
import { assignmentDue } from "@/lib/format"
import { cn } from "@/lib/utils"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListEmptyState } from "@/components/app/list-empty-state"
import { ListFilter, ListFilterBadges } from "@/components/app/list-filter"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { SearchInput } from "@/components/app/search-input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RowListSkeleton } from "@/components/app/list-skeletons"

const DUE_CHIP: Record<string, string> = {
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  slate: "border-border bg-muted/40 text-muted-foreground",
}

const DUE_OPTIONS = [
  { value: "overdue", label: "Overdue", icon: TriangleAlertIcon },
  { value: "due-soon", label: "Due soon", icon: ClockIcon },
  { value: "no-due-date", label: "No due date", icon: MinusIcon },
]

/**
 * F9 "my queue" (Phase 2) — tasks assigned to the current officer/monitor,
 * with overdue escalation. Sits above the case feed on the police home.
 */
export function AssignmentQueue() {
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["my-assignments"],
    queryFn: listMyAssignments,
  })
  const [due, setDue] = useState("all")
  // Which task is being completed — while set, every Done button is
  // disabled so no other status change can race the in-flight mutation.
  const [busyId, setBusyId] = useState<string | null>(null)

  const open = data?.open ?? []
  const preFiltered = useMemo(
    () =>
      open.filter((item) => {
        const state = assignmentDue(item.dueAt, item.state)
        if (due === "overdue") return state.overdue
        if (due === "due-soon") return !state.overdue && state.tone === "amber"
        if (due === "no-due-date") return state.daysLeft == null
        return true
      }),
    [open, due]
  )
  const { query, setQuery, page, setPage, pageCount, total, visible } =
    usePaginatedSearch({
      items: preFiltered,
      search: (item, q) =>
        `${item.recordTitle} ${item.assignedByName} ${item.note ?? ""}`
          .toLowerCase()
          .includes(q),
    })

  if (isLoading)
    return (
      <section aria-label="My queue" className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <RowListSkeleton count={2} />
      </section>
    )
  const overdueCount = open.filter(
    (item) => assignmentDue(item.dueAt, item.state).overdue
  ).length

  // Nothing assigned — hide the whole section instead of an empty state.
  if (open.length === 0) return null

  return (
    <section aria-label="My queue" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        My queue
        <span
          className={cn(
            "inline-flex items-center rounded-none border px-1.5 py-0.5",
            overdueCount > 0
              ? DUE_CHIP.red
              : "border-border bg-muted/40 text-muted-foreground"
          )}
        >
          {open.length} open
          {overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}
        </span>
      </h2>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search tasks…"
            className="flex-1"
          />
          <ListRefreshButton
            onRefresh={() =>
              queryClient.invalidateQueries({ queryKey: ["my-assignments"] })
            }
            loading={isFetching}
          />
          <ListFilter
            title="Filter tasks"
            description="Narrow by due state."
            heading="Due"
            allLabel="All tasks"
            options={DUE_OPTIONS}
            value={due}
            onChange={setDue}
            showBadges={false}
          />
        </div>
        <ListFilterBadges
          heading="Due"
          options={DUE_OPTIONS}
          value={due}
          onChange={setDue}
        />
      </div>
      {visible.length === 0 ? (
        <ListEmptyState message="No tasks match the current search and filters." />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {visible.map((item) => {
              const due = assignmentDue(item.dueAt, item.state)
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-none border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/records/${item.recordId}`}
                      className="block truncate text-[15px] font-medium hover:underline"
                    >
                      {item.recordTitle}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>from {item.assignedByName}</span>
                      {item.note && <span>· {item.note}</span>}
                      {due.daysLeft != null && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-none border px-1.5 py-0.5 font-medium",
                            DUE_CHIP[due.tone]
                          )}
                        >
                          {due.overdue
                            ? `Overdue ${Math.abs(due.daysLeft)}d`
                            : due.daysLeft === 0
                              ? "Due today"
                              : `${due.daysLeft}d left`}
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-none"
                    aria-label={`Mark task done: ${item.recordTitle}`}
                    disabled={busyId !== null}
                    onClick={async () => {
                      if (busyId !== null) return
                      setBusyId(item.id)
                      try {
                        await completeAssignment(item.id)
                        toast.success("Task done.")
                        await queryClient.invalidateQueries({
                          queryKey: ["my-assignments"],
                        })
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Failed."
                        )
                      } finally {
                        setBusyId(null)
                      }
                    }}
                  >
                    <CheckIcon data-icon="inline-start" />
                    {busyId === item.id ? "Saving…" : "Done"}
                  </Button>
                </li>
              )
            })}
          </ul>
          <ListPagination
            page={page}
            pageCount={pageCount}
            onPage={setPage}
            total={total}
          />
        </>
      )}
    </section>
  )
}
