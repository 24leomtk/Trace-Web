"use client"

import { useEffect, useMemo, useState } from "react"
import { useDebounce } from "use-debounce"

import { DEFAULT_PAGE_SIZE } from "@/components/app/list-pagination"

/**
 * Debounced search + 12-per-page client pagination for secondary lists.
 * Server actions return the full (capped) list; filtering + paging stays
 * local so every list behaves the same without new endpoints.
 */
export function usePaginatedSearch<T>({
  items,
  search,
  pageSize = DEFAULT_PAGE_SIZE,
  debounceMs = 300,
}: {
  items: T[]
  search: (item: T, query: string) => boolean
  pageSize?: number
  debounceMs?: number
}) {
  const [query, setQuery] = useState("")
  const [debouncedQuery] = useDebounce(query.trim().toLowerCase(), debounceMs)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    if (!debouncedQuery) return items
    return items.filter((item) => search(item, debouncedQuery))
  }, [items, debouncedQuery, search])

  useEffect(() => {
    setPage(0)
  }, [debouncedQuery, items.length])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
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
