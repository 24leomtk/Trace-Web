import { BellOffIcon, CheckIcon } from "lucide-react"

interface EmptyStateProps {
  type: "inbox" | "unread"
  filtered?: boolean
}

export function EmptyState({ type, filtered }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16">
      <div className="relative mb-6">
        <div className="flex h-16 w-16 items-center justify-center bg-muted/30">
          <BellOffIcon className="h-8 w-8 text-muted-foreground/40" />
        </div>
        {!filtered && (
          <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center bg-green-100 dark:bg-green-900/30">
            <CheckIcon className="h-3 w-3 text-green-600 dark:text-green-400" />
          </div>
        )}
      </div>
      <h3 className="mb-2 text-base font-semibold text-foreground">
        {filtered
          ? "No matching notifications"
          : type === "unread"
            ? "Nothing unread"
            : "All caught up"}
      </h3>
      <p className="max-w-60 text-center text-sm leading-relaxed text-muted-foreground">
        {filtered
          ? "Try a different search or clear the type filter."
          : type === "unread"
            ? "Referrals, outcomes, status changes and reviews will appear here."
            : "You will be notified here about referrals, outcomes, status changes and reviews."}
      </p>
    </div>
  )
}
