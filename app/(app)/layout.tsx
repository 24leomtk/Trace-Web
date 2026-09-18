import { redirect } from "next/navigation"

import { FloatingNav } from "@/components/app/floating-nav"
import { getCurrentUser } from "@/lib/session"
import { HomeViewProvider } from "@/providers/home-view-context"
import { QueryProvider } from "@/providers/query-provider"
import { UserProvider } from "@/providers/user-context"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  return (
    <QueryProvider>
      <UserProvider user={user}>
        <HomeViewProvider>
          <div className="min-h-svh pb-28 lg:pb-12">
            <main className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 lg:pt-5">
              {children}
            </main>
          </div>
          <FloatingNav />
        </HomeViewProvider>
      </UserProvider>
    </QueryProvider>
  )
}
