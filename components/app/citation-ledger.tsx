"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PrinterIcon } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"

import {
  getCitationLedger,
  listCourtOptions,
  recordCitationPayment,
  scheduleCitationCourt,
} from "@/lib/actions/citations"
import { formatDateKey } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

function mwk(value: number): string {
  return `MWK ${value.toLocaleString()}`
}

/**
 * F3 fine ledger (Phase 2) — printable ticket + running balance + receipted
 * payments + monitor-set court date. `is_paid` is derived from the ledger,
 * never toggled.
 */
export function CitationLedger({
  recordId,
  canManage,
  isMonitor,
}: {
  recordId: string
  canManage: boolean
  isMonitor: boolean
}) {
  const queryClient = useQueryClient()
  const ledgerQuery = useQuery({
    queryKey: ["citation-ledger", recordId],
    queryFn: () => getCitationLedger(recordId),
  })
  const courtsQuery = useQuery({
    queryKey: ["court-options"],
    queryFn: listCourtOptions,
    enabled: isMonitor,
  })

  const [amount, setAmount] = useState("")
  const [receiptNo, setReceiptNo] = useState("")
  const [note, setNote] = useState("")
  const [paying, setPaying] = useState(false)
  const [courtDate, setCourtDate] = useState("")
  const [courtId, setCourtId] = useState("")
  const [scheduling, setScheduling] = useState(false)

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: ["citation-ledger", recordId],
    })
  }

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a positive amount.")
      return
    }
    setPaying(true)
    try {
      const result = await recordCitationPayment({
        recordId,
        amount: Math.round(parsed * 100) / 100,
        receiptNo: receiptNo.trim() || undefined,
        note: note.trim() || undefined,
      })
      toast.success(
        `Receipt ${result.receiptNo} recorded.${result.isPaid ? " Fine fully paid." : ""}`
      )
      setAmount("")
      setReceiptNo("")
      setNote("")
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment failed.")
    } finally {
      setPaying(false)
    }
  }

  async function submitSchedule(event: React.FormEvent) {
    event.preventDefault()
    if (!courtDate) {
      toast.error("Choose a court date.")
      return
    }
    setScheduling(true)
    try {
      await scheduleCitationCourt({
        recordId,
        courtDate,
        courtId: courtId || undefined,
      })
      toast.success("Court date scheduled.")
      setCourtDate("")
      setCourtId("")
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scheduling failed.")
    } finally {
      setScheduling(false)
    }
  }

  if (ledgerQuery.isLoading) return <Skeleton className="h-40 w-full" />
  if (ledgerQuery.isError || !ledgerQuery.data) {
    return (
      <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
        Could not load the fine ledger.
      </p>
    )
  }

  const ledger = ledgerQuery.data
  const ticketNo = `TRACE-${recordId.slice(0, 8).toUpperCase()}`
  const ticketUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/records/${recordId}`
      : recordId
  const todayKey = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-col gap-4">
      {/* Printable uniform ticket */}
      <section
        aria-label="Uniform traffic ticket"
        className="rounded-none border bg-card px-4 py-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Uniform traffic ticket · {ticketNo}
            </p>
            <p className="mt-0.5 text-[15px] font-medium">
              {ledger.violationType} · {ledger.plateNumber ?? "No plate"}
            </p>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              {ledger.driverName && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Driver</dt>
                  <dd className="font-medium">{ledger.driverName}</dd>
                </div>
              )}
              {ledger.location && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Place</dt>
                  <dd className="font-medium">{ledger.location}</dd>
                </div>
              )}
              {ledger.dateIssued && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Issued</dt>
                  <dd className="font-medium">
                    {formatDateKey(ledger.dateIssued)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Fine</dt>
                <dd className="font-medium">
                  {ledger.fineAmount != null ? mwk(ledger.fineAmount) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="font-medium">{mwk(ledger.totalPaid)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="font-medium">
                  {ledger.balance != null ? mwk(ledger.balance) : "—"}
                  {ledger.isPaid && " · PAID"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Court</dt>
                <dd className="font-medium">
                  {ledger.courtDate
                    ? `${formatDateKey(ledger.courtDate)}${ledger.courtName ? ` · ${ledger.courtName}` : ""}`
                    : "Not scheduled"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <QRCodeSVG
              value={ticketUrl}
              size={88}
              aria-label={`Ticket ${ticketNo} code`}
            />
            <span className="text-[10px] text-muted-foreground">
              {ticketNo}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-fit print:hidden"
          onClick={() => window.print()}
        >
          <PrinterIcon data-icon="inline-start" />
          Print ticket
        </Button>
      </section>

      {/* Payments */}
      <section className="flex flex-col gap-2 rounded-none border bg-card p-4 print:hidden">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Payments ({ledger.payments.length})
        </h2>
        {ledger.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payments recorded yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ledger.payments.map((payment) => (
              <li
                key={payment.id}
                className="rounded-none border px-3 py-2 text-sm"
              >
                <p className="font-medium">
                  {mwk(payment.amount)} · {payment.receiptNo}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[payment.receivedByName, payment.note]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canManage && !ledger.isPaid && (
          <form onSubmit={submitPayment} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Amount (MWK)"
                aria-label="Payment amount in kwacha"
              />
              <Input
                value={receiptNo}
                onChange={(event) => setReceiptNo(event.target.value)}
                placeholder="Receipt no. (auto)"
                aria-label="Receipt number, blank for auto"
              />
            </div>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Note (optional)"
              aria-label="Payment note"
            />
            <Button type="submit" size="sm" className="w-fit" disabled={paying}>
              {paying ? "Recording…" : "Record payment"}
            </Button>
          </form>
        )}
        {ledger.isPaid && (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Fully paid — no further payments accepted.
          </p>
        )}
      </section>

      {/* Court scheduling (monitors) */}
      {isMonitor && (
        <section className="flex flex-col gap-2 rounded-none border bg-card p-4 print:hidden">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Court appearance
          </h2>
          <form onSubmit={submitSchedule} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <DatePicker
                value={courtDate}
                onChange={setCourtDate}
                label="Court date"
                placeholder="Court date"
                min={todayKey}
                allowClear={false}
                className="flex-1"
              />
              <Select value={courtId || undefined} onValueChange={setCourtId}>
                <SelectTrigger aria-label="Court" className="h-9 flex-1">
                  <SelectValue placeholder="Select court…" />
                </SelectTrigger>
                <SelectContent>
                  {(courtsQuery.data ?? []).map((court) => (
                    <SelectItem key={court.id} value={court.id}>
                      {court.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              size="sm"
              className="w-fit"
              disabled={scheduling}
            >
              {scheduling
                ? "Scheduling…"
                : ledger.courtDate
                  ? "Reschedule"
                  : "Schedule"}
            </Button>
          </form>
        </section>
      )}
    </div>
  )
}
