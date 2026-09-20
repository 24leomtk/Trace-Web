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

  return <ReconciliationBoard />
}
