"use client"

import { useState } from "react"
import { CheckIcon, ChevronsUpDownIcon, TriangleAlertIcon } from "lucide-react"

import { breakGlassAccess } from "@/lib/actions/access"
import type { PatientSummary } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

interface BreakGlassModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: PatientSummary[]
  onConfirm: (patientId: string, reason: string) => void
}

export function BreakGlassModal({
  open,
  onOpenChange,
  patients,
  onConfirm,
}: BreakGlassModalProps) {
  const [patientId, setPatientId] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patient = patients.find((p) => p.id === patientId) ?? null
  const reasonValid = reason.trim().length >= 10

  function handleOpenChange(next: boolean) {
    if (!next && !submitting) {
      setPatientId(null)
      setReason("")
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleSubmit() {
    if (!patient || !reasonValid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await breakGlassAccess({ patientId: patient.id, reason: reason.trim() })
      const confirmedPatientId = patient.id
      const confirmedReason = reason.trim()
      setPatientId(null)
      setReason("")
      onConfirm(confirmedPatientId, confirmedReason)
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Break-glass access failed. Try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Break-glass emergency access"
      description="Open a patient's full history without a code. A real reason is required — every break-glass read is flagged for admin review."
    >
      <div className="flex items-start gap-2.5 rounded-[min(var(--radius-2xl),18px)] border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
        <p className="text-xs leading-relaxed text-red-900 dark:text-red-200">
          Use only when the patient cannot share a code and waiting is not safe.
          Misuse is visible to district and national admins.
        </p>
      </div>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={pickerOpen}
            className="w-full justify-between"
          >
            {patient ? patient.name : "Select the patient you are treating…"}
            <ChevronsUpDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) p-1"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search connected patients…" />
            <CommandList>
              <CommandEmpty>No connected patient found.</CommandEmpty>
              <CommandGroup>
                {patients.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={`${option.name} ${option.phone}`}
                    onSelect={() => {
                      setPatientId(option.id)
                      setPickerOpen(false)
                    }}
                  >
                    {option.name}
                    <CheckIcon
                      className={cn(
                        "ml-auto",
                        patientId === option.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why is full history needed right now? (e.g. patient unconscious after RTA, no code possible)"
        rows={3}
      />

      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}

      <Button
        variant="destructive"
        disabled={!patient || !reasonValid || submitting}
        onClick={() => void handleSubmit()}
      >
        {submitting ? (
          <>
            <Spinner className="size-4" />
            Opening…
          </>
        ) : (
          <>
            <TriangleAlertIcon data-icon="inline-start" />
            Open full history (break-glass)
          </>
        )}
      </Button>
    </ResponsiveModal>
  )
}
