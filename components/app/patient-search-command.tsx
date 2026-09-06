"use client"

import { HeartPulseIcon, LockIcon, UserRoundIcon } from "lucide-react"

import { formatFullDate } from "@/lib/format"
import type { PatientSummary } from "@/lib/types"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

interface PatientSearchCommandProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: PatientSummary[]
  onSelect: (patientId: string) => void
  onSelectEmergency?: () => void
  onReset?: () => void
}

export function PatientSearchCommand({
  open,
  onOpenChange,
  patients,
  onSelect,
  onSelectEmergency,
  onReset,
}: PatientSearchCommandProps) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Find a patient"
      description="Search your connected patients by name or phone number."
    >
      <CommandInput placeholder="Search patients..." />
      <CommandList>
        <CommandEmpty>No connected patient found.</CommandEmpty>
        {patients.length > 0 && (
          <CommandGroup heading="Connected patients">
            {patients.map((patient) => (
              <CommandItem
                key={patient.id}
                value={`${patient.name} ${patient.phone}`}
                onSelect={() => {
                  onSelect(patient.id)
                  onOpenChange(false)
                }}
              >
              <UserRoundIcon className="text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{patient.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {patient.primaryCondition} · last visit{" "}
                  {formatFullDate(patient.lastVisitAt)}
                </span>
                {!patient.accessExpiresAt && (
                  <span className="flex items-center gap-1 truncate text-xs font-medium text-amber-600 dark:text-amber-400">
                    <LockIcon className="size-3" />
                    Access window ended — need a new code or break-glass
                  </span>
                )}
              </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {onSelectEmergency && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Emergency info — no code needed">
              <CommandItem
                value="emergency lookup national id phone number"
                onSelect={() => onSelectEmergency()}
              >
                <HeartPulseIcon className="text-muted-foreground" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    Look up emergency info
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Find by national ID or phone number · blood type,
                    allergies, contact
                  </span>
                </div>
              </CommandItem>
            </CommandGroup>
          </>
        )}
        {onReset && (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value="back to my records"
                onSelect={() => {
                  onReset()
                  onOpenChange(false)
                }}
                className="text-muted-foreground"
              >
                Back to my records
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
