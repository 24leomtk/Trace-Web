"use client"

import { useEffect, useRef } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"

interface UseInfiniteListOptions<T> {
  key: string
  fetchPage: (cursor: number | null) => Promise<{
    items: T[]
    nextCursor: number | null
  }>
}

/**
 * IntersectionObserver-driven infinite list backed by TanStack Query's
 * useInfiniteQuery for caching/deduping. Offset-cursor semantics.
 * The first page is fetched by useInfiniteQuery itself.
 */
export function useInfiniteList<T>({ key, fetchPage }: UseInfiniteListOptions<T>) {
  const query = useInfiniteQuery({
    queryKey: ["infinite-list", key],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)

  // Re-run when the key changes so the observer attaches to fresh nodes.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        if (
          !loadingRef.current &&
          query.hasNextPage &&
          !query.isFetchingNextPage &&
          !query.isLoading
        ) {
          loadingRef.current = true
          void query
            .fetchNextPage()
            .catch(() => {})
            .finally(() => {
              loadingRef.current = false
            })
        }
      },
      { rootMargin: "400px 0px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [key, query.hasNextPage, query.isFetchingNextPage, query.isLoading])

  const items = query.data?.pages.flatMap((page) => page.items) ?? []

  return {
    items,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetching && !query.isLoading,
    hasMore: query.hasNextPage ?? true,
    sentinelRef,
    retry: () => query.refetch(),
  }
}
