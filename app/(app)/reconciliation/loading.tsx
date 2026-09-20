import { Skeleton } from "@/components/ui/skeleton"
import {
  PageHeaderSkeleton,
  StatChipsSkeleton,
} from "@/components/app/list-skeletons"

/** Mirrors reconciliation: header row (title + tabs) + stat chips + rows. */
export default function ReconciliationLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading reconciliation"
    >
      <PageHeaderSkeleton titleWidth="w-48" subWidth="w-64" withTabs tabCount={4} />
      <StatChipsSkeleton count={3} />
      <div
        aria-hidden="true"
        className="flex flex-col gap-2 rounded-none border bg-card p-4"
      >
        <div className="flex items-start gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="size-10 shrink-0" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  )
}
