import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { organizationTypeEnum, districtEnum } from "./enums"

// ---------------------------------------------------------------------------
// organizations — external bodies that get their own portal accounts on
// TRACE, rather than being provisioned as police branches:
//   - courts (court_liaison users)
//   - insurance companies (insurance_portal_user users)
//   - the vehicle registry authority (vehicle_registrar users)
//
// Kept as one table (distinguished by orgType) rather than three, since
// they all play the same structural role: an external org whose staff
// log into TRACE scoped to that org rather than to a police branch/district.
// ---------------------------------------------------------------------------

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    orgType: organizationTypeEnum("org_type").notNull(),
    // Courts are typically jurisdiction-bound; leave null for insurers and
    // the (presumably single, national) vehicle registry authority.
    district: districtEnum("district"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("organizations_org_type_idx").on(table.orgType),
    index("organizations_district_idx").on(table.district),
  ]
)
