"use client"

import { createContext, useContext, useMemo, useState } from "react"

import type { CaseStatus } from "@/lib/types"
import type { RecordType } from "@/validations/record"

export type HomeTab = "feed" | "reports"

export type FeedScope = "all" | "mine" | "district" | "country"

export interface CaseFeedFilters {
  type: RecordType | null
  status: CaseStatus | null
  /** Filed-date window (local `yyyy-mm-dd` keys, inclusive). */
  from: string | null
  to: string | null
}

export const EMPTY_CASE_FILTERS: CaseFeedFilters = {
  type: null,
  status: null,
  from: null,
  to: null,
}

interface HomeViewContextValue {
  tab: HomeTab
  setTab: (tab: HomeTab) => void
  feedScope: FeedScope
  setFeedScope: (scope: FeedScope) => void
  caseFilters: CaseFeedFilters
  setCaseFilters: (filters: CaseFeedFilters) => void
}

const HomeViewContext = createContext<HomeViewContextValue | undefined>(undefined)

export function HomeViewProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<HomeTab>("feed")
  const [feedScope, setFeedScope] = useState<FeedScope>("all")
  const [caseFilters, setCaseFilters] = useState<CaseFeedFilters>(EMPTY_CASE_FILTERS)

  const value = useMemo(
    () => ({ tab, setTab, feedScope, setFeedScope, caseFilters, setCaseFilters }),
    [tab, feedScope, caseFilters]
  )

  return (
    <HomeViewContext.Provider value={value}>
      {children}
    </HomeViewContext.Provider>
  )
}

export function useHomeView() {
  const context = useContext(HomeViewContext)
  if (!context) {
    throw new Error("useHomeView must be used within a HomeViewProvider")
  }
  return context
}
