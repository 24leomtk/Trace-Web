"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "sonner"

import {
  changeStatus,
  getRecord,
  setAccessLevel,
} from "@/lib/actions/records"
import {
  listCourtLiaisons,
  liveCourtReferralsFor,
  recordCourtOutcome,
  referCaseToCourt,
  renewCourtAccess,
  revokeCourtAccess,
} from "@/lib/actions/access"
import { RECORD_TYPE_META, TONE_BADGE_CLASS } from "@/lib/record-meta"
import { formatDateTime } from "@/lib/format"
import type { AccessLevel, CaseStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AttachmentsModal } from "@/components/app/attachments-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useUser } from "@/providers/user-context"

const STATUSES: CaseStatus[] = ["active", "resolved", "closed", "archived"]
const LEVELS: AccessLevel[] = ["branch", "district", "country"]

export default function RecordDetailPage({ params }: { params: { id: string } }) {
  const { user } = useUser()
  const queryClient = useQueryClient()
  const [showAttachments, setShowAttachments] = useState(false)
  const [liaisonId, setLiaisonId] = useState("")
  const [reason, setReason] = useState("")
  const [outcome, setOutcome] = useState("charged")
  const [outcomeNotes, setOutcomeNotes] = useState("")

  const recordQuery = useQuery({
    queryKey: ["record", params.id],
    queryFn: () => getRecord(params.id),
  })
  const referralsQuery = useQuery({
    queryKey: ["referrals", params.id],
    queryFn: () => liveCourtReferralsFor(params.id),
    enabled:
      user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR",
  })
  const liaisonsQuery = useQuery({
    queryKey: ["court-liaisons"],
    queryFn: listCourtLiaisons,
    enabled:
      user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR",
  })

  const isMonitor =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"
  const isLiaison = user.role === "COURT_LIAISON"

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["record", params.id] })
    await queryClient.invalidateQueries({ queryKey: ["referrals", params.id] })
  }

  if (recordQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (recordQuery.isError || !recordQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="rounded-3xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          {recordQuery.error instanceof Error
            ? recordQuery.error.message
            : "Record not found."}
        </p>
      </div>
    )
  }

  const record = recordQuery.data
  const meta = RECORD_TYPE_META[record.recordType]

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <header className="flex flex-col gap-1">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {meta.label} · {record.district.replace(/_/g, " ")} · {record.branchName}
        </p>
        <h1 className="text-xl font-semibold">{record.title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{record.summary}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {record.badges.map((badge) => (
            <span
              key={badge.label}
              className={cn(
                "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium",
                TONE_BADGE_CLASS[badge.tone]
              )}
            >
              {badge.label}
            </span>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Filed by {record.author.name} · {formatDateTime(record.createdAt)} ·
          status {record.status} · {record.accessLevel} visibility
        </p>
      </header>

      {record.attachments.length > 0 && (
        <Button
          variant="outline"
          className="w-fit rounded-full"
          onClick={() => setShowAttachments(true)}
        >
          View {record.attachments.length} attachment{record.attachments.length === 1 ? "" : "s"}
        </Button>
      )}

      {isMonitor && (
        <>
          <section className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Status
            </h2>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={record.status === status ? "default" : "outline"}
                  onClick={async () => {
                    try {
                      await changeStatus({ id: record.id, status })
                      toast.success(`Status → ${status}.`)
                      await refresh()
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed.")
                    }
                  }}
                >
                  {status}
                </Button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Visibility
            </h2>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((level) => (
                <Button
                  key={level}
                  size="sm"
                  variant={record.accessLevel === level ? "default" : "outline"}
                  onClick={async () => {
                    try {
                      await setAccessLevel({ id: record.id, level })
                      toast.success(`Visibility → ${level}.`)
                      await refresh()
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Failed.")
                    }
                  }}
                >
                  {level}
                </Button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-3xl border bg-card p-4">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Court referrals
            </h2>
            {referralsQuery.data && referralsQuery.data.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {referralsQuery.data.map((referral) => (
                  <li key={referral.id} className="rounded-2xl border px-3 py-2 text-sm">
                    <p className="font-medium">{referral.liaisonName}</p>
                    <p className="text-xs text-muted-foreground">
                      {referral.reason || "No reason given"} · until{" "}
                      {referral.expiresAt ? formatDateTime(referral.expiresAt) : "—"} ·
                      outcome: {referral.outcome}
                    </p>
                    <div className="mt-1.5 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await renewCourtAccess(referral.id)
                          toast.success("Access renewed for 90 days.")
                          await refresh()
                        }}
                      >
                        Renew
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await revokeCourtAccess(referral.id)
                          toast.success("Access revoked.")
                          await refresh()
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No live referrals.</p>
            )}
            <form
              className="flex flex-col gap-2"
              onSubmit={async (event) => {
                event.preventDefault()
                if (!liaisonId) {
                  toast.error("Choose a court liaison.")
                  return
                }
                try {
                  await referCaseToCourt({
                    recordId: record.id,
                    courtLiaisonId: liaisonId,
                    reason,
                  })
                  toast.success("Case referred (90-day access).")
                  setLiaisonId("")
                  setReason("")
                  await refresh()
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed.")
                }
              }}
            >
              <select
                value={liaisonId}
                onChange={(event) => setLiaisonId(event.target.value)}
                className="h-9 rounded-2xl border bg-input/50 px-2.5 text-sm outline-none"
                aria-label="Court liaison"
              >
                <option value="">Select liaison…</option>
                {(liaisonsQuery.data ?? []).map((liaison) => (
                  <option key={liaison.id} value={liaison.id}>
                    {liaison.name}{liaison.orgName ? ` · ${liaison.orgName}` : ""}
                  </option>
                ))}
              </select>
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason, e.g. referred for prosecution"
              />
              <Button type="submit" size="sm" className="w-fit">
                Refer to court
              </Button>
            </form>
          </section>
        </>
      )}

      {user.role === "OFFICER" && record.reportedBy === user.id && (
        <section className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Visibility
          </h2>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((level) => (
              <Button
                key={level}
                size="sm"
                variant={record.accessLevel === level ? "default" : "outline"}
                onClick={async () => {
                  try {
                    await setAccessLevel({ id: record.id, level })
                    toast.success(`Visibility → ${level}.`)
                    await refresh()
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Failed.")
                  }
                }}
              >
                {level}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            You can widen your own case. De-escalation is monitor-only.
          </p>
        </section>
      )}

      {isLiaison && (
        <LiaisonOutcomeForm
          recordId={record.id}
          outcome={outcome}
          setOutcome={setOutcome}
          outcomeNotes={outcomeNotes}
          setOutcomeNotes={setOutcomeNotes}
        />
      )}

      <AttachmentsModal
        open={showAttachments}
        onOpenChange={setShowAttachments}
        recordTitle={record.title}
        attachments={record.attachments}
      />
    </div>
  )
}

function LiaisonOutcomeForm({
  recordId,
  outcome,
  setOutcome,
  outcomeNotes,
  setOutcomeNotes,
}: {
  recordId: string
  outcome: string
  setOutcome: (value: string) => void
  outcomeNotes: string
  setOutcomeNotes: (value: string) => void
}) {
  const queryClient = useQueryClient()
  const referrals = useQuery({
    queryKey: ["my-referrals"],
    queryFn: () => import("@/lib/actions/records").then((m) => m.getMyReferrals()),
  })
  const mine = referrals.data?.find((entry) => entry.record.id === recordId)

  if (!mine) return null

  return (
    <section className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Case outcome
      </h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault()
          try {
            await recordCourtOutcome({
              referralId: mine.referralId,
              outcome,
              outcomeNotes,
            })
            toast.success("Outcome recorded.")
            await queryClient.invalidateQueries({ queryKey: ["record", recordId] })
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed.")
          }
        }}
      >
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          className="h-9 rounded-2xl border bg-input/50 px-2.5 text-sm outline-none"
          aria-label="Outcome"
        >
          {["pending", "charged", "withdrawn", "dismissed", "convicted", "acquitted", "other"].map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            )
          )}
        </select>
        <Textarea
          value={outcomeNotes}
          onChange={(event) => setOutcomeNotes(event.target.value)}
          placeholder="Outcome notes (optional)"
        />
        <Button type="submit" size="sm" className="w-fit">
          Record outcome
        </Button>
      </form>
    </section>
  )
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit rounded-full">
      <Link href="/">
        <ArrowLeftIcon data-icon="inline-start" />
        Back
      </Link>
    </Button>
  )
}
