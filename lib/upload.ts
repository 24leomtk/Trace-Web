import type { UploadedAttachment } from "@/lib/actions/records"
import type { UploadCredentialsResult } from "@/lib/actions/uploads"

/** Upload a single image straight to Cloudinary using signed credentials
 * produced by the `getUploadCredentials` server action. */
export async function uploadImageToCloudinary(
  file: File,
  credentials: UploadCredentialsResult
): Promise<UploadedAttachment> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("api_key", credentials.apiKey)
  formData.append("timestamp", String(credentials.timestamp))
  formData.append("signature", credentials.signature)
  formData.append("folder", credentials.folder)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${credentials.cloudName}/image/upload`,
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
    fileType: file.type || `image/${result.format ?? "png"}`,
    fileSizeBytes: result.bytes ?? file.size,
  }
}
