import {
  pgTable,
  text,
  boolean,
  timestamp,
  date,
  uuid,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { userRoleEnum, districtEnum, sexEnum } from "./enums"
import { hospitals } from "./hospitals"

// ---------------------------------------------------------------------------
// users  — extends better-auth's required columns with profile fields.
//          The profiles table from the SQL schema is merged in here.
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    // ── better-auth required ────────────────────────────────────────────
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    phoneNumber: text("phone_number").unique(),
    phoneNumberVerified: boolean("phone_number_verified"),

    // ── merged from profiles ────────────────────────────────────────────
    // Nullable to allow account creation before profile completion
    nationalId: text("national_id").unique(),
    dateOfBirth: date("date_of_birth"),
    sex: sexEnum("sex"),
    district: districtEnum("district"), // patient's home district

    role: userRoleEnum("role").default("patient").notNull(),

    // Doctors only
    hospitalId: uuid("hospital_id").references(() => hospitals.id, {
      onDelete: "set null",
    }),
    medicalLicenseNo: text("medical_license_no"),

    // Emergency-readable without a code (any doctor/admin). Keep small.
    // e.g. { blood_type, allergies, chronic_conditions, emergency_contact_name, ... }
    emergencyInfo: jsonb("emergency_info")
      .$type<{
        blood_type?: string
        allergies?: string[]
        chronic_conditions?: string[]
        current_medications?: string[]
        emergency_contact_name?: string
        emergency_contact_phone?: string
        organ_donor?: boolean
      }>()
      .default({})
      .notNull(),
  },
  (table) => [
    index("users_national_id_idx").on(table.nationalId),
    index("users_role_idx").on(table.role),
    index("users_hospital_id_idx").on(table.hospitalId),
    index("users_district_idx").on(table.district),
  ]
)

// ---------------------------------------------------------------------------
// sessions  — better-auth managed
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
)

// ---------------------------------------------------------------------------
// accounts  — better-auth managed
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("accounts_issuer_account_id_uidx").on(
      table.issuer,
      table.accountId
    ),
    index("accounts_user_id_idx").on(table.userId),
  ]
)

// ---------------------------------------------------------------------------
// verifications  — better-auth managed
// ---------------------------------------------------------------------------

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)]
)
