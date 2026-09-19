"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  decideTaxWaiver,
  listMyTaxes,
  listPendingWaivers,
  type TaxLedgerRow,
} from "@/lib/actions/tax"
import { isTaxDueSoon, isTaxOverdue, isTaxSettled } from "@/lib/visibility"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListPagination } from "@/components/app/list-pagination"
import { SearchInput } from "@/components/app/search-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Tax compliance home — read-only oversight plus the one power this role
 * holds: approving or rejecting pending waivers (maker-checker).
 */
export function TaxComplianceHome() {
  const queryClient = useQueryClient()
  const pending = useQuery({
    queryKey: ["pending-waivers"],
    queryFn: listPendingWaivers,
  })
  const ledger = useQuery({
    queryKey: ["my-taxes"],
    queryFn: listMyTaxes,
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["pending-waivers"] })
    await queryClient.invalidateQueries({ queryKey: ["my-taxes"] })
  }

  const overdueCount = useMemo(
    () => (ledger.data ?? []).filter((row) => isTaxOverdue(row)).length,
    [ledger.data]
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Compliance review</h1>
        <p className="text-sm text-muted-foreground">
          Read-only ledger oversight. Waiver decisions are yours alone.
          {overdueCount > 0 ? ` ${overdueCount} overdue right now.` : ""}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Waivers awaiting decision ({pending.data?.length ?? 0})
        </h2>
        {pending.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : pending.isError ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            Could not load waivers.
          </p>
        ) : !pending.data || pending.data.length === 0 ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            Queue clear — no pending waivers.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {pending.data.map((row) => (
              <WaiverRow key={row.id} row={row} onDone={refresh} />
            ))}
          </ul>
        )}
      </section>

      <LedgerReadOnly
        data={ledger.data}
        isLoading={ledger.isLoading}
        isError={ledger.isError}
      />
    </div>
  )
}

function WaiverRow({ row, onDone }: { row: TaxLedgerRow; onDone: () => void }) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  async function decide(decision: "approved" | "rejected") {
    setBusy(true)
    try {
      await decideTaxWaiver({ taxId: row.id, decision, reason })
      toast.success(`Waiver ${decision}.`)
      await onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-none border border-amber-200 bg-card px-4 py-3">
      <p className="text-[15px] font-medium">
        {row.plateNumber} · {row.taxType.replace(/_/g, " ")} · MWK {row.amountDue}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Proposed justification: {row.waiverReason || "—"}
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Decision note (optional)…"
          className="h-8 rounded-none"
        />
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void decide("approved")}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void decide("rejected")}
        >
          Reject
        </Button>
      </div>
    </li>
  )
}

function LedgerReadOnly({
  data,
  isLoading,
  isError,
}: {
  data: TaxLedgerRow[] | undefined
  isLoading: boolean
  isError: boolean
}) {
  const { query, setQuery, page, setPage, pageCount, total, visible } =
    usePaginatedSearch({
      items: data ?? [],
      search: (row, q) =>
        `${row.plateNumber} ${row.taxType.replace(/_/g, " ")} ${row.referenceNo ?? ""} ${row.waiverStatus}`
          .toLowerCase()
          .includes(q),
    })

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Ledger (read-only)
      </h2>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search plate, tax type, reference…"
      />
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : isError ? (
        <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          Could not load the ledger.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          No rows match.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {visible.map((row) => {
              const state = isTaxSettled(row)
                ? "settled"
                : isTaxOverdue(row)
                  ? "overdue"
                  : isTaxDueSoon(row)
                    ? "due soon"
                    : "unpaid"
              return (
                <li
                  key={row.id}
                  className="rounded-none border bg-card px-4 py-3"
                >
                  <p className="text-[15px] font-medium">
                    {row.plateNumber} · {row.taxType.replace(/_/g, " ")} · MWK{" "}
                    {row.amountDue}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {state} · due {row.dueDate}
                    {row.isPaid && row.receiptNo ? ` · receipt ${row.receiptNo}` : ""}
                    {row.waiverStatus !== "none" ? ` · waiver ${row.waiverStatus}` : ""}
                  </p>
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
