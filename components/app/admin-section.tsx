"use client"

import { useState } from "react"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, TriangleAlertIcon } from "lucide-react"

import { formatDateKey, fromDateKey, toDateKey } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function AdminSection({
  title,
  description,
  icon,
  action,
  children,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[min(var(--radius-3xl),20px)] border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground [&_svg]:size-4">
            {icon}
          </div>
          <div>
            <h3 className="text-[15px] font-medium">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export function AdminListPagination({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (page: number) => void
}) {
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-between pt-1">
      <span className="text-xs text-muted-foreground">
        Page {page + 1} of {pageCount}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeftIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRightIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function AdminField({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

const adminTriggerClassName =
  "flex h-8 w-full items-center justify-between gap-2 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-sm transition-[color,box-shadow] duration-200 outline-none hover:bg-input/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

export interface AdminComboboxOption {
  value: string
  label: string
  detail?: string
}

/** Searchable single-select built on the shared combobox primitive. */
export function AdminCombobox({
  value,
  onChange,
  options,
  placeholder,
  label,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: AdminComboboxOption[]
  placeholder: string
  label: string
  disabled?: boolean
}) {
  const selected = options.find((option) => option.value === value) ?? null
  // Portal the popup into the surrounding dialog (when there is one) so the
  // dialog's focus trap and dismiss handling treat it as inside. Falls back
  // to <body> when the combobox is used on a plain page.
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  return (
    <span
      ref={(element) => {
        setPortalContainer(
          element?.closest('[data-slot="dialog-content"]') as HTMLElement | null
        )
      }}
      className="contents"
    >
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next) => onChange(next?.value ?? "")}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
    >
      <ComboboxTrigger
        type="button"
        aria-label={label}
        disabled={disabled}
        className={cn(adminTriggerClassName, !selected && "text-muted-foreground")}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
      </ComboboxTrigger>
      <ComboboxContent container={portalContainer ?? undefined} className="w-[var(--anchor-width)]">
        <ComboboxInput placeholder={`Search ${label.toLowerCase()}…`} showTrigger={false} />
        <ComboboxSeparator />
        <ComboboxEmpty>No match found.</ComboboxEmpty>
        <ComboboxList>
          {options.map((option) => (
            <ComboboxItem key={option.value || "empty"} value={option}>
              <span className="flex-1 truncate">{option.label}</span>
              {option.detail && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {option.detail}
                </span>
              )}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
    </span>
  )
}

/** Date picker built on the shared calendar inside a popover. */
export function AdminDateField({
  value,
  onChange,
  label,
  placeholder = "Select date",
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? fromDateKey(value) : undefined

  function selectDay(day: Date | undefined) {
    onChange(day ? toDateKey(day) : "")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={label}
        className={cn(adminTriggerClassName, !selected && "text-muted-foreground")}
      >
        <span className="truncate">
          {selected ? formatDateKey(value) : placeholder}
        </span>
        <CalendarIcon className="size-4 shrink-0 opacity-40" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={selectDay}
          disabled={{ after: new Date() }}
          captionLayout="dropdown"
        />
      </PopoverContent>
    </Popover>
  )
}

export function AdminSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
    />
  )
}

/** Accessible on/off switch built on a button — mirrors the app's rounded tokens. */
export function AdminToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform",
          checked && "translate-x-5"
        )}
      />
    </button>
  )
}

/**
 * Two-step destructive confirmation. Step one spells out what else goes away
 * with the item; step two requires typing the item's full name. Mount keyed
 * by the target id so step/input state resets for every target.
 */export function AdminDeleteDialog({
  title,
  intro,
  consequences,
  requireText,
  requireLabel,
  confirmLabel,
  deleting,
  onConfirm,
  onClose,
}: {
  title: string
  intro: string
  consequences: string[]
  requireText: string
  requireLabel: string
  confirmLabel: string
  deleting?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const [step, setStep] = useState<"warn" | "confirm">("warn")
  const [typed, setTyped] = useState("")
  const matches = typed.trim() === requireText.trim() && requireText.trim() !== ""

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        {step === "warn" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <TriangleAlertIcon className="text-destructive" />
              </AlertDialogMedia>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{intro}</AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="flex flex-col gap-1.5 rounded-2xl bg-muted/50 px-3 py-2.5 text-left text-sm">
              {consequences.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
              {/* Plain button: AlertDialogAction would dismiss the dialog
                  instead of advancing to the typing step. */}
              <Button type="button" onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <TriangleAlertIcon className="text-destructive" />
              </AlertDialogMedia>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>
                {requireLabel} <span className="font-medium text-foreground">“{requireText}”</span> to
                confirm. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={requireText}
              aria-label={requireLabel}
              autoComplete="off"
            />
            <AlertDialogFooter>
              <Button variant="ghost" onClick={() => setStep("warn")}>
                Back
              </Button>
              {/* Plain button: keeps the dialog open on failure so the error
                  toast has context; the parent closes it on success. */}
              <Button
                type="button"
                variant="destructive"
                disabled={!matches || deleting}
                onClick={onConfirm}
              >
                {deleting ? "Deleting…" : confirmLabel}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** "3 case records" / "1 case record" for delete-preview bullets. */
export function pluralCount(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}
