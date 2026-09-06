import {
  pgTable,
  text,
  uuid,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { userRoleEnum, domainEnum, districtEnum } from "./enums"
import { branches } from "./branches"
import { organizations } from "./organizations"

// ---------------------------------------------------------------------------
// users — no self-registration. Accounts are provisioned by a system_admin,
// so there's no email/password/verification flow here, just the profile.
//
// Scope by role:
//   officer            -> domain + branchId required, district left null
//   district_monitor   -> domain + district required, branchId null
//   country_monitor    -> domain required, branchId/district null
//   system_admin       -> domain/branchId/district/organizationId all null
//                          (pure platform role, no case-data access)
//   compliance_auditor -> domain/branchId/district/organizationId all null
//                          (cross-domain, audit-log-only access)
//   court_liaison          -> organizationId required (a court);
//   insurance_portal_user  -> organizationId required (an insurer);
//   vehicle_registrar      -> organizationId required (the vehicle registry);
//     all three: domain/branchId/district left null — their access is scoped
//     by organization (and, for court_liaison, by individual case referrals
//     — see courtCaseAccess in court.ts) rather than by branch/district.
//
// These nullability rules aren't enforced by a CHECK constraint here since
// Drizzle's pg-core check() support is limited across versions — enforce in
// application code (or add a CHECK constraint by hand in a migration) if you
// want it at the DB level too.
// ---------------------------------------------------------------------------
// ── better-auth required ────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    phoneNumber: text("phone_number").unique(),
    phoneNumberVerified: boolean("phone_number_verified"),
    badgeNumber: text("badge_number").unique(), // police roles only

    role: userRoleEnum("role").notNull(),
    // Null for system_admin, compliance_auditor, and the three
    // organization-scoped roles — see comment above.
    domain: domainEnum("domain"),

    branchId: uuid("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    district: districtEnum("district"),

    // Set for court_liaison / insurance_portal_user / vehicle_registrar;
    // null for every police role and for system_admin/compliance_auditor.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),

    isActive: boolean("is_active").default(true).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("users_role_idx").on(table.role),
    index("users_domain_idx").on(table.domain),
    index("users_branch_id_idx").on(table.branchId),
    index("users_district_idx").on(table.district),
    index("users_organization_id_idx").on(table.organizationId),
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
