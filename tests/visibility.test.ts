import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  canViewRecord,
  escapeLike,
  isOwnScopeRead,
  isPolicyLive,
  type VisibilityRecord,
  type VisibilityScope,
} from "../lib/visibility"
import {
  citationBalance,
  daysSince,
  daysUntil,
  expiryTone,
  formatCountdown,
  generateReceiptNo,
  isCitationPaid,
  normalizePlate,
  referralSla,
  REFERRAL_OUTCOME_SLA_DAYS,
  REFERRAL_VIEW_SLA_DAYS,
} from "../lib/format"

const officer: VisibilityScope = {
  role: "OFFICER",
  domain: "regular",
  branchId: "branch-1",
  branchDistrict: "lilongwe",
  district: null,
}

const districtMonitor: VisibilityScope = {
  role: "DISTRICT_MONITOR",
  domain: "regular",
  branchId: null,
  branchDistrict: null,
  district: "lilongwe",
}

const countryMonitor: VisibilityScope = {
  role: "COUNTRY_MONITOR",
  domain: "regular",
  branchId: null,
  branchDistrict: null,
  district: null,
}

function record(overrides: Partial<VisibilityRecord>): VisibilityRecord {
  return {
    domain: "regular",
    branchId: "branch-1",
    district: "lilongwe",
    accessLevel: "branch",
    reportedBy: "someone",
    ...overrides,
  }
}

describe("canViewRecord", () => {
  it("officer reads own branch at any level", () => {
    assert.equal(canViewRecord(officer, record({})), true)
  })

  it("officer reads other-branch district records in own district", () => {
    assert.equal(
      canViewRecord(officer, record({ branchId: "branch-2", accessLevel: "district" })),
      true
    )
  })

  it("officer cannot read other-branch district records from another district", () => {
    assert.equal(
      canViewRecord(
        officer,
        record({ branchId: "branch-9", district: "blantyre", accessLevel: "district" })
      ),
      false
    )
  })

  it("officer reads country-level records domain-wide", () => {
    assert.equal(
      canViewRecord(
        officer,
        record({ branchId: "branch-9", district: "blantyre", accessLevel: "country" })
      ),
      true
    )
  })

  it("officer cannot read branch-level records from other branches", () => {
    assert.equal(canViewRecord(officer, record({ branchId: "branch-2" })), false)
  })

  it("officer is locked to own domain", () => {
    assert.equal(
      canViewRecord(officer, record({ domain: "traffic", accessLevel: "country" })),
      false
    )
  })

  it("district monitor reads everything in-district, in-domain", () => {
    assert.equal(canViewRecord(districtMonitor, record({})), true)
    assert.equal(
      canViewRecord(districtMonitor, record({ branchId: "branch-2" })),
      true
    )
  })

  it("district monitor cannot read other districts or domains", () => {
    assert.equal(
      canViewRecord(districtMonitor, record({ district: "blantyre" })),
      false
    )
    assert.equal(
      canViewRecord(districtMonitor, record({ domain: "traffic" })),
      false
    )
  })

  it("country monitor reads country-level only", () => {
    assert.equal(
      canViewRecord(countryMonitor, record({ accessLevel: "country" })),
      true
    )
    assert.equal(
      canViewRecord(
        countryMonitor,
        record({ branchId: "branch-2", district: "blantyre" })
      ),
      false
    )
  })

  it("external and platform roles have no direct access", () => {
    const mine = record({ accessLevel: "country" })
    for (const role of [
      "SYSTEM_ADMIN",
      "COMPLIANCE_AUDITOR",
      "COURT_LIAISON",
      "INSURANCE_PORTAL_USER",
      "VEHICLE_REGISTRAR",
    ] as const) {
      assert.equal(
        canViewRecord({ ...officer, role, branchId: null, branchDistrict: null }, mine),
        false,
        role
      )
    }
  })
})

describe("isOwnScopeRead", () => {
  it("officer reading own branch is routine (unlogged)", () => {
    assert.equal(isOwnScopeRead(officer, record({})), true)
  })

  it("officer reading escalated records is logged", () => {
    assert.equal(
      isOwnScopeRead(officer, record({ branchId: "branch-2", accessLevel: "country" })),
      false
    )
  })

  it("monitor reads are always logged", () => {
    assert.equal(isOwnScopeRead(districtMonitor, record({})), false)
  })
})

describe("escapeLike", () => {
  it("escapes %, _, and backslash", () => {
    assert.equal(escapeLike("MH%_12\\3"), "MH\\%\\_12\\\\3")
  })

  it("leaves plain plates untouched", () => {
    assert.equal(escapeLike("MH 1234"), "MH 1234")
  })
})

describe("isPolicyLive", () => {
  it("live within window", () => {
    assert.equal(
      isPolicyLive({
        isActive: true,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        today: "2026-09-06",
      }),
      true
    )
  })

  it("expired end date is not live", () => {
    assert.equal(
      isPolicyLive({
        isActive: true,
        startDate: "2026-01-01",
        endDate: "2026-09-05",
        today: "2026-09-06",
      }),
      false
    )
  })

  it("inactive flag is not live even in window", () => {
    assert.equal(
      isPolicyLive({
        isActive: false,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        today: "2026-09-06",
      }),
      false
    )
  })
})

describe("daysUntil / daysSince", () => {
  const now = new Date("2026-09-17T12:00:00Z").getTime()

  it("counts whole days to a future timestamp", () => {
    assert.equal(daysUntil("2026-09-20T12:00:00Z", now), 3)
  })

  it("is negative once the timestamp has passed", () => {
    assert.equal(daysUntil("2026-09-15T12:00:00Z", now), -2)
  })

  it("counts whole days since a past timestamp", () => {
    assert.equal(daysSince("2026-09-10T12:00:00Z", now), 7)
  })

  it("returns null for missing or invalid input", () => {
    assert.equal(daysUntil(null, now), null)
    assert.equal(daysUntil(undefined, now), null)
    assert.equal(daysUntil("not-a-date", now), null)
    assert.equal(daysSince(undefined, now), null)
  })
})

describe("expiryTone / formatCountdown", () => {
  it("red when expired or due within 7 days", () => {
    assert.equal(expiryTone(-1), "red")
    assert.equal(expiryTone(0), "red")
    assert.equal(expiryTone(7), "red")
  })

  it("amber within 30 days, emerald beyond, slate when unknown", () => {
    assert.equal(expiryTone(8), "amber")
    assert.equal(expiryTone(30), "amber")
    assert.equal(expiryTone(31), "emerald")
    assert.equal(expiryTone(null), "slate")
  })

  it("phrases countdowns for chips", () => {
    assert.equal(formatCountdown(null), "No expiry")
    assert.equal(formatCountdown(-3), "Expired 3d ago")
    assert.equal(formatCountdown(0), "Expires today")
    assert.equal(formatCountdown(1), "1 day left")
    assert.equal(formatCountdown(12), "12 days left")
  })
})

describe("normalizePlate", () => {
  it("trims, uppercases, and collapses spaces like filing does", () => {
    assert.equal(normalizePlate("  mh  1234 "), "MH 1234")
    assert.equal(normalizePlate("mh1234"), "MH1234")
  })
})

describe("citationBalance / isCitationPaid", () => {
  it("subtracts payments, floored at zero", () => {
    assert.equal(citationBalance(5000, 2000), 3000)
    assert.equal(citationBalance(5000, 5000), 0)
    assert.equal(citationBalance(5000, 9000), 0)
  })

  it("unknown fine has unknown balance", () => {
    assert.equal(citationBalance(null, 0), null)
  })

  it("paid once payments cover the fine", () => {
    assert.equal(isCitationPaid(5000, 4999), false)
    assert.equal(isCitationPaid(5000, 5000), true)
    assert.equal(isCitationPaid(null, 0), false)
    assert.equal(isCitationPaid(null, 100), true)
  })
})

describe("generateReceiptNo", () => {
  it("is deterministic under fixed args and prefixed", () => {
    const first = generateReceiptNo(1720000000000, 12345)
    const second = generateReceiptNo(1720000000000, 12345)
    assert.equal(first, second)
    assert.match(first, /^R-[0-9A-Z]{6}$/)
  })
})

describe("referralSla", () => {
  const referred = "2026-09-01T12:00:00Z"
  const now = new Date("2026-09-17T12:00:00Z").getTime()

  it("measures days to view and outcome", () => {
    const sla = referralSla(
      referred,
      "2026-09-03T12:00:00Z",
      "2026-09-10T12:00:00Z",
      now
    )
    assert.equal(sla.daysSinceReferral, 16)
    assert.equal(sla.daysToView, 2)
    assert.equal(sla.daysToOutcome, 9)
    assert.equal(sla.viewOverdue, false)
    assert.equal(sla.outcomeOverdue, false)
  })

  it("flags unviewed referrals past the view window", () => {
    const sla = referralSla(referred, null, null, now)
    assert.equal(sla.daysToView, null)
    assert.equal(sla.viewOverdue, 16 > REFERRAL_VIEW_SLA_DAYS)
    assert.equal(sla.outcomeOverdue, 16 > REFERRAL_OUTCOME_SLA_DAYS)
  })

  it("fresh referrals are not overdue", () => {
    const sla = referralSla(
      "2026-09-16T12:00:00Z",
      null,
      null,
      now
    )
    assert.equal(sla.viewOverdue, false)
    assert.equal(sla.outcomeOverdue, false)
  })
})
