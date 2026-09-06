import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (user) redirect("/")

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <main className="grid flex-1 place-items-center px-4 py-10">
        <div className="flex w-full max-w-sm flex-col items-center gap-8">
          {children}
        </div>
      </main>
    </div>
  )
}
