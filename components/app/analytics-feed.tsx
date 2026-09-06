"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react"

import { getAnalyticsFeed } from "@/lib/actions/analytics"
import { formatFullDate, formatTimelineDate } from "@/lib/format"
import type { AnalyticsEntry } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

const SEVERITY_STYLE = {
  info: {
    dot: "bg-sky-500",
    chip: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    label: "Digest",
  },
  warning: {
    dot: "bg-amber-500",
    chip: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    label: "Watch",
  },
  critical: {
    dot: "bg-red-500",
    chip: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
    label: "Outbreak alert",
  },
} as const

export function AnalyticsFeed() {
  const { data: feed, isError } = useQuery({
    queryKey: ["analytics-feed"],
    queryFn: getAnalyticsFeed,
  })

  if (isError) {
    return (
      <p className="rounded-[min(var(--radius-3xl),20px)] border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        Could not load analytics. Try again shortly.
      </p>
    )
  }

  if (!feed) return <AnalyticsSkeleton />

  return (
    <div className="flex flex-col gap-4">
      {feed.map((entry) => (
        <AnalyticsCard key={entry.id} entry={entry} />
      ))}
      <p className="pt-2 pb-1 text-center text-xs text-muted-foreground">
        Aggregated data · groups smaller than 5 are never shown
      </p>
    </div>
  )
}

function AnalyticsCard({ entry }: { entry: AnalyticsEntry }) {
  const severity = SEVERITY_STYLE[entry.severity]

  return (
    <article
      className={cn(
        "relative flex flex-col gap-3 rounded-[min(var(--radius-3xl),20px)] border bg-card p-5",
        entry.severity === "critical" && "border-red-200 dark:border-red-500/20"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span
          aria-hidden="true"
          className={cn("size-2 rounded-full", severity.dot)}
        />
        <time
          dateTime={entry.date}
          className="text-[11px] font-medium tracking-widest text-muted-foreground"
        >
          {formatTimelineDate(entry.date)}
        </time>
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
          {entry.scopeLabel}
        </span>
        <span
          className={cn(
            "ml-auto inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium",
            severity.chip
          )}
        >
          {severity.label}
        </span>
      </div>

      <div>
        <h3 className="text-[15px] leading-snug font-medium">{entry.title}</h3>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {entry.description}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {entry.metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl bg-muted/60 px-3 py-2.5"
          >
            <p className="flex items-baseline gap-1.5">
              <span className="text-base font-medium tracking-tight">
                {metric.value}
              </span>
              {metric.deltaPct !== undefined && (
                <DeltaBadge value={metric.deltaPct} />
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {metric.label}
            </p>
          </div>
        ))}
      </div>

      {entry.breakdown && (
        <div className="flex flex-col gap-1.5">
          {entry.breakdown.map((row) => (
            <div key={row.label} className="flex items-center gap-3 text-xs">
              <span className="w-32 shrink-0 truncate text-muted-foreground sm:w-40">
                {row.label}
              </span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    entry.severity === "critical"
                      ? "bg-red-400 dark:bg-red-500"
                      : "bg-primary/60"
                  )}
                  style={{ width: `${row.share}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-right font-medium tabular-nums">
                {row.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {entry.severity === "critical" && (
        <p className="text-xs text-muted-foreground">
          Flagged {formatFullDate(entry.date)} · rapid response actions tracked in
          the district log.
        </p>
      )}
    </article>
  )
}

function DeltaBadge({ value }: { value: number }) {
  const up = value > 0
  const flat = value === 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[10px] font-semibold tabular-nums",
        flat
          ? "bg-muted text-muted-foreground"
          : up
            ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      )}
    >
      {!flat &&
        (up ? (
          <ArrowUpRightIcon className="size-3" />
        ) : (
          <ArrowDownRightIcon className="size-3" />
        ))}
      {Math.abs(value).toFixed(0)}%
    </span>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1].map((row) => (
        <div key={row} className="rounded-[min(var(--radius-3xl),20px)] border p-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-full" />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((cell) => (
              <Skeleton key={cell} className="h-14 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
