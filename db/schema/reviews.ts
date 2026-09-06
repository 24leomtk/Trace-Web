import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { records } from "./records"
import { users } from "./auth"

// ---------------------------------------------------------------------------
// case_reviews — the monitor review queue, made concrete. A review is a
// timestamped follow-up note on a case (not an edit of the case itself, so
// history stays append-only). Monitors in scope can review; the filing
// officer can add notes on their own cases.
// ---------------------------------------------------------------------------

export const caseReviews = pgTable(
  "case_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => users.id),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("case_reviews_record_id_idx").on(table.recordId),
    index("case_reviews_reviewer_id_idx").on(table.reviewerId),
  ]
)
