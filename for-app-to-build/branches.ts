import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { domainEnum, districtEnum } from "./enums"

// ---------------------------------------------------------------------------
// branches — a police station (regular) or traffic depot/post (traffic).
// A single physical building housing both could just be two branch rows
// sharing a district/location if that fits how your stations are organized.
// ---------------------------------------------------------------------------

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    domain: domainEnum("domain").notNull(),
    district: districtEnum("district").notNull(),
    location: text("location"),
    contactPhone: text("contact_phone"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("branches_domain_idx").on(table.domain),
    index("branches_district_idx").on(table.district),
  ]
)
