"use server"

import { and, desc, eq, ilike } from "drizzle-orm"

import { db } from "@/db"
import { recordAttachments, records, users, vehicleCases, vehicles, vehicleTaxes } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { defaultRetentionUntil, fileKindFromMime } from "@/lib/format"
import { writeAudit, writeAuditTx } from "@/lib/server/audit"
import { escapeLike } from "@/lib/visibility"
import { vehicleSchema, type VehicleInput } from "@/validations/admin"
import type { BulkVehicleCsvRow } from "@/lib/format"
import { normalizePlate } from "@/lib/format"
import { getViewerScope } from "@/lib/actions/records"

export type VehicleStatus = "active" | "out_of_service"

export interface RegistrarVehicleRow {
  id: string
  plateNumber: string
  make: string | null
  model: string | null
  color: string | null
  isVerified: boolean
  isFlagged: boolean
  status: VehicleStatus
  createdAt: Date
  updatedAt: Date
}

function emptyToUndefined(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined
  return value.trim()
}

function canWorkVehicles(role: string): boolean {
  return (
    role === "OFFICER" ||
    role === "DISTRICT_MONITOR" ||
    role === "COUNTRY_MONITOR" ||
    role === "VEHICLE_REGISTRAR"
  )
}

export async function searchVehicles(query: string, limit = 10) {
  const scope = await getViewerScope()
  if (!canWorkVehicles(scope.role) && scope.role !== "INSURANCE_PORTAL_USER") {
    throw new Error("Your role can't search vehicles.")
  }
  const q = query.trim().toUpperCase()
  if (!q) return []
  return withUserCtx(scope.id, async (tx) => {
    const rows = await tx
      .select({
        id: vehicles.id,
        plateNumber: vehicles.plateNumber,
        make: vehicles.make,
        model: vehicles.model,
        color: vehicles.color,
        isFlagged: vehicles.isFlagged,
        isVerified: vehicles.isVerified,
        status: vehicles.status,
      })
      .from(vehicles)
      .where(ilike(vehicles.plateNumber, `%${escapeLike(q)}%`))
      .orderBy(desc(vehicles.updatedAt))
      .limit(limit)
    return rows
  })
}

export async function getVehicle(id: string) {
  const scope = await getViewerScope()
  if (!canWorkVehicles(scope.role)) {
    await writeAudit({
      actorId: scope.id,
      actionType: "cross_branch_access",
      vehicleId: id,
      reason: "DENIED: attempted vehicle read with no vehicle scope.",
    })
    throw new Error("Your role can't open vehicles.")
  }
  return withUserCtx(scope.id, async (tx) => {
    const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).limit(1)
    if (!vehicle) throw new Error("Vehicle not found.")
    const [registrar] = vehicle.registeredBy
      ? await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, vehicle.registeredBy))
          .limit(1)
      : []
    const cases = await tx
      .select({
        id: vehicleCases.id,
        recordId: vehicleCases.recordId,
        caseType: vehicleCases.caseType,
        status: vehicleCases.status,
      })
      .from(vehicleCases)
      .where(eq(vehicleCases.vehicleId, id))
      .orderBy(desc(vehicleCases.createdAt))
      .limit(20)
    // Case links are police-only; registrars get counts, not case detail.
    const linkedCases =
      scope.role === "VEHICLE_REGISTRAR"
        ? []
        : await Promise.all(
            cases.map(async (entry) => {
              const [record] = await tx
                .select({ recordType: records.recordType, district: records.district })
                .from(records)
                .where(eq(records.id, entry.recordId))
                .limit(1)
              return { ...entry, recordType: record?.recordType, district: record?.district }
            })
          )
    // Tax rows ride the tax RLS (own-org + police read); roles without a
    // grant simply see none — same pattern as the registrar case blackout.
    const taxRows = await tx
      .select({
        id: vehicleTaxes.id,
        taxType: vehicleTaxes.taxType,
        amountDue: vehicleTaxes.amountDue,
        isPaid: vehicleTaxes.isPaid,
        dueDate: vehicleTaxes.dueDate,
        isWaived: vehicleTaxes.isWaived,
        isExempt: vehicleTaxes.isExempt,
        waiverStatus: vehicleTaxes.waiverStatus,
      })
      .from(vehicleTaxes)
      .where(eq(vehicleTaxes.vehicleId, id))
      .orderBy(desc(vehicleTaxes.dueDate))
      .limit(20)
    return {
      vehicle: {
        ...vehicle,
        createdAt: vehicle.createdAt.toISOString(),
        updatedAt: vehicle.updatedAt.toISOString(),
        verifiedAt: vehicle.verifiedAt?.toISOString() ?? null,
        registrarName: registrar?.name ?? null,
      },
      caseCount: cases.length,
      linkedCases,
      taxes: taxRows,
    }
  })
}

/**
 * Registrar verify/enrich (Q11: A) — can correct any field except the plate;
 * plate corrections need a system admin. Never changes the id, so case links
 * keep working.
 */
export async function verifyVehicle(input: VehicleInput & { id: string }) {
  const scope = await getViewerScope()
  if (scope.role !== "VEHICLE_REGISTRAR") {
    throw new Error("Only vehicle registrars can verify vehicles.")
  }
  const parsed = vehicleSchema.safeParse(input)
  if (!parsed.success) throw new Error("The vehicle details didn't pass validation.")

  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, input.id))
      .limit(1)
    if (!existing) throw new Error("Vehicle not found.")
    const plate = parsed.data.plateNumber.trim().toUpperCase()
    if (plate !== existing.plateNumber) {
      throw new Error("Plate corrections need a system administrator.")
    }
    await tx
      .update(vehicles)
      .set({
        make: emptyToUndefined(parsed.data.make),
        model: emptyToUndefined(parsed.data.model),
        year: parsed.data.year,
        color: emptyToUndefined(parsed.data.color),
        chassisNumber: emptyToUndefined(parsed.data.chassisNumber),
        engineNumber: emptyToUndefined(parsed.data.engineNumber),
        ownerName: emptyToUndefined(parsed.data.ownerName),
        ownerNationalId: emptyToUndefined(parsed.data.ownerNationalId),
        ownerPhone: emptyToUndefined(parsed.data.ownerPhone),
        ownerDistrict: (emptyToUndefined(parsed.data.ownerDistrict) ?? undefined) as never,
        isVerified: true,
        registeredBy: scope.id,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, input.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "vehicle_registered",
      vehicleId: input.id,
      reason: "Registrar verification/enrichment.",
    })
  })
}

/** Registrar creates an entry — caller decides verified vs queued. */
export async function registerVehicle(
  input: VehicleInput & { isVerified?: boolean }
): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (scope.role !== "VEHICLE_REGISTRAR") {
    throw new Error("Only vehicle registrars can register vehicles.")
  }
  const { isVerified = true, ...rest } = input
  const parsed = vehicleSchema.safeParse(rest)
  if (!parsed.success) throw new Error("The vehicle details didn't pass validation.")
  const plate = parsed.data.plateNumber.trim().toUpperCase()

  return withUserCtx(scope.id, async (tx) => {
    const [duplicate] = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.plateNumber, plate))
      .limit(1)
    if (duplicate) throw new Error("That plate is already on file — verify it instead.")
    const [created] = await tx
      .insert(vehicles)
      .values({
        plateNumber: plate,
        make: emptyToUndefined(parsed.data.make),
        model: emptyToUndefined(parsed.data.model),
        year: parsed.data.year,
        color: emptyToUndefined(parsed.data.color),
        chassisNumber: emptyToUndefined(parsed.data.chassisNumber),
        engineNumber: emptyToUndefined(parsed.data.engineNumber),
        ownerName: emptyToUndefined(parsed.data.ownerName),
        ownerNationalId: emptyToUndefined(parsed.data.ownerNationalId),
        ownerPhone: emptyToUndefined(parsed.data.ownerPhone),
        ownerDistrict: (emptyToUndefined(parsed.data.ownerDistrict) ?? undefined) as never,
        isVerified,
        registeredBy: isVerified ? scope.id : undefined,
        verifiedAt: isVerified ? new Date() : undefined,
        status: "active",
      })
      .returning({ id: vehicles.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "vehicle_registered",
      vehicleId: created.id,
      reason: isVerified
        ? `Authoritative registration of ${plate}.`
        : `Queued registration of ${plate} (unverified).`,
    })
    return { id: created.id }
  })
}

/**
 * Registrar edit — any field except the plate; plate corrections still need
 * a system admin so case links stay stable. Optionally flips verification.
 */
export async function updateVehicle(
  input: VehicleInput & { id: string; isVerified?: boolean }
): Promise<void> {
  const scope = await getViewerScope()
  if (scope.role !== "VEHICLE_REGISTRAR") {
    throw new Error("Only vehicle registrars can edit vehicles.")
  }
  const { id, isVerified, ...rest } = input
  const parsed = vehicleSchema.safeParse(rest)
  if (!parsed.success) throw new Error("The vehicle details didn't pass validation.")

  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, id))
      .limit(1)
    if (!existing) throw new Error("Vehicle not found.")
    const plate = parsed.data.plateNumber.trim().toUpperCase()
    if (plate !== existing.plateNumber) {
      throw new Error("Plate corrections need a system administrator.")
    }
    if (existing.status !== "active") {
      throw new Error("Restore this vehicle to active before editing.")
    }
    await tx
      .update(vehicles)
      .set({
        make: emptyToUndefined(parsed.data.make),
        model: emptyToUndefined(parsed.data.model),
        year: parsed.data.year,
        color: emptyToUndefined(parsed.data.color),
        chassisNumber: emptyToUndefined(parsed.data.chassisNumber),
        engineNumber: emptyToUndefined(parsed.data.engineNumber),
        ownerName: emptyToUndefined(parsed.data.ownerName),
        ownerNationalId: emptyToUndefined(parsed.data.ownerNationalId),
        ownerPhone: emptyToUndefined(parsed.data.ownerPhone),
        ownerDistrict: (emptyToUndefined(parsed.data.ownerDistrict) ?? undefined) as never,
        ...(isVerified === true
          ? { isVerified: true, registeredBy: scope.id, verifiedAt: new Date() }
          : isVerified === false
            ? { isVerified: false }
            : {}),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "vehicle_registered",
      vehicleId: id,
      reason: `Registrar edit of ${plate}${isVerified === true ? " (marked verified)" : ""}.`,
    })
  })
}

/**
 * Soft-delete / restore — out_of_service keeps the row (case links + audit
 * intact) but hides it from active queues and flags it everywhere else.
 */
export async function setVehicleStatus(input: {
  id: string
  status: VehicleStatus
}): Promise<void> {
  const scope = await getViewerScope()
  if (scope.role !== "VEHICLE_REGISTRAR") {
    throw new Error("Only vehicle registrars can change vehicle status.")
  }
  if (input.status !== "active" && input.status !== "out_of_service") {
    throw new Error("Unknown vehicle status.")
  }
  await withUserCtx(scope.id, async (tx) => {
    const [existing] = await tx
      .select({ id: vehicles.id, plateNumber: vehicles.plateNumber })
      .from(vehicles)
      .where(eq(vehicles.id, input.id))
      .limit(1)
    if (!existing) throw new Error("Vehicle not found.")
    await tx
      .update(vehicles)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(vehicles.id, input.id))
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "vehicle_registered",
      vehicleId: input.id,
      reason:
        input.status === "out_of_service"
          ? `Marked ${existing.plateNumber} out of service (soft-delete).`
          : `Restored ${existing.plateNumber} to active.`,
    })
  })
}

/** Full registry for the registrar tabs (capped — pilot-scale scan). */
export async function listRegistrarVehicles(
  limit = 500
): Promise<RegistrarVehicleRow[]> {
  const scope = await getViewerScope()
  if (scope.role !== "VEHICLE_REGISTRAR") throw new Error("Registrars only.")
  return withUserCtx(scope.id, async (tx) => {
    return tx
      .select({
        id: vehicles.id,
        plateNumber: vehicles.plateNumber,
        make: vehicles.make,
        model: vehicles.model,
        color: vehicles.color,
        isVerified: vehicles.isVerified,
        isFlagged: vehicles.isFlagged,
        status: vehicles.status,
        createdAt: vehicles.createdAt,
        updatedAt: vehicles.updatedAt,
      })
      .from(vehicles)
      .orderBy(desc(vehicles.updatedAt))
      .limit(limit)
  })
}

/**
 * Bulk registrar import (CSV/Excel rows parsed client-side). Per-row:
 * duplicate plates — both inside the file and already on file — come back
 * as failures instead of aborting the batch.
 */
export async function bulkRegisterVehicles(input: {
  rows: BulkVehicleCsvRow[]
}): Promise<{
  created: number
  failed: { row: number; plate: string; error: string }[]
}> {
  const scope = await getViewerScope()
  if (scope.role !== "VEHICLE_REGISTRAR") {
    throw new Error("Only vehicle registrars can import vehicles.")
  }
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new Error("No rows to import.")
  }
  if (input.rows.length > 500) {
    throw new Error("Split the file — 500 rows max per import.")
  }
  return withUserCtx(scope.id, async (tx) => {
    const failed: { row: number; plate: string; error: string }[] = []
    let created = 0
    const seen = new Set<string>()
    for (let index = 0; index < input.rows.length; index++) {
      const lineNo = index + 2
      const raw = input.rows[index]!
      const plate = normalizePlate(raw.plateNumber ?? "")
      if (!plate) {
        failed.push({ row: lineNo, plate: "", error: "Missing plate_number." })
        continue
      }
      if (seen.has(plate)) {
        failed.push({ row: lineNo, plate, error: "Duplicate plate inside the file." })
        continue
      }
      seen.add(plate)
      const parsed = vehicleSchema.safeParse({
        plateNumber: plate,
        make: raw.make ?? "",
        model: raw.model ?? "",
        year: raw.year,
        color: raw.color ?? "",
        chassisNumber: raw.chassisNumber ?? "",
        engineNumber: raw.engineNumber ?? "",
        ownerName: raw.ownerName ?? "",
        ownerNationalId: raw.ownerNationalId ?? "",
        ownerPhone: raw.ownerPhone ?? "",
        ownerDistrict: raw.ownerDistrict ?? "",
      })
      if (!parsed.success) {
        failed.push({ row: lineNo, plate, error: "Row didn't pass validation." })
        continue
      }
      const [duplicate] = await tx
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.plateNumber, plate))
        .limit(1)
      if (duplicate) {
        failed.push({ row: lineNo, plate, error: "Plate already on file." })
        continue
      }
      const verified = raw.isVerified !== false
      await tx.insert(vehicles).values({
        plateNumber: plate,
        make: emptyToUndefined(parsed.data.make),
        model: emptyToUndefined(parsed.data.model),
        year: parsed.data.year,
        color: emptyToUndefined(parsed.data.color),
        chassisNumber: emptyToUndefined(parsed.data.chassisNumber),
        engineNumber: emptyToUndefined(parsed.data.engineNumber),
        ownerName: emptyToUndefined(parsed.data.ownerName),
        ownerNationalId: emptyToUndefined(parsed.data.ownerNationalId),
        ownerPhone: emptyToUndefined(parsed.data.ownerPhone),
        ownerDistrict: (emptyToUndefined(parsed.data.ownerDistrict) ?? undefined) as never,
        isVerified: verified,
        registeredBy: verified ? scope.id : undefined,
        verifiedAt: verified ? new Date() : undefined,
        status: "active",
      })
      created += 1
    }
    const [first] = input.rows
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "vehicle_registered",
      reason: `Bulk vehicle import: ${created} created, ${failed.length} failed (from ${first?.plateNumber ?? "file"}…).`,
    })
    return { created, failed }
  })
}

/** Attach a photo/file directly to a vehicle (plate photo, independent of any case). */
export async function attachVehicleFile({
  vehicleId,
  url,
  storagePath,
  fileType,
  fileHash,
}: {
  vehicleId: string
  url: string
  storagePath: string
  fileType: string
  fileHash?: string
}): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (!canWorkVehicles(scope.role)) throw new Error("Your role can't attach files.")
  if (!fileKindFromMime(fileType)) {
    throw new Error(`Files of type "${fileType || "unknown"}" are not accepted.`)
  }
  return withUserCtx(scope.id, async (tx) => {
    const [vehicle] = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1)
    if (!vehicle) throw new Error("Vehicle not found.")
    const [row] = await tx
      .insert(recordAttachments)
      .values({
        vehicleId,
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
      vehicleId,
      reason: "File attached to vehicle.",
    })
    return { id: row.id }
  })
}

/** Registrar work queue: unverified + active rows first. */
export async function unverifiedVehicles(limit = 25) {  const scope = await getViewerScope()
  if (scope.role !== "VEHICLE_REGISTRAR") throw new Error("Registrars only.")
  return withUserCtx(scope.id, async (tx) => {
    return tx
      .select({
        id: vehicles.id,
        plateNumber: vehicles.plateNumber,
        make: vehicles.make,
        model: vehicles.model,
        color: vehicles.color,
        isVerified: vehicles.isVerified,
        isFlagged: vehicles.isFlagged,
        status: vehicles.status,
        createdAt: vehicles.createdAt,
      })
      .from(vehicles)
      .where(and(eq(vehicles.isVerified, false), eq(vehicles.status, "active")))
      .orderBy(desc(vehicles.createdAt))
      .limit(limit)
  })
}
