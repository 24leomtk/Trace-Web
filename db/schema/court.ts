import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { records } from "./records"
import { users } from "./auth"
import { courtCaseOutcomeEnum } from "./enums"

// ---------------------------------------------------------------------------
// court_case_access — a court_liaison's visibility is per-case, not
// branch/district/organization-wide. A police user (typically a district or
// country monitor) explicitly refers a specific record to a specific
// court_liaison; that's the only way a court_liaison can see it.
//
// Unlike records.access_level (branch/district/country, aimed at police
// users), this is a one-off grant with a time-boxed expiry (expiresAt)
// rather than open-ended access by default.
//
// Also doubles as where the case outcome gets recorded once known, closing
// the loop on the referral rather than it being one-directional.
// ---------------------------------------------------------------------------

export const courtCaseAccess = pgTable(
  "court_case_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    courtLiaisonId: text("court_liaison_id")
      .notNull()
      .references(() => users.id), // a user with role = 'court_liaison'
    referredBy: text("referred_by")
      .notNull()
      .references(() => users.id), // the police user who made the referral

    reason: text("reason"), // e.g. "referred for prosecution", case/docket number

    // Time-boxing — access lapses on its own unless explicitly renewed.
    // A scheduled job (or the access-check query itself) treats a record as
    // inaccessible once `expiresAt` has passed, the same way it would if
    // `revokedAt` were set; `revokedAt` remains for early, manual revocation.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    renewedAt: timestamp("renewed_at", { withTimezone: true }),
    renewalCount: integer("renewal_count").default(0).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    // F4 SLA: first time the liaison opened the referred record (set once,
    // on the first `court_case_viewed`). Together with `createdAt`
    // (referred) and `outcomeRecordedAt`, this drives referral timeliness.
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),

    // Outcome tracking — set by the court_liaison once the case concludes.
    outcome: courtCaseOutcomeEnum("outcome").default("pending").notNull(),
    outcomeNotes: text("outcome_notes"),
    outcomeRecordedBy: text("outcome_recorded_by").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    outcomeRecordedAt: timestamp("outcome_recorded_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("court_case_access_record_id_idx").on(table.recordId),
    index("court_case_access_court_liaison_id_idx").on(table.courtLiaisonId),
    index("court_case_access_expires_at_idx").on(table.expiresAt),
    index("court_case_access_outcome_idx").on(table.outcome),
  ]
)

// ---------------------------------------------------------------------------
// referral_documents — the e-Brief bundle (F4). Structured exhibits attached
// to a referral *after* it is made (tranches): charge sheets, statements,
// photos. Readable by in-scope monitors and the grant's liaison; writable by
// in-scope monitors only. Images only (same Cloudinary pipeline as case
// attachments).
// ---------------------------------------------------------------------------

export const referralDocuments = pgTable(
  "referral_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => courtCaseAccess.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    storagePath: text("storage_path").notNull(),
    fileType: text("file_type").notNull(),
    // N2: SHA-256 of the uploaded bytes (nullable for legacy rows).
    fileHash: text("file_hash"),
    uploadedBy: text("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("referral_documents_referral_id_idx").on(table.referralId),
  ]
)
