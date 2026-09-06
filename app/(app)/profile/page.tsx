"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ActivityIcon,
  BuildingIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  HeartPulseIcon,
  HistoryIcon,
  KeyRoundIcon,
  LogOutIcon,
  MapPinIcon,
  MonitorIcon,
  MoonIcon,
  PencilIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SunIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  getMyAccessGrants,
  getMyAccessLog,
  revokeAccessGrant,
} from "@/lib/actions/access"
import { authClient } from "@/lib/auth-client"
import { TONE_BADGE_CLASS, TONE_DOT_CLASS } from "@/lib/record-meta"
import { formatDateTime, formatFullDate, formatPhone } from "@/lib/format"
import type { AccessGrant, AccessLogEntry, Role } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useUser } from "@/providers/user-context"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { UpdateEmergencyInfoModal } from "@/components/app/update-emergency-info-modal"

const ROLE_LABEL: Record<Role, string> = {
  PATIENT: "Patient",
  DOCTOR: "Doctor",
  DISTRICT_ADMIN: "District admin",
  NATIONAL_ADMIN: "National admin",
  ADMINISTRATOR: "Administrator",
}

const ROLE_TONE: Record<Role, "sky" | "violet" | "amber" | "rose" | "emerald"> = {
  PATIENT: "sky",
  DOCTOR: "violet",
  DISTRICT_ADMIN: "amber",
  NATIONAL_ADMIN: "rose",
  ADMINISTRATOR: "emerald",
}

const THEME_CHOICES = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const

export default function ProfilePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useUser()
  // Administrators keep a personal chart like patients: own emergency info,
  // own access codes and their own audit trail — never anyone else's.
  const hasOwnChart = user.role === "PATIENT" || user.role === "ADMINISTRATOR"

  const { data: grants } = useQuery({
    queryKey: ["my-grants"],
    queryFn: getMyAccessGrants,
    enabled: hasOwnChart,
  })
  const { data: log } = useQuery({
    queryKey: ["my-access-log"],
    queryFn: getMyAccessLog,
    enabled: hasOwnChart,
  })

  const revokeMutation = useMutation({
    mutationFn: (grantId: string) => revokeAccessGrant(grantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-grants"] })
      void queryClient.invalidateQueries({ queryKey: ["my-access-log"] })
      toast.success("Access revoked")
    },
    onError: () => toast.error("Could not revoke that access window."),
  })

  const [revokeTarget, setRevokeTarget] = useState<AccessGrant | null>(null)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false)

  async function handleRevoke() {
    if (!revokeTarget) return
    await revokeMutation.mutateAsync(revokeTarget.id).catch(() => {})
    setRevokeTarget(null)
  }

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  const emergency = hasOwnChart ? user.emergencyInfo : undefined
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col items-center gap-3 rounded-[min(var(--radius-3xl),20px)] border bg-card p-6 text-center">
        <Avatar className="size-20">
          <AvatarFallback className="bg-secondary text-xl font-medium text-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-lg font-medium">{user.name}</h2>
          <p className="mt-0.5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <PhoneIcon className="size-3.5" />
            {formatPhone(user.phone)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium",
              TONE_BADGE_CLASS[ROLE_TONE[user.role]]
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                TONE_DOT_CLASS[ROLE_TONE[user.role]]
              )}
            />
            {ROLE_LABEL[user.role]}
          </span>
          {user.licenseNumber && (
            <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              <ActivityIcon className="size-3" />
              License {user.licenseNumber}
            </span>
          )}
        </div>
        {(user.facility || user.district) && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {user.facility && (
              <span className="inline-flex items-center gap-1">
                <BuildingIcon className="size-3.5" />
                {user.facility}
              </span>
            )}
            {user.district && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3.5" />
                {user.district}
              </span>
            )}
          </div>
        )}
      </section>

      {hasOwnChart ? (
        <ProfileSection
          title="Emergency info"
          description="Visible to any doctor immediately — even without an access code."
          icon={<TriangleAlertIcon className="size-4" />}
          action={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEmergencyModalOpen(true)}
              aria-label="Edit emergency information"
              title="Edit emergency info"
            >
              <PencilIcon className="size-3.5" />
            </Button>
          }
        >
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <InfoRow label="Blood type" value={emergency?.bloodType ?? "—"} />
            <InfoRow
              label="Allergies"
              value={
                emergency?.allergies && emergency.allergies.length > 0
                  ? emergency.allergies.join(", ")
                  : "None recorded"
              }
            />
            <InfoRow
              label="Chronic conditions"
              value={
                emergency?.chronicConditions &&
                emergency.chronicConditions.length > 0
                  ? emergency.chronicConditions.join(", ")
                  : "None recorded"
              }
            />
            <InfoRow
              label="Emergency contact"
              value={
                emergency?.emergencyContact
                  ? `${emergency.emergencyContact.name}${emergency.emergencyContact.relation ? ` (${emergency.emergencyContact.relation})` : ""} · ${formatPhone(emergency.emergencyContact.phone)}`
                  : "None recorded"
              }
            />
          </dl>
        </ProfileSection>
      ) : (
        <ProfileSection
          title="Professional details"
          description="Shown to facilities you interact with."
          icon={<ShieldCheckIcon className="size-4" />}
        >
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <InfoRow label="Role" value={ROLE_LABEL[user.role]} />
            <InfoRow
              label="Medical licence"
              value={user.licenseNumber ?? "—"}
            />
            <InfoRow label="Facility" value={user.facility ?? "—"} />
            <InfoRow label="Jurisdiction" value={user.district ?? "—"} />
          </dl>
        </ProfileSection>
      )}

      {hasOwnChart && (
        <ProfileGrantsSection
          grants={grants}
          onRevokeTarget={(grant) => setRevokeTarget(grant)}
        />
      )}

      {hasOwnChart && <AccessHistory log={log} />}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        title="Revoke access?"
        description={`${revokeTarget?.doctorName} will immediately lose access to your records and would need a new code for future visits.`}
        confirmLabel="Revoke access"
        destructive
        onConfirm={() => void handleRevoke()}
      />

      {hasOwnChart && (
        <UpdateEmergencyInfoModal
          open={emergencyModalOpen}
          onOpenChange={setEmergencyModalOpen}
          initialData={emergency}
        />
      )}
    </div>
  )
}

const GRANTS_PAGE_SIZE = 5
const LOG_PAGE_SIZE = 5

function ProfileGrantsSection({
  grants,
  onRevokeTarget,
}: {
  grants: AccessGrant[] | undefined
  onRevokeTarget: (grant: AccessGrant) => void
}) {
  const [page, setPage] = useState(0)

  const total = grants?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(total / GRANTS_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const paginatedGrants = (grants ?? []).slice(
    currentPage * GRANTS_PAGE_SIZE,
    (currentPage + 1) * GRANTS_PAGE_SIZE
  )

  return (
    <ProfileSection
      title="Active access grants"
      description="Doctors who can currently open your full history."
      icon={<KeyRoundIcon className="size-4" />}
    >
      {grants === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No doctor currently has access. Share your code to connect one.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {paginatedGrants.map((grant) => (
              <li
                key={grant.id}
                className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">
                    {grant.doctorName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {grant.facility} · until {formatFullDate(grant.expiresAt)}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() => onRevokeTarget(grant)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">
                Page {currentPage + 1} of {pageCount}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeftIcon className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Next page"
                >
                  <ChevronRightIcon className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </ProfileSection>
  )
}

function AccessHistory({ log }: { log: AccessLogEntry[] | undefined }) {
  const [page, setPage] = useState(0)

  const total = log?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(total / LOG_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const paginatedLog = (log ?? []).slice(
    currentPage * LOG_PAGE_SIZE,
    (currentPage + 1) * LOG_PAGE_SIZE
  )

  return (
    <ProfileSection
      title="Who viewed your records"
      description="Every access to your data — nothing about who looked is hidden from you."
      icon={<HistoryIcon className="size-4" />}
    >
      {log === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : log.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody has accessed your records yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {paginatedLog.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-3 rounded-2xl bg-muted/50 px-3 py-2.5"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background [&_svg]:size-3.5">
                  {ACCESS_LOG_ICONS[entry.action]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {entry.actorName}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {formatDateTime(entry.at)}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.detail ?? entry.actorFacility}
                  </p>
                </div>
                <span className="shrink-0 rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {ACCESS_ACTION_LABEL[entry.action]}
                </span>
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">
                Page {currentPage + 1} of {pageCount}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeftIcon className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Next page"
                >
                  <ChevronRightIcon className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </ProfileSection>
  )
}

const ACCESS_LOG_ICONS: Record<AccessLogEntry["action"], React.ReactNode> = {
  view: <EyeIcon />,
  grant: <KeyRoundIcon />,
  revoke: <LogOutIcon />,
  emergency: <HeartPulseIcon />,
  break_glass: <TriangleAlertIcon className="text-red-600 dark:text-red-400" />,
}

const ACCESS_ACTION_LABEL: Record<AccessLogEntry["action"], string> = {
  view: "View",
  grant: "Grant",
  revoke: "Revoke",
  emergency: "Emergency",
  break_glass: "Break-glass",
}

const noopSubscribe = () => () => {}

function ProfileSection({
  title,
  description,
  icon,
  action,
  children,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[min(var(--radius-3xl),20px)] border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground [&_svg]:size-4">
            {icon}
          </div>
          <div>
            <h3 className="text-[15px] font-medium">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
    </div>
  )
}
