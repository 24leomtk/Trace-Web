const DATE_FORMATTER_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
})

export function formatTimelineDate(iso: string) {
  const date = new Date(iso)
  return `${DATE_FORMATTER_MONTH.format(date).toUpperCase()} ${String(
    date.getUTCDate()
  ).padStart(2, "0")}, ${date.getUTCFullYear()}`
}

export function formatFullDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso))
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso))
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDelta(pct: number) {
  const sign = pct > 0 ? "+" : pct < 0 ? "" : ""
  return `${sign}${pct.toFixed(0)}%`
}

/** Local-time `yyyy-mm-dd` key that round-trips with fromDateKey. */
export function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Inverse of toDateKey: local-midnight Date from a `yyyy-mm-dd` string. */
export function fromDateKey(key: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return undefined
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function formatDateKey(key: string) {
  const date = fromDateKey(key)
  return date
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date)
    : key
}

export function formatPhone(phone: string) {
  if (!phone.startsWith("+265")) return phone
  const rest = phone.slice(4)
  return `+265 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5, 9)}`
}

export function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

/** Whole days from now until an ISO timestamp (negative = past). */
export function daysUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - now
  if (Number.isNaN(ms)) return null
  return Math.floor(ms / 86_400_000)
}

/** Whole days since an ISO timestamp (negative = future). */
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null
  const ms = now - new Date(iso).getTime()
  if (Number.isNaN(ms)) return null
  return Math.floor(ms / 86_400_000)
}

/** Countdown chip tone: green = comfortable, amber = due soon, red = overdue/imminent. */
export function expiryTone(daysLeft: number | null): "emerald" | "amber" | "red" | "slate" {
  if (daysLeft == null) return "slate"
  if (daysLeft < 0) return "red"
  if (daysLeft <= 7) return "red"
  if (daysLeft <= 30) return "amber"
  return "emerald"
}

export function formatCountdown(daysLeft: number | null): string {
  if (daysLeft == null) return "No expiry"
  if (daysLeft < 0) return `Expired ${Math.abs(daysLeft)}d ago`
  if (daysLeft === 0) return "Expires today"
  if (daysLeft === 1) return "1 day left"
  return `${daysLeft} days left`
}

/** Normalise a plate exactly the way filing does (trim + uppercase, single spaces). */
export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, " ")
}

/** Remaining fine after payments (never below zero; null fine = unknown). */
export function citationBalance(
  fineAmount: number | null,
  totalPaid: number
): number | null {
  if (fineAmount == null || Number.isNaN(fineAmount)) return null
  return Math.max(0, Math.round((fineAmount - totalPaid) * 100) / 100)
}

/** A fine counts as paid once payments cover it (null fine needs any payment). */
export function isCitationPaid(
  fineAmount: number | null,
  totalPaid: number
): boolean {
  if (fineAmount == null || Number.isNaN(fineAmount)) return totalPaid > 0
  return totalPaid >= fineAmount
}

/** Receipt numbers: R- + 6 base-36 chars. Deterministic under test args. */
export function generateReceiptNo(
  now = Date.now(),
  rand = Math.floor(Math.random() * 36 ** 6)
): string {
  const time = now.toString(36).slice(-3).toUpperCase().padStart(3, "0")
  const salt = rand.toString(36).toUpperCase().padStart(3, "0").slice(-3)
  return `R-${time}${salt}`
}

/** F4 referral timeliness thresholds (days). */
export const REFERRAL_VIEW_SLA_DAYS = 7
export const REFERRAL_OUTCOME_SLA_DAYS = 30

export interface ReferralSla {
  daysSinceReferral: number
  daysToView: number | null
  daysToOutcome: number | null
  viewOverdue: boolean
  outcomeOverdue: boolean
}
/**
 * F4 referral SLA from timestamps (all ISO or null). Overdue = unviewed past
 * the view window, or no outcome past the outcome window.
 */
export function referralSla(
  referredAt: string,
  firstViewedAt: string | null,
  outcomeRecordedAt: string | null,
  now = Date.now()
): ReferralSla {
  const referredMs = new Date(referredAt).getTime()
  const daysSinceReferral = Math.max(
    0,
    Math.floor((now - referredMs) / 86_400_000)
  )
  const daysToView =
    firstViewedAt != null
      ? Math.max(
          0,
          Math.floor(
            (new Date(firstViewedAt).getTime() - referredMs) / 86_400_000
          )
        )
      : null
  const daysToOutcome =
    outcomeRecordedAt != null
      ? Math.max(
          0,
          Math.floor(
            (new Date(outcomeRecordedAt).getTime() - referredMs) / 86_400_000
          )
        )
      : null
  return {
    daysSinceReferral,
    daysToView,
    daysToOutcome,
    viewOverdue: daysToView == null && daysSinceReferral > REFERRAL_VIEW_SLA_DAYS,
    outcomeOverdue:
      daysToOutcome == null && daysSinceReferral > REFERRAL_OUTCOME_SLA_DAYS,
  }
}

export interface AssignmentDue {
  overdue: boolean
  daysLeft: number | null
  tone: "red" | "amber" | "slate"
}

/** F9 due status for an open task (closed tasks are never overdue). */
export function assignmentDue(
  dueAt: string | null,
  state: string,
  now = Date.now()
): AssignmentDue {
  if (state !== "open" || !dueAt) {
    return { overdue: false, daysLeft: null, tone: "slate" }
  }
  const daysLeft = Math.floor((new Date(dueAt).getTime() - now) / 86_400_000)
  if (Number.isNaN(daysLeft)) return { overdue: false, daysLeft: null, tone: "slate" }
  if (daysLeft < 0) return { overdue: true, daysLeft, tone: "red" }
  if (daysLeft <= 3) return { overdue: false, daysLeft, tone: "amber" }
  return { overdue: false, daysLeft, tone: "slate" }
}

const WEEK_LABEL_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * U6 Monday-start week buckets (oldest → newest) for trend charts. Buckets
 * are computed in UTC while Postgres truncates in session time — week edges
 * may differ by a day around midnight, which is fine for trend purposes.
 */
export function lastWeekBuckets(weeks: number, today = new Date()) {
  const buckets: { key: string; label: string }[] = []
  const cursor = new Date(today)
  cursor.setUTCHours(0, 0, 0, 0)
  const sinceMonday = (cursor.getUTCDay() + 6) % 7
  cursor.setUTCDate(cursor.getUTCDate() - sinceMonday - (weeks - 1) * 7)
  for (let i = 0; i < weeks; i++) {
    buckets.push({
      key: cursor.toISOString().slice(0, 10),
      label: `${cursor.getUTCDate()} ${WEEK_LABEL_MONTHS[cursor.getUTCMonth()]}`,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  return buckets
}

export type FileKind = "image" | "pdf" | "video" | "audio" | "doc"

/** N2 accepted upload kinds. Executables and anything else are rejected. */
const ACCEPTED_FILE_KINDS: Record<FileKind, RegExp> = {
  image: /^image\//,
  pdf: /^application\/pdf$/,
  video: /^video\//,
  audio: /^audio\//,
  doc: /^(application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain)$/,
}

/** Map a MIME type to an accepted file kind, or null when rejected. */
export function fileKindFromMime(mime: string): FileKind | null {
  const type = mime.trim().toLowerCase()
  for (const [kind, pattern] of Object.entries(ACCEPTED_FILE_KINDS) as [
    FileKind,
    RegExp,
  ][]) {
    if (pattern.test(type)) return kind
  }
  return null
}

/** Per-kind client upload caps (bytes). */
export const FILE_KIND_MAX_BYTES: Record<FileKind, number> = {
  image: 10 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  doc: 10 * 1024 * 1024,
}

/** N2 default retention: 5 years from upload (policy placeholder — a
 * scheduled purge job is still follow-up work). */
export const RETENTION_YEARS = 5

export function defaultRetentionUntil(
  uploadedAt = new Date(),
  years = RETENTION_YEARS
): string {
  const until = new Date(uploadedAt)
  until.setUTCFullYear(until.getUTCFullYear() + years)
  return until.toISOString()
}

/** Short display form of a SHA-256 hex (first 12 chars). */
export function shortFileHash(hash: string | null | undefined): string | null {
  if (!hash) return null
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash
}
