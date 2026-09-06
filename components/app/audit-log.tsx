"use client"

import { useQuery } from "@tanstack/react-query"

import { getAuditLog } from "@/lib/actions/access"
import { formatDateTime } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"

/** Scoped audit viewer. Auditors see this only — no case drill-down. */
export function AuditLog({ limit = 50 }: { limit?: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-log", limit],
    queryFn: () => getAuditLog(limit),
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
      <p className="rounded-3xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        Could not load the audit log.
      </p>
    )
  }

  if (!data || data.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        No audit entries yet.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((entry) => (
        <li key={entry.id} className="rounded-3xl border bg-card px-4 py-3">
          <p className="text-sm font-medium">
            {entry.actorName} · {entry.action.replace(/_/g, " ")}
          </p>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {formatDateTime(entry.at)}
          </p>
          {entry.detail && (
            <p className="mt-1 text-sm text-muted-foreground">{entry.detail}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
