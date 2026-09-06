import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { records } from "./records"
import { users } from "./auth"

// ---------------------------------------------------------------------------
// notifications — closes the referral loop in-app instead of out-of-band.
// Created on: court referral / renewal / revocation (-> liaison), outcome
// recorded (-> referring monitor), status change (-> filing officer +
// live liaisons), review added (-> filing officer).
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // referral_received | referral_updated | outcome_recorded | status_changed | review_added
    recordId: uuid("record_id").references(() => records.id, {
      onDelete: "cascade",
    }),
    message: text("message").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_is_read_idx").on(table.isRead),
  ]
)

// ---------------------------------------------------------------------------
// idempotency_keys — lets mobile clients safely retry POSTs (field
// connectivity). The client sends `Idempotency-Key: <uuid>`; the first
// request stores its response, replays return the stored response with the
// original status instead of double-filing.
// ---------------------------------------------------------------------------

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    statusCode: integer("status_code").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idempotency_keys_user_id_idx").on(table.userId)]
)
