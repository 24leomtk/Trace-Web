import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  RowListSkeleton,
} from "@/components/app/list-skeletons"

/** Mirrors admin users: Accounts header + provision action + search + rows. */
export default function AdminUsersLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading accounts"
    >
      <PageHeaderSkeleton
        titleWidth="w-32"
        subWidth="w-72"
        withActions
      />
      <FilterBarSkeleton />
      <RowListSkeleton count={6} />
    </div>
  )
}
