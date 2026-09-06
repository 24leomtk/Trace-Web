import { sql } from "drizzle-orm"
import {
  pgTable,
  uuid,
  text,
  date,
  jsonb,
  timestamp,
  bigint,
  index,
} from "drizzle-orm/pg-core"
import { users } from "./auth"
import { hospitals } from "./hospitals"
import { recordTypeEnum } from "./enums"

// ---------------------------------------------------------------------------
// medical_records  — the core table.
//
// `data` stores the full typed payload per record_type
// (see validations/record.ts for each type's shape).
// The diagnoses / prescriptions / immunizations tables capture the coded
// facts extracted from `data` via trigger, for fast analytics queries.
// ---------------------------------------------------------------------------

export const medicalRecords = pgTable(
  "medical_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: text("profile_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Clearing (not deleting) history when the facility is removed.
    hospitalId: uuid("hospital_id").references(() => hospitals.id, {
      onDelete: "set null",
    }),
    // Attending doctor. Set null when the author account is deleted so the
    // patient's history survives — only profileId cascades.
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    recordType: recordTypeEnum("record_type").notNull(),
    recordDate: date("record_date")
      .default(sql`current_date`)
      .notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("medical_records_profile_id_idx").on(table.profileId),
    index("medical_records_hospital_id_idx").on(table.hospitalId),
    index("medical_records_date_idx").on(table.recordDate),
    index("medical_records_type_idx").on(table.recordType),
  ]
)

// ---------------------------------------------------------------------------
// record_attachments  — files stored in object storage; same access rules
// ---------------------------------------------------------------------------

export const recordAttachments = pgTable(
  "record_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => medicalRecords.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    storagePath: text("storage_path").notNull(), // path in private storage bucket
    // MIME types are stored as text because PostgreSQL enum labels are limited
    // to 63 bytes, while some valid MIME types are longer.
    fileType: text("file_type").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    checksum: text("checksum"),
    uploadedBy: text("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("record_attachments_record_id_idx").on(table.recordId)]
)
