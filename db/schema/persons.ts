import { pgTable, uuid, text, date, integer, timestamp, index } from "drizzle-orm/pg-core"
import { sexEnum, districtEnum } from "./enums"

// ---------------------------------------------------------------------------
// persons_of_interest — members of the public, NOT system users. Having a
// registry (rather than only free text inside each record's `data`) lets the
// same person be linked across multiple cases over time — e.g. reported
// missing once before, or wanted then later arrested, or a repeat name-match
// during a new report.
//
// Phase N1 (NamUs-inspired descriptions): the optional descriptive columns
// below (age/height/weight ranges, hair/eye/complexion/build, clothing,
// jewelry, medical notes) let officers record a usable physical description
// without hard-gating filing — every column stays nullable so legacy rows
// and roadside reports with sparse data keep working.
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
    // -- N1 descriptive columns (all optional) -----------------------------
    // Known age when exact; otherwise an estimated range (age_from..age_to).
    ageYears: integer("age_years"),
    ageFrom: integer("age_from"),
    ageTo: integer("age_to"),
    // Estimated height/weight ranges (cm / kg) — ranges, not single
    // values, because field estimates are approximate.
    heightCmFrom: integer("height_cm_from"),
    heightCmTo: integer("height_cm_to"),
    weightKgFrom: integer("weight_kg_from"),
    weightKgTo: integer("weight_kg_to"),
    hairColor: text("hair_color"),
    hairLength: text("hair_length"),
    eyeColor: text("eye_color"),
    complexion: text("complexion"),
    build: text("build"),
    clothingDescription: text("clothing_description"),
    jewelryDescription: text("jewelry_description"),
    medicalNotes: text("medical_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("persons_of_interest_national_id_idx").on(table.nationalId),
    index("persons_of_interest_full_name_idx").on(table.fullName),
  ]
)

// ---------------------------------------------------------------------------
// person_physical_features — NamUs-inspired distinguishing marks, TRACE-style.
//
// One row per mark: tattoo / scar / mark / piercing / amputation / other,
// with a free-text body location + description (+ optional approximate
// size). Separate rows (rather than cramming into
// distinguishing_features) so a profile can carry several marks and they
// stay individually searchable. Corrections are delete + re-insert; the
// audit trail records who changed what.
// ---------------------------------------------------------------------------

export const personPhysicalFeatures = pgTable(
  "person_physical_features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => personsOfInterest.id, { onDelete: "cascade" }),
    // tattoo | scar | mark | piercing | amputation | other (checked in SQL).
    featureType: text("feature_type").notNull(),
    bodyLocation: text("body_location"),
    description: text("description"),
    approximateSize: text("approximate_size"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("person_physical_features_person_id_idx").on(table.personId),
    index("person_physical_features_type_idx").on(table.featureType),
  ]
)
