"use client"

import type { NotificationItem as TraceNotification } from "@/lib/actions/notifications"
import { NotificationItem } from "./notification-item"
import { LoadingShimmer } from "./loading-shimmer"
import { EmptyState } from "./empty-state"

interface NotificationListProps {
  notifications: TraceNotification[]
  isLoading: boolean
  activeTab: string
  hasFilters: boolean
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
  onNotificationClick: (notification: TraceNotification) => void
}

export function NotificationList({
  notifications,
  isLoading,
  activeTab,
  hasFilters,
  onMarkAsRead,
  onDelete,
  onNotificationClick,
}: NotificationListProps) {
  return (
    <div className="min-h-[100px]">
      {isLoading ? (
        <LoadingShimmer />
      ) : notifications.length > 0 ? (
        <div className="scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent max-h-[60vh] overflow-y-auto sm:max-h-[400px]">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkAsRead={onMarkAsRead}
              onDelete={onDelete}
              onClick={onNotificationClick}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          type={activeTab === "unread" ? "unread" : "inbox"}
          filtered={hasFilters}
        />
      )}
    </div>
  )
}
