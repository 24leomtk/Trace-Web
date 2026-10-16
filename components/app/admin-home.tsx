"use client"

import { AnalyticsFeed } from "@/components/app/analytics-feed"

export function AdminHome() {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">System overview</h1>
        <p className="text-sm text-muted-foreground">
          National analytics across all domains and districts.
        </p>
      </header>
      <AnalyticsFeed />
    </div>
  )
}
