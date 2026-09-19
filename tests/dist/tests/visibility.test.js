"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const visibility_1 = require("../lib/visibility");
const format_1 = require("../lib/format");
const sms_1 = require("../lib/sms");
const record_1 = require("../validations/record");
const admin_1 = require("../validations/admin");
const officer = {
    role: "OFFICER",
    domain: "regular",
    branchId: "branch-1",
    branchDistrict: "lilongwe",
    district: null,
};
const districtMonitor = {
    role: "DISTRICT_MONITOR",
    domain: "regular",
    branchId: null,
    branchDistrict: null,
    district: "lilongwe",
};
const countryMonitor = {
    role: "COUNTRY_MONITOR",
    domain: "regular",
    branchId: null,
    branchDistrict: null,
    district: null,
};
function record(overrides) {
    return Object.assign({ domain: "regular", branchId: "branch-1", district: "lilongwe", accessLevel: "branch", reportedBy: "someone" }, overrides);
}
(0, node_test_1.describe)("canViewRecord", () => {
    (0, node_test_1.it)("officer reads own branch at any level", () => {
        strict_1.default.equal((0, visibility_1.canViewRecord)(officer, record({})), true);
    });
    (0, node_test_1.it)("officer reads other-branch district records in own district", () => {
        strict_1.default.equal((0, visibility_1.canViewRecord)(officer, record({ branchId: "branch-2", accessLevel: "district" })), true);
    });
    (0, node_test_1.it)("officer cannot read other-branch district records from another district", () => {
        strict_1.default.equal((0, visibility_1.canViewRecord)(officer, record({ branchId: "branch-9", district: "blantyre", accessLevel: "district" })), false);
    });
    (0, node_test_1.it)("officer reads country-level records domain-wide", () => {
        strict_1.default.equal((0, visibility_1.canViewRecord)(officer, record({ branchId: "branch-9", district: "blantyre", accessLevel: "country" })), true);
    });
    (0, node_test_1.it)("officer cannot read branch-level records from other branches", () => {
        strict_1.default.equal((0, visibility_1.canViewRecord)(officer, record({ branchId: "branch-2" })), false);
    });
    (0, node_test_1.it)("officer is locked to own domain", () => {
        strict_1.default.equal((0, visibility_1.canViewRecord)(officer, record({ domain: "traffic", accessLevel: "country" })), false);
    });
    (0, node_test_1.it)("district monitor reads everything in-district, in-domain", () => {
        strict_1.default.equal((0, visibility_1.canViewRecord)(districtMonitor, record({})), true);
        strict_1.default.equal((0, visibility_1.canViewRecord)(districtMonitor, record({ branchId: "branch-2" })), true);
    });
    (0, node_test_1.it)("district monitor cannot read other districts or domains", () => {
        strict_1.default.equal((0, visibility_1.canViewRecord)(districtMonitor, record({ district: "blantyre" })), false);
        strict_1.default.equal((0, visibility_1.canViewRecord)(districtMonitor, record({ domain: "traffic" })), false);
    });
    (0, node_test_1.it)("country monitor reads country-level only", () => {
        strict_1.default.equal((0, visibility_1.canViewRecord)(countryMonitor, record({ accessLevel: "country" })), true);
        strict_1.default.equal((0, visibility_1.canViewRecord)(countryMonitor, record({ branchId: "branch-2", district: "blantyre" })), false);
    });
    (0, node_test_1.it)("external and platform roles have no direct access", () => {
        const mine = record({ accessLevel: "country" });
        for (const role of [
            "SYSTEM_ADMIN",
            "COMPLIANCE_AUDITOR",
            "COURT_LIAISON",
            "INSURANCE_PORTAL_USER",
            "VEHICLE_REGISTRAR",
        ]) {
            strict_1.default.equal((0, visibility_1.canViewRecord)(Object.assign(Object.assign({}, officer), { role, branchId: null, branchDistrict: null }), mine), false, role);
        }
    });
});
(0, node_test_1.describe)("isOwnScopeRead", () => {
    (0, node_test_1.it)("officer reading own branch is routine (unlogged)", () => {
        strict_1.default.equal((0, visibility_1.isOwnScopeRead)(officer, record({})), true);
    });
    (0, node_test_1.it)("officer reading escalated records is logged", () => {
        strict_1.default.equal((0, visibility_1.isOwnScopeRead)(officer, record({ branchId: "branch-2", accessLevel: "country" })), false);
    });
    (0, node_test_1.it)("monitor reads are always logged", () => {
        strict_1.default.equal((0, visibility_1.isOwnScopeRead)(districtMonitor, record({})), false);
    });
});
(0, node_test_1.describe)("escapeLike", () => {
    (0, node_test_1.it)("escapes %, _, and backslash", () => {
        strict_1.default.equal((0, visibility_1.escapeLike)("MH%_12\\3"), "MH\\%\\_12\\\\3");
    });
    (0, node_test_1.it)("leaves plain plates untouched", () => {
        strict_1.default.equal((0, visibility_1.escapeLike)("MH 1234"), "MH 1234");
    });
});
(0, node_test_1.describe)("isPolicyLive", () => {
    (0, node_test_1.it)("live within window", () => {
        strict_1.default.equal((0, visibility_1.isPolicyLive)({
            isActive: true,
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            today: "2026-09-06",
        }), true);
    });
    (0, node_test_1.it)("expired end date is not live", () => {
        strict_1.default.equal((0, visibility_1.isPolicyLive)({
            isActive: true,
            startDate: "2026-01-01",
            endDate: "2026-09-05",
            today: "2026-09-06",
        }), false);
    });
    (0, node_test_1.it)("inactive flag is not live even in window", () => {
        strict_1.default.equal((0, visibility_1.isPolicyLive)({
            isActive: false,
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            today: "2026-09-06",
        }), false);
    });
});
(0, node_test_1.describe)("daysUntil / daysSince", () => {
    const now = new Date("2026-09-17T12:00:00Z").getTime();
    (0, node_test_1.it)("counts whole days to a future timestamp", () => {
        strict_1.default.equal((0, format_1.daysUntil)("2026-09-20T12:00:00Z", now), 3);
    });
    (0, node_test_1.it)("is negative once the timestamp has passed", () => {
        strict_1.default.equal((0, format_1.daysUntil)("2026-09-15T12:00:00Z", now), -2);
    });
    (0, node_test_1.it)("counts whole days since a past timestamp", () => {
        strict_1.default.equal((0, format_1.daysSince)("2026-09-10T12:00:00Z", now), 7);
    });
    (0, node_test_1.it)("returns null for missing or invalid input", () => {
        strict_1.default.equal((0, format_1.daysUntil)(null, now), null);
        strict_1.default.equal((0, format_1.daysUntil)(undefined, now), null);
        strict_1.default.equal((0, format_1.daysUntil)("not-a-date", now), null);
        strict_1.default.equal((0, format_1.daysSince)(undefined, now), null);
    });
});
(0, node_test_1.describe)("expiryTone / formatCountdown", () => {
    (0, node_test_1.it)("red when expired or due within 7 days", () => {
        strict_1.default.equal((0, format_1.expiryTone)(-1), "red");
        strict_1.default.equal((0, format_1.expiryTone)(0), "red");
        strict_1.default.equal((0, format_1.expiryTone)(7), "red");
    });
    (0, node_test_1.it)("amber within 30 days, emerald beyond, slate when unknown", () => {
        strict_1.default.equal((0, format_1.expiryTone)(8), "amber");
        strict_1.default.equal((0, format_1.expiryTone)(30), "amber");
        strict_1.default.equal((0, format_1.expiryTone)(31), "emerald");
        strict_1.default.equal((0, format_1.expiryTone)(null), "slate");
    });
    (0, node_test_1.it)("phrases countdowns for chips", () => {
        strict_1.default.equal((0, format_1.formatCountdown)(null), "No expiry");
        strict_1.default.equal((0, format_1.formatCountdown)(-3), "Expired 3d ago");
        strict_1.default.equal((0, format_1.formatCountdown)(0), "Expires today");
        strict_1.default.equal((0, format_1.formatCountdown)(1), "1 day left");
        strict_1.default.equal((0, format_1.formatCountdown)(12), "12 days left");
    });
});
(0, node_test_1.describe)("normalizePlate", () => {
    (0, node_test_1.it)("trims, uppercases, and collapses spaces like filing does", () => {
        strict_1.default.equal((0, format_1.normalizePlate)("  mh  1234 "), "MH 1234");
        strict_1.default.equal((0, format_1.normalizePlate)("mh1234"), "MH1234");
    });
});
(0, node_test_1.describe)("citationBalance / isCitationPaid", () => {
    (0, node_test_1.it)("subtracts payments, floored at zero", () => {
        strict_1.default.equal((0, format_1.citationBalance)(5000, 2000), 3000);
        strict_1.default.equal((0, format_1.citationBalance)(5000, 5000), 0);
        strict_1.default.equal((0, format_1.citationBalance)(5000, 9000), 0);
    });
    (0, node_test_1.it)("unknown fine has unknown balance", () => {
        strict_1.default.equal((0, format_1.citationBalance)(null, 0), null);
    });
    (0, node_test_1.it)("paid once payments cover the fine", () => {
        strict_1.default.equal((0, format_1.isCitationPaid)(5000, 4999), false);
        strict_1.default.equal((0, format_1.isCitationPaid)(5000, 5000), true);
        strict_1.default.equal((0, format_1.isCitationPaid)(null, 0), false);
        strict_1.default.equal((0, format_1.isCitationPaid)(null, 100), true);
    });
});
(0, node_test_1.describe)("generateReceiptNo", () => {
    (0, node_test_1.it)("is deterministic under fixed args and prefixed", () => {
        const first = (0, format_1.generateReceiptNo)(1720000000000, 12345);
        const second = (0, format_1.generateReceiptNo)(1720000000000, 12345);
        strict_1.default.equal(first, second);
        strict_1.default.match(first, /^R-[0-9A-Z]{6}$/);
    });
});
(0, node_test_1.describe)("generateTicketNo (Phase 1)", () => {
    (0, node_test_1.it)("is deterministic, yearly, and uppercased", () => {
        const first = (0, format_1.generateTicketNo)(1780000000000, 999);
        const second = (0, format_1.generateTicketNo)(1780000000000, 999);
        strict_1.default.equal(first, second);
        strict_1.default.match(first, /^T-2026-[0-9A-Z]{6}$/);
    });
});
(0, node_test_1.describe)("citationPaymentSchema (Phase 1 cross-branch)", () => {
    const base = {
        recordId: "00000000-0000-4000-8000-000000000000",
        amount: 5000,
        payerName: "Chifundo Banda",
        paymentMethod: "cash",
    };
    (0, node_test_1.it)("requires payer name and method", () => {
        strict_1.default.equal(admin_1.citationPaymentSchema.safeParse(base).success, true);
        strict_1.default.equal(admin_1.citationPaymentSchema.safeParse(Object.assign(Object.assign({}, base), { payerName: "" })).success, false);
        strict_1.default.equal(admin_1.citationPaymentSchema.safeParse(Object.assign(Object.assign({}, base), { paymentMethod: "cheque" }))
            .success, false);
    });
    (0, node_test_1.it)("rejects non-positive amounts (overpayment guard lives server-side)", () => {
        strict_1.default.equal(admin_1.citationPaymentSchema.safeParse(Object.assign(Object.assign({}, base), { amount: 0 })).success, false);
    });
});
(0, node_test_1.describe)("citationVoidSchema (Phase 1)", () => {
    (0, node_test_1.it)("requires a real reason", () => {
        strict_1.default.equal(admin_1.citationVoidSchema.safeParse({
            recordId: "00000000-0000-4000-8000-000000000000",
            reason: "Duplicate entry, original T-2026-ABC123 stands.",
        }).success, true);
        strict_1.default.equal(admin_1.citationVoidSchema.safeParse({
            recordId: "00000000-0000-4000-8000-000000000000",
            reason: "oops",
        }).success, false);
    });
});
(0, node_test_1.describe)("referralSla", () => {
    const referred = "2026-09-01T12:00:00Z";
    const now = new Date("2026-09-17T12:00:00Z").getTime();
    (0, node_test_1.it)("measures days to view and outcome", () => {
        const sla = (0, format_1.referralSla)(referred, "2026-09-03T12:00:00Z", "2026-09-10T12:00:00Z", now);
        strict_1.default.equal(sla.daysSinceReferral, 16);
        strict_1.default.equal(sla.daysToView, 2);
        strict_1.default.equal(sla.daysToOutcome, 9);
        strict_1.default.equal(sla.viewOverdue, false);
        strict_1.default.equal(sla.outcomeOverdue, false);
    });
    (0, node_test_1.it)("flags unviewed referrals past the view window", () => {
        const sla = (0, format_1.referralSla)(referred, null, null, now);
        strict_1.default.equal(sla.daysToView, null);
        strict_1.default.equal(sla.viewOverdue, 16 > format_1.REFERRAL_VIEW_SLA_DAYS);
        strict_1.default.equal(sla.outcomeOverdue, 16 > format_1.REFERRAL_OUTCOME_SLA_DAYS);
    });
    (0, node_test_1.it)("fresh referrals are not overdue", () => {
        const sla = (0, format_1.referralSla)("2026-09-16T12:00:00Z", null, null, now);
        strict_1.default.equal(sla.viewOverdue, false);
        strict_1.default.equal(sla.outcomeOverdue, false);
    });
});
(0, node_test_1.describe)("assignmentDue", () => {
    const now = new Date("2026-09-17T12:00:00Z").getTime();
    (0, node_test_1.it)("flags overdue open tasks", () => {
        const due = (0, format_1.assignmentDue)("2026-09-15T12:00:00Z", "open", now);
        strict_1.default.equal(due.overdue, true);
        strict_1.default.equal(due.tone, "red");
    });
    (0, node_test_1.it)("warns within 3 days, quiet beyond", () => {
        strict_1.default.equal((0, format_1.assignmentDue)("2026-09-19T12:00:00Z", "open", now).tone, "amber");
        strict_1.default.equal((0, format_1.assignmentDue)("2026-09-30T12:00:00Z", "open", now).tone, "slate");
    });
    (0, node_test_1.it)("closed or dateless tasks are never overdue", () => {
        strict_1.default.equal((0, format_1.assignmentDue)("2026-09-15T12:00:00Z", "done", now).overdue, false);
        strict_1.default.equal((0, format_1.assignmentDue)(null, "open", now).overdue, false);
        strict_1.default.equal((0, format_1.assignmentDue)(null, "open", now).daysLeft, null);
    });
});
(0, node_test_1.describe)("lastWeekBuckets", () => {
    (0, node_test_1.it)("returns Monday-start buckets oldest-first", () => {
        var _a;
        // 2026-09-17 is a Thursday; current week starts Mon 2026-09-14.
        const buckets = (0, format_1.lastWeekBuckets)(3, new Date("2026-09-17T12:00:00Z"));
        strict_1.default.deepEqual(buckets.map((bucket) => bucket.key), ["2026-08-31", "2026-09-07", "2026-09-14"]);
        strict_1.default.equal((_a = buckets[2]) === null || _a === void 0 ? void 0 : _a.label, "14 Sep");
    });
});
(0, node_test_1.describe)("fileKindFromMime", () => {
    (0, node_test_1.it)("maps accepted kinds and rejects the rest", () => {
        strict_1.default.equal((0, format_1.fileKindFromMime)("image/jpeg"), "image");
        strict_1.default.equal((0, format_1.fileKindFromMime)("application/pdf"), "pdf");
        strict_1.default.equal((0, format_1.fileKindFromMime)("video/mp4"), "video");
        strict_1.default.equal((0, format_1.fileKindFromMime)("audio/mpeg"), "audio");
        strict_1.default.equal((0, format_1.fileKindFromMime)("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "doc");
        strict_1.default.equal((0, format_1.fileKindFromMime)("application/x-msdownload"), null);
        strict_1.default.equal((0, format_1.fileKindFromMime)(""), null);
    });
});
(0, node_test_1.describe)("defaultRetentionUntil / shortFileHash", () => {
    (0, node_test_1.it)("retains for the policy horizon", () => {
        const until = (0, format_1.defaultRetentionUntil)(new Date("2026-09-17T00:00:00Z"));
        strict_1.default.equal(until.slice(0, 10), "2031-09-17");
        strict_1.default.equal(format_1.RETENTION_YEARS, 5);
    });
    (0, node_test_1.it)("shortens hashes for display", () => {
        strict_1.default.equal((0, format_1.shortFileHash)("abcdef1234567890"), "abcdef123456…");
        strict_1.default.equal((0, format_1.shortFileHash)(null), null);
        strict_1.default.equal((0, format_1.shortFileHash)(undefined), null);
    });
});
(0, node_test_1.describe)("parsePolicyCsv", () => {
    (0, node_test_1.it)("parses the shipped template", () => {
        var _a, _b;
        const parsed = (0, format_1.parsePolicyCsv)(format_1.POLICY_CSV_TEMPLATE);
        strict_1.default.equal(parsed.errors.length, 0);
        strict_1.default.equal(parsed.rows.length, 1);
        strict_1.default.equal((_a = parsed.rows[0]) === null || _a === void 0 ? void 0 : _a.plateNumber, "MH 1234");
        strict_1.default.equal((_b = parsed.rows[0]) === null || _b === void 0 ? void 0 : _b.isActive, true);
    });
    (0, node_test_1.it)("handles quoted commas and flags bad rows", () => {
        var _a, _b;
        const parsed = (0, format_1.parsePolicyCsv)('plate_number,policy_number,start_date,end_date\n"MH, 99",P1,2026-01-01,2026-12-31\nMH 2,,2026-01-01,bad-date\n');
        strict_1.default.equal(parsed.rows.length, 1);
        strict_1.default.equal((_a = parsed.rows[0]) === null || _a === void 0 ? void 0 : _a.plateNumber, "MH, 99");
        strict_1.default.equal(parsed.errors.length, 1);
        strict_1.default.equal((_b = parsed.errors[0]) === null || _b === void 0 ? void 0 : _b.line, 3);
    });
    (0, node_test_1.it)("requires the core columns", () => {
        var _a, _b;
        const parsed = (0, format_1.parsePolicyCsv)("plate_number,policy_number\nMH 1,P1\n");
        strict_1.default.equal(parsed.rows.length, 0);
        strict_1.default.match((_b = (_a = parsed.errors[0]) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : "", /Missing column/);
    });
    (0, node_test_1.it)("parses inactive flags", () => {
        var _a, _b;
        const parsed = (0, format_1.parsePolicyCsv)("plate_number,policy_number,start_date,end_date,is_active\nMH 1,P1,2026-01-01,2026-12-31,false\nMH 2,P2,2026-01-01,2026-12-31,\n");
        strict_1.default.equal((_a = parsed.rows[0]) === null || _a === void 0 ? void 0 : _a.isActive, false);
        strict_1.default.equal((_b = parsed.rows[1]) === null || _b === void 0 ? void 0 : _b.isActive, true);
    });
});
(0, node_test_1.describe)("record geo fields (F10)", () => {
    (0, node_test_1.it)("accepts optional coordinates on location-bearing types", () => {
        const result = record_1.crimeIncidentSchema.safeParse({
            incident_type: "Theft",
            description: "Bike stolen.",
            location: "Old Town",
            date_occurred: "2026-09-17",
            latitude: -13.98333,
            longitude: 33.78333,
        });
        strict_1.default.equal(result.success, true);
    });
    (0, node_test_1.it)("rejects out-of-range coordinates", () => {
        const result = record_1.crimeIncidentSchema.safeParse({
            incident_type: "Theft",
            description: "Bike stolen.",
            location: "Old Town",
            date_occurred: "2026-09-17",
            latitude: -100,
            longitude: 33.78333,
        });
        strict_1.default.equal(result.success, false);
    });
    (0, node_test_1.it)("filing still works without GPS", () => {
        const result = record_1.crimeIncidentSchema.safeParse({
            incident_type: "Theft",
            description: "Bike stolen.",
            location: "Old Town",
            date_occurred: "2026-09-17",
        });
        strict_1.default.equal(result.success, true);
    });
    (0, node_test_1.it)("wanted persons carry no geo fields (extras are stripped)", () => {
        const result = record_1.wantedPersonSchema.safeParse({
            full_name: "Jane Doe",
            offense: "Theft",
            danger_level: "low",
            description: "Wanted.",
            latitude: -13.98,
        });
        strict_1.default.equal(result.success, true);
        strict_1.default.equal(result.data.latitude, undefined);
    });
});
(0, node_test_1.describe)("resolveSmsConfig / otpMessage (N1)", () => {
    (0, node_test_1.it)("defaults to the log provider without gateway vars", () => {
        const savedUrl = process.env.SMS_API_URL;
        const savedKey = process.env.SMS_API_KEY;
        delete process.env.SMS_API_URL;
        delete process.env.SMS_API_KEY;
        try {
            strict_1.default.equal((0, sms_1.resolveSmsConfig)().provider, "log");
        }
        finally {
            if (savedUrl !== undefined)
                process.env.SMS_API_URL = savedUrl;
            if (savedKey !== undefined)
                process.env.SMS_API_KEY = savedKey;
        }
    });
    (0, node_test_1.it)("selects http when the gateway is configured", () => {
        const config = (0, sms_1.resolveSmsConfig)({
            SMS_API_URL: "https://sms.example.test/send",
            SMS_API_KEY: "secret",
            SMS_SENDER_ID: "TRACE",
        });
        strict_1.default.equal(config.provider, "http");
        strict_1.default.equal(config.senderId, "TRACE");
    });
    (0, node_test_1.it)("phrases the OTP with its expiry", () => {
        strict_1.default.match((0, sms_1.otpMessage)("123456"), /123456/);
        strict_1.default.match((0, sms_1.otpMessage)("123456"), /5 minutes/);
    });
});
(0, node_test_1.describe)("apiKeySchema (N4)", () => {
    (0, node_test_1.it)("accepts a scoped, optionally expiring key", () => {
        const result = admin_1.apiKeySchema.safeParse({
            userId: "user-1",
            name: "ANPR camera 3",
            scopes: ["plate:read"],
            expiresAt: "2099-01-01",
        });
        strict_1.default.equal(result.success, true);
    });
    (0, node_test_1.it)("rejects unknown scopes and past expiry", () => {
        strict_1.default.equal(admin_1.apiKeySchema.safeParse({
            userId: "user-1",
            name: "ANPR camera 3",
            scopes: ["cases:read"],
        }).success, false);
        strict_1.default.equal(admin_1.apiKeySchema.safeParse({
            userId: "user-1",
            name: "ANPR camera 3",
            scopes: ["plate:read"],
            expiresAt: "2000-01-01",
        }).success, false);
    });
});
