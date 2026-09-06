import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  inet,
  index,
} from "drizzle-orm/pg-core"
import { users } from "./auth"
import { accessGrants } from "./grants"
import { accessActionTypeEnum } from "./enums"

// ---------------------------------------------------------------------------
// actions  — append-only audit log. Never UPDATE or DELETE.
//
// Captures every access beyond a user's own data: doctor reads,
// admin reads, emergency overrides, and analytics report runs.
// Patients can see every entry where profile_id = themselves.
// ---------------------------------------------------------------------------

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Audit rows follow their subject and actor: deleting a user removes the
    // trail entries tied to them. The grant link is only cleared so surviving
    // rows stay valid.
    profileId: text("profile_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // whose data was touched
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // who did it
    actionType: accessActionTypeEnum("action_type").notNull(),
    accessGrantId: uuid("access_grant_id").references(() => accessGrants.id, {
      onDelete: "set null",
    }),

    reason: text("reason"), // required for emergency_access; free text justification
    reviewed: boolean("reviewed").default(false).notNull(),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    // Denormalized snapshot — audit log must stay true to history even if
    // the doctor's profile changes later
    doctorName: text("doctor_name"),
    medicalLicenseNo: text("medical_license_no"),
    hospitalName: text("hospital_name"),
    district: text("district"),

    location: text("location"),
    ipAddress: inet("ip_address"),
    deviceInfo: text("device_info"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("actions_profile_id_idx").on(table.profileId),
    index("actions_actor_id_idx").on(table.actorId),
    index("actions_type_idx").on(table.actionType),
    // Partial index — find unreviewed emergency / admin actions quickly
    index("actions_unreviewed_idx").on(table.reviewed),
  ]
)
