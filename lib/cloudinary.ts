import { createHash } from "node:crypto"

/**
 * Minimal signed-upload helper for Cloudinary — no SDK needed.
 * Only image uploads are supported (`resource_type: "image"`).
 */

export const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const API_KEY = process.env.CLOUDINARY_API_KEY
const API_SECRET = process.env.CLOUDINARY_API_SECRET

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET)
}

/** Sign an upload's params exactly the way Cloudinary expects:
 * sorted `key=value` pairs joined by `&`, secret appended, SHA-1 hex. */
export function signUploadParams(
  params: Record<string, string | number>
): string {
  if (!API_SECRET) {
    throw new Error("CLOUDINARY_API_SECRET is not configured.")
  }
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&")
  return createHash("sha1")
    .update(`${toSign}${API_SECRET}`)
    .digest("hex")
}

export interface UploadCredentials {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
}

export function buildUploadCredentials(
  folder = "chipatala/records"
): UploadCredentials {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "File storage is not configured. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
    )
  }
  const timestamp = Math.floor(Date.now() / 1000)
  return {
    cloudName: CLOUD_NAME!,
    apiKey: API_KEY!,
    timestamp,
    folder,
    signature: signUploadParams({ folder, timestamp }),
  }
}
