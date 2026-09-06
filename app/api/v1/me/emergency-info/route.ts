import * as z from "zod"

import { updateMyEmergencyInfo } from "@/lib/actions/access"
import { parseJsonBody, parseWith, route } from "@/lib/api/http"

export const dynamic = "force-dynamic"

const bloodTypeEnum = z.enum([
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
])

const emergencyContactSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  relation: z.string().trim().optional(),
})

const bodySchema = z.object({
  bloodType: bloodTypeEnum.or(z.literal("")).optional(),
  allergies: z.array(z.string().trim().min(1)).optional(),
  chronicConditions: z.array(z.string().trim().min(1)).optional(),
  emergencyContact: emergencyContactSchema.optional(),
})

/** Patient updates their own emergency contact and medical details. */
export const PUT = route(async (request: Request) => {
  const body = parseWith(bodySchema, await parseJsonBody(request))
  await updateMyEmergencyInfo({
    bloodType: body.bloodType || undefined,
    allergies: body.allergies,
    chronicConditions: body.chronicConditions,
    emergencyContact: body.emergencyContact,
  })
  return { ok: true }
})
