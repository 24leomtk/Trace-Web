import {
  FilterBarSkeleton,
  GridCardListSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/list-skeletons"

/** Mirrors admin branches: header + search + 2-col grid rows. */
export default function AdminBranchesLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading branches"
    >
      <PageHeaderSkeleton titleWidth="w-36" subWidth="w-64" withActions />
      <FilterBarSkeleton />
      <GridCardListSkeleton count={4} />
    </div>
  )
}
