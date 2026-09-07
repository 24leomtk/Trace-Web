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
