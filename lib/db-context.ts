import { sql } from "drizzle-orm"

import { db } from "@/db"

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Runs `fn` inside a transaction that:
 *   1. downgrades the connection to the restricted `app_user` role, so
 *      PostgreSQL RLS policies actually apply (the default connection role is
 *      the schema owner, which bypasses RLS entirely), and
 *   2. sets `app.current_user_id` for the same transaction, feeding the
  *      `app_user_id()` / `app_can_read_record()` policy helpers.
 *
 * Requires the connection role to be a member of `app_user` — see the
 * self-grant block in db/sql/00_prerequisites.sql (and
 * db/sql/Seed-refresh.sql).
 */
export async function withUserCtx<T>(
  userId: string,
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_user`)
    await tx.execute(sql`select public.set_user_id(${userId})`)
    return fn(tx)
  })
}
