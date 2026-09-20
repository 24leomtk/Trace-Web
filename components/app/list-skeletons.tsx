import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * Shared loading shells — every shell mirrors its loaded layout
 * (same gaps, same card/grid/row shapes) so route transitions
 * don't shift. All wrappers are aria-hidden; pages add their own
 * aria-busy / live region.
 */

export function PageHeaderSkeleton({
  titleWidth = "w-40",
  subWidth = "w-64",
  withActions = false,
}: {
  titleWidth?: string
  subWidth?: string
  withActions?: boolean
}) {
  return (
    <header className="flex items-start justify-between gap-3" aria-hidden="true">
      <div className="flex flex-col gap-1.5">
        <Skeleton className={cn("h-5", titleWidth)} />
        <Skeleton className={cn("h-4", subWidth)} />
      </div>
      {withActions && (
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      )}
    </header>
  )
}

export function FilterBarSkeleton({
  withFilter = true,
  withRefresh = true,
}: {
  withFilter?: boolean
  withRefresh?: boolean
}) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <div className="flex items-start gap-2">
        <Skeleton className="h-10 flex-1" />
        {withRefresh && <Skeleton className="size-10 shrink-0" />}
        {withFilter && <Skeleton className="size-10 shrink-0" />}
      </div>
    </div>
  )
}

export function ScopeTabBarSkeleton({ tabs = 4 }: { tabs?: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex gap-1 overflow-hidden rounded-none border bg-muted/40 p-1"
    >
      {Array.from({ length: tabs }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-20" />
      ))}
    </div>
  )
}

export function StatChipsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-36" />
      ))}
    </div>
  )
}

/** Mirrors RecordTimeline's TimelineSkeleton: thumb + 4 lines per card. */
export function TimelineListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, row) => (
        <div key={row} className="rounded-none border p-4">
          <div className="flex gap-3">
            <Skeleton className="hidden h-24 w-36 shrink-0 sm:block" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Mirrors court/registrar/tax/insurer grids: 1col lg:2col bordered cards. */
export function GridCardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul
      aria-hidden="true"
      className="grid grid-cols-1 gap-2 lg:grid-cols-2"
    >
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="flex flex-col gap-2 rounded-none border bg-card px-4 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </li>
      ))}
    </ul>
  )
}

/** Mirrors admin vertical rows: name + meta left, action button right. */
export function RowListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-3 rounded-none border px-3 py-2.5"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-8 w-24 shrink-0" />
        </li>
      ))}
    </ul>
  )
}

/** Mirrors lookup's stacked bg-card p-4 input cards. */
export function LookupCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-none border bg-card p-4"
        >
          <Skeleton className="h-3 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="size-10 shrink-0" />
            <Skeleton className="h-10 w-20 shrink-0" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Mirrors record/vehicle/person detail header + tabbar + content card. */
export function DetailHeaderSkeleton({
  withTabs = true,
  tabCount = 3,
}: {
  withTabs?: boolean
  tabCount?: number
}) {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="mt-1 flex gap-1.5">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="mt-1 h-3 w-72" />
      </div>
      {withTabs && <ScopeTabBarSkeleton tabs={tabCount} />}
      <div className="flex flex-col gap-2 rounded-none border bg-card p-4">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}

/** Mirrors the file-a-case wizard: back row + progress + type grid. */
export function WizardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="flex items-center gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-1.5 flex-1" />
        ))}
      </div>
      <Skeleton className="h-3 w-40" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  )
}
