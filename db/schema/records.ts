import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { users } from "./auth"
import { branches } from "./branches"
import { vehicles } from "./vehicles"
import { personsOfInterest } from "./persons"
import {
  recordTypeEnum,
  domainEnum,
  districtEnum,
  accessLevelEnum,
  caseStatusEnum,
} from "./enums"

// ---------------------------------------------------------------------------
// records — the core case table. One row per report, whatever its type.
//
// `data` stores the full typed payload for that record_type (see
// validations/record.ts for each shape). The tables in coded.ts are
// fast-lookup projections written alongside each record in app code, so
// listing/search screens never have to query into jsonb directly.
// ---------------------------------------------------------------------------

export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordType: recordTypeEnum("record_type").notNull(),
    // Derived from recordType at write time and stored, so a domain-wide
    // listing screen can filter with one indexed column instead of an
    // IN (...) over recordType.
    domain: domainEnum("domain").notNull(),

    reportedBy: text("reported_by")
      .notNull()
      .references(() => users.id), // officer who filed it (better-auth text id)
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    district: districtEnum("district").notNull(),

    // Populated when the case concerns a specific vehicle or person —
    // left null for types that don't (e.g. crime_incident with no suspect yet)
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    personId: uuid("person_id").references(() => personsOfInterest.id),

    accessLevel: accessLevelEnum("access_level").default("branch").notNull(),
    status: caseStatusEnum("status").default("active").notNull(),

    data: jsonb("data").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("records_type_idx").on(table.recordType),
    index("records_domain_idx").on(table.domain),
    index("records_branch_id_idx").on(table.branchId),
    index("records_district_idx").on(table.district),
    index("records_access_level_idx").on(table.accessLevel),
    index("records_status_idx").on(table.status),
    index("records_vehicle_id_idx").on(table.vehicleId),
    index("records_person_id_idx").on(table.personId),
  ]
)

// ---------------------------------------------------------------------------
// record_attachments — photos, scanned statements, etc.
//
// Can attach to a case (recordId — e.g. a scene photo tied to one accident
// or incident), and/or directly to a person or vehicle (e.g. a mugshot on a
// persons_of_interest profile, or a plate photo on a vehicle, independent of
// any specific case). At least one of the three should be set; which
// combinations you allow is an app-layer decision.
//
// Where recordId is set, treat this attachment as inheriting the parent
// record's accessLevel rather than storing its own.
// ---------------------------------------------------------------------------

export const recordAttachments = pgTable(
  "record_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id").references(() => records.id, {
      onDelete: "cascade",
    }),
    personId: uuid("person_id").references(() => personsOfInterest.id, {
      onDelete: "cascade",
    }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, {
      onDelete: "cascade",
    }),

    url: text("url").notNull(),
    storagePath: text("storage_path").notNull(),
    fileType: text("file_type").notNull(),
    uploadedBy: text("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("record_attachments_record_id_idx").on(table.recordId),
    index("record_attachments_person_id_idx").on(table.personId),
    index("record_attachments_vehicle_id_idx").on(table.vehicleId),
  ]
)
