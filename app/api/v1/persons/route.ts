import * as z from "zod"

import {
  ApiError,
  parseJsonBody,
  parseWith,
  queryOf,
  route,
} from "@/lib/api/http"
import { getCurrentUser } from "@/lib/session"
import { createPerson, searchPersons } from "@/lib/actions/persons"
import { personSchema } from "@/validations/admin"

export const dynamic = "force-dynamic"

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

/** Person-profile search (name / national ID). */
export const GET = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const query = parseWith(searchQuerySchema, queryOf(request))
  return { items: await searchPersons(query.q, query.limit) }
})

/** Create a person profile (dedupes on national ID). */
export const POST = route(async (request: Request) => {
  const viewer = await getCurrentUser()
  if (!viewer) throw new ApiError(401, "You must be signed in.")
  const body = parseWith(personSchema, await parseJsonBody(request))
  return createPerson(body)
})
