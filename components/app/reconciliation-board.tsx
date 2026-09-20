"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { getReconciliationSummary } from "@/lib/actions/citations"
import { formatDateKey } from "@/lib/format"
import { cn } from "@/lib/utils"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import {
  PageHeaderSkeleton,
  RowListSkeleton,
  StatChipsSkeleton,
} from "@/components/app/list-skeletons"
import { SearchInput } from "@/components/app/search-input"
import { TabGroup } from "@/components/app/tab-group"
import { ListEmptyState } from "@/components/app/list-empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useUser } from "@/providers/user-context"

function mwk(value: number): string {
  return `MWK ${value.toLocaleString()}`
}

type BoardTab = "takings" | "unpaid" | "paid" | "voids"

/**
 * Daily money reconciliation for monitors — tabbed like the case file, with
 * per-tab search + pagination + refresh and an explicit paid vs unpaid split.
 */
export function ReconciliationBoard() {
  const { user } = useUser()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<BoardTab>("takings")
  const summaryQuery = useQuery({
    queryKey: ["reconciliation"],
    queryFn: getReconciliationSummary,
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["reconciliation"] })
  }

  if (summaryQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeaderSkeleton
          titleWidth="w-48"
          subWidth="w-64"
          withTabs
          tabCount={4}
        />
        <StatChipsSkeleton count={3} />
        <div className="flex flex-col gap-2 rounded-none border bg-card p-4">
          <div className="flex items-start gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="size-10 shrink-0" />
          </div>
          <RowListSkeleton count={4} />
        </div>
      </div>
    )
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <ListRefreshButton
            onRefresh={refresh}
            loading={summaryQuery.isFetching}
          />
        </div>
        <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          {summaryQuery.error instanceof Error
            ? summaryQuery.error.message
            : "Could not load reconciliation."}
        </p>
      </div>
    )
  }

  const { totals, undeposited, unpaid, paid, voids } = summaryQuery.data
  const collected = totals.reduce((sum, entry) => sum + entry.total, 0)
  const overdueCount = unpaid.filter((entry) => entry.overdue).length

  const tabs: { value: BoardTab; label: string; count: number }[] = [
    { value: "takings", label: "Takings", count: totals.length },
    { value: "unpaid", label: "Unpaid", count: unpaid.length },
    { value: "paid", label: "Paid", count: paid.length },
    { value: "voids", label: "Voids", count: voids.length },
  ]

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-lg font-semibold">Fine reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            {user.role === "DISTRICT_MONITOR"
              ? "Takings and exceptions in your district."
              : "Takings and exceptions nationwide in your domain."}
          </p>
        </div>
        <TabGroup
          label="Reconciliation sections"
          options={tabs}
          value={tab}
          onChange={setTab}
        />
      </header>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-none border bg-card px-2 py-1 font-medium">
          Collected {mwk(collected)}
        </span>
        <span className="rounded-none border border-amber-200 bg-amber-50 px-2 py-1 font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          {overdueCount} overdue &gt;5d
        </span>
        <span className="rounded-none border px-2 py-1 font-medium text-muted-foreground">
          {undeposited.length} never deposited
        </span>
      </div>

      {tab === "takings" && (
        <TakingsTab
          totals={totals}
          refreshing={summaryQuery.isFetching}
          onRefresh={refresh}
        />
      )}
      {tab === "unpaid" && (
        <UnpaidTab
          unpaid={unpaid}
          refreshing={summaryQuery.isFetching}
          onRefresh={refresh}
        />
      )}
      {tab === "paid" && (
        <PaidTab
          paid={paid}
          refreshing={summaryQuery.isFetching}
          onRefresh={refresh}
        />
      )}
      {tab === "voids" && (
        <VoidsTab
          voids={voids}
          refreshing={summaryQuery.isFetching}
          onRefresh={refresh}
        />
      )}
    </div>
  )
}

function TakingsTab({
  totals,
  refreshing,
  onRefresh,
}: {
  totals: Awaited<ReturnType<typeof getReconciliationSummary>>["totals"]
  refreshing: boolean
  onRefresh: () => Promise<void>
}) {
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
    items: totals,
    search: (entry, q) =>
      `${entry.receiverName} ${entry.date} ${entry.tickets.join(" ")}`
        .toLowerCase()
        .includes(q),
  })
  return (
    <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
      <div className="flex items-start gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search receiver, ticket, or date…"
          className="flex-1"
        />
        <ListRefreshButton onRefresh={onRefresh} loading={refreshing} />
      </div>
      {totals.length === 0 ? (
        <ListEmptyState message="No payments recorded in scope yet." />
      ) : visible.length === 0 ? (
        <ListEmptyState message={`No takings match “${debouncedQuery}”.`} />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {visible.map((entry) => (
              <li
                key={`${entry.date}::${entry.receiverName}`}
                className="flex items-center justify-between gap-4 rounded-none border px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{entry.receiverName}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatDateKey(entry.date)} · {entry.count} receipt(s)
                  </span>
                  {entry.tickets.length > 0 && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.tickets.slice(0, 4).join(" · ")}
                      {entry.tickets.length > 4
                        ? ` · +${entry.tickets.length - 4} more`
                        : ""}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-medium">{mwk(entry.total)}</span>
              </li>
            ))}
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

function UnpaidTab({
  unpaid,
  refreshing,
  onRefresh,
}: {
  unpaid: Awaited<ReturnType<typeof getReconciliationSummary>>["unpaid"]
  refreshing: boolean
  onRefresh: () => Promise<void>
}) {
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
    items: unpaid,
    search: (entry, q) =>
      `${entry.ticketNumber ?? ""} ${entry.plateNumber ?? ""}`
        .toLowerCase()
        .includes(q),
  })
  return (
    <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
      <div className="flex items-start gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search unpaid ticket or plate…"
          className="flex-1"
        />
        <ListRefreshButton onRefresh={onRefresh} loading={refreshing} />
      </div>
      {unpaid.length === 0 ? (
        <ListEmptyState message="Nothing outstanding — every ticket has a payment, a court outcome, or a void." />
      ) : visible.length === 0 ? (
        <ListEmptyState
          message={`No unpaid tickets match “${debouncedQuery}”.`}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {visible.map((entry) => (
              <li key={entry.recordId}>
                <Link
                  href={`/records/${entry.recordId}`}
                  className="flex items-center justify-between gap-4 rounded-none border border-amber-200 px-3 py-2 text-sm hover:bg-accent dark:border-amber-500/20"
                >
                  <span>
                    <span className="font-medium">
                      {entry.ticketNumber ?? "No ticket no."}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {entry.plateNumber ?? "No plate"} · waiting{" "}
                      {entry.daysWaiting}d
                    </span>
                    <span
                      className={cn(
                        "ml-2 inline-flex items-center rounded-none border px-1.5 py-0.5 text-[11px] font-medium",
                        entry.overdue
                          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                          : "text-muted-foreground"
                      )}
                    >
                      {entry.overdue ? "UNPAID · OVERDUE" : "UNPAID"}
                    </span>
                  </span>
                  <span className="font-medium">
                    {entry.balance != null ? mwk(entry.balance) : "—"}
                  </span>
                </Link>
              </li>
            ))}
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

function PaidTab({
  paid,
  refreshing,
  onRefresh,
}: {
  paid: Awaited<ReturnType<typeof getReconciliationSummary>>["paid"]
  refreshing: boolean
  onRefresh: () => Promise<void>
}) {
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
    items: paid,
    search: (entry, q) =>
      `${entry.ticketNumber ?? ""} ${entry.plateNumber ?? ""}`
        .toLowerCase()
        .includes(q),
  })
  return (
    <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
      <div className="flex items-start gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search paid ticket or plate…"
          className="flex-1"
        />
        <ListRefreshButton onRefresh={onRefresh} loading={refreshing} />
      </div>
      {paid.length === 0 ? (
        <ListEmptyState message="No paid tickets in scope yet." />
      ) : visible.length === 0 ? (
        <ListEmptyState
          message={`No paid tickets match “${debouncedQuery}”.`}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {visible.map((entry) => (
              <li key={entry.recordId}>
                <Link
                  href={`/records/${entry.recordId}`}
                  className="flex items-center justify-between gap-4 rounded-none border border-emerald-200 px-3 py-2 text-sm hover:bg-accent dark:border-emerald-500/20"
                >
                  <span>
                    <span className="font-medium">
                      {entry.ticketNumber ?? "No ticket no."}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {entry.plateNumber ?? "No plate"} ·{" "}
                      {mwk(entry.totalPaid)} paid
                    </span>
                    <span className="ml-2 inline-flex items-center rounded-none border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                      PAID
                    </span>
                  </span>
                  <span className="font-medium">
                    {entry.balance != null && entry.balance > 0
                      ? `${mwk(entry.balance)} left`
                      : "Settled"}
                  </span>
                </Link>
              </li>
            ))}
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

function VoidsTab({
  voids,
  refreshing,
  onRefresh,
}: {
  voids: Awaited<ReturnType<typeof getReconciliationSummary>>["voids"]
  refreshing: boolean
  onRefresh: () => Promise<void>
}) {
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
    items: voids,
    search: (entry, q) =>
      `${entry.ticketNumber ?? ""} ${entry.reason ?? ""}`
        .toLowerCase()
        .includes(q),
  })
  return (
    <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
      <div className="flex items-start gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search voided tickets…"
          className="flex-1"
        />
        <ListRefreshButton onRefresh={onRefresh} loading={refreshing} />
      </div>
      {voids.length === 0 ? (
        <ListEmptyState message="No voided tickets." />
      ) : visible.length === 0 ? (
        <ListEmptyState message={`No voids match “${debouncedQuery}”.`} />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {visible.map((entry) => (
              <li key={entry.recordId}>
                <Link
                  href={`/records/${entry.recordId}`}
                  className="block rounded-none border px-3 py-2 text-sm hover:bg-accent"
                >
                  <span className="font-medium">
                    {entry.ticketNumber ?? "No ticket no."}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {entry.reason ?? "no reason given"}
                    {entry.voidAt
                      ? ` · ${formatDateKey(entry.voidAt.slice(0, 10))}`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
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
