"use client"

import Link from "next/link"
import { ArrowLeftIcon, ExternalLinkIcon, Trash2Icon } from "lucide-react"

import type { NotificationItem as TraceNotification } from "@/lib/actions/notifications"
import { formatDateShort } from "@/lib/format"
import { Button } from "@/components/ui/button"

interface NotificationDetailsProps {
  notification: TraceNotification
  onBack: () => void
  onDelete: (id: string) => void
}

export function NotificationDetails({
  notification,
  onBack,
  onDelete,
}: NotificationDetailsProps) {
  const handleDelete = () => {
    onDelete(notification.id)
    onBack()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to notifications"
            className="h-8 w-8 shrink-0 hover:bg-muted"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <span className="truncate text-sm font-medium tracking-wide uppercase">
            {notification.type.replace(/_/g, " ")}
          </span>
        </div>
        {notification.recordId && (
          <Button asChild size="icon" variant="ghost" aria-label="Open case">
            <Link href={`/records/${notification.recordId}`}>
              <ExternalLinkIcon className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5">
          {/* Metadata — single, quiet line, no icons */}
          <span className="mt-1.5 text-xs text-muted-foreground">
            {formatDateShort(notification.createdAt)}
          </span>
          {/* Divider separating metadata from the message */}
          <div className="mt-4 border-t" />

          {/* Message — full width, no boxed container */}
          <p className="mt-4 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
            {notification.message}
          </p>

          {notification.recordId && (
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href={`/records/${notification.recordId}`}>Open case</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Actions Footer */}
      <div className="border-t bg-muted/20 px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          className="w-full gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
        >
          <Trash2Icon className="h-4 w-4" />
          Dismiss
        </Button>
      </div>
    </div>
  )
}
