"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFERRAL_OUTCOME_SLA_DAYS = exports.REFERRAL_VIEW_SLA_DAYS = void 0;
exports.formatTimelineDate = formatTimelineDate;
exports.formatFullDate = formatFullDate;
exports.formatDateTime = formatDateTime;
exports.formatBytes = formatBytes;
exports.formatDelta = formatDelta;
exports.toDateKey = toDateKey;
exports.fromDateKey = fromDateKey;
exports.formatDateKey = formatDateKey;
exports.formatPhone = formatPhone;
exports.greetingForHour = greetingForHour;
exports.daysUntil = daysUntil;
exports.daysSince = daysSince;
exports.expiryTone = expiryTone;
exports.formatCountdown = formatCountdown;
exports.normalizePlate = normalizePlate;
exports.citationBalance = citationBalance;
exports.isCitationPaid = isCitationPaid;
exports.generateReceiptNo = generateReceiptNo;
exports.referralSla = referralSla;
const DATE_FORMATTER_MONTH = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
});
function formatTimelineDate(iso) {
    const date = new Date(iso);
    return `${DATE_FORMATTER_MONTH.format(date).toUpperCase()} ${String(date.getUTCDate()).padStart(2, "0")}, ${date.getUTCFullYear()}`;
}
function formatFullDate(iso) {
    return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(iso));
}
function formatDateTime(iso) {
    return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
    }).format(new Date(iso));
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatDelta(pct) {
    const sign = pct > 0 ? "+" : pct < 0 ? "" : "";
    return `${sign}${pct.toFixed(0)}%`;
}
/** Local-time `yyyy-mm-dd` key that round-trips with fromDateKey. */
function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
/** Inverse of toDateKey: local-midnight Date from a `yyyy-mm-dd` string. */
function fromDateKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match)
        return undefined;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
function formatDateKey(key) {
    const date = fromDateKey(key);
    return date
        ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date)
        : key;
}
function formatPhone(phone) {
    if (!phone.startsWith("+265"))
        return phone;
    const rest = phone.slice(4);
    return `+265 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5, 9)}`;
}
function greetingForHour(hour) {
    if (hour < 12)
        return "Good morning";
    if (hour < 17)
        return "Good afternoon";
    return "Good evening";
}
/** Whole days from now until an ISO timestamp (negative = past). */
function daysUntil(iso, now = Date.now()) {
    if (!iso)
        return null;
    const ms = new Date(iso).getTime() - now;
    if (Number.isNaN(ms))
        return null;
    return Math.floor(ms / 86400000);
}
/** Whole days since an ISO timestamp (negative = future). */
function daysSince(iso, now = Date.now()) {
    if (!iso)
        return null;
    const ms = now - new Date(iso).getTime();
    if (Number.isNaN(ms))
        return null;
    return Math.floor(ms / 86400000);
}
/** Countdown chip tone: green = comfortable, amber = due soon, red = overdue/imminent. */
function expiryTone(daysLeft) {
    if (daysLeft == null)
        return "slate";
    if (daysLeft < 0)
        return "red";
    if (daysLeft <= 7)
        return "red";
    if (daysLeft <= 30)
        return "amber";
    return "emerald";
}
function formatCountdown(daysLeft) {
    if (daysLeft == null)
        return "No expiry";
    if (daysLeft < 0)
        return `Expired ${Math.abs(daysLeft)}d ago`;
    if (daysLeft === 0)
        return "Expires today";
    if (daysLeft === 1)
        return "1 day left";
    return `${daysLeft} days left`;
}
/** Normalise a plate exactly the way filing does (trim + uppercase, single spaces). */
function normalizePlate(plate) {
    return plate.trim().toUpperCase().replace(/\s+/g, " ");
}
/** Remaining fine after payments (never below zero; null fine = unknown). */
function citationBalance(fineAmount, totalPaid) {
    if (fineAmount == null || Number.isNaN(fineAmount))
        return null;
    return Math.max(0, Math.round((fineAmount - totalPaid) * 100) / 100);
}
/** A fine counts as paid once payments cover it (null fine needs any payment). */
function isCitationPaid(fineAmount, totalPaid) {
    if (fineAmount == null || Number.isNaN(fineAmount))
        return totalPaid > 0;
    return totalPaid >= fineAmount;
}
/** Receipt numbers: R- + 6 base-36 chars. Deterministic under test args. */
function generateReceiptNo(now = Date.now(), rand = Math.floor(Math.random() * 36 ** 6)) {
    const time = now.toString(36).slice(-3).toUpperCase().padStart(3, "0");
    const salt = rand.toString(36).toUpperCase().padStart(3, "0").slice(-3);
    return `R-${time}${salt}`;
}
/** F4 referral timeliness thresholds (days). */
exports.REFERRAL_VIEW_SLA_DAYS = 7;
exports.REFERRAL_OUTCOME_SLA_DAYS = 30;
/**
 * F4 referral SLA from timestamps (all ISO or null). Overdue = unviewed past
 * the view window, or no outcome past the outcome window.
 */
function referralSla(referredAt, firstViewedAt, outcomeRecordedAt, now = Date.now()) {
    const referredMs = new Date(referredAt).getTime();
    const daysSinceReferral = Math.max(0, Math.floor((now - referredMs) / 86400000));
    const daysToView = firstViewedAt != null
        ? Math.max(0, Math.floor((new Date(firstViewedAt).getTime() - referredMs) / 86400000))
        : null;
    const daysToOutcome = outcomeRecordedAt != null
        ? Math.max(0, Math.floor((new Date(outcomeRecordedAt).getTime() - referredMs) / 86400000))
        : null;
    return {
        daysSinceReferral,
        daysToView,
        daysToOutcome,
        viewOverdue: daysToView == null && daysSinceReferral > exports.REFERRAL_VIEW_SLA_DAYS,
        outcomeOverdue: daysToOutcome == null && daysSinceReferral > exports.REFERRAL_OUTCOME_SLA_DAYS,
    };
}
