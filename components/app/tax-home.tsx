"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BellIcon, CheckIcon, ClockIcon, TriangleAlertIcon } from "lucide-react"
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
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/format"

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
  const [assessOpen, setAssessOpen] = useState(false)

  const preFiltered = useMemo(
    () =>
      (data ?? []).filter(
        (row) => status === "all" || statusOf(row) === status
      ),
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

      <AssessDialog
        open={assessOpen}
        onOpenChange={setAssessOpen}
        onDone={refresh}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Ledger
        </h2>
        <div className="flex flex-wrap items-start gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search plate, tax type, reference…"
            className="min-w-48 flex-1"
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
          <Button type="button" onClick={() => setAssessOpen(true)}>
            New assessment
          </Button>
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

function AssessDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [plate, setPlate] = useState("")
  const [vehicle, setVehicle] = useState<{
    id: string
    plateNumber: string
  } | null>(null)
  const [looking, setLooking] = useState(false)
  const [taxType, setTaxType] = useState<string>("license_fee")
  const [amount, setAmount] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [referenceNo, setReferenceNo] = useState("")
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  function reset() {
    setPlate("")
    setVehicle(null)
    setTaxType("license_fee")
    setAmount("")
    setDueDate("")
    setReferenceNo("")
    setServerError(null)
  }

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
    if (!dueDate) {
      toast.error("Choose a due date.")
      return
    }
    setSaving(true)
    setServerError(null)
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
      reset()
      onOpenChange(false)
      await onDone()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="New assessment"
      description="The bill lands on the vehicle immediately — overdue unpaid taxes flag the plate."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Vehicle
          </span>
          <div className="flex gap-2">
            <Input
              value={plate}
              onChange={(event) => {
                setPlate(event.target.value)
                setVehicle(null)
              }}
              placeholder="Plate number, e.g. LL 4242"
              aria-label="Plate number"
            />
            <Button
              type="button"
              variant="outline"
              disabled={looking}
              onClick={lookup}
            >
              {looking ? "…" : "Find"}
            </Button>
          </div>
          {vehicle && (
            <p className="text-xs text-emerald-700">
              On file: {vehicle.plateNumber}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Tax type
          </span>
          <Select value={taxType} onValueChange={setTaxType}>
            <SelectTrigger aria-label="Tax type">
              <SelectValue placeholder="Select tax type…" />
            </SelectTrigger>
            <SelectContent>
              {taxTypeOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Amount due (MWK)
          </span>
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="e.g. 40000"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Due date
          </span>
          <DatePicker
            value={dueDate}
            onChange={setDueDate}
            label="Due date"
            placeholder="Due date"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Reference{" "}
            <span className="font-normal normal-case opacity-60">optional</span>
          </span>
          <Input
            value={referenceNo}
            onChange={(event) => setReferenceNo(event.target.value)}
            placeholder="Assessment / TIP no."
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
          <Button type="submit" disabled={saving || !vehicle}>
            {saving ? "Recording…" : "Record assessment"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function TaxRow({ row, onDone }: { row: TaxLedgerRow; onDone: () => void }) {
  const [payOpen, setPayOpen] = useState(false)
  const [waiveOpen, setWaiveOpen] = useState(false)
  const state = statusOf(row)
  const collectable = !isTaxSettled(row)

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
        {formatCurrency(row.amountDue)}
        {row.referenceNo ? ` · ref ${row.referenceNo}` : ""}
        {row.periodStart
          ? ` · ${row.periodStart} → ${row.periodEnd ?? ""}`
          : ""}
      </p>
      {collectable && row.waiverStatus === "none" && (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPayOpen(true)}
          >
            Record payment
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setWaiveOpen(true)}
          >
            Propose waiver
          </Button>
        </div>
      )}
      {row.waiverStatus === "pending" && (
        <p className="mt-2 text-xs text-amber-700">Waiver awaiting decision.</p>
      )}
      <RecordPaymentDialog
        row={row}
        open={payOpen}
        onOpenChange={setPayOpen}
        onDone={onDone}
      />
      <ProposeWaiverDialog
        row={row}
        open={waiveOpen}
        onOpenChange={setWaiveOpen}
        onDone={onDone}
      />
    </li>
  )
}

function RecordPaymentDialog({
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
  const [receipt, setReceipt] = useState("")
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!receipt.trim()) {
      toast.error("A receipt number is required.")
      return
    }
    setSaving(true)
    setServerError(null)
    try {
      await recordTaxPayment({ taxId: row.id, receiptNo: receipt })
      toast.success("Payment recorded.")
      setReceipt("")
      onOpenChange(false)
      await onDone()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReceipt("")
          setServerError(null)
        }
        onOpenChange(next)
      }}
      title="Record payment"
      description={`${row.plateNumber} · ${row.taxType.replace(/_/g, " ")} · ${formatCurrency(row.amountDue)}. The plate clears on save.`}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Receipt no.
          </span>
          <Input
            value={receipt}
            onChange={(event) => setReceipt(event.target.value)}
            placeholder="e.g. TAX-R-80123"
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
          <Button type="submit" disabled={saving}>
            {saving ? "Recording…" : "Record payment"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function ProposeWaiverDialog({
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
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (reason.trim().length < 10) {
      toast.error("Give a justification (min 10 characters).")
      return
    }
    setSaving(true)
    setServerError(null)
    try {
      await proposeTaxWaiver({ taxId: row.id, reason })
      toast.success("Waiver sent for decision.")
      setReason("")
      onOpenChange(false)
      await onDone()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
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
      title="Propose waiver"
      description={`${row.plateNumber} · ${formatCurrency(row.amountDue)}. A compliance officer decides — proposing never waives.`}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Justification{" "}
            <span className="font-normal normal-case opacity-60">required</span>
          </span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Duplicate assessment issued at the border post…"
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
          <Button type="submit" disabled={saving}>
            {saving ? "Sending…" : "Send for decision"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}
