import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"

import {
  canViewRecord,
  escapeLike,
  isOwnScopeRead,
  isPolicyLive,
  isTaxDueSoon,
  isTaxOverdue,
  isTaxSettled,
  type VisibilityRecord,
  type VisibilityScope,
} from "../lib/visibility"
import {
  assignmentDue,
  citationBalance,
  citationResolveBlocker,
  daysSince,
  daysUntil,
  defaultRetentionUntil,
  expiryTone,
  fileKindFromMime,
  formatCountdown,
  generateReceiptNo,
  generateTicketNo,
  isCitationPaid,
  lastWeekBuckets,
  normalizePlate,
  parsePolicyCsv,
  POLICY_CSV_TEMPLATE,
  referralSla,
  REFERRAL_OUTCOME_SLA_DAYS,
  REFERRAL_VIEW_SLA_DAYS,
  RETENTION_YEARS,
  shortFileHash,
} from "../lib/format"
import { otpMessage, resolveSmsConfig } from "../lib/sms"
import { crimeIncidentSchema, wantedPersonSchema, arrestRecordSchema, vehicleOffenseSchema, roadAccidentSchema } from "../validations/record"
import { apiKeySchema, citationPaymentSchema, citationVoidSchema, custodyHoldSchema, custodyReleaseSchema, dispositionSchema, locateReportSchema, taxAssessmentSchema, taxPaymentSchema, taxRuleSchema, taxWaiverDecideSchema, taxWaiverProposeSchema } from "../validations/admin"

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
      "TAX_OFFICER",
      "TAX_COMPLIANCE_OFFICER",
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

describe("generateTicketNo (Phase 1)", () => {
  it("is deterministic, yearly, and uppercased", () => {
    const first = generateTicketNo(1780000000000, 999)
    const second = generateTicketNo(1780000000000, 999)
    assert.equal(first, second)
    assert.match(first, /^T-2026-[0-9A-Z]{6}$/)
  })
})

describe("citationPaymentSchema (Phase 1 cross-branch)", () => {
  const base = {
    recordId: "00000000-0000-4000-8000-000000000000",
    amount: 5000,
    payerName: "Chifundo Banda",
    paymentMethod: "cash" as const,
  }

  it("requires payer name and method", () => {
    assert.equal(citationPaymentSchema.safeParse(base).success, true)
    assert.equal(
      citationPaymentSchema.safeParse({ ...base, payerName: "" }).success,
      false
    )
    assert.equal(
      citationPaymentSchema.safeParse({ ...base, paymentMethod: "cheque" })
        .success,
      false
    )
  })

  it("rejects non-positive amounts (overpayment guard lives server-side)", () => {
    assert.equal(
      citationPaymentSchema.safeParse({ ...base, amount: 0 }).success,
      false
    )
  })
})

describe("citationVoidSchema (Phase 1)", () => {
  it("requires a real reason", () => {
    assert.equal(
      citationVoidSchema.safeParse({
        recordId: "00000000-0000-4000-8000-000000000000",
        reason: "Duplicate entry, original T-2026-ABC123 stands.",
      }).success,
      true
    )
    assert.equal(
      citationVoidSchema.safeParse({
        recordId: "00000000-0000-4000-8000-000000000000",
        reason: "oops",
      }).success,
      false
    )
  })
})

describe("citationResolveBlocker (Phase 2)", () => {
  it("blocks resolve while a balance is outstanding", () => {
    const block = citationResolveBlocker({
      voided: false,
      balance: 3000,
      dismissedByCourt: false,
    })
    assert.match(block ?? "", /Outstanding balance/)
  })

  it("allows resolve once paid in full", () => {
    assert.equal(
      citationResolveBlocker({
        voided: false,
        balance: 0,
        dismissedByCourt: false,
      }),
      null
    )
  })

  it("allows resolve on court dismissal without payment", () => {
    assert.equal(
      citationResolveBlocker({
        voided: false,
        balance: 5000,
        dismissedByCourt: true,
      }),
      null
    )
  })

  it("voided tickets close instead of resolving", () => {
    const block = citationResolveBlocker({
      voided: true,
      balance: 0,
      dismissedByCourt: false,
    })
    assert.match(block ?? "", /close it instead/)
  })

  it("unknown fines resolve (nothing to collect)", () => {
    assert.equal(
      citationResolveBlocker({
        voided: false,
        balance: null,
        dismissedByCourt: false,
      }),
      null
    )
  })
})

describe("locateReportSchema + dispositionSchema (Phase 3)", () => {
  it("requires place and a real account of what happened", () => {
    assert.equal(
      locateReportSchema.safeParse({
        recordId: "00000000-0000-4000-8000-000000000000",
        place: "Area 25 market",
        note: "Found with family, in good health.",
      }).success,
      true
    )
    assert.equal(
      locateReportSchema.safeParse({
        recordId: "00000000-0000-4000-8000-000000000000",
        place: "x",
        note: "found",
      }).success,
      false
    )
  })

  it("accepts only the four custodian dispositions", () => {
    assert.equal(
      dispositionSchema.safeParse({
        recordId: "00000000-0000-4000-8000-000000000000",
        disposition: "returned",
      }).success,
      true
    )
    assert.equal(
      dispositionSchema.safeParse({
        recordId: "00000000-0000-4000-8000-000000000000",
        disposition: "lost",
      }).success,
      false
    )
  })
})

describe("custodyHoldSchema + custodyReleaseSchema (Phase 4)", () => {
  const id = "00000000-0000-4000-8000-000000000000"

  it("orders holds with a legal basis", () => {
    assert.equal(
      custodyHoldSchema.safeParse({ recordId: id, holdBasis: "Held as evidence in case 12/26." }).success,
      true
    )
    assert.equal(
      custodyHoldSchema.safeParse({ recordId: id, holdBasis: "evidence" }).success,
      false
    )
  })

  it("dual-signs releases with recipient + checked ID", () => {
    assert.equal(
      custodyReleaseSchema.safeParse({
        recordId: id,
        recipientName: "Chifundo Banda",
        recipientIdChecked: "National ID MW123456",
      }).success,
      true
    )
    assert.equal(
      custodyReleaseSchema.safeParse({ recordId: id, recipientName: "X", recipientIdChecked: "" }).success,
      false
    )
  })
})

describe("Phase 5 record completion", () => {
  it("arrest accepts booking, custody, and prosecutor fields", () => {
    const base = {
      full_name: "John Banda",
      charges: ["theft"],
      arrest_location: "Limbe",
      arrest_date: "2026-09-01",
      arresting_officer: "Ofc. Phiri",
    }
    assert.equal(arrestRecordSchema.safeParse(base).success, true)
    assert.equal(
      arrestRecordSchema.safeParse({
        ...base,
        booking_no: "BK-12/26",
        custody_status: "handed_to_court",
        prosecutor_decision: "accepted",
      }).success,
      true
    )
    assert.equal(
      arrestRecordSchema.safeParse({ ...base, custody_status: "jailed" })
        .success,
      false
    )
  })

  it("offense defaults to non-criminal, no appearance", () => {
    const parsed = vehicleOffenseSchema.safeParse({
      plate_number: "MH 1234",
      offense_type: "speeding",
      description: "80 in a 60 zone",
      location: "M1",
      date_occurred: "2026-09-01",
    })
    assert.equal(parsed.success, true)
    if (parsed.success) {
      assert.equal(parsed.data.is_criminal, false)
      assert.equal(parsed.data.court_appearance_required, false)
    }
  })

  it("incident accepts structured victims alongside legacy strings", () => {
    const base = {
      incident_type: "burglary",
      description: "Shop break-in",
      location: "Zomba",
      date_occurred: "2026-09-01",
    }
    assert.equal(
      crimeIncidentSchema.safeParse({
        ...base,
        offense_code: "s.363",
        victims: ["Amina", { name: "Banda", contact: "+265991234567" }],
        witnesses: [],
      }).success,
      true
    )
  })

  it("accident accepts severity plus per-vehicle driver and snapshot", () => {
    assert.equal(
      roadAccidentSchema.safeParse({
        location: "M1",
        accident_date: "2026-09-01",
        description: "Rear-end collision",
        severity: "serious",
        weather: "rain",
        vehicles_involved: [
          {
            plate_number: "MH 1234",
            driver_name: "Chifundo",
            insurance_snapshot: {
              policy_number: "POL-1",
              insurer_name: "NICO",
              coverage_type: "comprehensive",
            },
          },
        ],
      }).success,
      true
    )
    assert.equal(
      roadAccidentSchema.safeParse({
        location: "M1",
        accident_date: "2026-09-01",
        description: "x",
        severity: "catastrophic",
        vehicles_involved: [],
      }).success,
      false
    )
  })
})

describe("Phase 6 hardening artifacts", () => {
  const hardeningSql = readFileSync(
    path.join(__dirname, "..", "..", "..", "db", "sql", "Functions&Policies.sql"),
    "utf8"
  )

  it("indexes ticket search + constrains money/lifecycle vocab", () => {
    for (const needle of [
      "traffic_citations_ticket_number_trgm_idx",
      "traffic_citations_violation_type_trgm_idx",
      "citation_payments_method_chk",
      "citation_payments_channel_chk",
      "records_locate_state_chk",
      "records_disposition_chk",
      "traffic_citations_void_chk",
    ]) {
      assert.ok(hardeningSql.includes(needle), `missing ${needle}`)
    }
  })

  it("gates the custody table behind RLS", () => {
    for (const needle of [
      "alter table public.impound_custody enable row level security",
      "impound_custody_read",
      "impound_custody_write",
      "impound_custody_update",
      "revoke delete on public.impound_custody from app_user",
    ]) {
      assert.ok(hardeningSql.includes(needle), `missing ${needle}`)
    }
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

describe("assignmentDue", () => {
  const now = new Date("2026-09-17T12:00:00Z").getTime()

  it("flags overdue open tasks", () => {
    const due = assignmentDue("2026-09-15T12:00:00Z", "open", now)
    assert.equal(due.overdue, true)
    assert.equal(due.tone, "red")
  })

  it("warns within 3 days, quiet beyond", () => {
    assert.equal(assignmentDue("2026-09-19T12:00:00Z", "open", now).tone, "amber")
    assert.equal(assignmentDue("2026-09-30T12:00:00Z", "open", now).tone, "slate")
  })

  it("closed or dateless tasks are never overdue", () => {
    assert.equal(assignmentDue("2026-09-15T12:00:00Z", "done", now).overdue, false)
    assert.equal(assignmentDue(null, "open", now).overdue, false)
    assert.equal(assignmentDue(null, "open", now).daysLeft, null)
  })
})

describe("lastWeekBuckets", () => {
  it("returns Monday-start buckets oldest-first", () => {
    // 2026-09-17 is a Thursday; current week starts Mon 2026-09-14.
    const buckets = lastWeekBuckets(3, new Date("2026-09-17T12:00:00Z"))
    assert.deepEqual(
      buckets.map((bucket) => bucket.key),
      ["2026-08-31", "2026-09-07", "2026-09-14"]
    )
    assert.equal(buckets[2]?.label, "14 Sep")
  })
})

describe("fileKindFromMime", () => {
  it("maps accepted kinds and rejects the rest", () => {
    assert.equal(fileKindFromMime("image/jpeg"), "image")
    assert.equal(fileKindFromMime("application/pdf"), "pdf")
    assert.equal(fileKindFromMime("video/mp4"), "video")
    assert.equal(fileKindFromMime("audio/mpeg"), "audio")
    assert.equal(
      fileKindFromMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ),
      "doc"
    )
    assert.equal(fileKindFromMime("application/x-msdownload"), null)
    assert.equal(fileKindFromMime(""), null)
  })
})

describe("defaultRetentionUntil / shortFileHash", () => {
  it("retains for the policy horizon", () => {
    const until = defaultRetentionUntil(new Date("2026-09-17T00:00:00Z"))
    assert.equal(until.slice(0, 10), "2031-09-17")
    assert.equal(RETENTION_YEARS, 5)
  })

  it("shortens hashes for display", () => {
    assert.equal(shortFileHash("abcdef1234567890"), "abcdef123456…")
    assert.equal(shortFileHash(null), null)
    assert.equal(shortFileHash(undefined), null)
  })
})

describe("parsePolicyCsv", () => {
  it("parses the shipped template", () => {
    const parsed = parsePolicyCsv(POLICY_CSV_TEMPLATE)
    assert.equal(parsed.errors.length, 0)
    assert.equal(parsed.rows.length, 1)
    assert.equal(parsed.rows[0]?.plateNumber, "MH 1234")
    assert.equal(parsed.rows[0]?.isActive, true)
  })

  it("handles quoted commas and flags bad rows", () => {
    const parsed = parsePolicyCsv(
      'plate_number,policy_number,start_date,end_date\n"MH, 99",P1,2026-01-01,2026-12-31\nMH 2,,2026-01-01,bad-date\n'
    )
    assert.equal(parsed.rows.length, 1)
    assert.equal(parsed.rows[0]?.plateNumber, "MH, 99")
    assert.equal(parsed.errors.length, 1)
    assert.equal(parsed.errors[0]?.line, 3)
  })

  it("requires the core columns", () => {
    const parsed = parsePolicyCsv("plate_number,policy_number\nMH 1,P1\n")
    assert.equal(parsed.rows.length, 0)
    assert.match(parsed.errors[0]?.message ?? "", /Missing column/)
  })

  it("parses inactive flags", () => {
    const parsed = parsePolicyCsv(
      "plate_number,policy_number,start_date,end_date,is_active\nMH 1,P1,2026-01-01,2026-12-31,false\nMH 2,P2,2026-01-01,2026-12-31,\n"
    )
    assert.equal(parsed.rows[0]?.isActive, false)
    assert.equal(parsed.rows[1]?.isActive, true)
  })
})

describe("record geo fields (F10)", () => {
  it("accepts optional coordinates on location-bearing types", () => {
    const result = crimeIncidentSchema.safeParse({
      incident_type: "Theft",
      description: "Bike stolen.",
      location: "Old Town",
      date_occurred: "2026-09-17",
      latitude: -13.98333,
      longitude: 33.78333,
    })
    assert.equal(result.success, true)
  })

  it("rejects out-of-range coordinates", () => {
    const result = crimeIncidentSchema.safeParse({
      incident_type: "Theft",
      description: "Bike stolen.",
      location: "Old Town",
      date_occurred: "2026-09-17",
      latitude: -100,
      longitude: 33.78333,
    })
    assert.equal(result.success, false)
  })

  it("filing still works without GPS", () => {
    const result = crimeIncidentSchema.safeParse({
      incident_type: "Theft",
      description: "Bike stolen.",
      location: "Old Town",
      date_occurred: "2026-09-17",
    })
    assert.equal(result.success, true)
  })

  it("wanted persons carry no geo fields (extras are stripped)", () => {
    const result = wantedPersonSchema.safeParse({
      full_name: "Jane Doe",
      offense: "Theft",
      danger_level: "low",
      description: "Wanted.",
      latitude: -13.98,
    })
    assert.equal(result.success, true)
    assert.equal(
      (result.data as Record<string, unknown>).latitude,
      undefined
    )
  })
})

describe("resolveSmsConfig / otpMessage (N1)", () => {
  it("defaults to the log provider without gateway vars", () => {
    const savedUrl = process.env.SMS_API_URL
    const savedKey = process.env.SMS_API_KEY
    delete process.env.SMS_API_URL
    delete process.env.SMS_API_KEY
    try {
      assert.equal(resolveSmsConfig().provider, "log")
    } finally {
      if (savedUrl !== undefined) process.env.SMS_API_URL = savedUrl
      if (savedKey !== undefined) process.env.SMS_API_KEY = savedKey
    }
  })

  it("selects http when the gateway is configured", () => {
    const config = resolveSmsConfig({
      SMS_API_URL: "https://sms.example.test/send",
      SMS_API_KEY: "secret",
      SMS_SENDER_ID: "TRACE",
    })
    assert.equal(config.provider, "http")
    assert.equal(config.senderId, "TRACE")
  })

  it("phrases the OTP with its expiry", () => {
    assert.match(otpMessage("123456"), /123456/)
    assert.match(otpMessage("123456"), /5 minutes/)
  })
})

describe("apiKeySchema (N4)", () => {
  it("accepts a scoped, optionally expiring key", () => {
    const result = apiKeySchema.safeParse({
      userId: "user-1",
      name: "ANPR camera 3",
      scopes: ["plate:read"],
      expiresAt: "2099-01-01",
    })
    assert.equal(result.success, true)
  })

  it("rejects unknown scopes and past expiry", () => {
    assert.equal(
      apiKeySchema.safeParse({
        userId: "user-1",
        name: "ANPR camera 3",
        scopes: ["cases:read"],
      }).success,
      false
    )
    assert.equal(
      apiKeySchema.safeParse({
        userId: "user-1",
        name: "ANPR camera 3",
        scopes: ["plate:read"],
        expiresAt: "2000-01-01",
      }).success,
      false
    )
  })
})

describe("tax ledger (MRA)", () => {
  it("settles on paid, waived, or exempt", () => {
    const base = { dueDate: "2020-01-01", today: "2026-09-19" }
    assert.equal(isTaxSettled({ ...base, isPaid: true, isWaived: false, isExempt: false }), true)
    assert.equal(isTaxSettled({ ...base, isPaid: false, isWaived: true, isExempt: false }), true)
    assert.equal(isTaxSettled({ ...base, isPaid: false, isWaived: false, isExempt: true }), true)
    assert.equal(isTaxSettled({ ...base, isPaid: false, isWaived: false, isExempt: false }), false)
  })

  it("is overdue only when past due with a live balance", () => {
    const live = { isPaid: false, isWaived: false, isExempt: false }
    assert.equal(isTaxOverdue({ ...live, dueDate: "2020-01-01", today: "2026-09-19" }), true)
    assert.equal(isTaxOverdue({ ...live, dueDate: "2026-09-19", today: "2026-09-19" }), false)
    assert.equal(isTaxOverdue({ ...live, dueDate: "2099-01-01", today: "2026-09-19" }), false)
    assert.equal(isTaxOverdue({ isPaid: true, isWaived: false, isExempt: false, dueDate: "2020-01-01", today: "2026-09-19" }), false)
  })

  it("flags due-soon inside 30 days", () => {
    const live = { isPaid: false, isWaived: false, isExempt: false }
    assert.equal(isTaxDueSoon({ ...live, dueDate: "2026-10-01", today: "2026-09-19" }), true)
    assert.equal(isTaxDueSoon({ ...live, dueDate: "2027-06-01", today: "2026-09-19" }), false)
    assert.equal(isTaxDueSoon({ ...live, dueDate: "2020-01-01", today: "2026-09-19" }), false)
  })
})

describe("taxAssessmentSchema", () => {
  const good = {
    vehicleId: "123e4567-e89b-12d3-a456-426614174000",
    taxType: "carbon_tax",
    amountDue: 60000,
    dueDate: "2026-10-01",
  }
  it("accepts a minimal assessment", () => {
    assert.equal(taxAssessmentSchema.safeParse(good).success, true)
  })

  it("rejects unknown types, negative amounts, bad dates", () => {
    assert.equal(taxAssessmentSchema.safeParse({ ...good, taxType: "road_toll" }).success, false)
    assert.equal(taxAssessmentSchema.safeParse({ ...good, amountDue: -5 }).success, false)
    assert.equal(taxAssessmentSchema.safeParse({ ...good, dueDate: "10/01/2026" }).success, false)
  })
})

describe("taxPaymentSchema", () => {
  it("requires a receipt number", () => {
    assert.equal(
      taxPaymentSchema.safeParse({ taxId: "123e4567-e89b-12d3-a456-426614174000", receiptNo: "TAX-R-1" }).success,
      true
    )
    assert.equal(
      taxPaymentSchema.safeParse({ taxId: "123e4567-e89b-12d3-a456-426614174000", receiptNo: "" }).success,
      false
    )
  })
})

describe("tax waiver maker-checker", () => {
  it("proposals need a real justification", () => {
    assert.equal(
      taxWaiverProposeSchema.safeParse({ taxId: "123e4567-e89b-12d3-a456-426614174000", reason: "Duplicate assessment at the border." }).success,
      true
    )
    assert.equal(
      taxWaiverProposeSchema.safeParse({ taxId: "123e4567-e89b-12d3-a456-426614174000", reason: "waive it" }).success,
      false
    )
  })

  it("decisions are approved or rejected only", () => {
    assert.equal(
      taxWaiverDecideSchema.safeParse({ taxId: "123e4567-e89b-12d3-a456-426614174000", decision: "approved" }).success,
      true
    )
    assert.equal(
      taxWaiverDecideSchema.safeParse({ taxId: "123e4567-e89b-12d3-a456-426614174000", decision: "maybe" }).success,
      false
    )
  })
})

describe("taxRuleSchema (admin reference data)", () => {
  it("accepts bands or flat amounts with an offset", () => {
    assert.equal(
      taxRuleSchema.safeParse({
        ownerOrgId: "123e4567-e89b-12d3-a456-426614174000",
        taxType: "carbon_tax",
        period: "annual",
        isEnabled: true,
        amount: null,
        engineBands: { "2000": 40000, above: 90000 },
        dueDayOffset: 30,
      }).success,
      true
    )
  })

  it("rejects unknown periods", () => {
    assert.equal(
      taxRuleSchema.safeParse({
        ownerOrgId: "123e4567-e89b-12d3-a456-426614174000",
        taxType: "carbon_tax",
        period: "fortnightly",
        isEnabled: true,
        dueDayOffset: 30,
      }).success,
      false
    )
  })
})
