import { getUploadCredentials } from "@/lib/actions/uploads"
import { route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

/** Short-lived Cloudinary signing material for direct-to-Cloudinary image
 * uploads (the mobile app uploads to Cloudinary, then attaches the returned
 * url/publicId to a POST /api/v1/records call). */
export const GET = route(() => getUploadCredentials())
