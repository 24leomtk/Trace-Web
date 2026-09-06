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
 * image upload. Images only — the signature pins resource_type to images. */
export async function getUploadCredentials(): Promise<UploadCredentialsResult> {
  const user = await requireUser()
  if (
    user.role === "DISTRICT_ADMIN" ||
    user.role === "NATIONAL_ADMIN" ||
    user.role === "ADMINISTRATOR"
  ) {
    throw new Error("Administrators don't upload files.")
  }

  const credentials = buildUploadCredentials(`chipatala/records/${user.id}`)
  return credentials
}
