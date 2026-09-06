import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { districtEnum } from "./enums"
import { users } from "./auth"

// ---------------------------------------------------------------------------
// vehicles — a lightweight registry. Two ways a row gets here:
//   1. Ad hoc: an officer references a plate in a case before it exists yet
//      (isVerified: false, registeredBy: null).
//   2. Authoritative: a vehicle_registrar creates or verifies the row against
//      the official vehicle registry (isVerified: true, registeredBy set).
// A case-created row can later be verified/enriched by a registrar without
// changing its id, so existing case links keep working.
// ---------------------------------------------------------------------------

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plateNumber: text("plate_number").notNull().unique(),
    make: text("make"),
    model: text("model"),
    year: integer("year"),
    color: text("color"),
    chassisNumber: text("chassis_number"),
    engineNumber: text("engine_number"),

    ownerName: text("owner_name"),
    ownerNationalId: text("owner_national_id"),
    ownerPhone: text("owner_phone"),
    ownerDistrict: districtEnum("owner_district"),

    // Maintained by a trigger whenever an active missing_vehicle /
    // vehicle_offense / vehicle_impoundment record exists for this plate —
    // lets a traffic stop check "is this car flagged" in one indexed lookup.
    isFlagged: boolean("is_flagged").default(false).notNull(),

    // Set once a vehicle_registrar has confirmed this row against the
    // official registry, as opposed to an officer's ad hoc case entry.
    isVerified: boolean("is_verified").default(false).notNull(),
    registeredBy: uuid("registered_by").references(() => users.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("vehicles_plate_number_idx").on(table.plateNumber),
    index("vehicles_owner_national_id_idx").on(table.ownerNationalId),
    index("vehicles_is_flagged_idx").on(table.isFlagged),
    index("vehicles_is_verified_idx").on(table.isVerified),
  ]
)
