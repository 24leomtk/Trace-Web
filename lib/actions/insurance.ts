"use server"

import { and, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { insurancePolicies, organizations, vehicles } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { writeAuditTx } from "@/lib/server/audit"
import { insurancePolicySchema, type InsurancePolicyInput } from "@/validations/admin"
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
