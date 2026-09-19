"use server"

import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  organizations,
  users,
  vehicles,
  vehicleTaxes,
} from "@/db/schema"
import { withUserCtx, type DbTransaction } from "@/lib/db-context"
import { writeAuditTx } from "@/lib/server/audit"
import { notifyUser } from "@/lib/actions/notifications"
import { getViewerScope } from "@/lib/actions/records"
import {
  taxAssessmentSchema,
  taxPaymentSchema,
  taxWaiverDecideSchema,
  taxWaiverProposeSchema,
  type TaxAssessmentInput,
  type TaxPaymentInput,
  type TaxWaiverDecideInput,
  type TaxWaiverProposeInput,
} from "@/validations/admin"

function emptyToUndefined(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined
  return value.trim()
}

function emptyToNull(value?: string): string | null {
  if (!value || value.trim() === "") return null
  return value.trim()
}

async function requireTaxOrg(role: "TAX_OFFICER" | "TAX_COMPLIANCE_OFFICER") {
  const scope = await getViewerScope()
  if (scope.role !== role || !scope.organizationId) {
    throw new Error("Revenue authority staff only.")
  }
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, scope.organizationId),
        eq(organizations.orgType, "revenue_authority")
      )
    )
    .limit(1)
  if (!org) throw new Error("Your revenue authority was not found.")
  return scope
}

async function requireTaxOfficer() {
  return requireTaxOrg("TAX_OFFICER")
}

async function requireTaxCompliance() {
  return requireTaxOrg("TAX_COMPLIANCE_OFFICER")
}

async function requireTaxStaff() {
  const scope = await getViewerScope()
  if (
    (scope.role !== "TAX_OFFICER" &&
      scope.role !== "TAX_COMPLIANCE_OFFICER") ||
    !scope.organizationId
  ) {
    throw new Error("Revenue authority staff only.")
  }
  return scope
}

/** Recompute one plate's flag via the narrow SECURITY DEFINER writer
 * (tax officers hold no vehicles_update grant — see 10_helpers.sql). */
async function refreshFlag(tx: DbTransaction, vehicleId: string): Promise<void> {
  await tx.execute(sql`select public.trace_refresh_vehicle_flag(${vehicleId})`)
}

/** Colleagues in the same revenue office (for ledger chatter + approvals). */
async function orgColleagues(
  tx: DbTransaction,
  organizationId: string,
  role: "TAX_OFFICER" | "TAX_COMPLIANCE_OFFICER" | "ANY",
  excludeId?: string
): Promise<string[]> {
  const rows = await tx
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(
      and(eq(users.organizationId, organizationId), eq(users.isActive, true))
    )
  return rows
    .filter(
      (row) =>
        row.id !== excludeId &&
        (role === "ANY" ||
          (role === "TAX_OFFICER"
            ? row.role === "tax_officer"
            : row.role === "tax_compliance_officer"))
    )
    .map((row) => row.id)
}

/** Create an assessment against the officer's own revenue office. */
export async function createTaxAssessment(
  input: TaxAssessmentInput
): Promise<{ id: string }> {
  const scope = await requireTaxOfficer()
  const parsed = taxAssessmentSchema.safeParse(input)
  if (!parsed.success) throw new Error("The assessment didn't pass validation.")
  const data = parsed.data

  return withUserCtx(scope.id, async (tx) => {
    const [vehicle] = await tx
      .select({ id: vehicles.id, plateNumber: vehicles.plateNumber })
      .from(vehicles)
      .where(eq(vehicles.id, data.vehicleId))
      .limit(1)
    if (!vehicle) {
      throw new Error("Vehicle not on file — it must be registered before tax can attach.")
    }
    const [created] = await tx
      .insert(vehicleTaxes)
      .values({
        vehicleId: vehicle.id,
        ownerOrgId: scope.organizationId!,
        taxType: data.taxType,
        amountDue: String(data.amountDue),
        dueDate: data.dueDate,
        periodStart: emptyToUndefined(data.periodStart),
        periodEnd: emptyToUndefined(data.periodEnd),
        referenceNo: emptyToUndefined(data.referenceNo),
        engineCc: data.engineCc ?? undefined,
        enteredBy: scope.id,
      })
      .returning({ id: vehicleTaxes.id })
    await refreshFlag(tx, vehicle.id)
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "tax_assessed",
      vehicleId: vehicle.id,
      reason:
        `assess ${data.taxType} ${data.amountDue} due ${data.dueDate}` +
        (data.referenceNo ? ` ref ${data.referenceNo.trim()}` : ""),
    })
    for (const userId of await orgColleagues(tx, scope.organizationId!, "ANY", scope.id)) {
      await notifyUser(tx, {
        userId,
        type: "status_changed",
        recordId: undefined,
        message: `Tax assessed: ${data.taxType} ${data.amountDue} on ${vehicle.plateNumber} by ${scope.name}.`,
      })
    }
    return { id: created.id }
  })
}

/** Correct an assessment (amount/dates/reference only — never the toggle or waiver fields). */
export async function updateTaxAssessment(
  input: TaxAssessmentInput & { id: string }
): Promise<void> {
  const scope = await requireTaxOfficer()
  const parsed = taxAssessmentSchema.safeParse(input)
  if (!parsed.success) throw new Error("The assessment didn't pass validation.")
  const data = parsed.data

  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(vehicleTaxes)
      .where(eq(vehicleTaxes.id, input.id))
      .limit(1)
    if (!existing || existing.ownerOrgId !== scope.organizationId) {
      throw new Error("Assessment not found.")
    }
    if (existing.isPaid) {
      throw new Error("Paid assessments are final — corrections go to the audit log.")
    }
    await tx
      .update(vehicleTaxes)
      .set({
        taxType: data.taxType,
        amountDue: String(data.amountDue),
        dueDate: data.dueDate,
        periodStart: emptyToNull(data.periodStart) ?? undefined,
        periodEnd: emptyToNull(data.periodEnd) ?? undefined,
        referenceNo: emptyToUndefined(data.referenceNo),
        engineCc: data.engineCc ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(vehicleTaxes.id, input.id))
    await refreshFlag(tx, existing.vehicleId)
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "tax_assessed",
      vehicleId: existing.vehicleId,
      reason: `reassess ${data.taxType} ${data.amountDue} due ${data.dueDate}.`,
    })
  })
}

/** Flip the paid toggle. Receipt discipline mirrors fine payments. */
export async function recordTaxPayment(input: TaxPaymentInput): Promise<void> {
  const scope = await requireTaxOfficer()
  const parsed = taxPaymentSchema.safeParse(input)
  if (!parsed.success) throw new Error("The payment didn't pass validation.")
  const data = parsed.data

  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(vehicleTaxes)
      .where(eq(vehicleTaxes.id, data.taxId))
      .limit(1)
    if (!existing || existing.ownerOrgId !== scope.organizationId) {
      throw new Error("Assessment not found.")
    }
    if (existing.isPaid) throw new Error("This assessment is already paid.")
    if (existing.isWaived) throw new Error("Waived assessments take no payment.")
    await tx
      .update(vehicleTaxes)
      .set({
        isPaid: true,
        paidAt: new Date(),
        receiptNo: data.receiptNo.trim(),
        receivedBy: scope.id,
        updatedAt: new Date(),
      })
      .where(eq(vehicleTaxes.id, data.taxId))
    await refreshFlag(tx, existing.vehicleId)
    const [vehicle] = await tx
      .select({ plateNumber: vehicles.plateNumber })
      .from(vehicles)
      .where(eq(vehicles.id, existing.vehicleId))
      .limit(1)
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "tax_payment_recorded",
      vehicleId: existing.vehicleId,
      reason: `pay ${existing.amountDue} receipt ${data.receiptNo.trim()} receiver ${scope.name}.`,
    })
    for (const userId of await orgColleagues(tx, scope.organizationId!, "ANY", scope.id)) {
      await notifyUser(tx, {
        userId,
        type: "payment_received",
        recordId: undefined,
        message: `Tax paid: ${existing.amountDue} on ${vehicle?.plateNumber ?? "a vehicle"} (receipt ${data.receiptNo.trim()}).`,
      })
    }
  })
}

/** Officer proposes a waiver — goes to pending, never applies directly. */
export async function proposeTaxWaiver(input: TaxWaiverProposeInput): Promise<void> {
  const scope = await requireTaxOfficer()
  const parsed = taxWaiverProposeSchema.safeParse(input)
  if (!parsed.success) throw new Error("The waiver reason didn't pass validation.")
  const data = parsed.data

  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(vehicleTaxes)
      .where(eq(vehicleTaxes.id, data.taxId))
      .limit(1)
    if (!existing || existing.ownerOrgId !== scope.organizationId) {
      throw new Error("Assessment not found.")
    }
    if (existing.isPaid) throw new Error("Paid assessments can't be waived.")
    if (existing.waiverStatus === "pending") {
      throw new Error("A waiver is already awaiting decision.")
    }
    await tx
      .update(vehicleTaxes)
      .set({
        waiverStatus: "pending",
        waiverReason: data.reason.trim(),
        waiverDecidedBy: null,
        waiverDecidedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(vehicleTaxes.id, data.taxId))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "tax_waiver_proposed",
      vehicleId: existing.vehicleId,
      reason: `waive-propose ${existing.amountDue} because ${data.reason.trim()}.`,
    })
    for (const userId of await orgColleagues(tx, scope.organizationId!, "TAX_COMPLIANCE_OFFICER")) {
      await notifyUser(tx, {
        userId,
        type: "approval_needed",
        recordId: undefined,
        message: `Waiver needs decision: ${existing.taxType} ${existing.amountDue} proposed by ${scope.name}.`,
      })
    }
  })
}

/** Compliance decides a pending waiver — the only path to is_waived. */
export async function decideTaxWaiver(input: TaxWaiverDecideInput): Promise<void> {
  const scope = await requireTaxCompliance()
  const parsed = taxWaiverDecideSchema.safeParse(input)
  if (!parsed.success) throw new Error("The decision didn't pass validation.")
  const data = parsed.data

  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(vehicleTaxes)
      .where(eq(vehicleTaxes.id, data.taxId))
      .limit(1)
    if (!existing || existing.ownerOrgId !== scope.organizationId) {
      throw new Error("Assessment not found.")
    }
    if (existing.waiverStatus !== "pending") {
      throw new Error("Only pending waivers can be decided.")
    }
    const approved = data.decision === "approved"
    await tx
      .update(vehicleTaxes)
      .set({
        waiverStatus: data.decision,
        waiverDecidedBy: scope.id,
        waiverDecidedAt: new Date(),
        isWaived: approved,
        updatedAt: new Date(),
      })
      .where(eq(vehicleTaxes.id, data.taxId))
    await refreshFlag(tx, existing.vehicleId)
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "tax_waiver_decided",
      vehicleId: existing.vehicleId,
      reason:
        `waive-${data.decision} ${existing.amountDue}` +
        (data.reason ? ` because ${data.reason.trim()}` : ""),
    })
    if (existing.enteredBy && existing.enteredBy !== scope.id) {
      await notifyUser(tx, {
        userId: existing.enteredBy,
        type: "status_changed",
        recordId: undefined,
        message: `Waiver ${data.decision}: ${existing.taxType} ${existing.amountDue} decided by ${scope.name}.`,
      })
    }
  })
}

export interface TaxLedgerRow {
  id: string
  vehicleId: string
  plateNumber: string
  taxType: string
  amountDue: string
  isPaid: boolean
  paidAt: string | null
  receiptNo: string | null
  dueDate: string
  periodStart: string | null
  periodEnd: string | null
  referenceNo: string | null
  engineCc: number | null
  isWaived: boolean
  isExempt: boolean
  waiverStatus: string
  waiverReason: string | null
  updatedAt: string
}

/** Own-org ledger for both tax roles (compliance read-only is app-enforced). */
export async function listMyTaxes(): Promise<TaxLedgerRow[]> {
  const scope = await requireTaxStaff()
  return withUserCtx(scope.id, async (tx) => {
    const rows = await tx
      .select({
        id: vehicleTaxes.id,
        vehicleId: vehicleTaxes.vehicleId,
        plateNumber: vehicles.plateNumber,
        taxType: vehicleTaxes.taxType,
        amountDue: vehicleTaxes.amountDue,
        isPaid: vehicleTaxes.isPaid,
        paidAt: vehicleTaxes.paidAt,
        receiptNo: vehicleTaxes.receiptNo,
        dueDate: vehicleTaxes.dueDate,
        periodStart: vehicleTaxes.periodStart,
        periodEnd: vehicleTaxes.periodEnd,
        referenceNo: vehicleTaxes.referenceNo,
        engineCc: vehicleTaxes.engineCc,
        isWaived: vehicleTaxes.isWaived,
        isExempt: vehicleTaxes.isExempt,
        waiverStatus: vehicleTaxes.waiverStatus,
        waiverReason: vehicleTaxes.waiverReason,
        updatedAt: vehicleTaxes.updatedAt,
      })
      .from(vehicleTaxes)
      .innerJoin(vehicles, eq(vehicleTaxes.vehicleId, vehicles.id))
      .where(eq(vehicleTaxes.ownerOrgId, scope.organizationId!))
      .orderBy(desc(vehicleTaxes.updatedAt))
      .limit(200)
    return rows.map((row) => ({
      ...row,
      paidAt: row.paidAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }))
  })
}

/** Pending-waiver decision queue (compliance only). */
export async function listPendingWaivers(): Promise<TaxLedgerRow[]> {
  const scope = await requireTaxCompliance()
  return withUserCtx(scope.id, async (tx) => {
    const rows = await tx
      .select({
        id: vehicleTaxes.id,
        vehicleId: vehicleTaxes.vehicleId,
        plateNumber: vehicles.plateNumber,
        taxType: vehicleTaxes.taxType,
        amountDue: vehicleTaxes.amountDue,
        isPaid: vehicleTaxes.isPaid,
        paidAt: vehicleTaxes.paidAt,
        receiptNo: vehicleTaxes.receiptNo,
        dueDate: vehicleTaxes.dueDate,
        periodStart: vehicleTaxes.periodStart,
        periodEnd: vehicleTaxes.periodEnd,
        referenceNo: vehicleTaxes.referenceNo,
        engineCc: vehicleTaxes.engineCc,
        isWaived: vehicleTaxes.isWaived,
        isExempt: vehicleTaxes.isExempt,
        waiverStatus: vehicleTaxes.waiverStatus,
        waiverReason: vehicleTaxes.waiverReason,
        updatedAt: vehicleTaxes.updatedAt,
      })
      .from(vehicleTaxes)
      .innerJoin(vehicles, eq(vehicleTaxes.vehicleId, vehicles.id))
      .where(
        and(
          eq(vehicleTaxes.ownerOrgId, scope.organizationId!),
          eq(vehicleTaxes.waiverStatus, "pending")
        )
      )
      .orderBy(desc(vehicleTaxes.updatedAt))
      .limit(100)
    return rows.map((row) => ({
      ...row,
      paidAt: row.paidAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }))
  })
}

/** Find a registered vehicle by plate (for the assess form picker). */
export async function findVehicleForTax(plateNumber: string): Promise<{
  id: string
  plateNumber: string
} | null> {
  const scope = await requireTaxStaff()
  const plate = plateNumber.trim().toUpperCase()
  if (!plate) return null
  return withUserCtx(scope.id, async (tx) => {
    const [vehicle] = await tx
      .select({ id: vehicles.id, plateNumber: vehicles.plateNumber })
      .from(vehicles)
      .where(eq(vehicles.plateNumber, plate))
      .limit(1)
    return vehicle ?? null
  })
}
