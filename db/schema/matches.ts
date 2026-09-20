import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { records } from "./records"
import { users } from "./auth"

// ---------------------------------------------------------------------------
// person_case_matches — Phase N4 (NamUs-inspired cross-matching, TRACE-style).
//
// A proposed link between two case records — typically a missing_person
// record and an unclaimed_person record that may concern the same individual.
// Links are workflow, never auto-merge:
//
//   possible   → proposed by an officer/monitor, awaiting review
//   confirmed  → confirmed by a monitor (approver ≠ proposer)
//   excluded   → reviewed and ruled out (stays queryable — ruling a match
//                out is itself evidence; an excluded pair may be re-proposed
//                later as a new row)
//
// Corrections are status flips to `excluded`, never DELETE. `score` is an
// optional 0–100 heuristic similarity recorded at proposal time (explicit
// non-goal: no ML scorer in this phase). The ordered-pair uniqueness guard
// lives in db/sql/20_constraints.sql (LEAST/GREATEST partial index —
// Drizzle can't express it); app code also checks both directions.
// ---------------------------------------------------------------------------

export const personCaseMatches = pgTable(
  "person_case_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordIdA: uuid("record_id_a")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    recordIdB: uuid("record_id_b")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    // possible | confirmed | excluded (checked in SQL).
    matchType: text("match_type").default("possible").notNull(),
    score: numeric("score"),
    reason: text("reason"),
    proposedBy: text("proposed_by")
      .notNull()
      .references(() => users.id),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("person_case_matches_record_a_idx").on(table.recordIdA),
    index("person_case_matches_record_b_idx").on(table.recordIdB),
    index("person_case_matches_type_idx").on(table.matchType),
  ]
)
