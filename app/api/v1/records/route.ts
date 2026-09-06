import * as z from "zod"

import { createRecord, listRecords } from "@/lib/actions/records"
import {
  ApiError,
  parseJsonBody,
  parseWith,
  queryOf,
  route,
} from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { recordSchemas, type RecordType } from "@/validations/record"
import type { AccessLevel } from "@/lib/types"
import { db } from "@/db"
import { idempotencyKeys } from "@/db/schema"
import { and, eq } from "drizzle-orm"

export const dynamic = "force-dynamic"

const recordTypes = Object.keys(recordSchemas) as [RecordType, ...RecordType[]]

const listQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  type: z.enum(recordTypes).optional(),
  status: z.enum(["active", "resolved", "closed", "archived"]).optional(),
})

const attachmentSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().min(1),
  publicId: z.string().min(1),
  fileType: z.string().min(1),
  fileSizeBytes: z.number().int().min(0),
})

const createBodySchema = z.object({
  type: z.enum(recordTypes),
  data: z.unknown(),
  accessLevel: z.enum(["branch", "district", "country"]).default("branch"),
  branchId: z.string().uuid().optional(),
  attachments: z.array(attachmentSchema).max(10).default([]),
})

/** Paginated case feed scoped to the caller's branch/district/domain. */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")

  const query = parseWith(listQuerySchema, queryOf(request))
  return listRecords({
    cursor: query.cursor,
    limit: query.limit,
    type: query.type,
    status: query.status,
  })
})

/**
 * Files a case in the caller's own domain.
 *
 * Mobile (offline-first): send `Idempotency-Key: <uuid>` — retries with the
 * same key return the original response instead of filing twice.
 */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(createBodySchema, await parseJsonBody(request))

  parseWith(recordSchemas[body.type], body.data)

  const idempotencyKey = request.headers.get("idempotency-key")?.trim()
  if (idempotencyKey) {
    const [stored] = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, idempotencyKey),
          eq(idempotencyKeys.userId, viewer.id)
        )
      )
      .limit(1)
    if (stored) {
      return { ...stored.response, idempotentReplay: true }
    }
  }

  const result = await createRecord({
    type: body.type,
    data: body.data as Record<string, unknown>,
    accessLevel: body.accessLevel as AccessLevel,
    branchId: body.branchId,
    attachments: body.attachments.map((attachment) => ({
      ...attachment,
      name: attachment.name ?? "image",
    })),
  })

  if (idempotencyKey) {
    try {
      await db.insert(idempotencyKeys).values({
        key: idempotencyKey,
        userId: viewer.id,
        statusCode: 200,
        response: result,
      })
    } catch {
      // Key raced (parallel retry): the case was still filed exactly once by
      // this request; the duplicate response simply isn't cached.
    }
  }

  return result
})
