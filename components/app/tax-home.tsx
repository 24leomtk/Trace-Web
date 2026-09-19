"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BellIcon,
  CheckIcon,
  ClockIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  createTaxAssessment,
  findVehicleForTax,
  listMyTaxes,
  proposeTaxWaiver,
  recordTaxPayment,
  type TaxLedgerRow,
} from "@/lib/actions/tax"
import { isTaxDueSoon, isTaxOverdue, isTaxSettled } from "@/lib/visibility"
import { taxTypeOptions } from "@/validations/admin"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListFilter, ListFilterBadges } from "@/components/app/list-filter"
import { ListPagination } from "@/components/app/list-pagination"
import { SearchInput } from "@/components/app/search-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const STATUS_OPTIONS = [
  { value: "unpaid", label: "Unpaid", icon: ClockIcon },
  { value: "overdue", label: "Overdue", icon: TriangleAlertIcon },
  { value: "due-soon", label: "Due soon", icon: BellIcon },
  { value: "settled", label: "Settled", icon: CheckIcon },
]

function statusOf(row: TaxLedgerRow): string {
  if (isTaxSettled(row)) return "settled"
  if (isTaxOverdue(row)) return "overdue"
  if (isTaxDueSoon(row)) return "due-soon"
  return "unpaid"
}

const STATUS_CHIP: Record<string, string> = {
  unpaid: "border-amber-200 bg-amber-50 text-amber-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
  "due-soon": "border-sky-200 bg-sky-50 text-sky-700",
  settled: "border-emerald-200 bg-emerald-50 text-emerald-700",
}

export function TaxHome() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-taxes"],
    queryFn: listMyTaxes,
  })
  const [status, setStatus] = useState("all")

  const preFiltered = useMemo(
    () => (data ?? []).filter((row) => status === "all" || statusOf(row) === status),
    [data, status]
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
    search: (row, q) =>
      `${row.plateNumber} ${row.taxType.replace(/_/g, " ")} ${row.referenceNo ?? ""}`
        .toLowerCase()
        .includes(q),
  })

  const hasActiveFilter = status !== "all" || debouncedQuery !== ""

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["my-taxes"] })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Vehicle taxes</h1>
        <p className="text-sm text-muted-foreground">
          Your office&apos;s assessments. Unpaid overdue taxes flag the plate.
        </p>
      </header>

      <AssessForm onDone={refresh} />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Ledger
        </h2>
        <div className="flex items-start gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search plate, tax type, reference…"
            className="flex-1"
          />
          <ListFilter
            title="Filter ledger"
            description="Narrow by collection status."
            heading="Status"
            allLabel="All statuses"
            options={STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
            showBadges={false}
          />
        </div>
        <ListFilterBadges
          heading="Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
        />
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : isError ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            Could not load the ledger.
          </p>
        ) : !data || data.length === 0 ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            No assessments yet.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            {hasActiveFilter
              ? "No assessments match the current search and filters."
              : "No assessments yet."}
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {visible.map((row) => (
                <TaxRow key={row.id} row={row} onDone={refresh} />
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
    </div>
  )
}

function AssessForm({ onDone }: { onDone: () => void }) {
  const [plate, setPlate] = useState("")
  const [vehicle, setVehicle] = useState<{ id: string; plateNumber: string } | null>(null)
  const [looking, setLooking] = useState(false)
  const [taxType, setTaxType] = useState<string>("license_fee")
  const [amount, setAmount] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [referenceNo, setReferenceNo] = useState("")
  const [saving, setSaving] = useState(false)

  async function lookup() {
    if (!plate.trim()) return
    setLooking(true)
    try {
      const found = await findVehicleForTax(plate)
      setVehicle(found)
      if (!found) toast.error("Vehicle not on file — register it first.")
    } catch {
      toast.error("Lookup failed.")
    } finally {
      setLooking(false)
    }
  }

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!vehicle) {
      toast.error("Look up the vehicle first.")
      return
    }
    const amountDue = Number(amount)
    if (!Number.isFinite(amountDue) || amountDue <= 0) {
      toast.error("Enter a positive amount.")
      return
    }
    setSaving(true)
    try {
      await createTaxAssessment({
        vehicleId: vehicle.id,
        taxType: taxType as (typeof taxTypeOptions)[number],
        amountDue,
        dueDate,
        periodStart: "",
        periodEnd: "",
        referenceNo,
      })
      toast.success("Assessment recorded.")
      setAmount("")
      setDueDate("")
      setReferenceNo("")
      await onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-none border bg-card p-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        New assessment
      </h2>
      <div className="flex gap-2">
        <Input
          value={plate}
          onChange={(event) => {
            setPlate(event.target.value)
            setVehicle(null)
          }}
          placeholder="Plate number, e.g. LL 4242"
          className="rounded-none"
        />
        <Button type="button" variant="outline" disabled={looking} onClick={lookup}>
          {looking ? "…" : "Find"}
        </Button>
      </div>
      {vehicle && (
        <p className="text-xs text-emerald-700">On file: {vehicle.plateNumber}</p>
      )}
      <form onSubmit={submit} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Tax type
          <select
            value={taxType}
            onChange={(event) => setTaxType(event.target.value)}
            className="h-9 rounded-none border bg-background px-2 text-sm text-foreground"
          >
            {taxTypeOptions.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Amount due (MWK)
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="e.g. 40000"
            className="rounded-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Due date
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="rounded-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Reference (assessment / TIP no.)
          <Input
            value={referenceNo}
            onChange={(event) => setReferenceNo(event.target.value)}
            placeholder="Optional"
            className="rounded-none"
          />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={saving || !vehicle}>
            {saving ? "Recording…" : "Record assessment"}
          </Button>
        </div>
      </form>
    </section>
  )
}

function TaxRow({ row, onDone }: { row: TaxLedgerRow; onDone: () => void }) {
  const [receipt, setReceipt] = useState("")
  const [waiveReason, setWaiveReason] = useState("")
  const [busy, setBusy] = useState(false)
  const state = statusOf(row)
  const collectable = !isTaxSettled(row)

  async function pay() {
    if (!receipt.trim()) {
      toast.error("A receipt number is required.")
      return
    }
    setBusy(true)
    try {
      await recordTaxPayment({ taxId: row.id, receiptNo: receipt })
      toast.success("Payment recorded.")
      setReceipt("")
      await onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  async function propose() {
    if (waiveReason.trim().length < 10) {
      toast.error("Give a justification (min 10 characters).")
      return
    }
    setBusy(true)
    try {
      await proposeTaxWaiver({ taxId: row.id, reason: waiveReason })
      toast.success("Waiver sent for decision.")
      setWaiveReason("")
      await onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-none border bg-card px-4 py-3">
      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
        <span>
          {row.plateNumber} · {row.taxType.replace(/_/g, " ")}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-none border px-1.5 py-0.5 text-xs",
            STATUS_CHIP[state]
          )}
        >
          {state === "settled"
            ? row.isPaid
              ? `paid ${row.receiptNo ?? ""}`.trim()
              : row.isExempt
                ? "exempt"
                : `waived (${row.waiverStatus})`
            : `${state} · due ${row.dueDate}`}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">
        MWK {row.amountDue}
        {row.referenceNo ? ` · ref ${row.referenceNo}` : ""}
        {row.periodStart ? ` · ${row.periodStart} → ${row.periodEnd ?? ""}` : ""}
      </p>
      {collectable && row.waiverStatus === "none" && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              value={receipt}
              onChange={(event) => setReceipt(event.target.value)}
              placeholder="Receipt no."
              className="h-8 rounded-none"
            />
            <Button type="button" size="sm" disabled={busy} onClick={pay}>
              Record payment
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              value={waiveReason}
              onChange={(event) => setWaiveReason(event.target.value)}
              placeholder="Waiver justification…"
              className="h-8 rounded-none"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={propose}
            >
              Propose waiver
            </Button>
          </div>
        </div>
      )}
      {row.waiverStatus === "pending" && (
        <p className="mt-2 text-xs text-amber-700">Waiver awaiting decision.</p>
      )}
    </li>
  )
}
