"use client"

import { useQuery } from "@tanstack/react-query"

import { getAuditLog } from "@/lib/actions/access"
import { formatDateTime } from "@/lib/format"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListPagination } from "@/components/app/list-pagination"
import { SearchInput } from "@/components/app/search-input"
import { Skeleton } from "@/components/ui/skeleton"

/** Scoped audit viewer. Auditors see this only — no case drill-down. */
export function AuditLog({ limit = 100 }: { limit?: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-log", limit],
    queryFn: () => getAuditLog(limit),
  })

  const {
    query,
    setQuery,
    debouncedQuery,
    page,
    setPage,
    pageCount,
    total,
    visible,
  } = usePaginatedSearch({
    items: data ?? [],
    search: (entry, q) =>
      `${entry.actorName} ${entry.action.replace(/_/g, " ")} ${entry.detail ?? ""}`
        .toLowerCase()
        .includes(q),
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        Could not load the audit log.
      </p>
    )
  }

  if (!data || data.length === 0) {
    return (
      <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        No audit entries yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search actor, action, detail…"
      />
      {visible.length === 0 ? (
        <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No audit entries match “{debouncedQuery}”.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {visible.map((entry) => (
              <li
                key={entry.id}
                className="rounded-none border bg-card px-4 py-3"
              >
                <p className="text-sm font-medium">
                  {entry.actorName} · {entry.action.replace(/_/g, " ")}
                </p>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {formatDateTime(entry.at)}
                </p>
                {entry.detail && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {entry.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <ListPagination
            page={page}
            pageCount={pageCount}
            onPage={setPage}
            total={total}
          />
        </>
      )}
    </div>
  )
}
