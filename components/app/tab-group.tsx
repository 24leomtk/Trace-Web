"use client"

import { cn } from "@/lib/utils"

export interface TabGroupOption<T extends string> {
  value: T
  label: string
  /** Appended as " (n)" when non-null — e.g. pending counts. */
  count?: number | null
}

/**
 * Compact tab bar for page header rows — small buttons that share one row
 * with the page title on wide screens and wrap on small ones. Replaces the
 * old full-width stretched tab bars.
 */
export function TabGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string
  options: TabGroupOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "flex gap-1 rounded-none border bg-muted/40 p-1",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-none px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors",
            value === option.value
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
          {option.count != null && ` (${option.count})`}
        </button>
      ))}
    </div>
  )
}
