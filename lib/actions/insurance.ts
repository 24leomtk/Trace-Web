"use server"

import { and, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { insurancePolicies, organizations, vehicles } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { normalizePlate } from "@/lib/format"
import { writeAuditTx } from "@/lib/server/audit"
import { bulkPolicyRowSchema, insurancePolicySchema, type InsurancePolicyInput } from "@/validations/admin"
import { getViewerScope } from "@/lib/actions/records"

function emptyToUndefined(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined
  return value.trim()
}

async function requireInsurer() {
  const scope = await getViewerScope()
  if (scope.role !== "INSURANCE_PORTAL_USER" || !scope.organizationId) {
    throw new Error("Insurer portal users only.")
  }
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, scope.organizationId),
        eq(organizations.orgType, "insurer")
      )
    )
    .limit(1)
  if (!org) throw new Error("Your insurer organization was not found.")
  return scope
}

/** Create a policy for the insurer's own org. Vehicle must already exist (Q18: A). */
export async function createPolicy(input: InsurancePolicyInput): Promise<{ id: string }> {
  const scope = await requireInsurer()
  const parsed = insurancePolicySchema.safeParse(input)
  if (!parsed.success) throw new Error("The policy didn't pass validation.")
  const data = parsed.data

  return withUserCtx(scope.id, async (tx) => {
    const [vehicle] = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.id, data.vehicleId))
      .limit(1)
    if (!vehicle) {
      throw new Error("Vehicle not on file — it must be registered before a policy can attach.")
    }
    const [created] = await tx
      .insert(insurancePolicies)
      .values({
        vehicleId: vehicle.id,
        insurerId: scope.organizationId!,
        policyNumber: data.policyNumber.trim(),
        coverageType: emptyToUndefined(data.coverageType),
        startDate: data.startDate,
        endDate: data.endDate,
        isActive: data.isActive,
        externalReference: emptyToUndefined(data.externalReference),
        enteredBy: scope.id,
      })
      .returning({ id: insurancePolicies.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "policy_entered",
      vehicleId: vehicle.id,
      reason: `Policy ${data.policyNumber.trim()} entered.`,
    })
    return { id: created.id }
  })
}

export async function updatePolicy(
  input: InsurancePolicyInput & { id: string }
): Promise<void> {
  const scope = await requireInsurer()
  const parsed = insurancePolicySchema.safeParse(input)
  if (!parsed.success) throw new Error("The policy didn't pass validation.")
  const data = parsed.data

  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(insurancePolicies)
      .where(eq(insurancePolicies.id, input.id))
      .limit(1)
    if (!existing || existing.insurerId !== scope.organizationId) {
      throw new Error("Policy not found.")
    }
    await tx
      .update(insurancePolicies)
      .set({
        policyNumber: data.policyNumber.trim(),
        coverageType: emptyToUndefined(data.coverageType),
        startDate: data.startDate,
        endDate: data.endDate,
        isActive: data.isActive,
        externalReference: emptyToUndefined(data.externalReference),
        enteredBy: scope.id,
        updatedAt: new Date(),
      })
      .where(eq(insurancePolicies.id, input.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "policy_updated",
      vehicleId: existing.vehicleId,
      reason: `Policy ${data.policyNumber.trim()} updated.`,
    })
  })
}

export async function listPolicies() {
  const scope = await requireInsurer()
  return withUserCtx(scope.id, async (tx) => {
    return tx
      .select({
        id: insurancePolicies.id,
        vehicleId: insurancePolicies.vehicleId,
        plateNumber: vehicles.plateNumber,
        policyNumber: insurancePolicies.policyNumber,
        coverageType: insurancePolicies.coverageType,
        startDate: insurancePolicies.startDate,
        endDate: insurancePolicies.endDate,
        isActive: insurancePolicies.isActive,
        updatedAt: insurancePolicies.updatedAt,
      })
      .from(insurancePolicies)
      .innerJoin(vehicles, eq(insurancePolicies.vehicleId, vehicles.id))
      .where(eq(insurancePolicies.insurerId, scope.organizationId!))
      .orderBy(desc(insurancePolicies.updatedAt))
      .limit(100)
  })
}

export interface BulkImportFailure {
  row: number
  plate: string
  error: string
}

/**
 * F7 bulk policy import (Phase 3) — up to 500 CSV-parsed rows in one call.
 * Vehicles must already be on file (same rule as manual entry); unknown
 * plates and duplicates come back as per-row failures instead of aborting
 * the batch. One summary audit entry covers the run.
 */
export async function bulkCreatePolicies(input: {
  rows: unknown[]
}): Promise<{ created: number; failed: BulkImportFailure[] }> {
  const scope = await requireInsurer()
  const rows = (Array.isArray(input.rows) ? input.rows : []).slice(0, 500)
  if (rows.length === 0) throw new Error("Nothing to import.")

  return withUserCtx(scope.id, async (tx) => {
    let created = 0
    const failed: BulkImportFailure[] = []
    for (let index = 0; index < rows.length; index++) {
      const parsed = bulkPolicyRowSchema.safeParse(rows[index])
      if (!parsed.success) {
        failed.push({
          row: index + 1,
          plate: String((rows[index] as Record<string, unknown>)?.plateNumber ?? ""),
          error: "Row didn't pass validation.",
        })
        continue
      }
      const data = parsed.data
      try {
        const [vehicle] = await tx
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(eq(vehicles.plateNumber, normalizePlate(data.plateNumber)))
          .limit(1)
        if (!vehicle) {
          throw new Error("Vehicle not on file — register it before attaching a policy.")
        }
        await tx.insert(insurancePolicies).values({
          vehicleId: vehicle.id,
          insurerId: scope.organizationId!,
          policyNumber: data.policyNumber.trim(),
          coverageType: emptyToUndefined(data.coverageType),
          startDate: data.startDate,
          endDate: data.endDate,
          isActive: data.isActive,
          externalReference: emptyToUndefined(data.externalReference),
          enteredBy: scope.id,
        })
        created += 1
      } catch (error) {
        failed.push({
          row: index + 1,
          plate: data.plateNumber,
          error:
            error instanceof Error && /duplicate|unique/i.test(error.message)
              ? "Duplicate policy number for this vehicle."
              : error instanceof Error
                ? error.message
                : "Import failed.",
        })
      }
    }
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "policy_entered",
      reason: `Bulk import: ${created} created, ${failed.length} failed.`,
    })
    return { created, failed: failed.slice(0, 50) }
  })
}
