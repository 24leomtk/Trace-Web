import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  TimelineListSkeleton,
} from "@/components/app/list-skeletons"

/**
 * Default (app) shell — mirrors OfficerHome, the most common landing:
 * header row (title + compact tabs) + timeline filter row + timeline cards.
 */
export default function AppLoading() {
  return (
    <div
      className="flex animate-in flex-col gap-5 duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading cases"
    >
      <PageHeaderSkeleton titleWidth="w-36" subWidth="w-48" withTabs tabCount={4} />
      <FilterBarSkeleton />
      <TimelineListSkeleton count={4} />
    </div>
  )
}
