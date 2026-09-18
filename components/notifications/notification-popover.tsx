"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDebounce } from "use-debounce"
import { BellIcon, XIcon } from "lucide-react"

import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
  type NotificationItem as TraceNotification,
} from "@/lib/actions/notifications"
import { useIsLargeScreen } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  NotificationHeader,
  type NotificationTab,
  type TraceNotificationFilters,
} from "./notification-header"
import { NotificationList } from "./notification-list"
import { NotificationPagination } from "./notification-pagination"
import { NotificationDetails } from "./notification-details"

type ViewState = "list" | "details"

const ITEMS_PER_PAGE = 6

export function NotificationPopover() {
  const queryClient = useQueryClient()
  const isLarge = useIsLargeScreen()
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<NotificationTab>("all")
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch] = useDebounce(searchInput.trim().toLowerCase(), 300)
  const [filters, setFilters] = useState<TraceNotificationFilters>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [viewState, setViewState] = useState<ViewState>("list")
  const [selectedNotification, setSelectedNotification] =
    useState<TraceNotification | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(100),
    enabled: isOpen,
    refetchOnWindowFocus: false,
  })
  const { data: unread } = useQuery({
    queryKey: ["unread-count"],
    queryFn: unreadNotificationCount,
    refetchInterval: 60_000,
  })

  const unreadCount = unread ?? 0
  const all = useMemo(() => data ?? [], [data])

  const filtered = useMemo(() => {
    return all.filter((item) => {
      if (activeTab === "unread" && item.isRead) return false
      if (filters.type && item.type !== filters.type) return false
      if (debouncedSearch) {
        const haystack =
          `${item.message} ${item.type.replace(/_/g, " ")}`.toLowerCase()
        if (!haystack.includes(debouncedSearch)) return false
      }
      return true
    })
  }, [all, activeTab, filters.type, debouncedSearch])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const visible = filtered.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, filters.type, debouncedSearch])

  // Reset transient view state when the popover closes.
  useEffect(() => {
    if (!isOpen) {
      setIsSearchMode(false)
      setSearchInput("")
      setViewState("list")
      setSelectedNotification(null)
      setCurrentPage(1)
    }
  }, [isOpen])

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["notifications"] })
    await queryClient.invalidateQueries({ queryKey: ["unread-count"] })
  }

  async function handleMarkAsRead(id: string) {
    await markNotificationRead(id)
    await refresh()
  }

  async function handleDelete(id: string) {
    await deleteNotification(id)
    await refresh()
  }

  async function handleMarkAllAsRead() {
    await markAllNotificationsRead()
    await refresh()
  }

  function handleNotificationClick(notification: TraceNotification) {
    setSelectedNotification(notification)
    setViewState("details")
    if (!notification.isRead) void handleMarkAsRead(notification.id)
  }

  function handleBackToList() {
    setViewState("list")
    setSelectedNotification(null)
  }

  function handleTabChange(tab: NotificationTab) {
    setActiveTab(tab)
    setCurrentPage(1)
  }

  function resetFilters() {
    setFilters({})
    setCurrentPage(1)
  }

  const hasActiveFilters =
    filters.type !== undefined || debouncedSearch !== "" || activeTab !== "all"

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`Notifications${unreadCount > 0 ? ` · ${unreadCount} unread` : ""}`}
              className={cn(
                "size-10 text-muted-foreground hover:text-foreground",
                isOpen && "bg-secondary text-secondary-foreground"
              )}
            >
              <span className="relative">
                <BellIcon className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side={isLarge ? "left" : "top"}>
          Notifications
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-[calc(100vw-2rem)] overflow-hidden border border-border/40 bg-background p-0 shadow-2xl sm:w-100"
        align="end"
        side={isLarge ? "left" : "top"}
        sideOffset={8}
      >
        {viewState === "details" && selectedNotification ? (
          <NotificationDetails
            notification={selectedNotification}
            onBack={handleBackToList}
            onDelete={handleDelete}
          />
        ) : (
          <>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-5 px-1.5 text-[10px] font-medium"
                  >
                    {unreadCount} New
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleMarkAllAsRead()}
                    className="h-7 px-2 text-[10px] font-medium text-muted-foreground hover:text-primary"
                  >
                    Mark all read
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-muted"
                  aria-label="Close notifications"
                  onClick={() => setIsOpen(false)}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <NotificationHeader
              activeTab={activeTab}
              isSearchMode={isSearchMode}
              searchInput={searchInput}
              filters={filters}
              hasActiveFilters={hasActiveFilters}
              onTabChange={handleTabChange}
              onSearchToggle={() => {
                setIsSearchMode((mode) => {
                  if (mode) setSearchInput("")
                  return !mode
                })
              }}
              onSearchInputChange={setSearchInput}
              onFiltersChange={setFilters}
              onResetFilters={resetFilters}
            />

            <NotificationList
              notifications={visible}
              isLoading={isLoading}
              activeTab={activeTab}
              hasFilters={hasActiveFilters}
              onMarkAsRead={(id) => void handleMarkAsRead(id)}
              onDelete={(id) => void handleDelete(id)}
              onNotificationClick={handleNotificationClick}
            />

            {filtered.length > ITEMS_PER_PAGE && (
              <NotificationPagination
                currentPage={safePage}
                totalPages={totalPages}
                totalNotifications={filtered.length}
                onPageChange={setCurrentPage}
              />
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
