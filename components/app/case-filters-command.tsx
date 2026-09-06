"use client"

import { useState } from "react"
import { ListFilterIcon } from "lucide-react"

import {
  RECORD_TYPE_META,
  RECORD_TYPE_ORDER,
} from "@/lib/record-meta"
import type { CaseStatus } from "@/lib/types"
import type { RecordType } from "@/validations/record"
import { NavButton } from "@/components/app/nav-button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useHomeView } from "@/providers/home-view-context"
import { useUser } from "@/providers/user-context"

const STATUS_OPTIONS: { value: CaseStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
]

export function CaseFiltersCommand() {
  const { user } = useUser()
  const { caseFilters, setCaseFilters } = useHomeView()
  const [open, setOpen] = useState(false)

  const types = RECORD_TYPE_ORDER.filter(
    (type) => !user.domain || RECORD_TYPE_META[type].domain === user.domain
  )

  return (
    <>
      <NavButton
        label="Filter cases"
        onClick={() => setOpen(true)}
        active={caseFilters.type !== null || caseFilters.status !== null}
      >
        <ListFilterIcon className="size-5" />
      </NavButton>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Filter cases"
        description="Narrow the feed by type or status."
      >
        <CommandInput placeholder="Search case types…" />
        <CommandList>
          <CommandEmpty>No match found.</CommandEmpty>
          <CommandGroup heading="Status">
            <CommandItem
              value="all statuses"
              onSelect={() => {
                setCaseFilters({ ...caseFilters, status: null })
                setOpen(false)
              }}
            >
              All statuses
            </CommandItem>
            {STATUS_OPTIONS.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                data-checked={caseFilters.status === option.value}
                onSelect={() => {
                  setCaseFilters({
                    ...caseFilters,
                    status:
                      caseFilters.status === option.value ? null : option.value,
                  })
                  setOpen(false)
                }}
              >
                {option.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Case type">
            <CommandItem
              value="all types"
              onSelect={() => {
                setCaseFilters({ ...caseFilters, type: null })
                setOpen(false)
              }}
            >
              All types
            </CommandItem>
            {types.map((type: RecordType) => {
              const meta = RECORD_TYPE_META[type]
              return (
                <CommandItem
                  key={type}
                  value={meta.label}
                  data-checked={caseFilters.type === type}
                  onSelect={() => {
                    setCaseFilters({
                      ...caseFilters,
                      type: caseFilters.type === type ? null : type,
                    })
                    setOpen(false)
                  }}
                >
                  <meta.icon className="text-muted-foreground" />
                  <span className="flex-1 truncate">{meta.label}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
