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
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

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
  const [decideOpen, setDecideOpen] = useState(false)

  return (
    <li className="rounded-none border border-amber-200 bg-card px-4 py-3">
      <p className="text-[15px] font-medium">
        {row.plateNumber} · {row.taxType.replace(/_/g, " ")} · MWK {row.amountDue}
      </p>
      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
        Proposed justification: {row.waiverReason || "—"}
      </p>
      <div className="mt-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setDecideOpen(true)}
        >
          Decide waiver
        </Button>
      </div>
      <DecideWaiverDialog
        row={row}
        open={decideOpen}
        onOpenChange={setDecideOpen}
        onDone={onDone}
      />
    </li>
  )
}

function DecideWaiverDialog({
  row,
  open,
  onOpenChange,
  onDone,
}: {
  row: TaxLedgerRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function decide(decision: "approved" | "rejected") {
    setBusy(true)
    setServerError(null)
    try {
      await decideTaxWaiver({ taxId: row.id, decision, reason })
      toast.success(`Waiver ${decision}.`)
      setReason("")
      onOpenChange(false)
      await onDone()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason("")
          setServerError(null)
        }
        onOpenChange(next)
      }}
      title="Decide waiver"
      description={`${row.plateNumber} · ${row.taxType.replace(/_/g, " ")} · MWK ${row.amountDue}. Approval waives the debt — this is logged against your name.`}
    >
      <div className="flex flex-col gap-3">
        <p className="rounded-none border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">Proposed justification: </span>
          {row.waiverReason || "—"}
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Decision note <span className="font-normal normal-case opacity-60">optional</span>
          </span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why this decision…"
            rows={3}
          />
        </div>
        {serverError && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {serverError}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void decide("rejected")}
          >
            Reject
          </Button>
          <Button type="button" disabled={busy} onClick={() => void decide("approved")}>
            {busy ? "Deciding…" : "Approve waiver"}
          </Button>
        </DialogFooter>
      </div>
    </ResponsiveModal>
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
