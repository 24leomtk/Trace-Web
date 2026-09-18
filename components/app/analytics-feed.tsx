"use client"

import { useQuery } from "@tanstack/react-query"
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  DownloadIcon,
} from "lucide-react"

import { getAnalyticsFeed } from "@/lib/actions/analytics"
import { formatFullDate, formatTimelineDate } from "@/lib/format"
import { RECORD_TYPE_META } from "@/lib/record-meta"
import type { AnalyticsEntry } from "@/lib/types"
import { cn } from "@/lib/utils"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListPagination } from "@/components/app/list-pagination"
import { SearchInput } from "@/components/app/search-input"
import { EMPTY_CASE_FILTERS, useHomeView } from "@/providers/home-view-context"
import { useUser } from "@/providers/user-context"
import type { RecordType } from "@/validations/record"
import { Button } from "@/components/ui/button"
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

  const {
    query,
    setQuery,
    debouncedQuery,
    page,
    setPage,
    pageCount,
    total,
    visible,
  } = usePaginatedSearch({
    items: feed ?? [],
    search: (entry, q) =>
      `${entry.title} ${entry.description} ${entry.scopeLabel}`
        .toLowerCase()
        .includes(q),
  })

  if (isError) {
    return (
      <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        Could not load analytics. Try again shortly.
      </p>
    )
  }

  if (!feed) return <AnalyticsSkeleton />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search reports…"
          className="flex-1"
        />
        <div className="flex justify-end print:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-none"
            onClick={() => downloadFeedCsv(feed)}
          >
            <DownloadIcon data-icon="inline-start" />
            Export CSV
          </Button>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No reports match “{debouncedQuery}”.
        </p>
      ) : (
        <>
          {visible.map((entry) => (
            <AnalyticsCard key={entry.id} entry={entry} />
          ))}
          <ListPagination
            page={page}
            pageCount={pageCount}
            onPage={setPage}
            total={total}
          />
        </>
      )}
      <p className="pt-2 pb-1 text-center text-xs text-muted-foreground">
        Aggregated data · groups smaller than 5 are never shown
      </p>
    </div>
  )
}

/** U6 CSV export — metrics, breakdowns, and series for every card. */
function downloadFeedCsv(feed: AnalyticsEntry[]) {
  const quote = (value: string | number) =>
    `"${String(value).replace(/"/g, '""')}"`
  const lines = ["section,title,scope,date,kind,label,value"]
  for (const entry of feed) {
    for (const metric of entry.metrics) {
      lines.push(
        [
          entry.id,
          entry.title,
          entry.scopeLabel,
          entry.date,
          "metric",
          metric.label,
          metric.value,
        ]
          .map(quote)
          .join(",")
      )
    }
    for (const row of entry.breakdown ?? []) {
      lines.push(
        [
          entry.id,
          entry.title,
          entry.scopeLabel,
          entry.date,
          "breakdown",
          row.label,
          `${row.count} (${(row.share * 100).toFixed(1)}%)`,
        ]
          .map(quote)
          .join(",")
      )
    }
    for (const point of entry.series ?? []) {
      lines.push(
        [
          entry.id,
          entry.title,
          entry.scopeLabel,
          entry.date,
          "series",
          point.label,
          point.value,
        ]
          .map(quote)
          .join(",")
      )
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `trace-analytics-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function AnalyticsCard({ entry }: { entry: AnalyticsEntry }) {
  const severity = SEVERITY_STYLE[entry.severity]
  const { user } = useUser()
  const { setTab, setCaseFilters } = useHomeView()

  function drillType(key?: string): RecordType | null {
    if (!key || !(key in RECORD_TYPE_META)) return null
    const type = key as RecordType
    if (user.domain && RECORD_TYPE_META[type].domain !== user.domain)
      return null
    return type
  }

  return (
    <article
      className={cn(
        "relative flex flex-col gap-3 rounded-none border bg-card p-5",
        entry.severity === "critical" && "border-red-200 dark:border-red-500/20"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span
          aria-hidden="true"
          className={cn("size-2 rounded-none", severity.dot)}
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
            "ml-auto inline-flex items-center rounded-none border px-1.5 py-0.5 text-xs font-medium",
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
            className="rounded-none bg-muted/60 px-3 py-2.5"
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

      {entry.series && entry.series.length > 0 && (
        <SeriesChart
          points={entry.series}
          label={`${entry.title} weekly trend`}
          tone={entry.severity === "critical" ? "red" : "primary"}
        />
      )}

      {entry.breakdown && (
        <div className="flex flex-col gap-1.5">
          {entry.breakdown.map((row) => {
            const type = drillType(row.key)
            const bar = (
              <>
                <span className="w-32 shrink-0 truncate text-muted-foreground sm:w-40">
                  {row.label}
                </span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-none bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-none",
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
              </>
            )
            return type ? (
              <button
                key={row.label}
                type="button"
                title={`View ${row.label} cases`}
                onClick={() => {
                  setCaseFilters({ ...EMPTY_CASE_FILTERS, type })
                  setTab("feed")
                }}
                className="flex items-center gap-3 rounded-none text-xs transition-colors hover:bg-accent"
              >
                {bar}
              </button>
            ) : (
              <div key={row.label} className="flex items-center gap-3 text-xs">
                {bar}
              </div>
            )
          })}
        </div>
      )}

      {entry.severity === "critical" && (
        <p className="text-xs text-muted-foreground">
          Flagged {formatFullDate(entry.date)} · rapid response actions tracked
          in the district log.
        </p>
      )}
    </article>
  )
}

/** U6 dependency-free weekly trend bars (oldest → newest). */
function SeriesChart({
  points,
  label,
  tone,
}: {
  points: { label: string; value: number }[]
  label: string
  tone: "primary" | "red"
}) {
  const max = Math.max(1, ...points.map((point) => point.value))
  const width = 240
  const height = 56
  const gap = 3
  const barWidth = (width - gap * (points.length - 1)) / points.length
  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-14 w-full"
        role="img"
        aria-label={`${label}: ${points.map((p) => `${p.label} ${p.value}`).join(", ")}`}
      >
        {points.map((point, index) => {
          const barHeight = Math.max(2, (point.value / max) * (height - 14))
          return (
            <rect
              key={`${point.label}-${index}`}
              x={index * (barWidth + gap)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx={1.5}
              className={
                tone === "red"
                  ? "fill-red-400 dark:fill-red-500"
                  : "fill-primary/60"
              }
            >
              <title>{`${point.label}: ${point.value}`}</title>
            </rect>
          )
        })}
      </svg>
      <figcaption className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>per week · max {max.toLocaleString()}</span>
        <span>{points[points.length - 1]?.label}</span>
      </figcaption>
    </figure>
  )
}

function DeltaBadge({ value }: { value: number }) {
  const up = value > 0
  const flat = value === 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-none px-1 py-0.5 text-[10px] font-semibold tabular-nums",
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
        <div key={row} className="rounded-none border p-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-full" />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((cell) => (
              <Skeleton key={cell} className="h-14 rounded-none" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
