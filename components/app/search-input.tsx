"use client"

import { SearchIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={cn("relative", className)}>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        role="searchbox"
        className="rounded-none pr-8 pl-8"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-none p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
