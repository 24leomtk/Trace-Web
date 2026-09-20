"use client"

import { useQuery } from "@tanstack/react-query"

import { getAccessReview } from "@/lib/actions/admin"
import { formatDateShort } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"
import { RowListSkeleton } from "@/components/app/list-skeletons"

/**
 * Phase 6: periodic access recertification. Who holds an account, what
 * scope it carries, when it was last used, and where guards are biting
 * (blocked transitions). Dormant accounts get deactivated from /admin/users.
 */
export function AccessReviewBoard() {
  const reviewQuery = useQuery({
    queryKey: ["access-review"],
    queryFn: getAccessReview,
  })

  if (reviewQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-none border bg-card p-4">
          <Skeleton className="h-3 w-24" />
          <div className="flex gap-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-none border bg-card p-4">
          <Skeleton className="h-3 w-36" />
          <RowListSkeleton count={4} />
        </div>
      </div>
    )
  }

  if (reviewQuery.isError || !reviewQuery.data) {
    return (
      <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
        {reviewQuery.error instanceof Error
          ? reviewQuery.error.message
          : "Could not load access review."}
      </p>
    )
  }

  const review = reviewQuery.data
  const flagged = review.users.filter(
    (user) => user.dormant || user.rejectedTransitions > 0 || !user.isActive
  )

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Summary
        </h2>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Accounts</dt>
            <dd className="font-medium">{review.users.length}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Dormant active (&gt;90d)</dt>
            <dd className="font-medium">{review.dormantCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Blocked transitions (30d)</dt>
            <dd className="font-medium">{review.rejectedTotal}</dd>
          </div>
        </dl>
        {review.dormantCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Deactivate leavers from Manage users — dormant accounts are the
            cheapest privilege to revoke.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Needs attention ({flagged.length})
        </h2>
        {flagged.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing flagged — every account was used recently and no guard is
            biting repeatedly.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {flagged.map((user) => (
              <li
                key={user.id}
                className="rounded-none border px-3 py-2 text-sm"
              >
                <span className="font-medium">{user.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {user.role.replace(/_/g, " ")} · {user.scope}
                  {!user.isActive ? " · DEACTIVATED" : ""}
                  {user.dormant
                    ? ` · dormant${user.lastActiveAt ? ` since ${formatDateShort(user.lastActiveAt)}` : ""}`
                    : ""}
                  {user.rejectedTransitions > 0
                    ? ` · ${user.rejectedTransitions} blocked`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
