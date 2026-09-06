"use client"

import { useState } from "react"
import { KeyRoundIcon, PaperclipIcon, TriangleAlertIcon } from "lucide-react"

import { getPatientRecords } from "@/lib/actions/records"
import { formatDateTime, toDateKey } from "@/lib/format"
import {
  RECORD_TYPE_META,
  TONE_BADGE_CLASS,
  TONE_DOT_CLASS,
} from "@/lib/record-meta"
import type { MedicalRecord } from "@/lib/types"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useHomeView } from "@/providers/home-view-context"
import { cn } from "@/lib/utils"
import { AttachmentsModal } from "@/components/app/attachments-modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline"

interface RecordTimelineProps {
  patientId: string
}

export function RecordTimeline({ patientId }: RecordTimelineProps) {
  const { recordFilters } = useHomeView()
  const [attachmentRecord, setAttachmentRecord] =
    useState<MedicalRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const filterType = recordFilters.type ?? undefined
  const filterDateFrom = recordFilters.from
    ? toDateKey(recordFilters.from)
    : undefined
  const filterDateTo = recordFilters.to ? toDateKey(recordFilters.to) : undefined
  const hasFilters = Boolean(filterType || filterDateFrom || filterDateTo)
  const filterKey = `${filterType ?? ""}|${filterDateFrom ?? ""}|${filterDateTo ?? ""}`

  const { items, isLoading, isFetchingMore, hasMore, sentinelRef } =
    useInfiniteList<MedicalRecord>({
      key: `${patientId}|${filterKey}`,
      fetchPage: async (cursor) => {
        try {
          const page = await getPatientRecords({
            patientId,
            cursor: cursor ?? 0,
            type: filterType,
            dateFrom: filterDateFrom,
            dateTo: filterDateTo,
          })
          setLoadError(null)
          return page
        } catch (error) {
          // The hook has no error channel — surface the message and stop.
          setLoadError(
            error instanceof Error ? error.message : "Could not load records."
          )
          return { items: [], nextCursor: null }
        }
      },
    })

  const showError = !isLoading && loadError !== null
  const accessDenied =
    loadError !== null && loadError.toLowerCase().includes("access window")

  return (
    <div className="flex flex-col">
      {isLoading ? (
        <TimelineSkeleton />
      ) : showError && accessDenied ? (
        <AccessRequiredState message={loadError} />
      ) : showError && items.length === 0 ? (
        <LoadErrorState message={loadError} />
      ) : items.length === 0 ? (
        <EmptyTimeline filtered={hasFilters} />
      ) : (
        <Timeline>
          {items.map((record, index) => {
            const meta = RECORD_TYPE_META[record.type]
            return (
              <TimelineItem
                key={record.id}
                step={1}
                className={index === items.length - 1 ? "" : "pb-9"}
              >
                <TimelineSeparator className="bg-border" />
                <TimelineIndicator
                  className={cn(
                    "size-2.5 translate-y-1.5 rounded-full border-0",
                    TONE_DOT_CLASS[meta.tone]
                  )}
                />
                <TimelineHeader>
                  <TimelineDate
                    dateTime={record.recordedAt}
                    className="text-[11px] font-medium tracking-widest"
                  >
                    {formatDateTime(record.recordedAt)}
                  </TimelineDate>
                  <span className="mb-1 block text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                    {meta.label}
                  </span>
                </TimelineHeader>
                <TimelineTitle className="text-[15px] leading-snug">
                  {record.title}
                </TimelineTitle>
                <TimelineContent className="mt-1 max-w-prose leading-relaxed">
                  {record.summary}
                </TimelineContent>

                {record.attachments.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAttachmentRecord(record)}
                    className="mt-3 w-fit gap-1.5 rounded-full"
                  >
                    <PaperclipIcon data-icon="inline-start" />
                    Attachments
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-5 px-1.5 text-[11px] font-semibold tabular-nums"
                    >
                      {record.attachments.length}
                    </Badge>
                  </Button>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span className="text-sm font-medium text-muted-foreground">
                    {record.author.name}
                  </span>
                  {record.badges.map((badge) => (
                    <span
                      key={`${record.id}-${badge.label}`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium",
                        TONE_BADGE_CLASS[badge.tone]
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          TONE_DOT_CLASS[badge.tone]
                        )}
                      />
                      {badge.label}
                    </span>
                  ))}
                </div>
              </TimelineItem>
            )
          })}
        </Timeline>
      )}

      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      <div className="flex h-10 items-center justify-center gap-2 text-sm text-muted-foreground">
        {isFetchingMore && (
          <>
            <Spinner className="size-4" />
            Loading earlier records…
          </>
        )}
        {!hasMore && items.length > 0 && (
          <span className="text-xs">End of records</span>
        )}
      </div>

      <AttachmentsModal
        open={!!attachmentRecord}
        onOpenChange={(open) => {
          if (!open) setAttachmentRecord(null)
        }}
        recordTitle={attachmentRecord?.title ?? ""}
        attachments={attachmentRecord?.attachments ?? []}
      />
    </div>
  )
}

function EmptyTimeline({ filtered }: { filtered?: boolean }) {
  return (
    <div className="rounded-[min(var(--radius-3xl),20px)] border border-dashed py-12 text-center">
      <p className="text-sm font-medium">
        {filtered ? "No matching records" : "No records yet"}
      </p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
        {filtered
          ? "Nothing falls inside the current type and date filters."
          : "Medical entries appear here as soon as a facility logs them."}
      </p>
    </div>
  )
}

function AccessRequiredState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[min(var(--radius-3xl),20px)] border border-amber-200 bg-amber-50 px-6 py-10 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
      <KeyRoundIcon className="size-5 text-amber-600 dark:text-amber-400" />
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        This chart is locked right now
      </p>
      <p className="max-w-xs text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/70">
        {message} Ask the patient to share a fresh access code, or use
        break-glass if waiting isn&apos;t safe.
      </p>
    </div>
  )
}

function LoadErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[min(var(--radius-3xl),20px)] border border-dashed px-6 py-10 text-center">
      <TriangleAlertIcon className="size-5 text-destructive" />
      <p className="text-sm font-medium">Couldn&apos;t load records</p>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

function TimelineSkeleton() {
  return (
    <div className="ms-6 flex flex-col gap-9">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}
