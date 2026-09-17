import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { users } from "./auth"

// ---------------------------------------------------------------------------
// api_keys — machine credentials for integrations (N4 pilot: ANPR readers).
//
// A key acts as one provisioned user: it carries that user's role/scope, so
// every existing visibility gate and audit rule applies unchanged. Only the
// SHA-256 hash is stored; the plaintext is shown once at issuance.
// Scopes bound the key further (e.g. plate:read can't open cases).
// ---------------------------------------------------------------------------

export const API_KEY_SCOPES = ["plate:read"] as const

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    scopes: text("scopes").array().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("api_keys_user_id_idx").on(table.userId),
    uniqueIndex("api_keys_key_hash_uidx").on(table.keyHash),
  ]
)
