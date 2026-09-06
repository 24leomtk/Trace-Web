"use server"

import { desc, eq, ilike, or } from "drizzle-orm"

import { db } from "@/db"
import {
  missingPersonCases,
  personsOfInterest,
  recordAttachments,
  records,
  vehicleCases,
  wantedPersonCases,
} from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { writeAudit, writeAuditTx } from "@/lib/server/audit"
import { escapeLike } from "@/lib/visibility"
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
          ilike(personsOfInterest.fullName, `%${escapeLike(q)}%`),
          ilike(personsOfInterest.nationalId, `%${escapeLike(q)}%`)
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
  if (!canWorkPersons(scope.role)) {
    await writeAudit({
      actorId: scope.id,
      actionType: "cross_branch_access",
      reason: "DENIED: attempted person-profile read with no person scope.",
    })
    throw new Error("Your role can't open person profiles.")
  }
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

/** Attach a file (e.g. mugshot) directly to a person profile. */
export async function attachPersonFile({
  personId,
  url,
  storagePath,
  fileType,
}: {
  personId: string
  url: string
  storagePath: string
  fileType: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (!canWorkPersons(scope.role)) throw new Error("Your role can't attach files.")
  return withUserCtx(scope.id, async (tx) => {
    const [person] = await tx
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(eq(personsOfInterest.id, personId))
      .limit(1)
    if (!person) throw new Error("Person not found.")
    const [row] = await tx
      .insert(recordAttachments)
      .values({ personId, url, storagePath, fileType, uploadedBy: scope.id })
      .returning({ id: recordAttachments.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      reason: "File attached to person profile.",
    })
    return { id: row.id }
  })
}
export async function mergePersons({
  keepId,
  dropId,
}: {
  keepId: string
  dropId: string
}): Promise<void> {
  const scope = await getViewerScope()
  if (scope.role !== "DISTRICT_MONITOR" && scope.role !== "COUNTRY_MONITOR") {
    throw new Error("Only monitors can merge duplicate profiles.")
  }
  if (keepId === dropId) throw new Error("Pick two different profiles.")
  await withUserCtx(scope.id, async (tx) => {
    const [keep] = await tx
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(eq(personsOfInterest.id, keepId))
      .limit(1)
    const [drop] = await tx
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(eq(personsOfInterest.id, dropId))
      .limit(1)
    if (!keep || !drop) throw new Error("Profile not found.")
    await tx
      .update(records)
      .set({ personId: keepId })
      .where(eq(records.personId, dropId))
    await tx
      .update(missingPersonCases)
      .set({ personId: keepId })
      .where(eq(missingPersonCases.personId, dropId))
    await tx
      .update(wantedPersonCases)
      .set({ personId: keepId })
      .where(eq(wantedPersonCases.personId, dropId))
    await tx
      .update(recordAttachments)
      .set({ personId: keepId })
      .where(eq(recordAttachments.personId, dropId))
    await tx.delete(personsOfInterest).where(eq(personsOfInterest.id, dropId))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      reason: `Merged duplicate person profile into ${keepId}.`,
    })
  })
}
