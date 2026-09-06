import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"
import { AuditLog } from "@/components/app/audit-log"

export default async function AuditPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (
    user.role !== "DISTRICT_MONITOR" &&
    user.role !== "COUNTRY_MONITOR" &&
    user.role !== "SYSTEM_ADMIN"
  ) {
    redirect("/")
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          {user.role === "DISTRICT_MONITOR"
            ? "Reads and actions in your district."
            : "Every access outside someone's own scope."}
        </p>
      </header>
      <AuditLog limit={100} />
    </div>
  )
}
