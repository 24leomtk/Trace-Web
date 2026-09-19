"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"

import { getReconciliationSummary } from "@/lib/actions/citations"
import { formatDateKey } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"

function mwk(value: number): string {
  return `MWK ${value.toLocaleString()}`
}

/**
 * Phase 2: daily money reconciliation for monitors. Per-receiver day totals
 * (what each counter took in) plus the two exception lists that catch
 * leakage: issued-but-undeposited (>5 days, no payment) and recent voids.
 */
export function ReconciliationBoard() {
  const summaryQuery = useQuery({
    queryKey: ["reconciliation"],
    queryFn: getReconciliationSummary,
  })

  if (summaryQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
        {summaryQuery.error instanceof Error
          ? summaryQuery.error.message
          : "Could not load reconciliation."}
      </p>
    )
  }

  const { totals, undeposited, voids } = summaryQuery.data

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Takings by receiver & day ({totals.length})
        </h2>
        {totals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payments recorded in scope yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {totals.map((entry) => (
              <li
                key={`${entry.date}::${entry.receiverName}`}
                className="flex items-center justify-between gap-4 rounded-none border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{entry.receiverName}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatDateKey(entry.date)} · {entry.count} receipt(s)
                  </span>
                </span>
                <span className="font-medium">{mwk(entry.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Issued, never deposited &gt;5 days ({undeposited.length})
        </h2>
        {undeposited.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing outstanding — every old ticket has a payment, a court
            outcome, or a void.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {undeposited.map((entry) => (
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
                  </span>
                  <span className="font-medium">
                    {entry.balance != null ? mwk(entry.balance) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Recent voids ({voids.length})
        </h2>
        {voids.length === 0 ? (
          <p className="text-sm text-muted-foreground">No voided tickets.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {voids.map((entry) => (
              <li key={entry.recordId}>
                <Link
                  href={`/records/${entry.recordId}`}
                  className="rounded-none border px-3 py-2 text-sm hover:bg-accent"
                >
                  <span className="font-medium">
                    {entry.ticketNumber ?? "No ticket no."}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {entry.reason ?? "no reason given"}
                    {entry.voidAt ? ` · ${formatDateKey(entry.voidAt.slice(0, 10))}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
