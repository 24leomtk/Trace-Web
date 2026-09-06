import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"
import { AdminSectionNav } from "@/app/(app)/admin/section-nav"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (user.role !== "ADMINISTRATOR") redirect("/")

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          Registry administration
        </p>
        <h1 className="mt-1 text-xl font-medium">Manage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Users, hospitals, clinical codebooks and treatment guidelines. Your
          own chart lives on the home screen — nobody else&apos;s records are
          reachable from here.
        </p>
      </header>
      <AdminSectionNav />
      {children}
    </div>
  )
}
