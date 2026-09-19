"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { listAssignableUsers } from "@/lib/actions/assignments"
import { getRecordData, updateRecord } from "@/lib/actions/records"
import { EntityPicker } from "@/components/app/entity-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  custodyStatusOptions,
  prosecutorDecisionOptions,
} from "@/validations/record"

/**
 * Phase 5: arrest custody strip. Shows booking / custody / prosecutor state
 * on the Case tab; filer or monitor can update them (plus link the
 * arresting officer account) while the record is active — via the normal
 * reviewed-edit path, so history stays audited.
 */
export function ArrestDetail({
  recordId,
  canManage,
  isActive,
}: {
  recordId: string
  canManage: boolean
  isActive: boolean
}) {
  const queryClient = useQueryClient()
  const payloadQuery = useQuery({
    queryKey: ["record-data", recordId],
    queryFn: () => getRecordData(recordId),
  })
  const officersQuery = useQuery({
    queryKey: ["assignable-users"],
    queryFn: listAssignableUsers,
    enabled: canManage && isActive,
  })

  const [booking, setBooking] = useState("")
  const [custody, setCustody] = useState("")
  const [prosecutor, setProsecutor] = useState("")
  const [officerId, setOfficerId] = useState("")
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["record-data", recordId] })
    await queryClient.invalidateQueries({ queryKey: ["record", recordId] })
  }

  function startEdit(payload: Record<string, unknown>) {
    setBooking(
      typeof payload.booking_no === "string" ? payload.booking_no : ""
    )
    setCustody(
      typeof payload.custody_status === "string" ? payload.custody_status : ""
    )
    setProsecutor(
      typeof payload.prosecutor_decision === "string"
        ? payload.prosecutor_decision
        : ""
    )
    setOfficerId(
      typeof payload.arresting_officer_id === "string"
        ? payload.arresting_officer_id
        : ""
    )
    setEditing(true)
  }

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    const base = payloadQuery.data
    if (!base) return
    setSaving(true)
    try {
      const next: Record<string, unknown> = { ...base }
      if (booking.trim()) next.booking_no = booking.trim()
      else delete next.booking_no
      if (custody) next.custody_status = custody
      else delete next.custody_status
      if (prosecutor) next.prosecutor_decision = prosecutor
      else delete next.prosecutor_decision
      if (officerId) {
        next.arresting_officer_id = officerId
        const officer = (officersQuery.data ?? []).find((o) => o.id === officerId)
        if (officer) next.arresting_officer = officer.name
      } else {
        delete next.arresting_officer_id
      }
      await updateRecord({ id: recordId, data: next })
      toast.success("Custody details saved.")
      setEditing(false)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.")
    } finally {
      setSaving(false)
    }
  }

  if (payloadQuery.isLoading) return <Skeleton className="h-24 w-full" />
  if (payloadQuery.isError || !payloadQuery.data) return null
  const payload = payloadQuery.data as Record<string, unknown>
  const custodyValue =
    typeof payload.custody_status === "string" ? payload.custody_status : ""
  const prosecutorValue =
    typeof payload.prosecutor_decision === "string"
      ? payload.prosecutor_decision
      : ""
  const bookingValue =
    typeof payload.booking_no === "string" ? payload.booking_no : ""
  const officerText =
    typeof payload.arresting_officer === "string"
      ? payload.arresting_officer
      : ""
  const officerLinked = typeof payload.arresting_officer_id === "string"

  return (
    <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Custody & prosecution
      </h2>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Custody</dt>
          <dd className="font-medium">
            {custodyValue ? custodyValue.replace(/_/g, " ") : "Not recorded"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Booking</dt>
          <dd className="font-medium">{bookingValue || "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Prosecutor</dt>
          <dd className="font-medium">
            {prosecutorValue ? prosecutorValue.replace(/_/g, " ") : "Pending"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Officer</dt>
          <dd className="font-medium">
            {officerText || "—"}
            {officerLinked ? " · linked" : ""}
          </dd>
        </div>
      </dl>
      {canManage && isActive && !editing && (
        <Button
          size="sm"
          variant="outline"
          className="w-fit print:hidden"
          onClick={() => startEdit(payload)}
        >
          Update custody…
        </Button>
      )}
      {canManage && isActive && editing && (
        <form onSubmit={submit} className="flex flex-col gap-2 print:hidden">
          <div className="flex gap-2">
            <Input
              value={booking}
              onChange={(event) => setBooking(event.target.value)}
              placeholder="Booking number"
              aria-label="Booking number"
            />
            <select
              value={custody}
              onChange={(event) => setCustody(event.target.value)}
              aria-label="Custody status"
              className="h-9 flex-1 rounded-none border bg-background px-2 text-sm"
            >
              <option value="">Custody status…</option>
              {custodyStatusOptions.map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <select
              value={prosecutor}
              onChange={(event) => setProsecutor(event.target.value)}
              aria-label="Prosecutor decision"
              className="h-9 flex-1 rounded-none border bg-background px-2 text-sm"
            >
              <option value="">Prosecutor decision…</option>
              {prosecutorDecisionOptions.map((value) => (
                <option key={value} value={value}>
                  {value.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <EntityPicker
              label="Arresting officer"
              placeholder="Link officer…"
              value={officerId}
              onChange={setOfficerId}
              triggerClassName="h-9 flex-1"
              source={{
                mode: "client",
                items: (officersQuery.data ?? []).map((officer) => ({
                  value: officer.id,
                  label: officer.name,
                })),
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
