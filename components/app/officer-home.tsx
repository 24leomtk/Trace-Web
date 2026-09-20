"use client"

import { AnalyticsFeed } from "@/components/app/analytics-feed"
import { AssignmentQueue } from "@/components/app/assignment-queue"
import { LocateQueue } from "@/components/app/locate-queue"
import { RecordTimeline } from "@/components/app/record-timeline"
import { TabGroup } from "@/components/app/tab-group"
import {
  useHomeView,
  type FeedScope,
} from "@/providers/home-view-context"
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
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMonitor && (
            <TabGroup
              label="Home view"
              options={[
                { value: "feed", label: "Cases" },
                { value: "reports", label: "Reports" },
              ]}
              value={tab}
              onChange={setTab}
            />
          )}
          {(tab === "feed" || !isMonitor) && (
            <TabGroup
              label="Case scope"
              options={scopes}
              value={feedScope}
              onChange={setFeedScope}
            />
          )}
        </div>
      </header>

      <AssignmentQueue />

      <LocateQueue />

      {tab === "reports" && isMonitor ? <AnalyticsFeed /> : <RecordTimeline />}
    </div>
  )
}
