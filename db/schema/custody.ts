import {
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core"
import { records } from "./records"
import { users } from "./auth"

// ---------------------------------------------------------------------------
// impound_custody — Phase 4 (records review R2/R5). A vehicle_impoundment
// record proves a tow happened; this table proves where the car is, who
// ordered the hold, who may release it, and that the owner was told.
//
// One row per record (created on hold placement). Hold fields are set once
// and never changed; release fields are set once and never changed —
// corrections are new audit entries, never silent edits (CHP-180
// amend-by-memo discipline). Only the hold authority (or a monitor in
// scope) can authorize release; the lot executes but never authorizes.
// ---------------------------------------------------------------------------

export const impoundCustody = pgTable(
  "impound_custody",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .unique()
      .references(() => records.id, { onDelete: "cascade" }),

    towCompany: text("tow_company"),
    lotLocation: text("lot_location"),
    bay: text("bay"),

    // Who ordered the hold + on what legal basis. Set once at placement.
    holdAuthorityId: text("hold_authority_id").references(() => users.id, {
      onDelete: "set null",
    }),
    holdBasis: text("hold_basis"),
    holdPlacedAt: timestamp("hold_placed_at", { withTimezone: true }),

    ownerNotifiedAt: timestamp("owner_notified_at", { withTimezone: true }),
    ownerNotifiedBy: text("owner_notified_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Dual signature: authorizer (hold authority / monitor) + recipient
    // whose ID was checked at handover. Set once — never updated.
    releaseAuthId: text("release_auth_id").references(() => users.id, {
      onDelete: "set null",
    }),
    releaseAt: timestamp("release_at", { withTimezone: true }),
    recipientName: text("recipient_name"),
    recipientIdChecked: text("recipient_id_checked"),

    feesSnapshot: numeric("fees_snapshot"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("impound_custody_record_id_idx").on(table.recordId)]
)
