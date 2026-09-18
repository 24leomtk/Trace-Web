"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export const DEFAULT_PAGE_SIZE = 12

export function ListPagination({
  page,
  pageCount,
  onPage,
  total,
}: {
  page: number
  pageCount: number
  onPage: (page: number) => void
  total?: number
}) {
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-between pt-1">
      <span className="text-xs text-muted-foreground">
        Page {page + 1} of {pageCount}
        {typeof total === "number" && ` · ${total} result${total === 1 ? "" : "s"}`}
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
