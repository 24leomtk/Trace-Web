import {
  GridCardListSkeleton,
  PageHeaderSkeleton,
} from "@/components/app/list-skeletons"

/** Mirrors tax rules: header + new-rule action + 2-col rule cards. */
export default function AdminTaxRulesLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading tax rules"
    >
      <PageHeaderSkeleton titleWidth="w-40" subWidth="w-72" withActions />
      <GridCardListSkeleton count={4} />
    </div>
  )
}
