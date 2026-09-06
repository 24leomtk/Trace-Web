"use client"

import { useState } from "react"
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { listBranchOptions } from "@/lib/actions/catalog"
import { formatDateKey, fromDateKey, toDateKey } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type {
  AnyFieldDef,
  PlainFieldDef,
  RefFieldDef,
  RowListDef,
  StringListDef,
} from "@/components/app/record-form/fields"

export type FormValues = Record<string, unknown>

interface DynamicFieldsProps {
  fields: AnyFieldDef[]
  values: FormValues
  setValue: (path: string, value: unknown) => void
  errors: Record<string, string>
}

export function DynamicFields({
  fields,
  values,
  setValue,
  errors,
}: DynamicFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
      {fields.map((field) => (
        <FieldRenderer
          key={field.path}
          field={field}
          value={values[field.path]}
          setValue={(value) => setValue(field.path, value)}
          setPathValue={setValue}
          invalid={!!errors[field.path]}
        />
      ))}
    </div>
  )
}

function FieldRenderer({
  field,
  value,
  setValue,
  setPathValue,
  invalid,
}: {
  field: AnyFieldDef
  value: unknown
  setValue: (value: unknown) => void
  setPathValue: (path: string, value: unknown) => void
  invalid: boolean
}) {
  if (field.kind === "stringlist") {
    return (
      <StringListEditor
        field={field}
        items={(value as string[]) ?? []}
        onChange={setValue}
      />
    )
  }

  if (field.kind === "rowlist") {
    return (
      <RowListEditor
        field={field}
        rows={(value as Record<string, string>[]) ?? []}
        onChange={setValue}
      />
    )
  }

  if (field.kind === "ref") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          {field.label}
          {!field.required && (
            <span className="ml-1 font-normal opacity-60">optional</span>
          )}
        </span>
        <CatalogField
          field={field}
          value={value}
          setPathValue={setPathValue}
          invalid={invalid}
        />
        <FieldError message={invalid ? "This field is required." : undefined} />
      </div>
    )
  }

  const spanClass = field.type === "textarea" ? "sm:col-span-2" : ""

  if (field.options) {
    return (
      <div className={cn("flex flex-col gap-1.5", spanClass)}>
        <FieldLabel field={field} />
        <MiniSelect
          options={field.options}
          value={(value as string) ?? ""}
          onChange={setValue}
          placeholder={`Select ${field.label.toLowerCase()}`}
          invalid={invalid}
        />
        <FieldError message={invalid ? `Required` : undefined} />
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-1.5", spanClass)}>
      <FieldLabel field={field} />
      {field.type === "textarea" ? (
        <TextareaStyled
          value={(value as string) ?? ""}
          onChange={setValue}
          placeholder={field.placeholder}
          invalid={invalid}
          label={field.label}
        />
      ) : field.type === "date" || field.type === "datetime-local" ? (
        <CalendarField
          value={value}
          onChange={setValue}
          withTime={field.type === "datetime-local"}
          label={field.label}
          placeholder={
            field.placeholder ?? `Select ${field.label.toLowerCase()}`
          }
          invalid={invalid}
        />
      ) : (
        <Input
          type={field.type === "number" ? "number" : (field.type ?? "text")}
          inputMode={field.type === "number" ? "numeric" : undefined}
          min={field.type === "number" ? 1 : undefined}
          value={(value as string) ?? ""}
          onChange={(event) => setValue(event.target.value)}
          placeholder={field.placeholder ?? field.label}
          aria-label={field.label}
          aria-invalid={invalid || undefined}
          className="bg-background dark:bg-input/20"
        />
      )}
      <FieldError message={invalid ? "This field is required." : undefined} />
    </div>
  )
}

function FieldLabel({ field }: { field: PlainFieldDef }) {
  return (
    <label className="text-xs font-medium tracking-wide text-muted-foreground">
      {field.label}
      {!field.required && (
        <span className="ml-1 font-normal normal-case opacity-60">optional</span>
      )}
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
}

const FIELD_TRIGGER_CLASS =
  "flex h-8 w-full items-center justify-between rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-sm transition-[color,box-shadow] duration-200 outline-none hover:bg-input/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/20"

interface BranchOption {
  value: string
  label: string
  detail?: string
}

function CatalogField({
  field,
  value,
  setPathValue,
  invalid,
}: {
  field: RefFieldDef
  value: unknown
  setPathValue: (path: string, value: unknown) => void
  invalid: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)

  // Branch picker for monitors filing under a branch in scope.
  const { data, isLoading } = useQuery({
    queryKey: ["branches", field.domain],
    queryFn: async (): Promise<BranchOption[]> => {
      const rows = await listBranchOptions(field.domain)
      return rows.map((row) => ({
        value: row.id,
        label: row.name,
        detail: row.district.replace(/_/g, " "),
      }))
    },
    staleTime: 60_000,
  })
  const options = data ?? []

  const raw = typeof value === "string" ? value : ""
  const selected = options.find((option) => option.value === raw)
  const display = selected?.label ?? raw

  const query = search.trim().toLowerCase()
  const matches = options.filter(
    (option) =>
      option.label.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query) ||
      (option.detail ?? "").toLowerCase().includes(query)
  )
  const pageCount = Math.max(1, Math.ceil(matches.length / CATALOG_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = matches.slice(
    currentPage * CATALOG_PAGE_SIZE,
    currentPage * CATALOG_PAGE_SIZE + CATALOG_PAGE_SIZE
  )

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setSearch("")
      setPage(0)
    }
  }

  function choose(option: BranchOption) {
    setPathValue(field.path, option.value)
    handleOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        type="button"
        aria-invalid={invalid || undefined}
        className={cn(FIELD_TRIGGER_CLASS, !display && "text-muted-foreground")}
      >
        <span className="truncate">
          {display ||
            field.placeholder ||
            `Select ${field.label.toLowerCase()}`}
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-40" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={(next) => {
              setSearch(next)
              setPage(0)
            }}
            placeholder={`Search ${field.label.toLowerCase()}…`}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading…" : "No match found."}
            </CommandEmpty>
            <CommandGroup>
              {visible.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  data-checked={selected?.value === option.value}
                  onSelect={() => choose(option)}
                >
                  <span className="flex-1 truncate">{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.detail}
                  </span>
                </CommandItem>
              ))}
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
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
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

const CATALOG_PAGE_SIZE = 5

function CalendarField({
  value,
  onChange,
  withTime,
  label,
  placeholder,
  invalid,
}: {
  value: unknown
  onChange: (value: unknown) => void
  withTime?: boolean
  label: string
  placeholder: string
  invalid: boolean
}) {
  const [open, setOpen] = useState(false)
  const raw = typeof value === "string" ? value : ""
  const dateKey = raw.slice(0, 10)
  const timeValue =
    withTime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)
      ? raw.slice(11, 16)
      : ""
  const selected = fromDateKey(dateKey)

  function selectDay(day: Date | undefined) {
    if (!day) {
      onChange("")
      return
    }
    const key = toDateKey(day)
    onChange(withTime ? `${key}T${timeValue || "00:00"}` : key)
    if (!withTime) setOpen(false)
  }

  function selectTime(next: string) {
    if (!dateKey) return
    onChange(`${dateKey}T${next}`)
  }

  const display =
    selected && withTime && timeValue
      ? `${formatDateKey(dateKey)}, ${timeValue}`
      : selected
        ? formatDateKey(dateKey)
        : ""

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={label}
        aria-invalid={invalid || undefined}
        className={cn(
          FIELD_TRIGGER_CLASS,
          !display && "text-muted-foreground"
        )}
      >
        {display || placeholder}
        <CalendarIcon className="size-4 shrink-0 opacity-40" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          disabled={{ after: new Date() }}
          selected={selected}
          onSelect={selectDay}
          captionLayout="dropdown"
        />
        {withTime && (
          <div className="border-t p-2">
            <label className="mb-1 block text-xs font-medium tracking-wide text-muted-foreground">
              Time
            </label>
            <Input
              type="time"
              value={timeValue}
              onChange={(event) => selectTime(event.target.value)}
              aria-label={`${label} time`}
              className="bg-background dark:bg-input/20"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function TextareaStyled({
  value,
  onChange,
  placeholder,
  invalid,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  invalid: boolean
  label: string
}) {
  return (
    <textarea
      data-slot="record-textarea"
      rows={3}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder ?? label}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className="flex w-full resize-none rounded-2xl border border-transparent bg-input/50 px-2.5 py-2 text-sm outline-none transition-[color,box-shadow] duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/20 dark:aria-invalid:border-destructive/50"
    />
  )
}

export function MiniSelect({
  options,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  options: readonly string[]
  value: string
  onChange: (value: unknown) => void
  placeholder: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-invalid={invalid || undefined}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-sm transition-[color,box-shadow] duration-200 outline-none hover:bg-input/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/20",
          !value && "text-muted-foreground"
        )}
      >
        {value || placeholder}
        <CheckIcon
          className={cn(
            "size-4 shrink-0 opacity-40 transition-transform",
            open && "rotate-90"
          )}
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1"
        align="start"
      >
        <Command>
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    onChange(option)
                    setOpen(false)
                  }}
                  data-checked={option === value}
                >
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function StringListEditor({
  field,
  items,
  onChange,
}: {
  field: StringListDef
  items: string[]
  onChange: (items: string[]) => void
}) {
  const [draft, setDraft] = useState("")

  function commit() {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (!items.includes(trimmed)) {
      onChange([...items, trimmed])
    }
    setDraft("")
  }

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <span className="text-xs font-medium tracking-wide text-muted-foreground">
        {field.label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-input/50 px-2 py-1.5 dark:bg-input/20">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              onClick={() => onChange(items.filter((entry) => entry !== item))}
              className="opacity-50 transition-opacity hover:opacity-100"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commit()
            }
          }}
          onBlur={commit}
          placeholder={items.length > 0 ? "Add another…" : field.placeholder}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}

function RowListEditor({
  field,
  rows,
  onChange,
}: {
  field: RowListDef
  rows: Record<string, string>[]
  onChange: (rows: Record<string, string>[]) => void
}) {
  function updateRow(index: number, key: string, value: string) {
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [key]: value } : row
    )
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="text-xs font-medium tracking-wide text-muted-foreground">
        {field.label}
      </span>
      {rows.map((row, index) => (
        <div
          key={index}
          className="rounded-2xl border bg-muted/30 p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium">
              {field.itemLabel} {index + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${field.itemLabel.toLowerCase()} ${index + 1}`}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <XIcon />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {field.fields.map((sub) => (
              <label key={sub.path} className="flex flex-col gap-1">
                <span className="sr-only">{sub.label}</span>
                <Input
                  value={row[sub.path] ?? ""}
                  onChange={(event) =>
                    updateRow(index, sub.path, event.target.value)
                  }
                  placeholder={sub.label}
                  className="bg-background dark:bg-input/20"
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => onChange([...rows, {}])}
      >
        <PlusIcon data-icon="inline-start" />
        Add {field.itemLabel.toLowerCase()}
      </Button>
    </div>
  )
}
