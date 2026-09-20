import {
  FilterBarSkeleton,
  GridCardListSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/list-skeletons"

/** Mirrors admin organizations: header + type filter + 2-col grid cards. */
export default function AdminOrganizationsLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading organizations"
    >
      <PageHeaderSkeleton titleWidth="w-44" subWidth="w-64" withActions />
      <FilterBarSkeleton />
      <GridCardListSkeleton count={4} />
    </div>
  )
}
