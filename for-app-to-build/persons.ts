import { pgTable, uuid, text, date, timestamp, index } from "drizzle-orm/pg-core"
import { sexEnum, districtEnum } from "./enums"

// ---------------------------------------------------------------------------
// persons_of_interest — members of the public, NOT system users. Having a
// registry (rather than only free text inside each record's `data`) lets the
// same person be linked across multiple cases over time — e.g. reported
// missing once before, or wanted then later arrested, or a repeat name-match
// during a new report.
// ---------------------------------------------------------------------------

export const personsOfInterest = pgTable(
  "persons_of_interest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    nationalId: text("national_id"),
    dateOfBirth: date("date_of_birth"),
    sex: sexEnum("sex"),
    homeDistrict: districtEnum("home_district"),
    distinguishingFeatures: text("distinguishing_features"),
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("persons_of_interest_national_id_idx").on(table.nationalId),
    index("persons_of_interest_full_name_idx").on(table.fullName),
  ]
)
