"use client"

import { usePathname, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  ActivityIcon,
  BuildingIcon,
  CircleAlertIcon,
  ClipboardListIcon,
  HouseIcon,
  LogOutIcon,
  PlusIcon,
  QrCodeIcon,
  Repeat2Icon,
  ScanLineIcon,
  SearchIcon,
  Undo2Icon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { listDiseaseOptions } from "@/lib/actions/analytics"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ConnectPatientModal } from "@/components/app/connect-patient-modal"
import { EmergencyLookupModal } from "@/components/app/emergency-lookup-modal"
import { ModeSwitcher } from "@/components/app/mode-switcher"
import { NavButton } from "@/components/app/nav-button"
import { PatientSearchCommand } from "@/components/app/patient-search-command"
import { QrAccessModal } from "@/components/app/qr-access-modal"
import { RecordFiltersCommand } from "@/components/app/record-filters-command"
import { ThemeToggle } from "@/components/app/theme-toggle"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useHomeView } from "@/providers/home-view-context"
import { useUser } from "@/providers/user-context"

type Modal =
  "access" | "connect" | "search" | "diseases" | "emergency" | "signout" | null

export function FloatingNav() {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { user } = useUser()
  const homeView = useHomeView()
  const [modal, setModal] = useState<Modal>(null)
  const inPatientChart =
    user.role === "DOCTOR" &&
    homeView.doctorMode === "patient" &&
    !!homeView.activePatient

  function openPatientChart(patientId: string) {
    homeView.openPatientChart(patientId)
    router.push("/")
    setModal(null)
  }

  async function signOut() {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
    setModal(null)
  }

  return (
    <>
      <nav
        aria-label="Primary"
        className={cn(
          "fixed z-40 flex items-center gap-0.5 rounded-[min(var(--radius-4xl),24px)] border bg-popover/90 p-1.5 shadow-lg ring-1 ring-foreground/5 backdrop-blur-xl dark:ring-foreground/10",
          "bottom-5 left-1/2 -translate-x-1/2 flex-row",
          "lg:top-1/2 lg:right-6 lg:bottom-auto lg:left-auto lg:-translate-x-0 lg:-translate-y-1/2 lg:flex-col"
        )}
      >
        {user.role === "PATIENT" && (
          <>
            {pathname === "/" && <RecordFiltersCommand />}
            <NavButton
              label="My access code"
              onClick={() => setModal("access")}
            >
              <QrCodeIcon className="size-5" />
            </NavButton>
            <ProfileNavButton />
            <ThemeToggle />
          </>
        )}

        {user.role === "DOCTOR" && (
          <>
            {inPatientChart ? (
              <NavButton
                key="record"
                label={`Record for ${homeView.activePatient?.name ?? "patient"}`}
                href="/records/new"
              >
                <PlusIcon className="size-5" />
              </NavButton>
            ) : (
              <NavButton
                key="connect"
                label="Add patient (scan code)"
                onClick={() => setModal("connect")}
              >
                <ScanLineIcon className="size-5" />
              </NavButton>
            )}
            {inPatientChart ? (
              <NavButton
                key="exit"
                label="Back to my records"
                onClick={() => {
                  homeView.exitPatientChart()
                  router.push("/")
                  setModal(null)
                }}
              >
                <Undo2Icon className="size-5" />
              </NavButton>
            ) : (
              <NavButton
                key="search"
                label="Find a patient"
                onClick={() => setModal("search")}
              >
                <SearchIcon className="size-5" />
              </NavButton>
            )}
            {pathname === "/" && <RecordFiltersCommand />}
            <ProfileNavButton />
            {inPatientChart ? (
              <NavButton
                key="switch"
                label="Switch patient"
                onClick={() => setModal("search")}
              >
                <Repeat2Icon className="size-5" />
              </NavButton>
            ) : (
              <ModeSwitcher onRequestPatientSearch={() => setModal("search")} />
            )}
            <ThemeToggle />
          </>
        )}

        {(user.role === "DISTRICT_ADMIN" || user.role === "NATIONAL_ADMIN") && (
          <>
            <NavButton
              label="Search diseases"
              onClick={() => setModal("diseases")}
            >
              <SearchIcon className="size-5" />
            </NavButton>
            {pathname === "/" && homeView.adminMode === "personal" && (
              <RecordFiltersCommand />
            )}
            <ProfileNavButton />
            <ModeSwitcher />
            <ThemeToggle />
          </>
        )}

        {user.role === "ADMINISTRATOR" && (
          <>
            {pathname === "/" && <RecordFiltersCommand />}
            <NavButton
              label="My access code"
              onClick={() => setModal("access")}
            >
              <QrCodeIcon className="size-5" />
            </NavButton>
            <NavButton
              label="Manage users"
              href="/admin/users"
              active={pathname.startsWith("/admin/users")}
            >
              <UsersIcon className="size-5" />
            </NavButton>
            <NavButton
              label="Manage hospitals"
              href="/admin/hospitals"
              active={pathname.startsWith("/admin/hospitals")}
            >
              <BuildingIcon className="size-5" />
            </NavButton>
            <NavButton
              label="Manage clinical codes"
              href="/admin/codes"
              active={pathname.startsWith("/admin/codes")}
            >
              <ClipboardListIcon className="size-5" />
            </NavButton>
            {pathname === "/" || pathname === "/admin" ? (
              <NavButton label="Profile" href="/profile">
                <UserRoundIcon className="size-5" />
              </NavButton>
            ) : (
              <NavButton key="home" label="Home" href="/">
                <HouseIcon className="size-5" />
              </NavButton>
            )}
            <ThemeToggle />
          </>
        )}

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
        description="You will need to verify your phone number again to access your records."
        confirmLabel="Sign out"
        onConfirm={signOut}
      />

      {user.role === "PATIENT" && (
        <QrAccessModal
          open={modal === "access"}
          onOpenChange={(open) => setModal(open ? "access" : null)}
        />
      )}

      {user.role === "ADMINISTRATOR" && (
        <QrAccessModal
          open={modal === "access"}
          onOpenChange={(open) => setModal(open ? "access" : null)}
        />
      )}

      {user.role === "DOCTOR" && (
        <>
          <ConnectPatientModal
            open={modal === "connect"}
            onOpenChange={(open) => setModal(open ? "connect" : null)}
            connectedPatients={homeView.connectedPatients}
            onConnected={openPatientChart}
            onBreakGlass={(patientId, reason) => {
              homeView.openPatientChart(patientId, { breakGlassReason: reason })
              void queryClient.invalidateQueries({
                queryKey: ["connected-patients"],
              })
              router.push("/")
              setModal(null)
              toast.warning(
                "Break-glass access opened — reason logged for admin review."
              )
            }}
          />
          <PatientSearchCommand
            open={modal === "search"}
            onOpenChange={(open) => setModal(open ? "search" : null)}
            patients={homeView.connectedPatients}
            onSelect={openPatientChart}
            onReset={homeView.exitPatientChart}
            onSelectEmergency={() => setModal("emergency")}
          />
          <EmergencyLookupModal
            open={modal === "emergency"}
            onOpenChange={(open) => setModal(open ? "emergency" : null)}
          />
        </>
      )}

      {(user.role === "DISTRICT_ADMIN" || user.role === "NATIONAL_ADMIN") && (
        <DiseaseSearchCommand
          open={modal === "diseases"}
          onOpenChange={(open) => setModal(open ? "diseases" : null)}
          onSelect={(diseaseId) => {
            homeView.selectDisease(diseaseId)
            setModal(null)
            router.push("/")
          }}
        />
      )}
    </>
  )
}

function DiseaseSearchCommand({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (diseaseId: string) => void
}) {
  // Cached aggressively — the underlying aggregates change slowly.
  const { data: options } = useQuery({
    queryKey: ["disease-options"],
    queryFn: listDiseaseOptions,
    enabled: open,
    staleTime: Infinity,
  })

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Disease statistics"
      description="Query disease statistics across your jurisdiction."
    >
      <CommandInput placeholder="Search a disease..." />
      <CommandList>
        <CommandEmpty>
          {options === undefined
            ? "Loading diseases…"
            : "No disease matches that search."}
        </CommandEmpty>
        {options && options.length > 0 && (
          <CommandGroup heading="Reportable diseases">
            {options.map((disease) => (
              <CommandItem
                key={disease.id}
                value={disease.name}
                onSelect={() => onSelect(disease.id)}
              >
                <ActivityIcon className="text-muted-foreground" />
                <span className="flex-1">{disease.name}</span>
                {disease.status === "outbreak" && (
                  <span className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                    <CircleAlertIcon className="size-3.5" />
                    Outbreak
                  </span>
                )}
                {disease.status === "watch" && (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Watch
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

function ProfileNavButton() {
  const pathname = usePathname()

  return pathname === "/profile" || pathname.startsWith("/records") ? (
    <NavButton key="home" label="Home" href="/">
      <HouseIcon className="size-5" />
    </NavButton>
  ) : (
    <NavButton key="profile" label="Profile" href="/profile">
      <UserRoundIcon className="size-5" />
    </NavButton>
  )
}
