import {
  LookupCardSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/list-skeletons"

/** Mirrors lookup: header + stacked input cards. */
export default function LookupLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-6 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading lookups"
    >
      <PageHeaderSkeleton titleWidth="w-28" subWidth="w-72" />
      <LookupCardSkeleton rows={4} />
    </div>
  )
}
