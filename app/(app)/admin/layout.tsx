import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (user.role !== "SYSTEM_ADMIN") redirect("/")

  // Each admin page is standalone with its own header — global tabs were
  // removed in favour of the existing FloatingNav + AdminHome navigation.
  return <div className="flex flex-col gap-6">{children}</div>
}
