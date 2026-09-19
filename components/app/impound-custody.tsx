"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  authorizeRelease,
  getCustodyState,
  placeHold,
  recordOwnerNotice,
} from "@/lib/actions/custody"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

function mwk(value: number): string {
  return `MWK ${value.toLocaleString()}`
}

/**
 * Phase 4: impound custody card. Proves where the car is, who ordered the
 * hold, and who signed the release — the lot executes but never authorizes.
 * Sits on the Case tab of vehicle_impoundment records.
 */
export function ImpoundCustody({ recordId }: { recordId: string }) {
  const queryClient = useQueryClient()
  const custodyQuery = useQuery({
    queryKey: ["custody", recordId],
    queryFn: () => getCustodyState(recordId),
  })

  const [basis, setBasis] = useState("")
  const [tow, setTow] = useState("")
  const [lot, setLot] = useState("")
  const [bay, setBay] = useState("")
  const [recipient, setRecipient] = useState("")
  const [recipientId, setRecipientId] = useState("")
  const [fees, setFees] = useState("")
  const [busy, setBusy] = useState(false)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["custody", recordId] })
    await queryClient.invalidateQueries({ queryKey: ["record", recordId] })
    await queryClient.invalidateQueries({
      queryKey: ["transition-hints", recordId],
    })
  }

  async function submitHold(event: React.SubmitEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await placeHold({
        recordId,
        holdBasis: basis,
        towCompany: tow || undefined,
        lotLocation: lot || undefined,
        bay: bay || undefined,
      })
      toast.success("Hold ordered.")
      setBasis("")
      setTow("")
      setLot("")
      setBay("")
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  async function submitRelease(event: React.SubmitEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const parsed = fees.trim() ? Number(fees) : undefined
      await authorizeRelease({
        recordId,
        recipientName: recipient,
        recipientIdChecked: recipientId,
        feesSnapshot:
          parsed != null && Number.isFinite(parsed) ? parsed : undefined,
      })
      toast.success("Release authorized.")
      setRecipient("")
      setRecipientId("")
      setFees("")
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  async function submitNotice() {
    setBusy(true)
    try {
      await recordOwnerNotice(recordId)
      toast.success("Owner notification recorded.")
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  if (custodyQuery.isLoading) return <Skeleton className="h-36 w-full" />
  if (custodyQuery.isError || !custodyQuery.data) return null
  const custody = custodyQuery.data

  return (
    <section className="flex flex-col gap-3 rounded-none border bg-card p-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Custody & release
      </h2>

      {!custody.hasHold && (
        <>
          <p className="text-sm text-muted-foreground">
            No hold ordered yet — the car is towed but not legally held. Order
            the hold to name who can release it.
          </p>
          {custody.canPlaceHold ? (
            <form onSubmit={submitHold} className="flex flex-col gap-2">
              <Textarea
                value={basis}
                onChange={(event) => setBasis(event.target.value)}
                placeholder="Legal basis for the hold (min 10 characters)…"
                rows={2}
              />
              <div className="flex gap-2">
                <Input
                  value={tow}
                  onChange={(event) => setTow(event.target.value)}
                  placeholder="Tow company"
                  aria-label="Tow company"
                />
                <Input
                  value={lot}
                  onChange={(event) => setLot(event.target.value)}
                  placeholder="Lot"
                  aria-label="Lot location"
                />
                <Input
                  value={bay}
                  onChange={(event) => setBay(event.target.value)}
                  placeholder="Bay"
                  aria-label="Bay or slot"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                className="w-fit"
                disabled={busy || basis.trim().length < 10}
              >
                {busy ? "Ordering…" : "Order hold"}
              </Button>
            </form>
          ) : (
            <p className="text-xs text-muted-foreground">
              Only the filing officer or a monitor orders the hold.
            </p>
          )}
        </>
      )}

      {custody.hasHold && (
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Lot</dt>
            <dd className="font-medium">
              {[custody.lotLocation, custody.bay].filter(Boolean).join(" · ") ||
                "—"}
            </dd>
          </div>
          {custody.towCompany && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tow</dt>
              <dd className="font-medium">{custody.towCompany}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Hold by</dt>
            <dd className="font-medium">
              {custody.holdAuthorityName ?? "—"}
              {custody.holdPlacedAt
                ? ` · ${formatDateTime(custody.holdPlacedAt)}`
                : ""}
            </dd>
          </div>
          {custody.holdBasis && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Basis</dt>
              <dd className="font-medium">{custody.holdBasis}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Owner told</dt>
            <dd className="font-medium">
              {custody.ownerNotifiedAt
                ? formatDateTime(custody.ownerNotifiedAt)
                : "Not yet"}
            </dd>
          </div>
          {custody.feesSnapshot != null && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Fees</dt>
              <dd className="font-medium">{mwk(custody.feesSnapshot)}</dd>
            </div>
          )}
        </dl>
      )}

      {custody.hasHold && !custody.released && (
        <div className="flex flex-col gap-2 border-t pt-3">
          {!custody.ownerNotifiedAt && (
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              disabled={busy}
              onClick={submitNotice}
            >
              {busy ? "Recording…" : "Record owner notification"}
            </Button>
          )}
          {custody.canRelease ? (
            <form onSubmit={submitRelease} className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Dual signature — your authorization plus the recipient&apos;s
                checked ID.
              </p>
              <div className="flex gap-2">
                <Input
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="Recipient name*"
                  aria-label="Recipient name"
                />
                <Input
                  value={recipientId}
                  onChange={(event) => setRecipientId(event.target.value)}
                  placeholder="ID checked*"
                  aria-label="ID document checked"
                />
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={fees}
                onChange={(event) => setFees(event.target.value)}
                placeholder="Fees owed in MWK (optional)"
                aria-label="Fees snapshot"
              />
              <Button
                type="submit"
                size="sm"
                className="w-fit"
                disabled={
                  busy || !recipient.trim() || recipientId.trim().length < 2
                }
              >
                {busy ? "Authorizing…" : "Authorize release"}
              </Button>
            </form>
          ) : (
            custody.releaseHint && (
              <p className="text-xs text-muted-foreground">
                {custody.releaseHint}
              </p>
            )
          )}
        </div>
      )}

      {custody.released && (
        <p className="rounded-none border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          RELEASED{custody.recipientName ? ` to ${custody.recipientName}` : ""}
          {custody.releasedAt ? ` · ${formatDateTime(custody.releasedAt)}` : ""} —
          the case can now resolve.
        </p>
      )}
    </section>
  )
}
