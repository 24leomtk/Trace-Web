import {
  pgTable,
  uuid,
  text,
  date,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { vehicles } from "./vehicles"
import { organizations } from "./organizations"
import { users } from "./auth"

// ---------------------------------------------------------------------------
// insurance_policies — entered and maintained directly by insurance_portal_user
// accounts (each scoped to their own insurer via organizationId), not sourced
// from an external batch feed. A traffic stop or accident record just reads
// this to check "is this vehicle currently insured, and by whom".
// ---------------------------------------------------------------------------

export const insurancePolicies = pgTable(
  "insurance_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    insurerId: uuid("insurer_id")
      .notNull()
      .references(() => organizations.id), // organizations.orgType = 'insurer'

    policyNumber: text("policy_number").notNull(),
    coverageType: text("coverage_type"), // e.g. "third_party", "comprehensive"

    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isActive: boolean("is_active").default(true).notNull(),

    // Insurer's own internal reference, for the insurer's own reconciliation
    externalReference: text("external_reference"),
    enteredBy: text("entered_by").references(() => users.id), // the insurance_portal_user who created/last updated it

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("insurance_policies_vehicle_id_idx").on(table.vehicleId),
    index("insurance_policies_insurer_id_idx").on(table.insurerId),
    index("insurance_policies_policy_number_idx").on(table.policyNumber),
    index("insurance_policies_is_active_idx").on(table.isActive),
  ]
)
