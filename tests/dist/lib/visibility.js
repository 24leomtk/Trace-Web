"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canViewRecord = canViewRecord;
exports.isOwnScopeRead = isOwnScopeRead;
exports.escapeLike = escapeLike;
exports.isPolicyLive = isPolicyLive;
exports.isTaxSettled = isTaxSettled;
exports.isTaxOverdue = isTaxOverdue;
exports.isTaxDueSoon = isTaxDueSoon;
/** Can this police viewer open this record directly? (Court grants handled separately.) */
function canViewRecord(scope, record) {
    var _a;
    if (scope.role === "OFFICER") {
        if (record.domain !== scope.domain)
            return false;
        if (record.branchId === scope.branchId)
            return true;
        // Escalated records: district-level in own district, country-level domain-wide.
        if (record.accessLevel === "district") {
            return record.district === ((_a = scope.branchDistrict) !== null && _a !== void 0 ? _a : scope.district);
        }
        if (record.accessLevel === "country")
            return true;
        return false;
    }
    if (scope.role === "DISTRICT_MONITOR") {
        return record.domain === scope.domain && record.district === scope.district;
    }
    if (scope.role === "COUNTRY_MONITOR") {
        // Aggregates + escalated-to-country only (no raw branch-level reads).
        return record.domain === scope.domain && record.accessLevel === "country";
    }
    // System admin, auditor, and external roles have no direct case access.
    return false;
}
/** True when the read stays inside the viewer's own narrow scope (officer reading
 * their own branch). Everything else is "outside my own scope" and gets logged. */
function isOwnScopeRead(scope, record) {
    return scope.role === "OFFICER" && record.branchId === scope.branchId;
}
/** Escape SQL LIKE wildcards in user search input (% _ and the escape char). */
function escapeLike(input) {
    return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
/** A policy is effectively live only within its coverage window. */
function isPolicyLive(policy) {
    var _a;
    const today = (_a = policy.today) !== null && _a !== void 0 ? _a : new Date().toISOString().slice(0, 10);
    return policy.isActive && policy.startDate <= today && today <= policy.endDate;
}
/** Settled means paid, waived, or exempt — nothing left to collect. */
function isTaxSettled(tax) {
    return tax.isPaid || tax.isWaived || tax.isExempt;
}
/** Overdue means past due with a live balance (derived, never stored). */
function isTaxOverdue(tax) {
    var _a;
    const today = (_a = tax.today) !== null && _a !== void 0 ? _a : new Date().toISOString().slice(0, 10);
    return !isTaxSettled(tax) && tax.dueDate < today;
}
/** Due within 30 days with a live balance — the "due soon" queue. */
function isTaxDueSoon(tax) {
    var _a;
    const today = (_a = tax.today) !== null && _a !== void 0 ? _a : new Date().toISOString().slice(0, 10);
    if (isTaxSettled(tax) || tax.dueDate < today)
        return false;
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 30);
    return tax.dueDate <= horizon.toISOString().slice(0, 10);
}
