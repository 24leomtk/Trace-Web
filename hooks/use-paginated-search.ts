"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebounce } from "use-debounce"

import { DEFAULT_PAGE_SIZE } from "@/components/app/list-pagination"

/**
 * Debounced search + 12-per-page client pagination for secondary lists.
 * Server actions return the full (capped) list; filtering + paging stays
 * local so every list behaves the same without new endpoints.
 *
 * Pagination is driven by the same filtered array the search produces, so
 * the page count/total always reflect the active query. `resetKey` covers
 * filters that live outside this hook (dropdowns, tabs, date ranges):
 * pass a stable string derived from them so a filter change jumps back to
 * page one even when the result length happens to stay the same.
 */
export function usePaginatedSearch<T>({
  items,
  search,
  pageSize = DEFAULT_PAGE_SIZE,
  debounceMs = 300,
  resetKey = "",
}: {
  items: T[]
  search: (item: T, query: string) => boolean
  pageSize?: number
  debounceMs?: number
  resetKey?: string
}) {
  const [query, setQueryState] = useState("")
  const [debouncedQuery] = useDebounce(query.trim().toLowerCase(), debounceMs)
  const [page, setPage] = useState(0)

  // Inline `search` callbacks change identity every render; keep the latest
  // in a ref so filtering doesn't churn on every parent render.
  const searchRef = useRef(search)
  searchRef.current = search

  const filtered = useMemo(() => {
    if (!debouncedQuery) return items
    const match = searchRef.current
    return items.filter((item) => match(item, debouncedQuery))
  }, [items, debouncedQuery])

  // Typing filters immediately: jump to page one without waiting for the
  // debounce, otherwise pagination shows the old page/total for ~300ms.
  const setQuery = useCallback((next: string) => {
    setQueryState(next)
    setPage(0)
  }, [])

  useEffect(() => {
    setPage(0)
  }, [debouncedQuery, resetKey, items.length])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  // Clamp real state (not just the derived value) so clearing a filter or
  // query can't snap back to a stale high page left over from before.
  useEffect(() => {
    setPage((prev) => Math.min(prev, pageCount - 1))
  }, [pageCount])
  const safePage = Math.min(page, pageCount - 1)
  const visible = useMemo(
    () => filtered.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [filtered, safePage, pageSize]
  )

  return {
    query,
    setQuery,
    debouncedQuery,
    page: safePage,
    setPage,
    pageCount,
    total: filtered.length,
    visible,
  }
}
