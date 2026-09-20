"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { listDormantLocates } from "@/lib/actions/locate"
import { Skeleton } from "@/components/ui/skeleton"
import { RowListSkeleton } from "@/components/app/list-skeletons"
import { useUser } from "@/providers/user-context"

/**
 * Phase 3: the "finding isn't closing" queue. Unconfirmed locates in scope,
 * oldest first — each one blocks its case from resolving. Monitors only,
 * sits under the assignment queue on the police home.
 */
export function LocateQueue() {
  const { user } = useUser()
  const isMonitor =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"
  const locatesQuery = useQuery({
    queryKey: ["dormant-locates"],
    queryFn: listDormantLocates,
    enabled: isMonitor,
  })

  if (!isMonitor) return null
  if (locatesQuery.isLoading)
    return (
      <div className="flex flex-col gap-2 rounded-none border bg-card p-4">
        <Skeleton className="h-3 w-56" />
        <RowListSkeleton count={2} />
      </div>
    )
  if (locatesQuery.isError || !locatesQuery.data) return null
  const items = locatesQuery.data
  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Locates awaiting confirmation ({items.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {items.slice(0, 8).map((entry) => (
          <li key={entry.recordId}>
            <Link
              href={`/records/${entry.recordId}`}
              className="flex items-center justify-between gap-4 rounded-none border border-amber-200 px-3 py-2 text-sm hover:bg-accent dark:border-amber-500/20"
            >
              <span>
                <span className="font-medium">{entry.typeLabel}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {entry.place ?? "no place given"}
                  {entry.locatorName ? ` · by ${entry.locatorName}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300">
                {entry.daysWaiting === 0
                  ? "today"
                  : `${entry.daysWaiting}d waiting`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 8 && (
        <p className="text-xs text-muted-foreground">
          +{items.length - 8} more — oldest first.
        </p>
      )}
    </section>
  )
}
