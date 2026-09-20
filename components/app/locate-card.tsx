"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  confirmLocate,
  getLocateState,
  recordDisposition,
  reportLocate,
} from "@/lib/actions/locate"
import { formatDateShort } from "@/lib/format"
import { useUser } from "@/providers/user-context"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

const DISPOSITIONS = ["held", "returned", "destroyed", "auctioned"] as const

/**
 * Phase 3: locate → confirm → clear card. Sits in its own section on
 * locatable cases (wanted / missing / stolen property). Reporting never
 * clears — confirmation by a different human does, and unblocks resolving.
 * Report + disposition forms live in dialogs; confirmation stays a button.
 */
export function LocateCard({
  recordId,
  recordType,
  isFiler,
}: {
  recordId: string
  recordType: string
  isFiler: boolean
}) {
  const { user } = useUser()
  const queryClient = useQueryClient()
  const isMonitor =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"
  const locateQuery = useQuery({
    queryKey: ["locate", recordId],
    queryFn: () => getLocateState(recordId),
  })

  const [reportOpen, setReportOpen] = useState(false)
  const [dispositionOpen, setDispositionOpen] = useState(false)
  const [place, setPlace] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [disposition, setDisposition] = useState("")

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["locate", recordId] })
    await queryClient.invalidateQueries({ queryKey: ["record", recordId] })
    await queryClient.invalidateQueries({
      queryKey: ["transition-hints", recordId],
    })
  }

  async function submitReport(event: React.SubmitEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await reportLocate({ recordId, place, note })
      toast.success("Locate reported — needs confirmation before resolving.")
      setPlace("")
      setNote("")
      setReportOpen(false)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  async function submitConfirm() {
    setBusy(true)
    try {
      await confirmLocate(recordId)
      toast.success("Locate confirmed — the case can now resolve.")
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  async function submitDisposition(event: React.SubmitEvent) {
    event.preventDefault()
    if (!disposition) return
    setBusy(true)
    try {
      await recordDisposition({
        recordId,
        disposition: disposition as (typeof DISPOSITIONS)[number],
      })
      toast.success(`Disposition → ${disposition}.`)
      setDisposition("")
      setDispositionOpen(false)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  if (locateQuery.isLoading)
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  if (locateQuery.isError || !locateQuery.data) return null
  const locate = locateQuery.data
  const canRecordDisposition =
    recordType === "stolen_property" && (isMonitor || isFiler)

  return (
    <div className="flex flex-col gap-3">
      {locate.locateState === "none" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            No locate reported yet. Found them? Report where — resolving
            unlocks only after confirmation by the originating branch or a
            monitor.
          </p>
          {locate.canReport && (
            <Button
              size="sm"
              className="w-fit rounded-none print:hidden"
              onClick={() => setReportOpen(true)}
            >
              <PlusIcon data-icon="inline-start" />
              Report locate
            </Button>
          )}
        </div>
      )}

      {locate.locateState === "located" && (
        <div className="flex flex-col gap-2">
          <p className="rounded-none border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            LOCATED · {locate.place}
            {locate.byName ? ` · reported by ${locate.byName}` : ""}
            {locate.at ? ` · ${formatDateShort(locate.at)}` : ""}
          </p>
          {locate.note && (
            <p className="text-sm text-muted-foreground">{locate.note}</p>
          )}
          {locate.canConfirm ? (
            <Button
              size="sm"
              className="w-fit rounded-none"
              disabled={busy}
              onClick={submitConfirm}
            >
              {busy ? "Confirming…" : "Confirm locate"}
            </Button>
          ) : (
            locate.confirmHint && (
              <p className="text-xs text-muted-foreground">
                {locate.confirmHint}
              </p>
            )
          )}
        </div>
      )}

      {locate.locateState === "confirmed" && (
        <p className="rounded-none border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          CONFIRMED{locate.byName ? ` · located by ${locate.byName}` : ""} — the
          case can now resolve.
        </p>
      )}

      {canRecordDisposition && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-sm text-muted-foreground">
            Custodian disposition
            {locate.disposition
              ? ` — currently ${locate.disposition}`
              : " — not recorded yet (required before closing)."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-fit rounded-none print:hidden"
            onClick={() => setDispositionOpen(true)}
          >
            <PlusIcon data-icon="inline-start" />
            Record disposition
          </Button>
        </div>
      )}

      <ResponsiveModal
        open={reportOpen}
        onOpenChange={(next) => {
          if (!busy) {
            if (!next) {
              setPlace("")
              setNote("")
            }
            setReportOpen(next)
          }
        }}
        title="Report locate"
        description="Resolving unlocks only after confirmation by the originating branch or a monitor."
      >
        <form onSubmit={submitReport} className="flex flex-col gap-3">
          <Input
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            placeholder="Where — e.g. Area 25 market, Lilongwe"
            aria-label="Locate place"
          />
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What happened (min 10 characters)…"
            rows={3}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReportOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !place.trim() || note.trim().length < 10}
            >
              {busy ? "Reporting…" : "Report locate"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveModal>

      <ResponsiveModal
        open={dispositionOpen}
        onOpenChange={(next) => {
          if (!busy) {
            if (!next) setDisposition("")
            setDispositionOpen(next)
          }
        }}
        title="Record disposition"
        description={
          locate.disposition
            ? `Currently ${locate.disposition}.`
            : "Required before a stolen-property case can close."
        }
      >
        <form onSubmit={submitDisposition} className="flex flex-col gap-3">
          <select
            value={disposition}
            onChange={(event) => setDisposition(event.target.value)}
            aria-label="Property disposition"
            className="h-9 w-full rounded-none border bg-background px-2 text-sm"
          >
            <option value="">Select disposition…</option>
            {DISPOSITIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDispositionOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !disposition}>
              {busy ? "Saving…" : "Save disposition"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveModal>
    </div>
  )
}
