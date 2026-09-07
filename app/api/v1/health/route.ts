import { sql } from "drizzle-orm"

import { db } from "@/db"
import { withUserCtx } from "@/lib/db-context"

export const dynamic = "force-dynamic"

/**
 * Liveness probe (no session required).
 *
 * `?deep=1` also verifies the RLS path: it runs `SET LOCAL ROLE app_user`
 * inside a transaction — the exact statement that fails with
 * "permission denied to set role app_user" when the connection role was
 * never granted membership (`GRANT app_user TO <owner> WITH SET TRUE`).
 * Use it to diagnose production 500s without signing in.
 */
export async function GET(request: Request) {
  const base = {
    ok: true,
    service: "trace-api",
    version: 1,
    time: new Date().toISOString(),
  }

  const deep = new URL(request.url).searchParams.get("deep") === "1"
  if (!deep) return Response.json(base)

  try {
    const userId = await withUserCtx("health-check", async (tx) => {
      const rows = await tx.execute<{ current_user_id: string }>(
        sql`select public.app_user_id() as current_user_id`
      )
      const row = (rows as unknown as { rows: { current_user_id: string }[] })
        .rows[0]
      return row?.current_user_id ?? null
    })
    return Response.json({
      ...base,
      rls: userId === "health-check" ? "ok" : "mismatch",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const needsGrant =
      /permission denied to set role/i.test(message) ||
      /app_user/i.test(message)
    return Response.json(
      {
        ...base,
        ok: false,
        rls: "failed",
        error: message,
        fix: needsGrant
          ? "Run as the schema owner: GRANT app_user TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;"
          : undefined,
      },
      { status: 503 }
    )
  }
}
