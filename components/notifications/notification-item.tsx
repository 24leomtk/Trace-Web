"use client"

import Link from "next/link"
import { CheckIcon, Trash2Icon } from "lucide-react"

import type { NotificationItem as TraceNotification } from "@/lib/actions/notifications"
import { formatNotificationTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface NotificationItemProps {
  notification: TraceNotification
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
  onClick: (notification: TraceNotification) => void
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onClick,
}: NotificationItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(notification)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onClick(notification)
        }
      }}
      className={cn(
        "group relative cursor-pointer border-b border-l-2 px-3 py-2.5 transition-all duration-200 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-ring/40",
        !notification.isRead &&
          "border-l-primary bg-primary/5 dark:bg-primary/20",
        notification.isRead &&
          "border-l-transparent sm:hover:border-l-muted-foreground/20",
        "sm:hover:bg-muted/15"
      )}
    >
      <div className="flex flex-col gap-2">
        <p
          className={cn(
            "line-clamp-2 text-xs leading-relaxed text-foreground transition-colors duration-200",
            !notification.isRead && "font-medium"
          )}
        >
          {notification.message}
        </p>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <span className="shrink-0 tracking-wide uppercase">
              {notification.type.replace(/_/g, " ")}
            </span>
            <span aria-hidden="true" className="text-muted-foreground/40">
              •
            </span>
            <span className="truncate">
              {formatNotificationTime(notification.createdAt)}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            {!notification.isRead && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Mark as read"
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkAsRead(notification.id)
                }}
                className="h-6 w-6 bg-primary/10 p-0 sm:bg-transparent sm:hover:bg-primary/10 dark:bg-primary/20 sm:dark:hover:bg-primary/20"
              >
                <CheckIcon className="h-3 w-3 text-primary" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              aria-label="Dismiss notification"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(notification.id)
              }}
              className="h-6 w-6 bg-red-100 p-0 sm:bg-transparent sm:hover:bg-red-100 dark:bg-red-900/30 sm:dark:hover:bg-red-900/20"
            >
              <Trash2Icon className="h-3 w-3 text-red-600" />
            </Button>
          </div>
        </div>

        {notification.recordId && (
          <Link
            href={`/records/${notification.recordId}`}
            onClick={(e) => e.stopPropagation()}
            className="w-fit text-xs font-medium text-primary hover:underline"
          >
            Open case
          </Link>
        )}
      </div>
    </div>
  )
}
