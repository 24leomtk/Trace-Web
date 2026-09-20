import { WizardSkeleton } from "@/components/app/list-skeletons"

export default function NewRecordLoading() {
  return (
    <div
      className="animate-in duration-300 fade-in"
      aria-busy="true"
      aria-label="Loading filing form"
    >
      <WizardSkeleton />
    </div>
  )
}
