"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  EyeIcon,
} from "lucide-react"

import { getDiseaseStats } from "@/lib/actions/analytics"
import { formatDelta } from "@/lib/format"
import type { DiseaseStat, DiseaseStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

const STATUS_META: Record<
  DiseaseStatus,
  { label: string; chip: string; dot: string; icon: typeof EyeIcon }
> = {
  stable: {
    label: "Stable",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    dot: "bg-emerald-500",
    icon: CircleCheckIcon,
  },
  watch: {
    label: "Watch",
    chip: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    dot: "bg-amber-500",
    icon: EyeIcon,
  },
  outbreak: {
    label: "Outbreak",
    chip: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
    dot: "bg-red-500",
    icon: CircleAlertIcon,
  },
}

interface DiseaseAnalyticsProps {
  selectedDiseaseId: string | null
  onSelectDisease: (id: string) => void
}

export function DiseaseAnalytics({
  selectedDiseaseId,
  onSelectDisease,
}: DiseaseAnalyticsProps) {
  const {
    data: stats,
    isError,
  } = useQuery({
    queryKey: ["disease-stats"],
    queryFn: getDiseaseStats,
  })

  const active = useMemo(
    () => stats?.find((stat) => stat.id === selectedDiseaseId) ?? null,
    [stats, selectedDiseaseId]
  )

  if (isError) {
    return (
      <p className="rounded-[min(var(--radius-3xl),20px)] border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        Could not load disease statistics. Try again shortly.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {(stats ?? []).map((stat) => (
          <button
            key={stat.id}
            type="button"
            onClick={() => onSelectDisease(stat.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              stat.id === selectedDiseaseId
                ? "border-transparent bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                stat.id === selectedDiseaseId
                  ? "bg-primary-foreground"
                  : STATUS_META[stat.status].dot
              )}
            />
            {stat.name}
          </button>
        ))}
        {!stats &&
          [0, 1, 2, 3].map((chip) => (
            <Skeleton key={chip} className="h-8 w-24 shrink-0 rounded-full" />
          ))}
      </div>

      {!stats || !active ? (
        <Skeleton className="h-64 rounded-[min(var(--radius-3xl),20px)]" />
      ) : (
        <>
          <article className="flex flex-col gap-4 rounded-[min(var(--radius-3xl),20px)] border bg-card p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="text-lg font-medium">{active.name}</h2>
              <StatusChip status={active.status} />
              <span className="ml-auto flex items-baseline gap-1.5 text-sm text-muted-foreground">
                Last 8 weeks
                <span
                  className={cn(
                    "text-base font-semibold tabular-nums",
                    active.deltaPct > 0
                      ? "text-red-600 dark:text-red-400"
                      : active.deltaPct < 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : ""
                  )}
                >
                  {formatDelta(active.deltaPct)}
                </span>
              </span>
            </div>

            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-3xl font-medium tracking-tight tabular-nums">
                  {active.totalCases.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Total cases in period
                </p>
              </div>
              <div className="flex h-20 min-w-0 flex-1 items-end justify-end gap-1.5 sm:max-w-xs">
                {active.weeklyCounts.map((count, index) => {
                  const max = Math.max(...active.weeklyCounts)
                  return (
                    <div key={index} className="flex w-full max-w-7 flex-col items-center gap-1">
                      <div
                        className={cn(
                          "w-full rounded-t-md",
                          active.status === "outbreak"
                            ? "bg-red-400 dark:bg-red-500"
                            : active.status === "watch"
                              ? "bg-amber-400 dark:bg-amber-500"
                              : "bg-sky-400 dark:bg-sky-500"
                        )}
                        style={{ height: `${Math.max(8, (count / max) * 72)}px` }}
                      />
                      <span className="hidden text-[9px] text-muted-foreground sm:block">
                        W{index + 27}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </article>

          <article className="flex flex-col gap-3 rounded-[min(var(--radius-3xl),20px)] border bg-card p-5">
            <h3 className="text-[15px] font-medium">Where cases cluster</h3>
            <div className="flex flex-col gap-2">
              {active.hotspots.map((hotspot) => (
                <div key={hotspot.label} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate text-muted-foreground sm:w-44">
                    {hotspot.label}
                  </span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        active.status === "outbreak"
                          ? "bg-red-400 dark:bg-red-500"
                          : active.status === "watch"
                            ? "bg-amber-400 dark:bg-amber-500"
                            : "bg-sky-400 dark:bg-sky-500"
                      )}
                      style={{ width: `${hotspot.share}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-medium tabular-nums">
                    {hotspot.cases.toLocaleString()}
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {hotspot.share.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Groups smaller than 5 people are suppressed to protect privacy.
            </p>
          </article>
        </>
      )}
    </div>
  )
}

function StatusChip({ status }: { status: DiseaseStatus }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium",
        meta.chip
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  )
}
