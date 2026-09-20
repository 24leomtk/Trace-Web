import {
  FilterBarSkeleton,
  GridCardListSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/list-skeletons"

/** Mirrors audit: header + search/filter + 2-col card grid. */
export default function AuditLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading audit log"
    >
      <PageHeaderSkeleton titleWidth="w-32" subWidth="w-64" />
      <FilterBarSkeleton />
      <GridCardListSkeleton count={6} />
    </div>
  )
}
