"use server"

import { createHash, randomBytes } from "node:crypto"
import { desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { apiKeys, users } from "@/db/schema"
import { requireSystemAdmin } from "@/lib/actions/admin"
import { apiKeySchema } from "@/validations/admin"

/** SHA-256 of a raw key — the only form ever stored. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export interface ApiKeyRow {
  id: string
  userId: string
  userName: string
  name: string
  keyPrefix: string
  scopes: string[]
  isActive: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

/**
 * N4 key issuance (Phase 3) — system admins only. The key acts as the given
 * (active) user, so role/scope gates and audit apply unchanged; scopes bind
 * it further. Plaintext is returned once and never stored.
 */
export async function createApiKey(input: {
  userId: string
  name: string
  scopes: string[]
  expiresAt?: string
}): Promise<{ id: string; key: string }> {
  await requireSystemAdmin()
  const parsed = apiKeySchema.safeParse(input)
  if (!parsed.success) throw new Error("The API key didn't pass validation.")

  const [target] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1)
  if (!target || !target.isActive) {
    throw new Error("Keys can only be issued to active users.")
  }

  const raw = `trace_${randomBytes(24).toString("hex")}`
  const [created] = await db
    .insert(apiKeys)
    .values({
      userId: target.id,
      name: parsed.data.name.trim(),
      keyHash: hashApiKey(raw),
      keyPrefix: raw.slice(0, 12),
      scopes: [...parsed.data.scopes],
      expiresAt: parsed.data.expiresAt
        ? new Date(`${parsed.data.expiresAt}T23:59:59.999Z`)
        : undefined,
    })
    .returning({ id: apiKeys.id })
  return { id: created.id, key: raw }
}

/** All keys with owner names — system admins only (hashes never leave). */
export async function listApiKeys(): Promise<ApiKeyRow[]> {
  await requireSystemAdmin()
  const rows = await db
    .select({
      key: apiKeys,
      userName: users.name,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .orderBy(desc(apiKeys.createdAt))
    .limit(200)
  return rows.map((row) => ({
    id: row.key.id,
    userId: row.key.userId,
    userName: row.userName,
    name: row.key.name,
    keyPrefix: row.key.keyPrefix,
    scopes: [...row.key.scopes],
    isActive: row.key.isActive,
    expiresAt: row.key.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.key.lastUsedAt?.toISOString() ?? null,
    createdAt: row.key.createdAt.toISOString(),
  }))
}

/** Revoke a key immediately — system admins only. */
export async function revokeApiKey(id: string): Promise<void> {
  await requireSystemAdmin()
  await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(eq(apiKeys.id, id))
}

/**
 * Authenticates a raw key with no session (machine integrations). Throws
 * API-key errors, which the HTTP layer maps to 403. Touches last_used_at.
 */
export async function verifyApiKey(
  raw: string
): Promise<{ userId: string; scopes: string[] }> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(raw.trim())))
    .limit(1)
  if (!row || !row.isActive) {
    throw new Error("That API key was not found.")
  }
  if (row.expiresAt && row.expiresAt <= new Date()) {
    throw new Error("That API key has expired.")
  }
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
  return { userId: row.userId, scopes: [...row.scopes] }
}
