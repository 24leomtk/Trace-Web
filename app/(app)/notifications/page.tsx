"use client"

import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notifications"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(),
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["notifications"] })
    await queryClient.invalidateQueries({ queryKey: ["unread-count"] })
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Referrals, outcomes, status changes, reviews.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await markAllNotificationsRead()
            await refresh()
          }}
        >
          Mark all read
        </Button>
      </header>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !data || data.length === 0 ? (
        <p className="rounded-3xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Nothing yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((item) => (
            <li
              key={item.id}
              className={`rounded-3xl border bg-card px-4 py-3 ${item.isRead ? "opacity-70" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm">{item.message}</p>
                  <p className="mt-0.5 text-[11px] tracking-wide text-muted-foreground uppercase">
                    {item.type.replace(/_/g, " ")} · {formatDateTime(item.createdAt)}
                  </p>
                </div>
                {!item.isRead && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await markNotificationRead(item.id)
                      await refresh()
                    }}
                  >
                    Mark read
                  </Button>
                )}
              </div>
              {item.recordId && (
                <Link
                  href={`/records/${item.recordId}`}
                  className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
                >
                  Open case
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
