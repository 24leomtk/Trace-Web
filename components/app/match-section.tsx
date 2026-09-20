"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  findMatchCandidates,
  listMatchesForRecord,
  proposeMatch,
  reviewMatch,
} from "@/lib/actions/matches"
import { formatDateShort } from "@/lib/format"
import { useUser } from "@/providers/user-context"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const MATCH_TONE: Record<string, string> = {
  possible:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  confirmed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  excluded:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300",
}

/**
 * N4 case-match workflow card. Sits in its own section on missing_person
 * and unclaimed_person cases: heuristic candidates can be proposed as
 * links by officers+, and proposed links are confirmed or ruled out by a
 * monitor who didn't propose them. Links never merge — ruling out stays
 * queryable as evidence.
 */
export function MatchSection({ recordId }: { recordId: string }) {
  const { user } = useUser()
  const queryClient = useQueryClient()
  const isMonitor =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"
  const matchesQuery = useQuery({
    queryKey: ["matches", recordId],
    queryFn: () => listMatchesForRecord(recordId),
  })
  const candidatesQuery = useQuery({
    queryKey: ["match-candidates", recordId],
    queryFn: () => findMatchCandidates(recordId),
  })

  const [proposeFor, setProposeFor] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState<string | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["matches", recordId] })
    await queryClient.invalidateQueries({
      queryKey: ["match-candidates", recordId],
    })
    await queryClient.invalidateQueries({ queryKey: ["record", recordId] })
  }

  async function submitPropose(event: React.SubmitEvent) {
    event.preventDefault()
    if (!proposeFor || reason.trim().length < 10) return
    setBusy(true)
    try {
      await proposeMatch({
        recordIdA: recordId,
        recordIdB: proposeFor,
        reason: reason.trim(),
      })
      toast.success("Match proposed — a monitor reviews it.")
      setReason("")
      setProposeFor(null)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  async function submitReview(matchId: string, decision: "confirmed" | "excluded") {
    setReviewing(matchId)
    try {
      await reviewMatch({ matchId, decision })
      toast.success(
        decision === "confirmed" ? "Match confirmed." : "Match ruled out."
      )
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setReviewing(null)
    }
  }

  if (matchesQuery.isLoading || candidatesQuery.isLoading)
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    )
  if (matchesQuery.isError) return null
  const matches = matchesQuery.data ?? []
  const candidates = candidatesQuery.data ?? []

  return (
    <div className="flex flex-col gap-3">
      {matches.length === 0 && candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No linked cases and no candidates — a possible missing↔unclaimed
          link will appear here for review.
        </p>
      )}

      {matches.map((match) => (
        <div
          key={match.id}
          className="flex flex-col gap-1.5 rounded-none border px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-none border px-1.5 py-0.5 text-xs font-medium uppercase",
                MATCH_TONE[match.matchType] ?? MATCH_TONE.possible
              )}
            >
              {match.matchType}
            </span>
            <Link
              href={`/records/${match.otherRecordId}`}
              className="text-sm font-medium underline underline-offset-2"
            >
              {match.otherRecordType.replace(/_/g, " ")} ·{" "}
              {match.otherDistrict.replace(/_/g, " ")}
            </Link>
            <span className="text-xs text-muted-foreground">
              {match.otherStatus} · {formatDateShort(match.createdAt)}
              {match.score != null && ` · score ${match.score}`}
            </span>
          </div>
          {match.reason && (
            <p className="text-sm text-muted-foreground">{match.reason}</p>
          )}
          {match.matchType === "possible" && isMonitor && (
            <div className="flex gap-2 print:hidden">
              <Button
                size="sm"
                className="w-fit rounded-none"
                disabled={reviewing === match.id}
                onClick={() => submitReview(match.id, "confirmed")}
              >
                {reviewing === match.id ? "Saving…" : "Confirm"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-fit rounded-none"
                disabled={reviewing === match.id}
                onClick={() => submitReview(match.id, "excluded")}
              >
                Rule out
              </Button>
            </div>
          )}
        </div>
      ))}

      {candidates.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-sm text-muted-foreground">
            Candidates — heuristic suggestions only. Verify before proposing;
            creating the link is always a human decision.
          </p>
          {candidates.map((candidate) => (
            <div
              key={candidate.recordId}
              className="flex items-center justify-between gap-2"
            >
              <p className="min-w-0 flex-1 truncate text-sm">
                <Link
                  href={`/records/${candidate.recordId}`}
                  className="font-medium underline underline-offset-2"
                >
                  {candidate.name}
                </Link>{" "}
                <span className="text-muted-foreground">
                  · {candidate.recordType.replace(/_/g, " ")} ·{" "}
                  {candidate.district.replace(/_/g, " ")} — {candidate.reason}
                </span>
              </p>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 rounded-none print:hidden"
                onClick={() => setProposeFor(candidate.recordId)}
              >
                <PlusIcon data-icon="inline-start" />
                Propose
              </Button>
            </div>
          ))}
        </div>
      )}

      <ResponsiveModal
        open={proposeFor !== null}
        onOpenChange={(next) => {
          if (!busy) {
            if (!next) {
              setReason("")
              setProposeFor(null)
            }
          }
        }}
        title="Propose match"
        description="Say why these records concern the same person — a monitor reviews it."
      >
        <form onSubmit={submitPropose} className="flex flex-col gap-3">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why these match (min 10 characters)…"
            rows={3}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProposeFor(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || reason.trim().length < 10}
            >
              {busy ? "Proposing…" : "Propose match"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveModal>
    </div>
  )
}
