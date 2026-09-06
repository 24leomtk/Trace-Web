"use server"

import { desc, eq, ilike, or } from "drizzle-orm"

import { db } from "@/db"
import { personsOfInterest, records } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { personSchema, type PersonInput } from "@/validations/admin"
import { getViewerScope } from "@/lib/actions/records"

function emptyToUndefined(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined
  return value.trim()
}

function canWorkPersons(role: string): boolean {
  return role === "OFFICER" || role === "DISTRICT_MONITOR" || role === "COUNTRY_MONITOR"
}

export async function searchPersons(query: string, limit = 10) {
  const scope = await getViewerScope()
  if (!canWorkPersons(scope.role)) throw new Error("Your role can't search persons.")
  const q = query.trim()
  if (!q) return []
  return withUserCtx(scope.id, async (tx) => {
    return tx
      .select({
        id: personsOfInterest.id,
        fullName: personsOfInterest.fullName,
        nationalId: personsOfInterest.nationalId,
        homeDistrict: personsOfInterest.homeDistrict,
      })
      .from(personsOfInterest)
      .where(
        or(
          ilike(personsOfInterest.fullName, `%${q}%`),
          ilike(personsOfInterest.nationalId, `%${q}%`)
        )
      )
      .orderBy(desc(personsOfInterest.createdAt))
      .limit(limit)
  })
}

export async function createPerson(input: PersonInput): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (!canWorkPersons(scope.role)) throw new Error("Your role can't create person profiles.")
  const parsed = personSchema.safeParse(input)
  if (!parsed.success) throw new Error("The person details didn't pass validation.")
  const data = parsed.data

  return withUserCtx(scope.id, async (tx) => {
    const nationalId = emptyToUndefined(data.nationalId)
    if (nationalId) {
      const [duplicate] = await tx
        .select({ id: personsOfInterest.id })
        .from(personsOfInterest)
        .where(eq(personsOfInterest.nationalId, nationalId))
        .limit(1)
      if (duplicate) return { id: duplicate.id }
    }
    const [created] = await tx
      .insert(personsOfInterest)
      .values({
        fullName: data.fullName.trim(),
        nationalId,
        dateOfBirth: emptyToUndefined(data.dateOfBirth),
        sex: data.sex,
        homeDistrict: (emptyToUndefined(data.homeDistrict) ?? undefined) as never,
        distinguishingFeatures: emptyToUndefined(data.distinguishingFeatures),
      })
      .returning({ id: personsOfInterest.id })
    return { id: created.id }
  })
}

export async function getPerson(id: string) {
  const scope = await getViewerScope()
  if (!canWorkPersons(scope.role)) throw new Error("Your role can't open person profiles.")
  return withUserCtx(scope.id, async (tx) => {
    const [person] = await tx
      .select()
      .from(personsOfInterest)
      .where(eq(personsOfInterest.id, id))
      .limit(1)
    if (!person) throw new Error("Person not found.")
    const linked = await tx
      .select({
        id: records.id,
        recordType: records.recordType,
        district: records.district,
        status: records.status,
        createdAt: records.createdAt,
      })
      .from(records)
      .where(eq(records.personId, id))
      .orderBy(desc(records.createdAt))
      .limit(20)
    return {
      person: { ...person, createdAt: person.createdAt.toISOString() },
      linkedCases: linked.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    }
  })
}
