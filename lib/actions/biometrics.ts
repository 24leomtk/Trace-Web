"use server"

import { desc, eq } from "drizzle-orm"

import { db } from "@/db"
import {
  personDnaSamples,
  personFingerprints,
  personsOfInterest,
} from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { writeAuditTx } from "@/lib/server/audit"
import {
  dnaSampleSchema,
  dnaStatusUpdateSchema,
  fingerprintSchema,
} from "@/validations/biometrics"
import { getViewerScope } from "@/lib/actions/records"

function emptyToUndefined(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined
  return value.trim()
}

function canWorkBiometrics(role: string): boolean {
  return role === "OFFICER" || role === "DISTRICT_MONITOR" || role === "COUNTRY_MONITOR"
}

async function requirePerson(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  personId: string
): Promise<void> {
  const [person] = await tx
    .select({ id: personsOfInterest.id })
    .from(personsOfInterest)
    .where(eq(personsOfInterest.id, personId))
    .limit(1)
  if (!person) throw new Error("Person not found.")
}

/** Record a fingerprint set against a person profile (audited). */
export async function recordFingerprint(input: {
  personId: string
  referenceNo?: string
  quality?: "poor" | "fair" | "good" | "excellent"
  dateProcessed?: string
  afisReference?: string
  notes?: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (!canWorkBiometrics(scope.role)) throw new Error("Your role can't record biometrics.")
  const parsed = fingerprintSchema.safeParse(input)
  if (!parsed.success) throw new Error("The fingerprint details didn't pass validation.")
  const data = parsed.data

  return withUserCtx(scope.id, async (tx) => {
    await requirePerson(tx, data.personId)
    const [row] = await tx
      .insert(personFingerprints)
      .values({
        personId: data.personId,
        referenceNo: emptyToUndefined(data.referenceNo),
        quality: data.quality,
        dateProcessed: emptyToUndefined(data.dateProcessed),
        afisReference: emptyToUndefined(data.afisReference),
        notes: emptyToUndefined(data.notes),
      })
      .returning({ id: personFingerprints.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "fingerprint_recorded",
      personId: data.personId,
      reason: "Fingerprint set recorded against person profile.",
    })
    return { id: row.id }
  })
}

/** Remove a fingerprint set (corrections are audited, never silent). */
export async function removeFingerprint(id: string): Promise<void> {
  const scope = await getViewerScope()
  if (!canWorkBiometrics(scope.role)) throw new Error("Your role can't edit biometrics.")
  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select({ id: personFingerprints.id, personId: personFingerprints.personId })
      .from(personFingerprints)
      .where(eq(personFingerprints.id, id))
      .limit(1)
    if (!existing) throw new Error("Fingerprint record not found.")
    await tx.delete(personFingerprints).where(eq(personFingerprints.id, id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "fingerprint_recorded",
      personId: existing.personId,
      reason: "Fingerprint set removed from person profile (correction).",
    })
  })
}

/** Record a DNA sample against a person profile (audited). */
export async function recordDnaSample(input: {
  personId: string
  sampleType?: "reference" | "family_reference" | "direct" | "elimination"
  labName?: string
  labReference?: string
  status?: "collected" | "sent" | "processed" | "destroyed"
  relationshipToSubject?: string
  collectedAt?: string
  notes?: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (!canWorkBiometrics(scope.role)) throw new Error("Your role can't record biometrics.")
  const parsed = dnaSampleSchema.safeParse(input)
  if (!parsed.success) throw new Error("The DNA sample details didn't pass validation.")
  const data = parsed.data

  return withUserCtx(scope.id, async (tx) => {
    await requirePerson(tx, data.personId)
    const [row] = await tx
      .insert(personDnaSamples)
      .values({
        personId: data.personId,
        sampleType: data.sampleType,
        labName: emptyToUndefined(data.labName),
        labReference: emptyToUndefined(data.labReference),
        status: data.status,
        relationshipToSubject: emptyToUndefined(data.relationshipToSubject),
        collectedAt: emptyToUndefined(data.collectedAt),
        notes: emptyToUndefined(data.notes),
      })
      .returning({ id: personDnaSamples.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "dna_sample_recorded",
      personId: data.personId,
      reason: "DNA sample recorded against person profile.",
    })
    return { id: row.id }
  })
}

/** Advance a DNA sample through the lab pipeline (audited). */
export async function updateDnaStatus(input: {
  sampleId: string
  status: "collected" | "sent" | "processed" | "destroyed"
}): Promise<void> {
  const scope = await getViewerScope()
  if (!canWorkBiometrics(scope.role)) throw new Error("Your role can't edit biometrics.")
  const parsed = dnaStatusUpdateSchema.safeParse(input)
  if (!parsed.success) throw new Error("The status update didn't pass validation.")
  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select({ id: personDnaSamples.id, personId: personDnaSamples.personId })
      .from(personDnaSamples)
      .where(eq(personDnaSamples.id, parsed.data.sampleId))
      .limit(1)
    if (!existing) throw new Error("DNA sample not found.")
    await tx
      .update(personDnaSamples)
      .set({ status: parsed.data.status })
      .where(eq(personDnaSamples.id, parsed.data.sampleId))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "dna_sample_recorded",
      personId: existing.personId,
      reason: `DNA sample status → ${parsed.data.status}.`,
    })
  })
}

/** Remove a DNA sample record (corrections are audited, never silent). */
export async function removeDnaSample(id: string): Promise<void> {
  const scope = await getViewerScope()
  if (!canWorkBiometrics(scope.role)) throw new Error("Your role can't edit biometrics.")
  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select({ id: personDnaSamples.id, personId: personDnaSamples.personId })
      .from(personDnaSamples)
      .where(eq(personDnaSamples.id, id))
      .limit(1)
    if (!existing) throw new Error("DNA sample not found.")
    await tx.delete(personDnaSamples).where(eq(personDnaSamples.id, id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "dna_sample_recorded",
      personId: existing.personId,
      reason: "DNA sample removed from person profile (correction).",
    })
  })
}

/** Biometric holdings for a person profile (fingerprints + DNA). */
export async function getPersonBiometrics(personId: string) {
  const scope = await getViewerScope()
  if (!canWorkBiometrics(scope.role)) throw new Error("Your role can't open person profiles.")
  return withUserCtx(scope.id, async (tx) => {
    await requirePerson(tx, personId)
    const fingerprints = await tx
      .select()
      .from(personFingerprints)
      .where(eq(personFingerprints.personId, personId))
      .orderBy(desc(personFingerprints.createdAt))
    const dnaSamples = await tx
      .select()
      .from(personDnaSamples)
      .where(eq(personDnaSamples.personId, personId))
      .orderBy(desc(personDnaSamples.createdAt))
    return {
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
