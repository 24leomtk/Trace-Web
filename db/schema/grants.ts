import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { users } from "./auth"

// ---------------------------------------------------------------------------
// access_grants  — time-limited access tokens issued by patients to doctors
// ---------------------------------------------------------------------------

export const accessGrants = pgTable(
  "access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: text("profile_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // patient
    // Null while the code is unclaimed; set to the clinician who redeems it.
    // Cascades with either side: a grant is meaningless without its patient
    // or its clinician.
    doctorId: text("doctor_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    issuedBy: text("issued_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // normally = profileId

    code: text("code").notNull(),
    durationSeconds: integer("duration_seconds").notNull(), // chosen by patient

    isUsed: boolean("is_used").default(false).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    // Set only once redeemed: used_at + duration_seconds
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isRevoked: boolean("is_revoked").default(false).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("access_grants_profile_id_idx").on(table.profileId),
    index("access_grants_doctor_id_idx").on(table.doctorId),
    // Partial index for active (non-revoked) grants
    index("access_grants_active_idx").on(table.profileId, table.doctorId),
  ]
)
