"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

import { getMyReferrals } from "@/lib/actions/records"
import { formatDateTime } from "@/lib/format"
import { RECORD_TYPE_META } from "@/lib/record-meta"
import { Skeleton } from "@/components/ui/skeleton"

export function CourtHome() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-referrals"],
    queryFn: getMyReferrals,
  })

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Referred cases</h1>
        <p className="text-sm text-muted-foreground">
          Only cases explicitly referred to you appear here.
        </p>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="rounded-3xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Could not load referrals.
        </p>
      ) : !data || data.length === 0 ? (
        <p className="rounded-3xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No active referrals. Access expires unless a monitor renews it.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((entry) => {
            const meta = RECORD_TYPE_META[entry.record.recordType]
            return (
              <li key={entry.referralId}>
                <Link
                  href={`/records/${entry.record.id}`}
                  className="block rounded-3xl border bg-card px-4 py-3 transition-colors hover:bg-accent"
                >
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {meta.label}
                    {entry.expiresAt &&
                      ` · access until ${formatDateTime(entry.expiresAt)}`}
                  </p>
                  <p className="mt-0.5 text-[15px] font-medium">
                    {entry.record.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {entry.record.summary}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
