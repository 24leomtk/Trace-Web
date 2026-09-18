"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

interface NotificationPaginationProps {
  currentPage: number
  totalPages: number
  totalNotifications: number
  onPageChange: (page: number) => void
}

export function NotificationPagination({
  currentPage,
  totalPages,
  totalNotifications,
  onPageChange,
}: NotificationPaginationProps) {
  return (
    <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2">
      <span className="text-[10px] text-muted-foreground">
        {totalNotifications} total
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className="h-6 w-6 hover:bg-background"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
        </Button>
        <span className="min-w-12 text-center text-[10px] font-medium">
          {currentPage} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className="h-6 w-6 hover:bg-background"
        >
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
