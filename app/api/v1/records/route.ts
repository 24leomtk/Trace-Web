import * as z from "zod"

import { createRecord, getPatientRecords } from "@/lib/actions/records"
import {
  ApiError,
  parseJsonBody,
  parseWith,
  queryOf,
  route,
} from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { recordSchemas, type RecordType } from "@/validations/record"

export const dynamic = "force-dynamic"

const recordTypes = Object.keys(recordSchemas) as [RecordType, ...RecordType[]]

const listQuerySchema = z.object({
  // Defaults to the signed-in user, so patients read their own history by
  // simply omitting it; doctors pass the patient they have access to.
  patientId: z.string().optional(),
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(8),
  type: z.enum(recordTypes).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

const attachmentSchema = z.object({
  // Display-only on the web app; not persisted. Kept optional for mobile.
  name: z.string().min(1).optional(),
  url: z.string().min(1),
  publicId: z.string().min(1),
  fileType: z.string().min(1),
  fileSizeBytes: z.number().int().min(0),
})

const createBodySchema = z.object({
  patientId: z.string(),
  type: z.enum(recordTypes),
  // Typed per record type; validated below (and re-validated by the action).
  data: z.unknown(),
  attachments: z.array(attachmentSchema).max(10).default([]),
})

/** Paginated medical records for a patient — the viewer must be the patient
 * themselves or a clinician with an active access window (RLS enforced). */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")

  const query = parseWith(listQuerySchema, queryOf(request))
  return getPatientRecords({
    patientId: query.patientId ?? viewer.id,
    cursor: query.cursor,
    limit: query.limit,
    type: query.type,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  })
})

/** Adds a record to a patient's history during an active encounter. */
export const POST = route(async (request: Request) => {
  const body = parseWith(createBodySchema, await parseJsonBody(request))

  // Validate the typed payload up front so the client gets per-field issues;
  // the action re-validates before persisting.
  parseWith(recordSchemas[body.type], body.data)

  return createRecord({
    patientId: body.patientId,
    type: body.type,
    data: body.data as Record<string, unknown>,
    attachments: body.attachments.map((attachment) => ({
      ...attachment,
      name: attachment.name ?? "image",
    })),
  })
})
