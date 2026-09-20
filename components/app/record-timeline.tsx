"use client"

import { useState } from "react"
import Link from "next/link"
import { useDebounce } from "use-debounce"
import { ArrowRightIcon, TriangleAlertIcon } from "lucide-react"

import { listRecords } from "@/lib/actions/records"
import { formatDateShort } from "@/lib/format"
import {
  RECORD_TYPE_META,
  TONE_BADGE_CLASS,
  TONE_DOT_CLASS,
} from "@/lib/record-meta"
import type { CaseStatus, TraceRecord } from "@/lib/types"
import type { RecordType } from "@/validations/record"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useHomeView } from "@/providers/home-view-context"
import { cn } from "@/lib/utils"
import {
  CaseFilterBadges,
  CaseFiltersCommand,
} from "@/components/app/case-filters-command"
import { SearchInput } from "@/components/app/search-input"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Timeline,
  TimelineDate,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
} from "@/components/reui/timeline"

/** Case types where a single photo (missing/wanted person, vehicle) aids recognition. */
const IMAGE_ELIGIBLE: RecordType[] = [
  "missing_person",
  "wanted_person",
  "missing_vehicle",
  "vehicle_offense",
  "vehicle_impoundment",
]

function previewImage(record: TraceRecord): string | null {
  if (!IMAGE_ELIGIBLE.includes(record.recordType)) return null
  return (
    record.attachments.find(
      (attachment) => attachment.kind === "image" && attachment.url
    )?.url ?? null
  )
}

/** The case feed: records visible to the current police user, newest first. */
export function RecordTimeline() {
  const { caseFilters, feedScope } = useHomeView()
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [debouncedQuery] = useDebounce(query.trim(), 350)

  const filterType: RecordType | undefined = caseFilters.type ?? undefined
  const filterStatus: CaseStatus | undefined = caseFilters.status ?? undefined
  const filterFrom = caseFilters.from ?? undefined
  const filterTo = caseFilters.to ?? undefined
  const hasFilters = Boolean(
    filterType || filterStatus || filterFrom || filterTo || debouncedQuery
  )
  const filterKey = `${feedScope}|${filterType ?? ""}|${filterStatus ?? ""}|${filterFrom ?? ""}|${filterTo ?? ""}|${debouncedQuery}`

  const { items, isLoading, isFetchingMore, hasMore, sentinelRef, retry } =
    useInfiniteList<TraceRecord>({
      key: `cases|${filterKey}`,
      fetchPage: async (cursor) => {
        try {
          const page = await listRecords({
            cursor: cursor ?? 0,
            type: filterType,
            status: filterStatus,
            scope: feedScope === "all" ? undefined : feedScope,
            query: debouncedQuery || undefined,
            from: filterFrom,
            to: filterTo,
          })
          setLoadError(null)
          return page
        } catch (error) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load cases."
          )
          return { items: [], nextCursor: null }
        }
      },
    })

  const showError = !isLoading && loadError !== null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search cases by name, plate, place…"
            className="flex-1"
          />
          <ListRefreshButton
            onRefresh={() => void retry()}
            loading={isLoading}
          />
          <CaseFiltersCommand showBadges={false} />
        </div>
        <CaseFilterBadges />
      </div>

      {isLoading ? (
        <TimelineSkeleton />
      ) : showError && items.length === 0 ? (
        <LoadErrorState message={loadError} />
      ) : items.length === 0 ? (
        <EmptyTimeline filtered={hasFilters} query={debouncedQuery} />
      ) : (
        <Timeline>
          {items.map((record) => (
            <CaseTimelineItem key={record.id} record={record} />
          ))}
        </Timeline>
      )}

      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      <div className="flex h-10 items-center justify-center gap-2 text-sm text-muted-foreground">
        {isFetchingMore && (
          <>
            <Spinner className="size-4" />
            Loading earlier cases…
          </>
        )}
        {!hasMore && items.length > 0 && (
          <span className="text-xs">End of cases</span>
        )}
      </div>
    </div>
  )
}

function CaseTimelineItem({ record }: { record: TraceRecord }) {
  const meta = RECORD_TYPE_META[record.recordType]
  const Icon = meta.icon
  const imageUrl = previewImage(record)

  return (
    <TimelineItem step={1} className="pb-4">
      <TimelineSeparator className="bg-border" />
      <TimelineIndicator
        className={cn(
          "flex size-8 -translate-x-1 items-center justify-center rounded-none border",
          TONE_BADGE_CLASS[meta.tone]
        )}
      >
        <Icon className="size-4" />
      </TimelineIndicator>

      <article className="overflow-hidden rounded-none border bg-card transition-colors hover:border-foreground/20">
        <div className="flex gap-0 sm:gap-0">
          {imageUrl && (
            <button
              type="button"
              aria-label={`View photo for ${record.title}`}
              className="relative hidden w-36 shrink-0 self-stretch overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:block lg:w-44"
            >
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
              <span className="absolute bottom-1.5 left-1.5 rounded-none bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                Photo
              </span>
            </button>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-none border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
                  TONE_BADGE_CLASS[meta.tone]
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-none",
                    TONE_DOT_CLASS[meta.tone]
                  )}
                />
                {meta.label}
              </span>
              <TimelineDate
                dateTime={record.createdAt}
                className="text-[11px] font-medium tracking-widest"
              >
                {formatDateShort(record.createdAt)}
              </TimelineDate>
              <span className="ml-auto text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                {record.status} · {record.accessLevel}
              </span>
            </div>

            {imageUrl && (
              <button
                type="button"
                aria-label={`View photo for ${record.title}`}
                className="relative -mx-3.5 block aspect-[16/9] overflow-hidden bg-muted sm:hidden"
              >
                <img
                  src={imageUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
              </button>
            )}

            <Link
              href={`/records/${record.id}`}
              className="group w-fit max-w-full"
            >
              <h3 className="text-base leading-snug font-semibold group-hover:underline">
                {record.title}
              </h3>
            </Link>
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {record.summary}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-[13px] font-medium text-muted-foreground">
                {record.author.name}
              </span>
              {record.badges.slice(0, 3).map((badge) => (
                <span
                  key={`${record.id}-${badge.label}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-none border px-1.5 py-0.5 text-xs font-medium",
                    TONE_BADGE_CLASS[badge.tone]
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-none",
                      TONE_DOT_CLASS[badge.tone]
                    )}
                  />
                  {badge.label}
                </span>
              ))}
            </div>

            <div className="mt-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 rounded-none px-2 text-xs"
              >
                <Link href={`/records/${record.id}`}>
                  Open case
                  <ArrowRightIcon data-icon="inline-end" className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </article>
    </TimelineItem>
  )
}

function EmptyTimeline({
  filtered,
  query,
}: {
  filtered?: boolean
  query?: string
}) {
  return (
    <div className="rounded-none border border-dashed py-12 text-center">
      <p className="text-sm font-medium">
        {filtered ? "No matching cases" : "No cases yet"}
      </p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
        {query
          ? `Nothing matches “${query}” in this feed.`
          : filtered
            ? "Nothing falls inside the current filters."
            : "Filed cases appear here as soon as your branch logs them."}
      </p>
    </div>
  )
}

function LoadErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-none border border-dashed px-6 py-10 text-center">
      <TriangleAlertIcon className="size-5 text-destructive" />
      <p className="text-sm font-medium">Couldn&apos;t load cases</p>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="rounded-none border p-4">
          <div className="flex gap-3">
            <Skeleton className="hidden h-24 w-36 shrink-0 sm:block" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
