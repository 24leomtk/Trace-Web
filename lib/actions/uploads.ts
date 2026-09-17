"use server"

import { buildUploadCredentials } from "@/lib/cloudinary"
import { requireUser } from "@/lib/session"

export interface UploadCredentialsResult {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
}

/** Hands the client short-lived signing material for a direct-to-Cloudinary
 * upload. N2: images, PDFs, video, audio, and documents — the endpoint (and
 * hence resource type) follows the allowlisted file kind; executables are
 * rejected before upload and again server-side at filing time. */
export async function getUploadCredentials(): Promise<UploadCredentialsResult> {
  const user = await requireUser()
  if (
    user.role === "SYSTEM_ADMIN" ||
    user.role === "COMPLIANCE_AUDITOR"
  ) {
    throw new Error("Administrators don't upload files.")
  }

  const credentials = buildUploadCredentials(`trace/records/${user.id}`)
  return credentials
}
