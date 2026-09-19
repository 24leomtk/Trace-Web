"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { useDebounce } from "use-debounce"

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface EntityOption {
  value: string
  label: string
  detail?: string
}

export interface EntityPage {
  items: EntityOption[]
  hasMore: boolean
}

type EntitySource =
  | {
      mode: "server"
      /** Distinguishes cached pages per picker (e.g. "admin-users"). */
      queryKey: string
      fetchPage: (
        query: string,
        page: number,
        pageSize: number
      ) => Promise<EntityPage>
    }
  | { mode: "client"; items: EntityOption[] }

const PAGE_SIZE = 8

const TRIGGER_CLASS =
  "flex h-8 w-full items-center justify-between gap-2 rounded-none border border-transparent bg-input/50 px-2.5 py-1 text-sm transition-[color,box-shadow] duration-200 outline-none hover:bg-input/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50"

/**
 * Single-select entity picker for unbounded lists (users, branches,
 * organizations, liaisons…). Popover + command + debounced search +
 * pagination, following the CatalogField pattern. Static enums should keep
 * using AdminCombobox/Select — this is for entity tables that grow.
 */
export function EntityPicker({
  value,
  onChange,
  label,
  placeholder,
  source,
  disabled,
  triggerClassName,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  source: EntitySource
  disabled?: boolean
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch] = useDebounce(search.trim(), 300)
  const [page, setPage] = useState(0)
  // Remembers the picked row so the trigger keeps its label even when the
  // selection is off the current page (or the search changes after picking).
  const [picked, setPicked] = useState<EntityOption | null>(null)

  // Portal the popup into the surrounding dialog (when there is one) so the
  // dialog's focus trap and dismiss handling treat it as inside — same trick
  // as AdminCombobox. Falls back to <body> on plain pages.
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  )

  useEffect(() => {
    if (!value) setPicked(null)
  }, [value])

  const serverQuery = useQuery({
    queryKey:
      source.mode === "server"
        ? ["entity-picker", source.queryKey, debouncedSearch, page]
        : ["entity-picker", "disabled"],
    queryFn: () =>
      source.mode === "server"
        ? source.fetchPage(debouncedSearch, page, PAGE_SIZE)
        : { items: [], hasMore: false },
    enabled: source.mode === "server" && open,
    staleTime: 30_000,
  })

  const serverItems =
    source.mode === "server" ? (serverQuery.data?.items ?? []) : []
  const serverHasMore =
    source.mode === "server" ? (serverQuery.data?.hasMore ?? false) : false
  const serverLoading =
    source.mode === "server" &&
    (serverQuery.isLoading || serverQuery.isFetching)

  const clientMatches = useMemo(() => {
    if (source.mode !== "client") return []
    const q = debouncedSearch.toLowerCase()
    if (!q) return source.items
    return source.items.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.value.toLowerCase().includes(q) ||
        (option.detail ?? "").toLowerCase().includes(q)
    )
  }, [source, debouncedSearch])

  const clientPageCount = Math.max(
    1,
    Math.ceil(clientMatches.length / PAGE_SIZE)
  )
  const clientPage = Math.min(page, clientPageCount - 1)
  const clientVisible = clientMatches.slice(
    clientPage * PAGE_SIZE,
    clientPage * PAGE_SIZE + PAGE_SIZE
  )

  const items = source.mode === "server" ? serverItems : clientVisible
  const isLoading = serverLoading
  const showFooter =
    source.mode === "server"
      ? items.length > 0 || page > 0
      : clientPageCount > 1
  const currentPage = source.mode === "server" ? page : clientPage
  const pageLabel =
    source.mode === "server"
      ? `Page ${currentPage + 1}`
      : `${currentPage + 1} / ${clientPageCount}`
  const canNext =
    source.mode === "server" ? serverHasMore : currentPage < clientPageCount - 1

  const selected =
    picked ??
    (value ? (items.find((option) => option.value === value) ?? null) : null)
  const display = selected?.label ?? ""

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setSearch("")
      setPage(0)
    }
  }

  function choose(option: EntityOption) {
    onChange(option.value)
    setPicked(option)
    handleOpenChange(false)
  }

  return (
    <span
      ref={(element) => {
        setPortalContainer(
          element?.closest('[data-slot="dialog-content"]') as HTMLElement | null
        )
      }}
      className="contents"
    >
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          type="button"
          aria-label={label}
          disabled={disabled}
          className={cn(
            TRIGGER_CLASS,
            !display && "text-muted-foreground",
            triggerClassName
          )}
        >
          <span className="truncate">
            {display || placeholder || `Select ${label.toLowerCase()}`}
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-40" />
        </PopoverTrigger>
        <PopoverContent
          container={portalContainer ?? undefined}
          align="start"
          className="w-full p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={(next) => {
                setSearch(next)
                setPage(0)
              }}
              placeholder={`Search ${label.toLowerCase()}…`}
            />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Loading…" : "No match found."}
              </CommandEmpty>
              <CommandGroup>
                {items.map((option) => {
                  const isSelected = option.value === (picked?.value ?? value)
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => choose(option)}
                    >
                      <CheckIcon
                        className={cn(
                          "size-3.5 shrink-0 text-primary",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1 truncate">{option.label}</span>
                      {option.detail && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {option.detail}
                        </span>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
            {showFooter && (
              <div className="flex items-center justify-between border-t px-2 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={currentPage === 0}
                  onClick={() =>
                    setPage(
                      source.mode === "server" ? page - 1 : clientPage - 1
                    )
                  }
                >
                  <ChevronLeftIcon data-icon="inline-start" />
                  Prev
                </Button>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {pageLabel}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={!canNext}
                  onClick={() =>
                    setPage(
                      source.mode === "server" ? page + 1 : clientPage + 1
                    )
                  }
                >
                  Next
                  <ChevronRightIcon data-icon="inline-end" />
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </span>
  )
}
