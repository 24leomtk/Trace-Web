import {
  FilterBarSkeleton,
  GridCardListSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/list-skeletons"

/** Mirrors API keys: header + issue action + search + status filter + cards. */
export default function AdminApiKeysLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading API keys"
    >
      <PageHeaderSkeleton titleWidth="w-36" subWidth="w-64" withActions />
      <FilterBarSkeleton />
      <GridCardListSkeleton count={4} />
    </div>
  )
}
