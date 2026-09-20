"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  FileAudioIcon,
  FilePlus2Icon,
  FileTextIcon,
  FileVideoIcon,
  ImageIcon,
  MicroscopeIcon,
  PencilLineIcon,
  PlusIcon,
  PrinterIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  addRecordAttachments,
  changeStatus,
  getRecord,
  getRecordData,
  getTransitionHints,
  reassignRecord,
  setAccessLevel,
  updateRecord,
} from "@/lib/actions/records"
import {
  getRecordAuditLog,
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
import { getUploadCredentials } from "@/lib/actions/uploads"
import { uploadFileToCloudinary } from "@/lib/upload"
import { RECORD_TYPE_META, TONE_BADGE_CLASS } from "@/lib/record-meta"
import {
  assignmentDue,
  formatBytes,
  formatDateKey,
  formatDateShort,
  referralSla,
  shortFileHash,
} from "@/lib/format"
import { formatDistrict } from "@/lib/roles"
import type { AccessLevel, AttachmentMeta, CaseStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { formatCoords, openStreetMapUrl } from "@/components/app/geo-capture"
import { LinkedEntities } from "@/components/app/linked-entities"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { ArrestDetail } from "@/components/app/arrest-detail"
import { ImpoundCustody } from "@/components/app/impound-custody"
import { LocateCard } from "@/components/app/locate-card"
import { EntityPicker } from "@/components/app/entity-picker"
import { SearchInput } from "@/components/app/search-input"
import { ReferralBundle } from "@/components/app/referral-bundle"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { StatusUpdateDialog } from "@/components/app/status-update-dialog"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import {
  DynamicFields,
  type FormValues,
} from "@/components/app/record-form/dynamic-fields"
import {
  RECORD_FORM_FIELDS,
  type AnyFieldDef,
} from "@/components/app/record-form/fields"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DetailHeaderSkeleton } from "@/components/app/list-skeletons"
import { Textarea } from "@/components/ui/textarea"
import { useUser } from "@/providers/user-context"
import { CitationLedger } from "@/components/app/citation-ledger"

const LEVELS: AccessLevel[] = ["branch", "district", "country"]

const KIND_ICON: Record<AttachmentMeta["kind"], typeof FileTextIcon> = {
  pdf: FileTextIcon,
  image: ImageIcon,
  lab: MicroscopeIcon,
  video: FileVideoIcon,
  audio: FileAudioIcon,
  doc: FileTextIcon,
}

const LOCATABLE = [
  "wanted_person",
  "missing_person",
  "missing_vehicle",
  "stolen_property",
]

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

function formatFieldValue(field: AnyFieldDef, raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === "boolean") return raw ? "Yes" : "No"
  if (typeof raw === "number") return String(raw)
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    return trimmed ? trimmed : null
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null
    if (field.kind === "rowlist") {
      const rows = raw
        .map((row) => {
          if (typeof row === "string") return row
          if (typeof row === "object" && row !== null) {
            const parts = field.fields
              .map((sub) => {
                const value = (row as Record<string, unknown>)[sub.path]
                return typeof value === "string" && value.trim()
                  ? value.trim()
                  : null
              })
              .filter(Boolean)
            return parts.length > 0 ? parts.join(" · ") : null
          }
          return null
        })
        .filter(Boolean) as string[]
      return rows.length > 0 ? rows.join("; ") : null
    }
    const items = raw.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0
    )
    return items.length > 0 ? items.join(", ") : null
  }
  return null
}

export default function RecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user } = useUser()
  const queryClient = useQueryClient()

  const [editOpen, setEditOpen] = useState(false)
  const [editValues, setEditValues] = useState<FormValues>({})
  const [editSaving, setEditSaving] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [referOpen, setReferOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [reassignOpen, setReassignOpen] = useState(false)

  const isMonitor =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"

  const recordQuery = useQuery({
    queryKey: ["record", id],
    queryFn: () => getRecord(id),
  })
  const recordDataQuery = useQuery({
    queryKey: ["record-data", id],
    queryFn: () => getRecordData(id),
    enabled: !!recordQuery.data,
  })
  const referralsQuery = useQuery({
    queryKey: ["referrals", id],
    queryFn: () => liveCourtReferralsFor(id),
    enabled:
      !!recordQuery.data &&
      (user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"),
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
    enabled: user.role === "DISTRICT_MONITOR" && !!recordQuery.data,
  })
  const assignmentsQuery = useQuery({
    queryKey: ["assignments", id],
    queryFn: () => listRecordAssignments(id),
    enabled: !!recordQuery.data,
  })
  const assignableQuery = useQuery({
    queryKey: ["assignable-users"],
    queryFn: listAssignableUsers,
    enabled: isMonitor && !!recordQuery.data,
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
  // Audit trail: monitors are the only roles that can both open a record
  // and pass the audit-log gate.
  const canViewAudit = isMonitor
  const recordAuditQuery = useQuery({
    queryKey: ["record-audit", id],
    queryFn: () => getRecordAuditLog(id),
    enabled: !!recordQuery.data && canViewAudit,
  })
  const auditSearch = usePaginatedSearch({
    items: recordAuditQuery.data ?? [],
    pageSize: 5,
    search: (entry, q) =>
      `${entry.actorName} ${entry.action.replace(/_/g, " ")} ${entry.detail ?? ""}`
        .toLowerCase()
        .includes(q),
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["record", id] })
    await queryClient.invalidateQueries({ queryKey: ["record-data", id] })
    await queryClient.invalidateQueries({ queryKey: ["referrals", id] })
    await queryClient.invalidateQueries({ queryKey: ["reviews", id] })
    await queryClient.invalidateQueries({ queryKey: ["assignments", id] })
    await queryClient.invalidateQueries({ queryKey: ["record-audit", id] })
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

  async function openEditDialog() {
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
      setEditOpen(true)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load payload."
      )
    }
  }

  async function submitEdit(event: React.SubmitEvent) {
    event.preventDefault()
    setEditSaving(true)
    const payload: Record<string, unknown> = {}
    for (const [path, raw] of Object.entries(editValues)) {
      if (typeof raw === "string") {
        if (raw.trim() === "") continue
        const numeric = ["age", "age_from", "age_to", "height_cm_from", "height_cm_to", "weight_kg_from", "weight_kg_to", "estimated_value", "fine_amount"].includes(path)
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
      setEditOpen(false)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.")
    } finally {
      setEditSaving(false)
    }
  }

  if (recordQuery.isLoading) {
    return <DetailHeaderSkeleton />
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
  const canManageFiles = canEdit
  const isPolice =
    user.role === "OFFICER" ||
    user.role === "DISTRICT_MONITOR" ||
    user.role === "COUNTRY_MONITOR"
  const isFiler = record.reportedBy === user.id
  const showPeople = isPolice && (record.personId || record.vehicleId)
  const showLocate = isPolice && LOCATABLE.includes(record.recordType)
  const showManage = isMonitor || (user.role === "OFFICER" && isFiler)
  const payload = (recordDataQuery.data ?? {}) as Record<string, unknown>
  const detailFields = (RECORD_FORM_FIELDS[record.recordType] ?? [])
    .map((field) => ({
      field,
      display: formatFieldValue(field, payload[field.path]),
    }))
    .filter((entry) => entry.display)
  // Reassign targets: in-district, in-domain branches excluding the current
  // one. Single-branch districts legitimately yield zero targets.
  const reassignTargets = (branchesQuery.data ?? []).filter(
    (branch) => branch.id !== record.branchId
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between print:hidden">
        <BackLink />
        <div className="flex shrink-0 items-center gap-2">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-none"
              onClick={openEditDialog}
            >
              <PencilLineIcon data-icon="inline-start" />
              Edit
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-none"
            onClick={() => window.print()}
          >
            <PrinterIcon data-icon="inline-start" />
            Print
          </Button>
        </div>
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
          Filed by {record.author.name} · {formatDateShort(record.createdAt)} ·
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

      {/* Case details */}
      <Section title="Case details">
        {recordDataQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading details…</p>
        ) : detailFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No structured details on file.
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {detailFields.map(({ field, display }) => (
              <div
                key={field.path}
                className={cn(
                  "flex flex-col gap-0.5 border-b pb-2",
                  field.kind === "rowlist" && "sm:col-span-2"
                )}
              >
                <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {field.label}
                </dt>
                <dd className="text-sm">{display}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      {/* Files */}
      <Section
        title={`Files (${record.attachments.length})`}
        action={
          canManageFiles ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-none print:hidden"
              onClick={() => setAttachOpen(true)}
            >
              <FilePlus2Icon data-icon="inline-start" />
              Add files
            </Button>
          ) : undefined
        }
      >
        {record.attachments.length === 0 ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            No files attached to this record.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {record.attachments.map((attachment) => {
              const Icon = KIND_ICON[attachment.kind]
              const hash = shortFileHash(attachment.fileHash)
              const isImage =
                attachment.kind === "image" && Boolean(attachment.url)
              return (
                <li key={attachment.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!attachment.url) {
                        toast.error("This attachment has no stored file.")
                        return
                      }
                      window.open(
                        attachment.url,
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }}
                    className="group flex w-full flex-col gap-2 rounded-none border bg-muted/20 p-2 text-left transition-colors hover:bg-muted/40"
                  >
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        loading="lazy"
                        className="aspect-video w-full rounded-none border bg-muted object-cover"
                      />
                    ) : (
                      <span className="flex aspect-video w-full items-center justify-center rounded-none border bg-muted/40 text-muted-foreground">
                        <Icon className="size-6" />
                      </span>
                    )}
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {attachment.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(attachment.sizeBytes)} ·{" "}
                        {attachment.kind.toUpperCase()}
                        {hash ? ` · SHA ${hash}` : ""}
                      </span>
                      {attachment.retentionUntil && (
                        <span className="text-[11px] text-muted-foreground">
                          Kept until{" "}
                          {formatDateKey(
                            attachment.retentionUntil.slice(0, 10)
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

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

      {showPeople && (
        <Section title="People & vehicles">
          <LinkedEntities
            personId={record.personId}
            vehicleId={record.vehicleId}
          />
        </Section>
      )}

      {showLocate && (
        <Section title="Locate & recovery">
          <LocateCard
            recordId={record.id}
            recordType={record.recordType}
            isFiler={isFiler}
          />
        </Section>
      )}

      {/* Reviews */}
      <Section
        title={`Reviews & follow-up notes (${(reviewsQuery.data ?? []).length})`}
        action={
          <div className="flex items-center gap-2 print:hidden">
            <ListRefreshButton
              onRefresh={refresh}
              loading={reviewsQuery.isFetching}
            />
            {canReview && (
              <Button
                size="sm"
                className="rounded-none"
                onClick={() => setReviewOpen(true)}
              >
                <PlusIcon data-icon="inline-start" />
                Add review
              </Button>
            )}
          </div>
        }
      >
        {(reviewsQuery.data ?? []).length > 4 && (
          <SearchInput
            value={reviewsSearch.query}
            onChange={reviewsSearch.setQuery}
            placeholder="Search reviews…"
          />
        )}
        {reviewsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading reviews…</p>
        ) : (reviewsQuery.data ?? []).length === 0 ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            No reviews yet.
          </p>
        ) : reviewsSearch.visible.length === 0 ? (
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
                    {review.reviewerName} · {formatDateShort(review.createdAt)}
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
        )}
      </Section>

      {/* Tasking */}
      {isMonitor && (
        <Section
          title={`Tasks (${(assignmentsQuery.data ?? []).length})`}
          action={
            <div className="flex items-center gap-2 print:hidden">
              <ListRefreshButton
                onRefresh={refresh}
                loading={assignmentsQuery.isFetching}
              />
              <Button
                size="sm"
                className="rounded-none"
                onClick={() => setTaskOpen(true)}
              >
                <PlusIcon data-icon="inline-start" />
                Assign task
              </Button>
            </div>
          }
        >
          {record.recordType === "crime_incident" &&
            record.status === "active" &&
            (assignmentsQuery.data ?? []).length === 0 && (
              <p className="rounded-none border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                No investigator assigned yet — assign one so this incident has
                an owner.
              </p>
            )}
          {(assignmentsQuery.data ?? []).length > 4 && (
            <SearchInput
              value={tasksSearch.query}
              onChange={tasksSearch.setQuery}
              placeholder="Search tasks…"
            />
          )}
          {(assignmentsQuery.data ?? []).length === 0 ? (
            <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              No tasks yet.
            </p>
          ) : tasksSearch.visible.length === 0 ? (
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
                              ? `due ${formatDateKey(task.dueAt.slice(0, 10))}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {task.state === "open" && (
                        <div className="mt-1.5 flex gap-2 print:hidden">
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
          )}
        </Section>
      )}

      {/* Justice */}
      {isMonitor && (
        <Section
          title={`Court referrals (${(referralsQuery.data ?? []).length})`}
          action={
            <Button
              size="sm"
              className="rounded-none print:hidden"
              onClick={() => setReferOpen(true)}
            >
              <PlusIcon data-icon="inline-start" />
              Refer to court
            </Button>
          }
        >
          {referralsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading referrals…</p>
          ) : (referralsQuery.data ?? []).length === 0 ? (
            <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              No live referrals.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(referralsQuery.data ?? []).map((referral) => {
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
                        ? formatDateShort(referral.expiresAt)
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
                    <div className="mt-1.5 flex gap-2 print:hidden">
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
          )}
        </Section>
      )}

      {isLiaison && (
        <LiaisonOutcomeSection
          recordId={record.id}
          attachmentCount={record.attachments.length}
        />
      )}

      {/* Activity — append-only audit trail for this case */}
      {canViewAudit && (
        <Section
          title={`Activity (${(recordAuditQuery.data ?? []).length})`}
          action={
            <ListRefreshButton
              onRefresh={refresh}
              loading={recordAuditQuery.isFetching}
            />
          }
        >
          {(recordAuditQuery.data ?? []).length > 4 && (
            <SearchInput
              value={auditSearch.query}
              onChange={auditSearch.setQuery}
              placeholder="Search actor, action, detail…"
            />
          )}
          {recordAuditQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          ) : recordAuditQuery.isError ? (
            <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              Could not load the activity trail.
            </p>
          ) : (recordAuditQuery.data ?? []).length === 0 ? (
            <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              No recorded activity yet.
            </p>
          ) : auditSearch.visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No entries match “{auditSearch.debouncedQuery}”.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {auditSearch.visible.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-none border px-3 py-2 text-sm"
                  >
                    <p className="font-medium">
                      {entry.actorName} · {entry.action.replace(/_/g, " ")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateShort(entry.at)}
                    </p>
                    {entry.detail && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {entry.detail}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <ListPagination
                page={auditSearch.page}
                pageCount={auditSearch.pageCount}
                onPage={auditSearch.setPage}
                total={auditSearch.total}
              />
            </>
          )}
        </Section>
      )}

      {/* Manage */}
      {showManage && (
        <Section title="Manage">
          <div className="flex flex-col gap-4">
            {isMonitor && (
              <div className="flex flex-col gap-2 print:hidden">
                <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Status
                </h3>
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
              </div>
            )}

            <div className="flex flex-col gap-2 print:hidden">
              <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Visibility
              </h3>
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
              {!isMonitor && (
                <p className="text-xs text-muted-foreground">
                  You can widen your own case. De-escalation is monitor-only.
                </p>
              )}
            </div>

            {user.role === "DISTRICT_MONITOR" && (
              <div className="flex flex-col gap-2 print:hidden">
                <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Reassign branch
                </h3>
                {branchesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading branches…
                  </p>
                ) : reassignTargets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No other branches in your district and domain — this case
                    has nowhere to move.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      Currently at{" "}
                      <span className="font-medium">{record.branchName}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReassignOpen(true)}
                    >
                      Move…
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Dialogs */}
      <ResponsiveModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit case"
        description="Active records only. Changes are validated and audited."
        className="sm:max-w-2xl"
      >
        <form onSubmit={submitEdit} className="flex flex-col gap-4">
          <DynamicFields
            fields={RECORD_FORM_FIELDS[record.recordType]}
            values={editValues}
            setValue={(path, value) =>
              setEditValues((prev) => ({ ...prev, [path]: value }))
            }
            errors={{}}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={editSaving}>
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveModal>

      <AddFilesDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        recordId={record.id}
        onDone={refresh}
      />

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        recordId={record.id}
        onDone={refresh}
      />

      {isMonitor && (
        <TaskDialog
          open={taskOpen}
          onOpenChange={setTaskOpen}
          recordId={record.id}
          onDone={refresh}
        />
      )}

      {isMonitor && (
        <ReferDialog
          open={referOpen}
          onOpenChange={setReferOpen}
          recordId={record.id}
          onDone={refresh}
        />
      )}

      {showManage && user.role === "DISTRICT_MONITOR" && (
        <ReassignDialog
          open={reassignOpen}
          onOpenChange={setReassignOpen}
          recordId={record.id}
          currentBranchName={record.branchName ?? "the current branch"}
          targets={reassignTargets}
          onDone={refresh}
        />
      )}

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

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function AddFilesDialog({
  open,
  onOpenChange,
  recordId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordId: string
  onDone: () => Promise<void>
}) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (files.length === 0) {
      toast.error("Choose at least one file.")
      return
    }
    setUploading(true)
    try {
      const credentials = await getUploadCredentials()
      const uploaded = []
      for (const file of files) {
        uploaded.push(await uploadFileToCloudinary(file, credentials))
      }
      await addRecordAttachments({ id: recordId, attachments: uploaded })
      toast.success(
        `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} added.`
      )
      setFiles([])
      onOpenChange(false)
      await onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!uploading) {
          if (!next) setFiles([])
          onOpenChange(next)
        }
      }}
      title="Add files"
      description="Photos, PDFs, video, audio or documents. Up to 6 files at a time."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input
          type="file"
          multiple
          accept="image/*,application/pdf,video/*,audio/*,.doc,.docx,.txt"
          onChange={(event) =>
            setFiles(Array.from(event.target.files ?? []).slice(0, 6))
          }
          aria-label="Files to attach"
        />
        {files.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {files.map((file) => (
              <li
                key={`${file.name}-${file.size}`}
                className="flex items-center justify-between gap-2 rounded-none border px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium">
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={uploading || files.length === 0}>
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function ReviewDialog({
  open,
  onOpenChange,
  recordId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordId: string
  onDone: () => Promise<void>
}) {
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!note.trim()) return
    setSaving(true)
    try {
      await addReview({ recordId, note: note.trim() })
      toast.success("Review added.")
      setNote("")
      onOpenChange(false)
      await onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!saving) {
          if (!next) setNote("")
          onOpenChange(next)
        }
      }}
      title="Add review"
      description="Notes and follow-ups stay on the case timeline."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a review note or follow-up…"
          rows={4}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !note.trim()}>
            {saving ? "Adding…" : "Add review"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function TaskDialog({
  open,
  onOpenChange,
  recordId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordId: string
  onDone: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const assignableQuery = useQuery({
    queryKey: ["assignable-users"],
    queryFn: listAssignableUsers,
    enabled: open,
  })
  const [assignee, setAssignee] = useState("")
  const [due, setDue] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!assignee) {
      toast.error("Choose who to task.")
      return
    }
    setSaving(true)
    try {
      await assignCase({
        recordId,
        assigneeId: assignee,
        dueAt: due || undefined,
        note: note || undefined,
      })
      toast.success("Task assigned.")
      setAssignee("")
      setDue("")
      setNote("")
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: ["my-assignments"] })
      await onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
      title="Assign task"
      description="Task an officer — they are notified and the task tracks to done."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <EntityPicker
          label="Assignee"
          placeholder="Select officer…"
          value={assignee}
          onChange={setAssignee}
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
            value={due}
            onChange={setDue}
            label="Due date (optional)"
            placeholder="Due date (optional)"
            min={new Date().toISOString().slice(0, 10)}
            className="flex-1"
          />
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Task note (optional)"
            aria-label="Task note"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !assignee}>
            {saving ? "Assigning…" : "Assign task"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function ReferDialog({
  open,
  onOpenChange,
  recordId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordId: string
  onDone: () => Promise<void>
}) {
  const liaisonsQuery = useQuery({
    queryKey: ["court-liaisons"],
    queryFn: listCourtLiaisons,
    enabled: open,
  })
  const [liaisonId, setLiaisonId] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!liaisonId) {
      toast.error("Choose a court liaison.")
      return
    }
    setSaving(true)
    try {
      await referCaseToCourt({ recordId, courtLiaisonId: liaisonId, reason })
      toast.success("Case referred (90-day access).")
      setLiaisonId("")
      setReason("")
      onOpenChange(false)
      await onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
      title="Refer to court"
      description="Grants the liaison 90-day access to this case."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
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
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !liaisonId}>
            {saving ? "Referring…" : "Refer to court"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function ReassignDialog({
  open,
  onOpenChange,
  recordId,
  currentBranchName,
  targets,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordId: string
  currentBranchName: string
  targets: { id: string; name: string; district: string }[]
  onDone: () => Promise<void>
}) {
  const [targetId, setTargetId] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!targetId) {
      toast.error("Choose a target branch.")
      return
    }
    setSaving(true)
    try {
      await reassignRecord({ id: recordId, branchId: targetId })
      toast.success("Case reassigned.")
      setTargetId("")
      onOpenChange(false)
      await onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!saving) {
          if (!next) setTargetId("")
          onOpenChange(next)
        }
      }}
      title="Reassign branch"
      description={`Move this case away from ${currentBranchName}.`}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <EntityPicker
          label="Target branch"
          placeholder="Select branch…"
          value={targetId}
          onChange={setTargetId}
          triggerClassName="h-9"
          source={{
            mode: "client",
            items: targets.map((branch) => ({
              value: branch.id,
              label: branch.name,
              detail: formatDistrict(branch.district),
            })),
          }}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !targetId}>
            {saving ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function LiaisonOutcomeSection({
  recordId,
  attachmentCount,
}: {
  recordId: string
  attachmentCount: number
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState("charged")
  const [outcomeNotes, setOutcomeNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const referrals = useQuery({
    queryKey: ["my-referrals"],
    queryFn: () =>
      import("@/lib/actions/records").then((m) => m.getMyReferrals()),
  })
  const mine = referrals.data?.find((entry) => entry.record.id === recordId)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!mine) return
    setSaving(true)
    try {
      await recordCourtOutcome({
        referralId: mine.referralId,
        outcome,
        outcomeNotes,
      })
      toast.success("Outcome recorded.")
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["record", recordId] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  if (!mine) return null

  return (
    <Section
      title="Referral & outcome"
      action={
        <Button
          size="sm"
          className="rounded-none print:hidden"
          onClick={() => setOpen(true)}
        >
          <PlusIcon data-icon="inline-start" />
          Record outcome
        </Button>
      }
    >
      <ReferralBundle
        referralId={mine.referralId}
        canUpload={false}
        caseAttachmentCount={attachmentCount}
      />
      <ResponsiveModal
        open={open}
        onOpenChange={(next) => {
          if (!saving) setOpen(next)
        }}
        title="Record outcome"
        description="The outcome is shared back with the filing branch."
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
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
            rows={3}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Recording…" : "Record outcome"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveModal>
    </Section>
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
