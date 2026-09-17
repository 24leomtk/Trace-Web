import type { UploadedAttachment } from "@/lib/actions/records"
import type { UploadCredentialsResult } from "@/lib/actions/uploads"
import { KIND_ENDPOINTS, type UploadKind } from "@/lib/cloudinary"
import {
  FILE_KIND_MAX_BYTES,
  fileKindFromMime,
  type FileKind,
} from "@/lib/format"

/** SHA-256 hex of a File's bytes (N2 evidence integrity). */
export async function hashFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Upload any accepted file straight to Cloudinary using signed credentials.
 * Rejects disallowed MIME types and per-kind over-size files before touching
 * the network. Returns the attachment with its content hash attached.
 */
export async function uploadFileToCloudinary(
  file: File,
  credentials: UploadCredentialsResult
): Promise<UploadedAttachment & { kind: FileKind; fileHash: string }> {
  const kind = fileKindFromMime(file.type)
  if (!kind) {
    throw new Error(
      `Files of type "${file.type || "unknown"}" are not accepted. Use images, PDFs, video, audio, or documents.`
    )
  }
  if (file.size > FILE_KIND_MAX_BYTES[kind]) {
    const mb = Math.round(FILE_KIND_MAX_BYTES[kind] / (1024 * 1024))
    throw new Error(`"${file.name}" exceeds the ${mb} MB limit for ${kind} files.`)
  }

  const fileHash = await hashFile(file)
  const endpoint = KIND_ENDPOINTS[kind as UploadKind]

  const formData = new FormData()
  formData.append("file", file)
  formData.append("api_key", credentials.apiKey)
  formData.append("timestamp", String(credentials.timestamp))
  formData.append("signature", credentials.signature)
  formData.append("folder", credentials.folder)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${credentials.cloudName}/${endpoint}/upload`,
    { method: "POST", body: formData }
  )

  if (!response.ok) {
    throw new Error(`Cloudinary upload failed (${response.status})`)
  }

  const result = (await response.json()) as {
    secure_url?: string
    public_id?: string
    bytes?: number
    format?: string
  }

  if (!result.secure_url || !result.public_id) {
    throw new Error("Cloudinary returned an unexpected response.")
  }

  return {
    name: file.name,
    url: result.secure_url,
    publicId: result.public_id,
    fileType: file.type || `application/octet-stream`,
    fileSizeBytes: result.bytes ?? file.size,
    fileHash,
    kind,
  }
}

/** Backwards-compatible image upload (existing callers). */
export async function uploadImageToCloudinary(
  file: File,
  credentials: UploadCredentialsResult
): Promise<UploadedAttachment> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Images only — use uploadFileToCloudinary for other kinds.")
  }
  const uploaded = await uploadFileToCloudinary(file, credentials)
  return {
    name: uploaded.name,
    url: uploaded.url,
    publicId: uploaded.publicId,
    fileType: uploaded.fileType,
    fileSizeBytes: uploaded.fileSizeBytes,
    fileHash: uploaded.fileHash,
  }
}
