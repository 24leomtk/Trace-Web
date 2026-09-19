"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, PrinterIcon } from "lucide-react"
import { toast } from "sonner"

import {
  changeStatus,
  getRecord,
  getRecordData,
  getTransitionHints,
  reassignRecord,
  setAccessLevel,
  updateRecord,
} from "@/lib/actions/records"
import {
  listCourtLiaisons,
  liveCourtReferralsFor,
  recordCourtOutcome,
  referCaseToCourt,
  renewCourtAccess,
  revokeCourtAccess,
} from "@/lib/actions/access"
import { branchOptions } from "@/lib/actions/admin"
import {
  assignCase,
  cancelAssignment,
  completeAssignment,
  listAssignableUsers,
  listRecordAssignments,
} from "@/lib/actions/assignments"
import { addReview, listReviews } from "@/lib/actions/reviews"
import { RECORD_TYPE_META, TONE_BADGE_CLASS } from "@/lib/record-meta"
import { assignmentDue, formatDateTime, referralSla } from "@/lib/format"
import { formatDistrict } from "@/lib/roles"
import type { AccessLevel, CaseStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AttachmentsModal } from "@/components/app/attachments-modal"
import { CitationLedger } from "@/components/app/citation-ledger"
import { EntityPicker } from "@/components/app/entity-picker"
import { formatCoords, openStreetMapUrl } from "@/components/app/geo-capture"
import { LinkedEntities } from "@/components/app/linked-entities"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { ArrestDetail } from "@/components/app/arrest-detail"
import { ImpoundCustody } from "@/components/app/impound-custody"
import { LocateCard } from "@/components/app/locate-card"
import { SearchInput } from "@/components/app/search-input"
import { ReferralBundle } from "@/components/app/referral-bundle"
import { StatusUpdateDialog } from "@/components/app/status-update-dialog"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import {
  DynamicFields,
  type FormValues,
} from "@/components/app/record-form/dynamic-fields"
import { RECORD_FORM_FIELDS } from "@/components/app/record-form/fields"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useUser } from "@/providers/user-context"

const LEVELS: AccessLevel[] = ["branch", "district", "country"]

function setDeep(
  target: Record<string, unknown>,
  path: string,
  value: unknown
) {
  const segments = path.split(".")
  let node = target
  for (let index = 0; index < segments.length - 1; index++) {
    const key = segments[index]
    if (typeof node[key] !== "object" || node[key] === null) node[key] = {}
    node = node[key] as Record<string, unknown>
  }
  node[segments[segments.length - 1]] = value
}

export default function RecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user } = useUser()
  const queryClient = useQueryClient()
  const [showAttachments, setShowAttachments] = useState(false)
  const [liaisonId, setLiaisonId] = useState("")
  const [reason, setReason] = useState("")
  const [outcome, setOutcome] = useState("charged")
  const [outcomeNotes, setOutcomeNotes] = useState("")
  const [reviewNote, setReviewNote] = useState("")
  const [editing, setEditing] = useState(false)
  const [editValues, setEditValues] = useState<FormValues>({})
  const [reassignTo, setReassignTo] = useState("")
  const [taskAssignee, setTaskAssignee] = useState("")
  const [taskDue, setTaskDue] = useState("")
  const [taskNote, setTaskNote] = useState("")
  const [tab, setTab] = useState("case")
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const isMonitor =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"
  const recordQuery = useQuery({
    queryKey: ["record", id],
    queryFn: () => getRecord(id),
  })
  const referralsQuery = useQuery({
    queryKey: ["referrals", id],
    queryFn: () => liveCourtReferralsFor(id),
    enabled:
      user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR",
  })
  const liaisonsQuery = useQuery({
    queryKey: ["court-liaisons"],
    queryFn: listCourtLiaisons,
    enabled:
      user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR",
  })
  const reviewsQuery = useQuery({
    queryKey: ["reviews", id],
    queryFn: () => listReviews(id),
    enabled: !!recordQuery.data,
  })
  const branchesQuery = useQuery({
    queryKey: ["branch-options", user.domain],
    queryFn: () =>
      branchOptions(user.domain === "traffic" ? "traffic" : "regular"),
    enabled: user.role === "DISTRICT_MONITOR",
  })
  const assignmentsQuery = useQuery({
    queryKey: ["assignments", id],
    queryFn: () => listRecordAssignments(id),
    enabled: !!recordQuery.data,
  })
  const assignableQuery = useQuery({
    queryKey: ["assignable-users"],
    queryFn: listAssignableUsers,
    enabled: isMonitor,
  })
  const hintsQuery = useQuery({
    queryKey: ["transition-hints", id],
    queryFn: () => getTransitionHints(id),
    enabled: isMonitor && statusDialogOpen && !!recordQuery.data,
  })
  const reviewsSearch = usePaginatedSearch({
    items: reviewsQuery.data ?? [],
    search: (review, q) =>
      `${review.note} ${review.reviewerName}`.toLowerCase().includes(q),
  })
  const tasksSearch = usePaginatedSearch({
    items: assignmentsQuery.data ?? [],
    search: (task, q) =>
      `${task.assigneeName} ${task.note ?? ""} ${task.state}`
        .toLowerCase()
        .includes(q),
  })

  const isLiaison = user.role === "COURT_LIAISON"
  const canReview = isMonitor || recordQuery.data?.reportedBy === user.id

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["record", id] })
    await queryClient.invalidateQueries({ queryKey: ["referrals", id] })
    await queryClient.invalidateQueries({ queryKey: ["reviews", id] })
    await queryClient.invalidateQueries({ queryKey: ["assignments", id] })
    await queryClient.invalidateQueries({ queryKey: ["my-assignments"] })
    await queryClient.invalidateQueries({ queryKey: ["custody", id] })
    await queryClient.invalidateQueries({ queryKey: ["locate", id] })
  }

  async function confirmStatusChange(next: CaseStatus, statusReason: string) {
    setStatusSaving(true)
    setStatusError(null)
    try {
      await changeStatus({
        id,
        status: next,
        reason: statusReason || `Status → ${next}.`,
      })
      toast.success(`Status → ${next}.`)
      setStatusDialogOpen(false)
      await refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed."
      setStatusError(message)
      toast.error(message)
    } finally {
      setStatusSaving(false)
    }
  }

  async function startEditing() {
    try {
      const payload = await getRecordData(id)
      const record = recordQuery.data
      if (!record) return
      const values: FormValues = {}
      for (const field of RECORD_FORM_FIELDS[record.recordType]) {
        const raw = payload[field.path]
        values[field.path] =
          raw ??
          (field.kind === "stringlist" || field.kind === "rowlist"
            ? []
            : field.kind === undefined && field.type === "checkbox"
              ? false
              : "")
      }
      // F10: carry the GPS fix (not a rendered field) so edits don't drop it.
      if (typeof payload.latitude === "number")
        values.latitude = payload.latitude
      if (typeof payload.longitude === "number")
        values.longitude = payload.longitude
      setEditValues(values)
      setEditing(true)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load payload."
      )
    }
  }

  async function submitEdit(event: React.SubmitEvent) {
    event.preventDefault()
    const payload: Record<string, unknown> = {}
    for (const [path, raw] of Object.entries(editValues)) {
      if (typeof raw === "string") {
        if (raw.trim() === "") continue
        const numeric = ["age", "estimated_value", "fine_amount"].includes(path)
          ? Number(raw)
          : raw
        setDeep(payload, path, numeric)
      } else if (Array.isArray(raw)) {
        if (raw.length > 0) setDeep(payload, path, raw)
      } else if (raw != null) {
        setDeep(payload, path, raw)
      }
    }
    try {
      await updateRecord({ id, data: payload })
      toast.success("Case updated.")
      setEditing(false)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.")
    }
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
        <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          {recordQuery.error instanceof Error
            ? recordQuery.error.message
            : "Record not found."}
        </p>
      </div>
    )
  }

  const record = recordQuery.data
  const meta = RECORD_TYPE_META[record.recordType]
  const canEdit =
    record.status === "active" && (record.reportedBy === user.id || isMonitor)
  const isPolice =
    user.role === "OFFICER" ||
    user.role === "DISTRICT_MONITOR" ||
    user.role === "COUNTRY_MONITOR"
  const isFiler = record.reportedBy === user.id

  // U5 consolidated pane — one header, role-filtered tabs.
  const tabs: { value: string; label: string }[] = [
    { value: "case", label: "Case" },
    ...(isPolice && (record.personId || record.vehicleId)
      ? [{ value: "people", label: "People & vehicles" }]
      : []),
    { value: "reviews", label: "Reviews & tasks" },
    ...(isMonitor || isLiaison
      ? [
          {
            value: "justice",
            label: isLiaison ? "Referral & outcome" : "Justice",
          },
        ]
      : []),
    ...(isMonitor || (user.role === "OFFICER" && isFiler)
      ? [{ value: "manage", label: "Manage" }]
      : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between print:hidden">
        <BackLink />
        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          <PrinterIcon data-icon="inline-start" />
          Print
        </Button>
      </div>

      <header className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {meta.label} · {record.district.replace(/_/g, " ")} ·{" "}
              {record.branchName}
            </p>
            <h1 className="text-xl font-semibold">{record.title}</h1>
          </div>
          {isMonitor && (
            <Button
              size="sm"
              onClick={() => setStatusDialogOpen(true)}
              className="shrink-0 rounded-none print:hidden"
            >
              Update status · {record.status}
            </Button>
          )}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {record.summary}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {record.badges.map((badge) => (
            <span
              key={badge.label}
              className={cn(
                "inline-flex items-center rounded-none border px-1.5 py-0.5 text-xs font-medium",
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
          {record.geo && (
            <>
              {" · "}
              <a
                href={openStreetMapUrl(
                  record.geo.latitude,
                  record.geo.longitude
                )}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                GPS {formatCoords(record.geo.latitude, record.geo.longitude)}
              </a>
            </>
          )}
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Case sections"
        className="flex gap-1 overflow-x-auto rounded-none border bg-muted/40 p-1 print:hidden"
      >
        {tabs.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            onClick={() => setTab(option.value)}
            className={cn(
              "flex-1 rounded-none px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              tab === option.value
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "people" && (
        <LinkedEntities
          personId={record.personId}
          vehicleId={record.vehicleId}
        />
      )}

      {record.attachments.length > 0 && (
        <Button
          variant="outline"
          className="w-fit rounded-none print:hidden"
          onClick={() => setShowAttachments(true)}
        >
          View {record.attachments.length} attachment
          {record.attachments.length === 1 ? "" : "s"}
        </Button>
      )}

      {tab === "case" && (
        <>
          {editing ? (
            <form
              onSubmit={submitEdit}
              className="flex flex-col gap-4 rounded-none border bg-card p-4 print:hidden"
            >
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Edit case (active records only)
              </h2>
              <DynamicFields
                fields={RECORD_FORM_FIELDS[record.recordType]}
                values={editValues}
                setValue={(path, value) =>
                  setEditValues((prev) => ({ ...prev, [path]: value }))
                }
                errors={{}}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Save changes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            canEdit && (
              <div className="print:hidden">
                <Button variant="outline" size="sm" onClick={startEditing}>
                  Edit case details
                </Button>
              </div>
            )
          )}

          {record.recordType === "traffic_citation" && (
            <CitationLedger
              recordId={record.id}
              canManage={record.reportedBy === user.id || isMonitor}
              isMonitor={isMonitor}
            />
          )}

          {record.recordType === "arrest_record" && (
            <ArrestDetail
              recordId={record.id}
              canManage={record.reportedBy === user.id || isMonitor}
              isActive={record.status === "active"}
            />
          )}

          {record.recordType === "vehicle_impoundment" && isPolice && (
            <ImpoundCustody recordId={record.id} />
          )}
        </>
      )}

      {tab === "reviews" && (
        <>
          {isPolice &&
            [
              "wanted_person",
              "missing_person",
              "missing_vehicle",
              "stolen_property",
            ].includes(record.recordType) && (
              <LocateCard
                recordId={record.id}
                recordType={record.recordType}
                isFiler={isFiler}
              />
            )}
          <section className="flex flex-col gap-3 rounded-none border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Reviews & follow-up notes
          </h2>
          {(reviewsQuery.data ?? []).length > 4 && (
            <div className="flex items-start gap-2">
              <SearchInput
                value={reviewsSearch.query}
                onChange={reviewsSearch.setQuery}
                placeholder="Search reviews…"
                className="flex-1"
              />
              <ListRefreshButton onRefresh={refresh} loading={reviewsQuery.isFetching} />
            </div>
          )}
          {reviewsQuery.data && reviewsQuery.data.length > 0 ? (
            reviewsSearch.visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reviews match “{reviewsSearch.debouncedQuery}”.
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {reviewsSearch.visible.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-none border px-3 py-2 text-sm"
                    >
                      <p>{review.note}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {review.reviewerName} · {formatDateTime(review.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
                <ListPagination
                  page={reviewsSearch.page}
                  pageCount={reviewsSearch.pageCount}
                  onPage={reviewsSearch.setPage}
                  total={reviewsSearch.total}
                />
              </>
            )
          ) : (
            <p className="text-sm text-muted-foreground">No reviews yet.</p>
          )}
          {canReview && (
            <form
              className="flex flex-col gap-2 print:hidden"
              onSubmit={async (event) => {
                event.preventDefault()
                try {
                  await addReview({ recordId: record.id, note: reviewNote })
                  toast.success("Review added.")
                  setReviewNote("")
                  await refresh()
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Failed."
                  )
                }
              }}
            >
              <Textarea
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Add a review note or follow-up…"
              />
              <Button
                type="submit"
                size="sm"
                className="w-fit"
                disabled={!reviewNote.trim()}
              >
                Add review
              </Button>
            </form>
          )}
        </section>
        </>
      )}

      {isMonitor && (
        <>
          {tab === "manage" && (
            <>
              <section className="flex flex-col gap-2 rounded-none border bg-card p-4 print:hidden">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Status
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-none border px-2 py-1 text-sm font-medium">
                    {record.status}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatusDialogOpen(true)}
                  >
                    Update status…
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Status changes are logged with a reason and notify the filing
                  officer.
                </p>
              </section>

              <section className="flex flex-col gap-2 rounded-none border bg-card p-4 print:hidden">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Visibility
                </h2>
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map((level) => (
                    <Button
                      key={level}
                      size="sm"
                      variant={
                        record.accessLevel === level ? "default" : "outline"
                      }
                      onClick={async () => {
                        try {
                          await setAccessLevel({ id: record.id, level })
                          toast.success(`Visibility → ${level}.`)
                          await refresh()
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : "Failed."
                          )
                        }
                      }}
                    >
                      {level}
                    </Button>
                  ))}
                </div>
              </section>

              {user.role === "DISTRICT_MONITOR" && (
                <section className="flex flex-col gap-2 rounded-none border bg-card p-4 print:hidden">
                  <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Reassign branch
                  </h2>
                  <form
                    className="flex gap-2"
                    onSubmit={async (event) => {
                      event.preventDefault()
                      if (!reassignTo) return
                      try {
                        await reassignRecord({
                          id: record.id,
                          branchId: reassignTo,
                        })
                        toast.success("Case reassigned.")
                        setReassignTo("")
                        await refresh()
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Failed."
                        )
                      }
                    }}
                  >
                    <EntityPicker
                      label="Target branch"
                      placeholder="Select branch…"
                      value={reassignTo}
                      onChange={setReassignTo}
                      triggerClassName="h-9 flex-1"
                      source={{
                        mode: "client",
                        items: (branchesQuery.data ?? [])
                          .filter((branch) => branch.id !== record.branchId)
                          .map((branch) => ({
                            value: branch.id,
                            label: branch.name,
                            detail: formatDistrict(branch.district),
                          })),
                      }}
                    />
                    <Button type="submit" size="sm">
                      Move
                    </Button>
                  </form>
                </section>
              )}
            </>
          )}

          {tab === "reviews" && (
            <section className="flex flex-col gap-2 rounded-none border bg-card p-4 print:hidden">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Tasking
              </h2>
              {record.recordType === "crime_incident" &&
                record.status === "active" &&
                (assignmentsQuery.data ?? []).length === 0 &&
                isMonitor && (
                  <p className="rounded-none border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                    No investigator assigned yet — assign one below so this
                    incident has an owner.
                  </p>
                )}
              {(assignmentsQuery.data ?? []).length > 4 && (
                <div className="flex items-start gap-2">
                  <SearchInput
                    value={tasksSearch.query}
                    onChange={tasksSearch.setQuery}
                    placeholder="Search tasks…"
                    className="flex-1"
                  />
                  <ListRefreshButton onRefresh={refresh} loading={assignmentsQuery.isFetching} />
                </div>
              )}
              {(assignmentsQuery.data ?? []).length > 0 ? (
                tasksSearch.visible.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tasks match “{tasksSearch.debouncedQuery}”.
                  </p>
                ) : (
                <>
                <ul className="flex flex-col gap-2">
                  {tasksSearch.visible.map((task) => {
                    const due = assignmentDue(task.dueAt, task.state)
                    return (
                      <li
                        key={task.id}
                        className="rounded-none border px-3 py-2 text-sm"
                      >
                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                          <span>{task.assigneeName}</span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-none border px-1.5 py-0.5 text-xs",
                              task.state === "open"
                                ? due.overdue
                                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                                  : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                                : "border-border bg-muted/40 text-muted-foreground"
                            )}
                          >
                            {task.state === "open"
                              ? due.overdue
                                ? `Overdue ${Math.abs(due.daysLeft ?? 0)}d`
                                : due.daysLeft != null
                                  ? due.daysLeft === 0
                                    ? "Due today"
                                    : `Due in ${due.daysLeft}d`
                                  : "Open"
                              : task.state}
                          </span>
                        </p>
                        {(task.note || task.dueAt) && (
                          <p className="text-xs text-muted-foreground">
                            {[
                              task.note,
                              task.dueAt
                                ? `due ${task.dueAt.slice(0, 10)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        {task.state === "open" && (
                          <div className="mt-1.5 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await completeAssignment(task.id)
                                  toast.success("Task done.")
                                  await refresh()
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Failed."
                                  )
                                }
                              }}
                            >
                              Done
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await cancelAssignment(task.id)
                                  toast.success("Task cancelled.")
                                  await refresh()
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Failed."
                                  )
                                }
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <ListPagination
                  page={tasksSearch.page}
                  pageCount={tasksSearch.pageCount}
                  onPage={tasksSearch.setPage}
                  total={tasksSearch.total}
                />
                </>
                )
              ) : (
                <p className="text-sm text-muted-foreground">No tasks yet.</p>
              )}
              <form
                className="flex flex-col gap-2"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (!taskAssignee) {
                    toast.error("Choose who to task.")
                    return
                  }
                  try {
                    await assignCase({
                      recordId: record.id,
                      assigneeId: taskAssignee,
                      dueAt: taskDue || undefined,
                      note: taskNote || undefined,
                    })
                    toast.success("Task assigned.")
                    setTaskAssignee("")
                    setTaskDue("")
                    setTaskNote("")
                    await refresh()
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Failed."
                    )
                  }
                }}
              >
                <EntityPicker
                  label="Assignee"
                  placeholder="Select officer…"
                  value={taskAssignee}
                  onChange={setTaskAssignee}
                  triggerClassName="h-9"
                  source={{
                    mode: "client",
                    items: (assignableQuery.data ?? []).map((person) => ({
                      value: person.id,
                      label: person.name,
                      detail: person.detail,
                    })),
                  }}
                />
                <div className="flex gap-2">
                  <DatePicker
                    value={taskDue}
                    onChange={setTaskDue}
                    label="Due date (optional)"
                    placeholder="Due date (optional)"
                    min={new Date().toISOString().slice(0, 10)}
                    className="flex-1"
                  />
                  <Input
                    value={taskNote}
                    onChange={(event) => setTaskNote(event.target.value)}
                    placeholder="Task note (optional)"
                    aria-label="Task note"
                  />
                </div>
                <Button type="submit" size="sm" className="w-fit">
                  Assign task
                </Button>
              </form>
            </section>
          )}

          {tab === "justice" && (
            <section className="flex flex-col gap-3 rounded-none border bg-card p-4 print:hidden">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Court referrals
              </h2>
              {referralsQuery.data && referralsQuery.data.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {referralsQuery.data.map((referral) => {
                    const sla = referralSla(
                      referral.referredAt,
                      referral.firstViewedAt,
                      null
                    )
                    return (
                      <li
                        key={referral.id}
                        className="flex flex-col gap-2 rounded-none border px-3 py-2 text-sm"
                      >
                        <p className="font-medium">{referral.liaisonName}</p>
                        <p className="text-xs text-muted-foreground">
                          {referral.reason || "No reason given"} · until{" "}
                          {referral.expiresAt
                            ? formatDateTime(referral.expiresAt)
                            : "—"}{" "}
                          · outcome: {referral.outcome}
                        </p>
                        <p className="flex flex-wrap gap-1.5 text-xs">
                          <span className="inline-flex items-center rounded-none border px-1.5 py-0.5 font-medium text-muted-foreground">
                            Referred {sla.daysSinceReferral}d ago
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-none border px-1.5 py-0.5 font-medium",
                              sla.viewOverdue
                                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                            )}
                          >
                            {sla.daysToView == null
                              ? sla.viewOverdue
                                ? "Unviewed · overdue"
                                : "Unviewed"
                              : `Viewed in ${sla.daysToView}d`}
                          </span>
                          <span className="inline-flex items-center rounded-none border px-1.5 py-0.5 font-medium text-muted-foreground">
                            {referral.documentsCount} brief doc
                            {referral.documentsCount === 1 ? "" : "s"}
                          </span>
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
                        <ReferralBundle
                          referralId={referral.id}
                          canUpload
                          caseAttachmentCount={record.attachments.length}
                        />
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No live referrals.
                </p>
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
                    toast.error(
                      error instanceof Error ? error.message : "Failed."
                    )
                  }
                }}
              >
                <EntityPicker
                  label="Court liaison"
                  placeholder="Select liaison…"
                  value={liaisonId}
                  onChange={setLiaisonId}
                  triggerClassName="h-9"
                  source={{
                    mode: "client",
                    items: (liaisonsQuery.data ?? []).map((liaison) => ({
                      value: liaison.id,
                      label: liaison.name,
                      detail: liaison.orgName ?? undefined,
                    })),
                  }}
                />
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
          )}
        </>
      )}

      {user.role === "OFFICER" &&
        record.reportedBy === user.id &&
        tab === "manage" && (
          <section className="flex flex-col gap-2 rounded-none border bg-card p-4 print:hidden">
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
                      toast.error(
                        error instanceof Error ? error.message : "Failed."
                      )
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

      {isLiaison && tab === "justice" && (
        <LiaisonOutcomeForm
          recordId={record.id}
          attachmentCount={record.attachments.length}
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
      {isMonitor && (
        <StatusUpdateDialog
          open={statusDialogOpen}
          onOpenChange={(open) => {
            setStatusDialogOpen(open)
            if (!open) setStatusError(null)
          }}
          currentStatus={record.status}
          saving={statusSaving}
          hints={hintsQuery.data?.hints}
          serverError={statusError}
          onConfirm={confirmStatusChange}
        />
      )}
    </div>
  )
}

function LiaisonOutcomeForm({
  recordId,
  attachmentCount,
  outcome,
  setOutcome,
  outcomeNotes,
  setOutcomeNotes,
}: {
  recordId: string
  attachmentCount: number
  outcome: string
  setOutcome: (value: string) => void
  outcomeNotes: string
  setOutcomeNotes: (value: string) => void
}) {
  const queryClient = useQueryClient()
  const referrals = useQuery({
    queryKey: ["my-referrals"],
    queryFn: () =>
      import("@/lib/actions/records").then((m) => m.getMyReferrals()),
  })
  const mine = referrals.data?.find((entry) => entry.record.id === recordId)

  if (!mine) return null

  return (
    <div className="flex flex-col gap-4 print:hidden">
      <ReferralBundle
        referralId={mine.referralId}
        canUpload={false}
        caseAttachmentCount={attachmentCount}
      />
      <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
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
              await queryClient.invalidateQueries({
                queryKey: ["record", recordId],
              })
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed.")
            }
          }}
        >
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger aria-label="Outcome" className="h-9">
              <SelectValue placeholder="Select outcome…" />
            </SelectTrigger>
            <SelectContent>
              {[
                "pending",
                "charged",
                "withdrawn",
                "dismissed",
                "convicted",
                "acquitted",
                "other",
              ].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
    </div>
  )
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit rounded-none">
      <Link href="/">
        <ArrowLeftIcon data-icon="inline-start" />
        Back
      </Link>
    </Button>
  )
}
