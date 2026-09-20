"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { GavelIcon, HourglassIcon } from "lucide-react"

import { getMyReferrals } from "@/lib/actions/records"
import {
  daysUntil,
  expiryTone,
  formatCountdown,
  formatDateShort,
} from "@/lib/format"
import { RECORD_TYPE_META, TONE_BADGE_CLASS } from "@/lib/record-meta"
import { cn } from "@/lib/utils"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListFilter, ListFilterBadges } from "@/components/app/list-filter"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { SearchInput } from "@/components/app/search-input"
import { Skeleton } from "@/components/ui/skeleton"

const OUTCOME_OPTIONS = [
  { value: "pending", label: "Awaiting outcome", icon: HourglassIcon },
  { value: "decided", label: "Outcome recorded", icon: GavelIcon },
]

export function CourtHome() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["my-referrals"],
    queryFn: getMyReferrals,
  })
  const [outcome, setOutcome] = useState("all")

  const preFiltered = useMemo(
    () =>
      (data ?? []).filter((entry) => {
        if (outcome === "pending") return entry.outcome === "pending"
        if (outcome === "decided") return entry.outcome !== "pending"
        return true
      }),
    [data, outcome]
  )

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
    items: preFiltered,
    search: (entry, q) =>
      `${entry.record.title} ${entry.record.summary} ${entry.record.recordType.replace(/_/g, " ")} ${entry.outcome}`
        .toLowerCase()
        .includes(q),
  })

  const hasActiveFilter = outcome !== "all" || debouncedQuery !== ""

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Referred cases</h1>
        <p className="text-sm text-muted-foreground">
          Only cases explicitly referred to you appear here.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search referred cases…"
            className="flex-1"
          />
          <ListRefreshButton
            onRefresh={() =>
              queryClient.invalidateQueries({ queryKey: ["my-referrals"] })
            }
            loading={isFetching}
          />
          <ListFilter
            title="Filter referrals"
            description="Narrow by court outcome."
            heading="Outcome"
            allLabel="All outcomes"
            options={OUTCOME_OPTIONS}
            value={outcome}
            onChange={setOutcome}
            showBadges={false}
          />
        </div>
        <ListFilterBadges
          heading="Outcome"
          options={OUTCOME_OPTIONS}
          value={outcome}
          onChange={setOutcome}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Could not load referrals.
        </p>
      ) : !data || data.length === 0 ? (
        <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No active referrals. Access expires unless a monitor renews it.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          {hasActiveFilter
            ? "No referrals match the current search and filters."
            : "No active referrals. Access expires unless a monitor renews it."}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visible.map((entry) => {
              const meta = RECORD_TYPE_META[entry.record.recordType]
              const left = daysUntil(entry.expiresAt)
              const tone = expiryTone(left)
              return (
                <li key={entry.referralId}>
                  <Link
                    href={`/records/${entry.record.id}`}
                    className="block rounded-none border bg-card px-4 py-3 transition-colors hover:bg-accent"
                  >
                    <p className="flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      <span>{meta.label}</span>
                      {entry.expiresAt && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-none border px-1.5 py-0.5 normal-case",
                            TONE_BADGE_CLASS[tone]
                          )}
                        >
                          {formatCountdown(left)} · until{" "}
                          {formatDateShort(entry.expiresAt)}
                        </span>
                      )}
                      <span
                        className={cn(
                          "inline-flex items-center rounded-none border px-1.5 py-0.5 normal-case",
                          entry.outcome !== "pending"
                            ? TONE_BADGE_CLASS.emerald
                            : TONE_BADGE_CLASS.slate
                        )}
                      >
                        {entry.outcome !== "pending"
                          ? `Outcome: ${entry.outcome}`
                          : "Awaiting outcome"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[15px] font-medium">
                      {entry.record.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {entry.record.summary}
                    </p>
                  </Link>
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
    </div>
  )
}
