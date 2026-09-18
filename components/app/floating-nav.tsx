"use client"

import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BellIcon,
  Building2Icon,
  CarFrontIcon,
  FilePlus2Icon,
  GavelIcon,
  HouseIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LogOutIcon,
  ScrollTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { unreadNotificationCount } from "@/lib/actions/notifications"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { NavButton } from "@/components/app/nav-button"
import { ThemeToggle } from "@/components/app/theme-toggle"
import { CaseFiltersCommand } from "@/components/app/case-filters-command"
import { useUser } from "@/providers/user-context"

type Modal = "signout" | null

export function FloatingNav() {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useUser()
  const [modal, setModal] = useState<Modal>(null)
  const { data: unread } = useQuery({
    queryKey: ["unread-count"],
    queryFn: unreadNotificationCount,
    refetchInterval: 60_000,
  })

  async function signOut() {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
    setModal(null)
  }

  const isPolice =
    user.role === "OFFICER" ||
    user.role === "DISTRICT_MONITOR" ||
    user.role === "COUNTRY_MONITOR"
  const canFile =
    user.role === "OFFICER" ||
    user.role === "DISTRICT_MONITOR" ||
    user.role === "COUNTRY_MONITOR"
  const isMonitor =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed z-40 flex items-center gap-0.5 rounded-[min(var(--radius-4xl),24px)] border bg-popover/90 p-1.5 shadow-lg ring-1 ring-foreground/5 backdrop-blur-xl dark:ring-foreground/10 bottom-5 left-1/2 -translate-x-1/2 flex-row lg:top-1/2 lg:right-6 lg:bottom-auto lg:left-auto lg:-translate-x-0 lg:-translate-y-1/2 lg:flex-col print:hidden"
      >
        {isPolice && (
          <>
            <NavButton label="Home" href="/" active={pathname === "/"}>
              <HouseIcon className="size-5" />
            </NavButton>
            {pathname === "/" && <CaseFiltersCommand />}
            {canFile && (
              <NavButton
                label="File a case"
                href="/records/new"
                active={pathname === "/records/new"}
              >
                <FilePlus2Icon className="size-5" />
              </NavButton>
            )}
            <NavButton
              label="Lookups"
              href="/lookup"
              active={pathname.startsWith("/lookup")}
            >
              <SearchIcon className="size-5" />
            </NavButton>
            {isMonitor && (
              <NavButton
                label="Audit log"
                href="/audit"
                active={pathname.startsWith("/audit")}
              >
                <ScrollTextIcon className="size-5" />
              </NavButton>
            )}
            <ProfileNavButton />
            <ThemeToggle />
          </>
        )}

        {user.role === "COURT_LIAISON" && (
          <>
            <NavButton label="Referrals" href="/" active={pathname === "/"}>
              <GavelIcon className="size-5" />
            </NavButton>
            <ProfileNavButton />
            <ThemeToggle />
          </>
        )}

        {user.role === "INSURANCE_PORTAL_USER" && (
          <>
            <NavButton label="Policies" href="/" active={pathname === "/"}>
              <LandmarkIcon className="size-5" />
            </NavButton>
            <NavButton
              label="Flag lookup"
              href="/lookup"
              active={pathname.startsWith("/lookup")}
            >
              <SearchIcon className="size-5" />
            </NavButton>
            <ProfileNavButton />
            <ThemeToggle />
          </>
        )}

        {user.role === "VEHICLE_REGISTRAR" && (
          <>
            <NavButton label="Registry" href="/" active={pathname === "/"}>
              <CarFrontIcon className="size-5" />
            </NavButton>
            <ProfileNavButton />
            <ThemeToggle />
          </>
        )}

        {user.role === "SYSTEM_ADMIN" && (
          <>
            <NavButton label="Home" href="/" active={pathname === "/"}>
              <HouseIcon className="size-5" />
            </NavButton>
            <NavButton
              label="Manage users"
              href="/admin/users"
              active={pathname.startsWith("/admin/users")}
            >
              <UsersIcon className="size-5" />
            </NavButton>
            <NavButton
              label="Branches"
              href="/admin/branches"
              active={pathname.startsWith("/admin/branches")}
            >
              <Building2Icon className="size-5" />
            </NavButton>
            <NavButton
              label="Organizations"
              href="/admin/organizations"
              active={pathname.startsWith("/admin/organizations")}
            >
              <LandmarkIcon className="size-5" />
            </NavButton>
            <NavButton
              label="API keys"
              href="/admin/api-keys"
              active={pathname.startsWith("/admin/api-keys")}
            >
              <KeyRoundIcon className="size-5" />
            </NavButton>
            <NavButton
              label="Audit log"
              href="/audit"
              active={pathname.startsWith("/audit")}
            >
              <ScrollTextIcon className="size-5" />
            </NavButton>
            <ProfileNavButton />
            <ThemeToggle />
          </>
        )}

        {user.role === "COMPLIANCE_AUDITOR" && (
          <>
            <NavButton label="Audit log" href="/" active={pathname === "/"}>
              <ShieldCheckIcon className="size-5" />
            </NavButton>
            <ProfileNavButton />
            <ThemeToggle />
          </>
        )}

        <NavButton
          key="notifications"
          label="Notifications"
          href="/notifications"
          active={pathname.startsWith("/notifications")}
        >
          <span className="relative">
            <BellIcon className="size-5" />
            {!!unread && unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </span>
        </NavButton>
        <NavButton
          key="sign-out"
          label="Sign out"
          onClick={() => setModal("signout")}
        >
          <LogOutIcon className="size-5" />
        </NavButton>
      </nav>

      <ConfirmDialog
        open={modal === "signout"}
        onOpenChange={(open) => setModal(open ? "signout" : null)}
        title="Sign out?"
        description="You will need to verify your phone number again to access TRACE."
        confirmLabel="Sign out"
        onConfirm={signOut}
      />
    </>
  )
}

function ProfileNavButton() {
  const pathname = usePathname()

  return pathname === "/profile" ? (
    <NavButton key="home" label="Home" href="/">
      <HouseIcon className="size-5" />
    </NavButton>
  ) : (
    <NavButton key="profile" label="Profile" href="/profile">
      <UserRoundIcon className="size-5" />
    </NavButton>
  )
}
