"use server"

import { and, desc, eq, exists, gte, ilike, isNull, lte, or } from "drizzle-orm"

import { db } from "@/db"
import {
  missingPersonCases,
  personDnaSamples,
  personFingerprints,
  personPhysicalFeatures,
  personsOfInterest,
  recordAttachments,
  records,
  unclaimedPersonCases,
  vehicleCases,
  wantedPersonCases,
} from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { defaultRetentionUntil, fileKindFromMime } from "@/lib/format"
import { writeAudit, writeAuditTx } from "@/lib/server/audit"
import { escapeLike } from "@/lib/visibility"
import { personSchema, personFeatureSchema, type PersonInput } from "@/validations/admin"
import { getViewerScope } from "@/lib/actions/records"

function emptyToUndefined(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined
  return value.trim()
}

function canWorkPersons(role: string): boolean {
  return role === "OFFICER" || role === "DISTRICT_MONITOR" || role === "COUNTRY_MONITOR"
}

export interface PersonSearchFilters {
  /** Home district (snake_case enum value). */
  district?: string
  sex?: "male" | "female" | "other"
  /** Age window — overlaps age_years / age_from..age_to (unknown ages pass). */
  ageMin?: number
  ageMax?: number
  /** Has at least one physical mark of this type. */
  featureType?: "tattoo" | "scar" | "mark" | "piercing" | "amputation" | "other"
}

export async function searchPersons(
  query: string,
  limit = 10,
  filters: PersonSearchFilters = {}
) {
  const scope = await getViewerScope()
  if (!canWorkPersons(scope.role)) throw new Error("Your role can't search persons.")
  const q = query.trim()
  if (!q) return []
  return withUserCtx(scope.id, async (tx) => {
    const conditions = [
      or(
        ilike(personsOfInterest.fullName, `%${escapeLike(q)}%`),
        ilike(personsOfInterest.nationalId, `%${escapeLike(q)}%`)
      ),
    ]
    if (filters.district) {
      conditions.push(
        eq(personsOfInterest.homeDistrict, filters.district as never)
      )
    }
    if (filters.sex) {
      conditions.push(eq(personsOfInterest.sex, filters.sex))
    }
    // Age overlap: exact age in window, or estimated range overlapping it.
    // Profiles with no age data pass (unknown age could be anyone).
    if (filters.ageMin !== undefined || filters.ageMax !== undefined) {
      const min = filters.ageMin ?? 0
      const max = filters.ageMax ?? 150
      conditions.push(
        or(
          and(
            gte(personsOfInterest.ageYears, min),
            lte(personsOfInterest.ageYears, max)
          ),
          and(
            or(
              isNull(personsOfInterest.ageFrom),
              lte(personsOfInterest.ageFrom, max)
            ),
            or(
              isNull(personsOfInterest.ageTo),
              gte(personsOfInterest.ageTo, min)
            )
          )
        )
      )
    }
    if (filters.featureType) {
      conditions.push(
        exists(
          tx
            .select({ id: personPhysicalFeatures.id })
            .from(personPhysicalFeatures)
            .where(
              and(
                eq(personPhysicalFeatures.personId, personsOfInterest.id),
                eq(personPhysicalFeatures.featureType, filters.featureType)
              )
            )
        )
      )
    }
    return tx
      .select({
        id: personsOfInterest.id,
        fullName: personsOfInterest.fullName,
        nationalId: personsOfInterest.nationalId,
        sex: personsOfInterest.sex,
        ageYears: personsOfInterest.ageYears,
        homeDistrict: personsOfInterest.homeDistrict,
      })
      .from(personsOfInterest)
      .where(and(...conditions))
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
        // N1 description fields — validated optional numbers pass through;
        // empty-string text fields collapse to undefined (NULL).
        ageYears: data.ageYears,
        ageFrom: data.ageFrom,
        ageTo: data.ageTo,
        heightCmFrom: data.heightCmFrom,
        heightCmTo: data.heightCmTo,
        weightKgFrom: data.weightKgFrom,
        weightKgTo: data.weightKgTo,
        hairColor: emptyToUndefined(data.hairColor),
        hairLength: emptyToUndefined(data.hairLength),
        eyeColor: emptyToUndefined(data.eyeColor),
        complexion: emptyToUndefined(data.complexion),
        build: emptyToUndefined(data.build),
        clothingDescription: emptyToUndefined(data.clothingDescription),
        jewelryDescription: emptyToUndefined(data.jewelryDescription),
        medicalNotes: emptyToUndefined(data.medicalNotes),
      })
      .returning({ id: personsOfInterest.id })
    return { id: created.id }
  })
}

/** Update a person profile's descriptive fields (officers + monitors). */
export async function updatePerson(
  id: string,
  input: PersonInput
): Promise<void> {
  const scope = await getViewerScope()
  if (!canWorkPersons(scope.role)) throw new Error("Your role can't edit person profiles.")
  const parsed = personSchema.safeParse(input)
  if (!parsed.success) throw new Error("The person details didn't pass validation.")
  const data = parsed.data

  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(eq(personsOfInterest.id, id))
      .limit(1)
    if (!existing) throw new Error("Person not found.")
    await tx
      .update(personsOfInterest)
      .set({
        fullName: data.fullName.trim(),
        nationalId: emptyToUndefined(data.nationalId),
        dateOfBirth: emptyToUndefined(data.dateOfBirth),
        sex: data.sex,
        homeDistrict: (emptyToUndefined(data.homeDistrict) ?? undefined) as never,
        distinguishingFeatures: emptyToUndefined(data.distinguishingFeatures),
        ageYears: data.ageYears,
        ageFrom: data.ageFrom,
        ageTo: data.ageTo,
        heightCmFrom: data.heightCmFrom,
        heightCmTo: data.heightCmTo,
        weightKgFrom: data.weightKgFrom,
        weightKgTo: data.weightKgTo,
        hairColor: emptyToUndefined(data.hairColor),
        hairLength: emptyToUndefined(data.hairLength),
        eyeColor: emptyToUndefined(data.eyeColor),
        complexion: emptyToUndefined(data.complexion),
        build: emptyToUndefined(data.build),
        clothingDescription: emptyToUndefined(data.clothingDescription),
        jewelryDescription: emptyToUndefined(data.jewelryDescription),
        medicalNotes: emptyToUndefined(data.medicalNotes),
        updatedAt: new Date(),
      })
      .where(eq(personsOfInterest.id, id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      reason: "Person profile description updated.",
    })
  })
}

/** Add a physical mark (tattoo/scar/…) to a person profile. */
export async function addPersonFeature(input: {
  personId: string
  featureType: string
  bodyLocation?: string
  description?: string
  approximateSize?: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (!canWorkPersons(scope.role)) throw new Error("Your role can't edit person profiles.")
  const parsed = personFeatureSchema.safeParse(input)
  if (!parsed.success) throw new Error("The feature details didn't pass validation.")
  const data = parsed.data

  return withUserCtx(scope.id, async (tx) => {
    const [person] = await tx
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(eq(personsOfInterest.id, data.personId))
      .limit(1)
    if (!person) throw new Error("Person not found.")
    const [row] = await tx
      .insert(personPhysicalFeatures)
      .values({
        personId: data.personId,
        featureType: data.featureType,
        bodyLocation: emptyToUndefined(data.bodyLocation),
        description: emptyToUndefined(data.description),
        approximateSize: emptyToUndefined(data.approximateSize),
      })
      .returning({ id: personPhysicalFeatures.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      reason: "Physical feature added to person profile.",
    })
    return { id: row.id }
  })
}

/** Remove a physical mark (corrections are audited, never silent). */
export async function removePersonFeature(featureId: string): Promise<void> {
  const scope = await getViewerScope()
  if (!canWorkPersons(scope.role)) throw new Error("Your role can't edit person profiles.")
  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select({ id: personPhysicalFeatures.id })
      .from(personPhysicalFeatures)
      .where(eq(personPhysicalFeatures.id, featureId))
      .limit(1)
    if (!existing) throw new Error("Feature not found.")
    await tx.delete(personPhysicalFeatures).where(eq(personPhysicalFeatures.id, featureId))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      reason: "Physical feature removed from person profile.",
    })
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
    const features = await tx
      .select()
      .from(personPhysicalFeatures)
      .where(eq(personPhysicalFeatures.personId, id))
      .orderBy(desc(personPhysicalFeatures.createdAt))
    const fingerprints = await tx
      .select()
      .from(personFingerprints)
      .where(eq(personFingerprints.personId, id))
      .orderBy(desc(personFingerprints.createdAt))
    const dnaSamples = await tx
      .select()
      .from(personDnaSamples)
      .where(eq(personDnaSamples.personId, id))
      .orderBy(desc(personDnaSamples.createdAt))
    return {
      person: {
        ...person,
        createdAt: person.createdAt.toISOString(),
        updatedAt: person.updatedAt.toISOString(),
      },
      linkedCases: linked.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      physicalFeatures: features.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      fingerprints: fingerprints.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      dnaSamples: dnaSamples.map((row) => ({
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
  fileHash,
}: {
  personId: string
  url: string
  storagePath: string
  fileType: string
  fileHash?: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (!canWorkPersons(scope.role)) throw new Error("Your role can't attach files.")
  if (!fileKindFromMime(fileType)) {
    throw new Error(`Files of type "${fileType || "unknown"}" are not accepted.`)
  }
  return withUserCtx(scope.id, async (tx) => {
    const [person] = await tx
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(eq(personsOfInterest.id, personId))
      .limit(1)
    if (!person) throw new Error("Person not found.")
    const [row] = await tx
      .insert(recordAttachments)
      .values({
        personId,
        url,
        storagePath,
        fileType,
        fileHash: fileHash?.trim() || undefined,
        retentionUntil: new Date(defaultRetentionUntil()),
        uploadedBy: scope.id,
      })
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
      .update(unclaimedPersonCases)
      .set({ personId: keepId })
      .where(eq(unclaimedPersonCases.personId, dropId))
    await tx
      .update(recordAttachments)
      .set({ personId: keepId })
      .where(eq(recordAttachments.personId, dropId))
    await tx
      .update(personPhysicalFeatures)
      .set({ personId: keepId })
      .where(eq(personPhysicalFeatures.personId, dropId))
    await tx
      .update(personFingerprints)
      .set({ personId: keepId })
      .where(eq(personFingerprints.personId, dropId))
    await tx
      .update(personDnaSamples)
      .set({ personId: keepId })
      .where(eq(personDnaSamples.personId, dropId))
    await tx.delete(personsOfInterest).where(eq(personsOfInterest.id, dropId))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "record_updated",
      reason: `Merged duplicate person profile into ${keepId}.`,
    })
  })
}
