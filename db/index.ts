// Make sure to install the '@neondatabase/serverless' package
//
// Uses the WebSocket Pool driver (not neon-http) so that transactions work —
// required by withUserCtx, which scopes `set local role app_user` +
// `app.current_user_id` to a single transaction for RLS enforcement.
import { Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
import { appRelations } from "./schema/relations"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const db = drizzle({ client: pool, relations: appRelations })
