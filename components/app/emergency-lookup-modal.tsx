"use client"

import { useState } from "react"
import { HeartPulseIcon, SearchIcon, TriangleAlertIcon } from "lucide-react"
import { isValidPhoneNumber } from "react-phone-number-input"
import { toast } from "sonner"

import { emergencyLookup } from "@/lib/actions/access"
import { formatFullDate, formatPhone } from "@/lib/format"
import type { EmergencyLookupEntry } from "@/lib/types"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/reui/phone-input"

interface EmergencyLookupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type LookupStatus = "idle" | "found" | "missing"

export function EmergencyLookupModal({
  open,
  onOpenChange,
}: EmergencyLookupModalProps) {
  const [nationalId, setNationalId] = useState("")
  const [phoneNumber, setPhoneNumber] = useState<string>("")
  const [status, setStatus] = useState<LookupStatus>("idle")
  const [result, setResult] = useState<EmergencyLookupEntry | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
      toast.error("Enter a valid phone number.")
      return
    }

    setSubmitting(true)
    try {
      const entry = await emergencyLookup({ nationalId, phoneNumber })
      if (!entry) {
        setStatus("missing")
        setResult(null)
        return
      }
      setStatus("found")
      setResult(entry)
    } catch {
      toast.error("Lookup failed — try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setNationalId("")
      setPhoneNumber("")
      setStatus("idle")
      setResult(null)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Emergency info lookup"
      description="Find a patient's emergency info by national ID or phone number — no access code needed."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          value={nationalId}
          onChange={(event) => setNationalId(event.target.value)}
          placeholder="National ID — e.g. BQ73920418"
          aria-label="National ID"
          autoComplete="off"
        />
        <PhoneInput
          value={phoneNumber}
          onChange={setPhoneNumber}
          countries={["MW"]}
          defaultCountry="MW"
          placeholder="Or phone number — e.g. 991 778 899"
          aria-label="Phone number"
          autoComplete="tel-national"
        />
        <Button type="submit" disabled={submitting}>
          <SearchIcon data-icon="inline-start" />
          {submitting ? "Looking up…" : "Look up"}
        </Button>
      </form>

      {status === "missing" && (
        <p className="flex items-start gap-1.5 rounded-2xl border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          No patient matches that national ID or phone number.
        </p>
      )}

      {status === "found" && result && (
        <div className="flex flex-col gap-3 rounded-[min(var(--radius-3xl),20px)] border bg-card p-4">
          <div>
            <p className="text-sm font-medium">{result.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Born {formatFullDate(result.dateOfBirth)} ·{" "}
              {result.sex === "F" ? "Female" : "Male"} · {result.district}{" "}
              District · {formatPhone(result.phone)}
            </p>
          </div>
          <EmergencyRow label="Blood type" value={result.emergencyInfo.bloodType ?? "—"} />
          <EmergencyRow
            label="Allergies"
            value={
              result.emergencyInfo.allergies?.length
                ? result.emergencyInfo.allergies.join(", ")
                : "None recorded"
            }
            highlight={!!result.emergencyInfo.allergies?.length}
          />
          <EmergencyRow
            label="Chronic conditions"
            value={
              result.emergencyInfo.chronicConditions?.length
                ? result.emergencyInfo.chronicConditions.join(", ")
                : "None recorded"
            }
          />
          {result.emergencyInfo.emergencyContact && (
            <EmergencyRow
              label="Emergency contact"
              value={`${result.emergencyInfo.emergencyContact.name} (${result.emergencyInfo.emergencyContact.relation}) · ${formatPhone(result.emergencyInfo.emergencyContact.phone)}`}
            />
          )}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <HeartPulseIcon className="size-3.5" />
        Every emergency lookup is logged and visible to the patient.
      </p>
    </ResponsiveModal>
  )
}

function EmergencyRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="min-w-0">
      <span className="text-xs tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <p
        className={
          highlight
            ? "mt-0.5 text-sm font-medium text-red-600 dark:text-red-400"
            : "mt-0.5 text-sm font-medium"
        }
      >
        {value}
      </p>
    </div>
  )
}
