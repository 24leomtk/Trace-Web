import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"
import { AdminHome } from "@/components/app/admin-home"
import { AuditLog } from "@/components/app/audit-log"
import { CourtHome } from "@/components/app/court-home"
import { InsurerHome } from "@/components/app/insurer-home"
import { OfficerHome } from "@/components/app/officer-home"
import { RegistrarHome } from "@/components/app/registrar-home"

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  const role = user.role

  switch (role) {
    case "OFFICER":
    case "DISTRICT_MONITOR":
    case "COUNTRY_MONITOR":
      return <OfficerHome />
    case "COURT_LIAISON":
      return <CourtHome />
    case "INSURANCE_PORTAL_USER":
      return <InsurerHome />
    case "VEHICLE_REGISTRAR":
      return <RegistrarHome />
    case "SYSTEM_ADMIN":
      return <AdminHome />
    case "COMPLIANCE_AUDITOR":
      return (
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold">Compliance audit</h1>
            <p className="text-sm text-muted-foreground">
              Read-only trail of who touched what, and when.
            </p>
          </header>
          <AuditLog limit={100} />
        </div>
      )
  }
}
