import { Skeleton } from "@/components/ui/skeleton"
import {
  PageHeaderSkeleton,
  RowListSkeleton,
} from "@/components/app/list-skeletons"

/** Mirrors access review: header + summary dl card + needs-attention rows. */
export default function AccessReviewLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading access review"
    >
      <PageHeaderSkeleton titleWidth="w-44" subWidth="w-72" />
      <div
        aria-hidden="true"
        className="flex flex-col gap-2 rounded-none border bg-card p-4"
      >
        <Skeleton className="h-3 w-24" />
        <div className="flex gap-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex flex-col gap-2 rounded-none border bg-card p-4"
      >
        <Skeleton className="h-3 w-36" />
        <RowListSkeleton count={4} />
      </div>
    </div>
  )
}
