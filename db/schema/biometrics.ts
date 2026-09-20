import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { personsOfInterest } from "./persons"
import { users } from "./auth"

// ---------------------------------------------------------------------------
// person_fingerprints — Phase N3 (NamUs-inspired biometrics, TRACE-style).
//
// Fingerprint holdings live on the person profile, not on any single case:
// the same set identifies them across a missing-person report today and an
// unclaimed-person match tomorrow. `referenceNo` is the local form/lift
// number; `afisReference` is set only when the set was actually searched in
// an AFIS (nullable — most branch intakes never reach AFIS). Rows are
// append-only in spirit: corrections are delete + re-insert via audited
// actions, never silent edits.
// ---------------------------------------------------------------------------

export const personFingerprints = pgTable(
  "person_fingerprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => personsOfInterest.id, { onDelete: "cascade" }),
    referenceNo: text("reference_no"),
    // poor | fair | good | excellent (checked in SQL).
    quality: text("quality"),
    dateProcessed: date("date_processed"),
    processedBy: text("processed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    afisReference: text("afis_reference"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("person_fingerprints_person_id_idx").on(table.personId),
  ]
)

// ---------------------------------------------------------------------------
// person_dna_samples — Phase N3. Same person-anchored pattern: a sample
// collected for one case stays queryable for future matches. `sampleType`
// is reference | family_reference | direct | elimination (checked in SQL);
// `status` tracks the lab pipeline (collected | sent | processed |
// destroyed). `labReference` replaces NamUs's CODIS upload columns —
// TRACE records the lab's own reference, whatever system the lab uses.
// ---------------------------------------------------------------------------

export const personDnaSamples = pgTable(
  "person_dna_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => personsOfInterest.id, { onDelete: "cascade" }),
    // reference | family_reference | direct | elimination (checked in SQL).
    sampleType: text("sample_type"),
    labName: text("lab_name"),
    labReference: text("lab_reference"),
    // collected | sent | processed | destroyed (checked in SQL).
    status: text("status").default("collected").notNull(),
    relationshipToSubject: text("relationship_to_subject"),
    collectedAt: date("collected_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("person_dna_samples_person_id_idx").on(table.personId),
  ]
)
