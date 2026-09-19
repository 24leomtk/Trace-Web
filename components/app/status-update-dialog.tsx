"use client"

import { useEffect, useState } from "react"

import type { CaseStatus } from "@/lib/types"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export const CASE_STATUSES: CaseStatus[] = [
  "active",
  "resolved",
  "closed",
  "archived",
]

const STATUS_HELP: Record<CaseStatus, string> = {
  active: "Open and still being worked.",
  resolved: "Outcome reached — content locks, use notes for follow-ups.",
  closed: "No further action — kept for reference.",
  archived: "Filed away — hidden from day-to-day queues.",
}

export function StatusUpdateDialog({
  open,
  onOpenChange,
  currentStatus,
  saving,
  hints,
  serverError,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentStatus: CaseStatus
  saving?: boolean
  /** Phase 2: per-target guards from getTransitionHints — blocked targets disable. */
  hints?: { status: CaseStatus; allowed: boolean; message: string | null }[]
  serverError?: string | null
  onConfirm: (status: CaseStatus, reason: string) => void | Promise<void>
}) {
  const [status, setStatus] = useState<CaseStatus>(currentStatus)
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (open) {
      setStatus(currentStatus)
      setReason("")
    }
  }, [open, currentStatus])

  const hintFor = (value: CaseStatus) =>
    hints?.find((hint) => hint.status === value)
  const reasonRequired = status !== "active"
  const blocked = hintFor(status)?.allowed === false
  const canSubmit =
    !saving && status !== currentStatus && !blocked && (!reasonRequired || reason.trim().length > 0)

  function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!canSubmit) return
    void onConfirm(status, reason.trim())
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Update status"
      description={`Currently ${currentStatus}. The change is logged and the filing officer is notified.`}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Status
          </span>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as CaseStatus)}
          >
            <SelectTrigger aria-label="New status">
              <SelectValue placeholder="Select status…" />
            </SelectTrigger>
            <SelectContent>
              {CASE_STATUSES.map((value) => {
                const hint = hintFor(value)
                return (
                  <SelectItem
                    key={value}
                    value={value}
                    disabled={hint?.allowed === false}
                  >
                    {value}
                    {value === currentStatus ? " (current)" : ""}
                    {hint?.allowed === false ? " — blocked" : ""}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {blocked
              ? hintFor(status)?.message
              : (hintFor(status)?.message ?? STATUS_HELP[status])}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Reason{" "}
            {reasonRequired ? (
              <span className="font-normal normal-case opacity-60">required</span>
            ) : (
              <span className="font-normal normal-case opacity-60">optional</span>
            )}
          </span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Suspect charged, docket handed to court…"
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
          <Button type="submit" disabled={!canSubmit}>
            {saving ? "Updating…" : `Update to ${status}`}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}
