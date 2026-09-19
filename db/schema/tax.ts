import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  date,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { vehicles } from "./vehicles"
import { organizations } from "./organizations"
import { users } from "./auth"

// ---------------------------------------------------------------------------
// vehicle_taxes — one row per vehicle per tax obligation, entered and
// maintained directly by tax_officer accounts (each scoped to their own
// revenue authority via organizationId), mirroring the insurance pattern.
//
// Malawi coverage (2026/27 regime): import_duty | import_excise |
// import_vat | carbon_tax | road_access_fee | transit_fee | license_fee |
// toll_fee | penalty. Duty-free CPCs and the motorcycle flat moratorium are
// modelled as exempt assessments, not special code.
//
// Money model is a SIMPLE TOGGLE (owner decision): is_paid flips with a
// receipt; there is no payment-history table. Balance history is
// reconstructable from the audit log's structured reasons (see
// lib/actions/tax.ts). overdue/settled are derived, never stored.
// ---------------------------------------------------------------------------

export const TAX_TYPES = [
  "import_duty",
  "import_excise",
  "import_vat",
  "carbon_tax",
  "road_access_fee",
  "transit_fee",
  "license_fee",
  "toll_fee",
  "penalty",
] as const

export type TaxType = (typeof TAX_TYPES)[number]

export const TAX_WAIVER_STATES = ["none", "pending", "approved", "rejected"] as const

export type TaxWaiverState = (typeof TAX_WAIVER_STATES)[number]

export const vehicleTaxes = pgTable(
  "vehicle_taxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    // Revenue office that owns this assessment (enterer's org at entry).
    ownerOrgId: uuid("owner_org_id")
      .notNull()
      .references(() => organizations.id),

    taxType: text("tax_type").notNull(),
    amountDue: numeric("amount_due").notNull(),

    // Simple paid toggle (no ledger): flips with receipt + receiver.
    isPaid: boolean("is_paid").default(false).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    receiptNo: text("receipt_no"),
    receivedBy: text("received_by").references(() => users.id, {
      onDelete: "set null",
    }),

    dueDate: date("due_date").notNull(),
    // Set for cyclical taxes (auto-generated); null for one-off assessments.
    periodStart: date("period_start"),
    periodEnd: date("period_end"),

    referenceNo: text("reference_no"), // assessment / TIP / invoice number
    engineCc: integer("engine_cc"), // snapshot for banded taxes (carbon)

    isWaived: boolean("is_waived").default(false).notNull(),
    isExempt: boolean("is_exempt").default(false).notNull(),

    // Maker-checker waivers: officer proposes (pending + reason), only a
    // tax_compliance_officer flips to approved/rejected (see §2c of the
    // tax plan). Direct is_waived writes are blocked in action code.
    waiverStatus: text("waiver_status").default("none").notNull(),
    waiverReason: text("waiver_reason"),
    waiverDecidedBy: text("waiver_decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    waiverDecidedAt: timestamp("waiver_decided_at", { withTimezone: true }),

    enteredBy: text("entered_by").references(() => users.id), // the tax_officer who created it

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("vehicle_taxes_vehicle_id_idx").on(table.vehicleId),
    index("vehicle_taxes_owner_org_id_idx").on(table.ownerOrgId),
    index("vehicle_taxes_tax_type_idx").on(table.taxType),
    index("vehicle_taxes_due_date_idx").on(table.dueDate),
    index("vehicle_taxes_is_paid_idx").on(table.isPaid),
    // Idempotency key for auto-generation (61_tax_automation.sql):
    // one row per vehicle per tax per period.
    uniqueIndex("vehicle_taxes_vehicle_type_period_uidx").on(
      table.vehicleId,
      table.taxType,
      table.periodStart
    ),
  ]
)

// ---------------------------------------------------------------------------
// tax_automation_rules — which cyclical taxes self-generate, owned by one
// revenue office. REFERENCE DATA: managed by system_admin (like branches),
// read by tax roles. The daily generator (61_tax_automation.sql) loops
// enabled rules and inserts missing current-period assessments.
// ---------------------------------------------------------------------------

export const TAX_PERIODS = ["monthly", "quarterly", "annual"] as const

export type TaxPeriod = (typeof TAX_PERIODS)[number]

export const taxAutomationRules = pgTable(
  "tax_automation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerOrgId: uuid("owner_org_id")
      .notNull()
      .references(() => organizations.id),
    taxType: text("tax_type").notNull(),
    period: text("period").notNull(), // monthly | quarterly | annual
    isEnabled: boolean("is_enabled").default(false).notNull(),
    // Flat amount per generated assessment; engine_bands wins when set and
    // the vehicle has an engine_cc (Malawi carbon bands, e.g.
    // {"2000":40000,"3000":60000,"above":90000}).
    amount: numeric("amount"),
    engineBands: jsonb("engine_bands"),
    dueDayOffset: integer("due_day_offset").default(30).notNull(),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tax_automation_rules_owner_org_id_idx").on(table.ownerOrgId),
    uniqueIndex("tax_automation_rules_org_type_period_uidx").on(
      table.ownerOrgId,
      table.taxType,
      table.period
    ),
  ]
)
