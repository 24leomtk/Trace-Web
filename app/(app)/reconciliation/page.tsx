import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"
import { ReconciliationBoard } from "@/components/app/reconciliation-board"

export default async function ReconciliationPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (
    user.role !== "DISTRICT_MONITOR" &&
    user.role !== "COUNTRY_MONITOR"
  ) {
    redirect("/")
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Fine reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          {user.role === "DISTRICT_MONITOR"
            ? "Takings and exceptions in your district."
            : "Takings and exceptions nationwide in your domain."}
        </p>
      </header>
      <ReconciliationBoard />
    </div>
  )
}
