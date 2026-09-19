"use client"

import { RefreshCwIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Icon-only refresh next to a search bar. Every list view pairs this with
 * its SearchInput so a stale react-query cache is one tap away.
 */
export function ListRefreshButton({
  onRefresh,
  loading,
  label = "Refresh list",
  className,
}: {
  onRefresh: () => void | Promise<void>
  loading?: boolean
  label?: string
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      disabled={loading}
      onClick={() => void onRefresh()}
      className={cn("shrink-0 rounded-none", className)}
    >
      <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
    </Button>
  )
}
