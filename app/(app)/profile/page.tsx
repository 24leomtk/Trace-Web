import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"
import { formatDistrict } from "@/lib/roles"

const ROLE_LABEL: Record<string, string> = {
  OFFICER: "Officer",
  DISTRICT_MONITOR: "District monitor",
  COUNTRY_MONITOR: "Country monitor",
  SYSTEM_ADMIN: "System administrator",
  COMPLIANCE_AUDITOR: "Compliance auditor",
  COURT_LIAISON: "Court liaison",
  INSURANCE_PORTAL_USER: "Insurance portal user",
  VEHICLE_REGISTRAR: "Vehicle registrar",
}

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const rows: [string, string | undefined][] = [
    ["Name", user.name],
    ["Phone", user.phone],
    ["Role", ROLE_LABEL[user.role] ?? user.role],
    ["Badge number", user.badgeNumber],
    ["Domain", user.domain === "traffic" ? "Traffic" : user.domain === "regular" ? "Regular" : undefined],
    ["Posting", user.posting],
    ["District", user.district ? formatDistrict(user.district) : undefined],
    ["Organization", user.organizationName],
  ]

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Profile</p>
        <h1 className="mt-1 text-xl font-medium">{user.name}</h1>
      </header>
      <section className="flex flex-col gap-2 rounded-3xl border bg-card p-5">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="shrink-0 text-muted-foreground">{label}</span>
              <span className="text-right font-medium">{value}</span>
            </div>
          ))}
      </section>
      <p className="text-xs text-muted-foreground">
        Account changes (phone numbers, postings, deactivation) are handled by a
        system administrator.
      </p>
    </div>
  )
}
