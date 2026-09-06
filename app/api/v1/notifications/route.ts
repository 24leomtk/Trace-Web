import * as z from "zod"

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from "@/lib/actions/notifications"
import {
  ApiError,
  parseJsonBody,
  parseWith,
  queryOf,
  route,
} from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"

export const dynamic = "force-dynamic"

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

const readBodySchema = z.object({
  id: z.string().uuid().optional(),
  all: z.boolean().default(false),
})

/** In-app notifications (referrals, outcomes, status changes, reviews). */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const query = parseWith(listQuerySchema, queryOf(request))
  return {
    unread: await unreadNotificationCount(),
    items: await listNotifications(query.limit),
  }
})

/** Mark one (`{ id }`) or all (`{ all: true }`) notifications read. */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(readBodySchema, await parseJsonBody(request))
  if (body.all) {
    await markAllNotificationsRead()
    return { ok: true }
  }
  if (!body.id) throw new ApiError(422, "Pass an id or { all: true }.")
  await markNotificationRead(body.id)
  return { ok: true }
})
