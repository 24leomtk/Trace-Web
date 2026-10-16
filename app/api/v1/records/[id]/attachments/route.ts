import * as z from "zod"

import { ApiError, parseJsonBody, parseWith, route } from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { addRecordAttachments } from "@/lib/actions/records"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const attachmentSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().min(1),
  publicId: z.string().min(1),
  fileType: z.string().min(1),
  fileSizeBytes: z.number().int().min(0),
  fileHash: z.string().min(1).max(128).optional(),
})

const bodySchema = z.object({
  attachments: z.array(attachmentSchema).min(1).max(6),
})

/** Append files to an active case (upload to Cloudinary first via /uploads/credentials). */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const { id } = await params
  const body = parseWith(bodySchema, await parseJsonBody(request))
  await addRecordAttachments({
    id,
    attachments: body.attachments.map((a) => ({ ...a, name: a.name ?? "image" })),
  })
  return { ok: true }
})
