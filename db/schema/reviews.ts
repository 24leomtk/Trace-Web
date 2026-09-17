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

// ---------------------------------------------------------------------------
// case_assignments — per-officer tasking (F9). Monitors assign a case to a
// specific officer (or monitor) with an optional due date and note; states
// are open → done | cancelled. History stays queryable (rows are never
// deleted), so workload and turnaround are auditable. Complements (not
// replaces) branch-level ownership and free-text review notes.
// ---------------------------------------------------------------------------

export const caseAssignments = pgTable(
  "case_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    assigneeId: text("assignee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    // open | done | cancelled — validated in action code.
    state: text("state").default("open").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("case_assignments_record_id_idx").on(table.recordId),
    index("case_assignments_assignee_id_idx").on(table.assigneeId),
    index("case_assignments_state_idx").on(table.state),
  ]
)
