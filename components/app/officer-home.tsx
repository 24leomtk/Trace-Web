"use client"

import { cn } from "@/lib/utils"
import { AnalyticsFeed } from "@/components/app/analytics-feed"
import { AssignmentQueue } from "@/components/app/assignment-queue"
import { RecordTimeline } from "@/components/app/record-timeline"
import { useHomeView, type FeedScope, type HomeTab } from "@/providers/home-view-context"
import { useUser } from "@/providers/user-context"

const SCOPE_TABS: { value: FeedScope; label: string }[] = [
  { value: "all", label: "All visible" },
  { value: "mine", label: "My branch" },
  { value: "district", label: "District" },
  { value: "country", label: "National" },
]

export function OfficerHome() {
  const { user } = useUser()
  const { tab, setTab, feedScope, setFeedScope } = useHomeView()
  const isMonitor =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"
  // Country monitors have no district; district tab maps to the national feed.
  const scopes: { value: FeedScope; label: string }[] =
    user.role === "COUNTRY_MONITOR"
      ? [
          { value: "all", label: "All visible" },
          { value: "mine", label: "Filed by me" },
          { value: "country", label: "National" },
        ]
      : user.role === "DISTRICT_MONITOR"
        ? [
            { value: "all", label: "All district" },
            { value: "mine", label: "Filed by me" },
            { value: "country", label: "National" },
          ]
        : SCOPE_TABS

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">
          {user.role === "OFFICER"
            ? "Branch cases"
            : user.role === "DISTRICT_MONITOR"
              ? "District oversight"
              : "National oversight"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {user.posting ?? user.district ?? user.domain}
        </p>
      </header>

      <AssignmentQueue />

      {isMonitor && (
        <div className="flex gap-1 rounded-full border bg-muted/40 p-1">
          {(["feed", "reports"] as HomeTab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                tab === value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {value === "feed" ? "Cases" : "Reports"}
            </button>
          ))}
        </div>
      )}

      {(tab === "feed" || !isMonitor) && (
        <div
          role="tablist"
          aria-label="Case scope"
          className="flex gap-1 overflow-x-auto rounded-full border bg-muted/40 p-1"
        >
          {scopes.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={feedScope === option.value}
              onClick={() => setFeedScope(option.value)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                feedScope === option.value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {tab === "reports" && isMonitor ? <AnalyticsFeed /> : <RecordTimeline />}
    </div>
  )
}
