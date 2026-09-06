"use client"

import { useUser } from "@/providers/user-context"
import { useHomeView } from "@/providers/home-view-context"
import { cn } from "@/lib/utils"
import { AnalyticsFeed } from "@/components/app/analytics-feed"
import { DiseaseAnalytics } from "@/components/app/disease-analytics"
import { RecordTimeline } from "@/components/app/record-timeline"

export default function HomePage() {
  const { user } = useUser()
  const homeView = useHomeView()

  if (user.role === "ADMINISTRATOR") {
    // Own chart only — administrators never open other people's records.
    // The management workspace lives at /admin (see the nav).
    return (
      <PageShell>
        <RecordTimeline patientId={user.id} />
      </PageShell>
    )
  }

  if (user.role === "PATIENT") {
    return (
      <PageShell>
        <RecordTimeline patientId={user.id} />
      </PageShell>
    )
  }

  if (user.role === "DOCTOR") {
    const viewingPatient =
      homeView.doctorMode === "patient" && homeView.activePatient
    return (
      <PageShell tinted={!!viewingPatient}>
        <RecordTimeline
          key={viewingPatient ? homeView.activePatient!.id : user.id}
          patientId={viewingPatient ? homeView.activePatient!.id : user.id}
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      {homeView.adminMode === "summary" ? (
        <AnalyticsFeed />
      ) : homeView.adminMode === "disease" ? (
        <DiseaseAnalytics
          selectedDiseaseId={homeView.selectedDiseaseId}
          onSelectDisease={homeView.selectDisease}
        />
      ) : (
        <RecordTimeline patientId={user.id} />
      )}
    </PageShell>
  )
}

function PageShell({
  children,
  tinted,
}: {
  children: React.ReactNode
  tinted?: boolean
}) {
  return (
    <div className="flex flex-col gap-8">
      {children}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-amber-500/5 to-transparent transition-opacity",
          tinted ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  )
}
