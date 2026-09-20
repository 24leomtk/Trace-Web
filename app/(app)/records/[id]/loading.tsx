import { DetailHeaderSkeleton } from "@/components/app/list-skeletons"

export default function RecordDetailLoading() {
  return (
    <div
      className="animate-in duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading case"
    >
      <DetailHeaderSkeleton />
    </div>
  )
}
