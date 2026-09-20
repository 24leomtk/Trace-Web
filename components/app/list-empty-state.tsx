import { cn } from "@/lib/utils"

/**
 * Shaped empty state for lists — keeps the list's visual footprint with
 * ghost rows/cards so a section still reads as a list when it has no data,
 * instead of collapsing to a lone line of text.
 */
export function ListEmptyState({
  message,
  hint,
  className,
}: {
  message: string
  hint?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-none border border-dashed px-4 py-24",
        className
      )}
    >
      <div className="flex flex-col gap-0.5 text-center">
        <p className="text-sm font-medium">{message}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
}
