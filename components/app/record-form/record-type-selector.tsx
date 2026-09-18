"use client"

import { useState } from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
} from "lucide-react"

import { RECORD_TYPE_META, RECORD_TYPE_ORDER } from "@/lib/record-meta"
import type { Domain } from "@/lib/types"
import type { RecordType } from "@/validations/record"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const PAGE_SIZE = 20

interface RecordTypeSelectorProps {
  value: RecordType
  onChange: (type: RecordType) => void
  /** When set, only types in this domain are listed (filing is domain-locked). */
  domain?: Domain
}

export function RecordTypeSelector({
  value,
  onChange,
  domain,
}: RecordTypeSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)

  const query = search.trim().toLowerCase()
  const matches = RECORD_TYPE_ORDER.filter((type) => {
    const meta = RECORD_TYPE_META[type]
    if (domain && meta.domain !== domain) return false
    return (
      meta.label.toLowerCase().includes(query) ||
      meta.shortLabel.toLowerCase().includes(query)
    )
  })
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = matches.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  )
  const selectedMeta = RECORD_TYPE_META[value]

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setSearch("")
      setPage(0)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto w-full justify-between rounded-none px-3 py-2.5"
        >
          <span className="flex min-w-0 items-center gap-2">
            <selectedMeta.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-left text-sm font-normal">
              {selectedMeta.label}
            </span>
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={(next) => {
              setSearch(next)
              setPage(0)
            }}
            placeholder="Search record types…"
          />
          <CommandList>
            <CommandEmpty>No record type found.</CommandEmpty>
            <CommandGroup>
              {visible.map((type) => {
                const meta = RECORD_TYPE_META[type]
                return (
                  <CommandItem
                    key={type}
                    value={type}
                    data-checked={type === value}
                    onSelect={() => {
                      onChange(type)
                      handleOpenChange(false)
                    }}
                  >
                    <meta.icon className="text-muted-foreground" />
                    <span className="flex-1 truncate">{meta.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {meta.shortLabel}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t px-2 py-1.5">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeftIcon data-icon="inline-start" />
                Prev
              </Button>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {currentPage + 1} / {pageCount}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
