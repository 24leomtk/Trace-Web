"use client"

import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useHomeView } from "@/providers/home-view-context"
import { useUser } from "@/providers/user-context"

export function ChartAlertBanner() {
  const { user } = useUser()
  const homeView = useHomeView()

  if (user.role !== "DOCTOR") return null
  if (homeView.doctorMode !== "patient" || !homeView.activePatient) return null

  const breakGlass = !!homeView.breakGlassReason

  return (
    <div
      role="status"
      className={cn(
        "mb-6 flex items-center justify-between gap-2 rounded-[min(var(--radius-2xl),18px)] border px-4 py-1",
        breakGlass
          ? "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10"
          : "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
      )}
    >
      <div className="min-w-0 text-sm">
        <p
          className={cn(
            "font-medium",
            breakGlass
              ? "text-red-900 dark:text-red-200"
              : "text-amber-900 dark:text-amber-200"
          )}
        >
          {breakGlass ? "Break-glass access — " : "Viewing "}
          {homeView.activePatient.name}&apos;s records
        </p>
        <p
          className={cn(
            "mt-0.5 text-xs",
            breakGlass
              ? "text-red-800/80 dark:text-red-200/70"
              : "text-amber-800/80 dark:text-amber-200/70"
          )}
        >
          {breakGlass
            ? `Reason on file: “${homeView.breakGlassReason}” — flagged for admin review.`
            : "New entries will be added to the patient's chart."}
        </p>
      </div>
      <button
        type="button"
        onClick={homeView.exitPatientChart}
        aria-label="Back to my records"
        className={cn(
          "rounded-full p-1.5 transition-colors",
          breakGlass
            ? "text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-500/20"
            : "text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-500/20"
        )}
      >
        <XIcon className="size-4" />
      </button>
    </div>
  )
}
