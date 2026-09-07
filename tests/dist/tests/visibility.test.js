"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const visibility_1 = require("../lib/visibility");
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
