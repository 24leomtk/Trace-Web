"use client"

import { useState } from "react"
import { CalendarIcon, XIcon } from "lucide-react"

import { formatDateKey, fromDateKey, toDateKey } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  min?: string
  max?: string
  allowClear?: boolean
  className?: string
}

/**
 * Shadcn date picker built on Calendar + Popover.
 * Value is a `yyyy-mm-dd` key to match the rest of the app.
 */
export function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Select date",
  min,
  max,
  allowClear = true,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? fromDateKey(value) : undefined

  function selectDay(day: Date | undefined) {
    onChange(day ? toDateKey(day) : "")
    setOpen(false)
  }

  const minDate = min ? fromDateKey(min) : undefined
  const maxDate = max ? fromDateKey(max) : undefined
  const disabled =
    minDate || maxDate
      ? {
          before: minDate,
          after: maxDate ?? new Date(8640000000000000),
        }
      : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("flex w-full gap-1.5", className)}>
        <PopoverTrigger
          type="button"
          aria-label={label}
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-none border border-transparent bg-input/50 px-2.5 py-1 text-sm transition-[color,box-shadow] duration-200 outline-none hover:bg-input/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
            !selected && "text-muted-foreground"
          )}
        >
          <span className="truncate">
            {selected ? formatDateKey(value) : placeholder}
          </span>
          <CalendarIcon className="size-4 shrink-0 opacity-40" />
        </PopoverTrigger>
        {allowClear && value && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Clear ${label}`}
            onClick={() => onChange("")}
            className="shrink-0"
          >
            <XIcon />
          </Button>
        )}
      </div>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={selectDay}
          disabled={disabled}
          captionLayout="dropdown"
        />
      </PopoverContent>
    </Popover>
  )
}
