import {
  pgTable,
  uuid,
  text,
  timestamp,
  inet,
  index,
} from "drizzle-orm/pg-core"
import { users } from "./auth"
import { records } from "./records"
import { vehicles } from "./vehicles"
import { auditActionTypeEnum } from "./enums"

// ---------------------------------------------------------------------------
// actions — append-only audit log. Never UPDATE or DELETE.
//
// Every read/write of a record beyond the reporting officer's own creation
// gets logged here — especially any read that crossed branch or district
// lines under the record's access_level, so a country monitor's or district
// monitor's activity is reviewable later.
//
// vehicleId is separate from recordId because some actions (e.g. an
// insurer's self-serve "is this plate flagged" lookup) concern a vehicle
// directly and aren't tied to any specific case — including when the
// answer is "no open case", where recordId would have nothing to point to.
// ---------------------------------------------------------------------------

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id").references(() => records.id, {
      onDelete: "set null",
    }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    actionType: auditActionTypeEnum("action_type").notNull(),

    // Free-text justification — expected for cross_district_access /
    // cross_branch_access reads, optional otherwise
    reason: text("reason"),

    ipAddress: inet("ip_address"),
    deviceInfo: text("device_info"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("actions_record_id_idx").on(table.recordId),
    index("actions_vehicle_id_idx").on(table.vehicleId),
    index("actions_actor_id_idx").on(table.actorId),
    index("actions_type_idx").on(table.actionType),
  ]
)
