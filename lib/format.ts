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
