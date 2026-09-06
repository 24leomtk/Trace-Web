"use server"

import { and, desc, eq, ilike } from "drizzle-orm"

import { db } from "@/db"
import { records, users, vehicleCases, vehicles } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { writeAuditTx } from "@/lib/server/audit"
import { vehicleSchema, type VehicleInput } from "@/validations/admin"
import { getViewerScope } from "@/lib/actions/records"

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
      })
      .from(vehicles)
      .where(ilike(vehicles.plateNumber, `%${q}%`))
      .orderBy(desc(vehicles.updatedAt))
      .limit(limit)
    return rows
  })
}

export async function getVehicle(id: string) {
  const scope = await getViewerScope()
  if (!canWorkVehicles(scope.role)) throw new Error("Your role can't open vehicles.")
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

/** Registrar creates an authoritative entry (is_verified from the start). */
export async function registerVehicle(input: VehicleInput): Promise<{ id: string }> {
  const scope = await getViewerScope()
  if (scope.role !== "VEHICLE_REGISTRAR") {
    throw new Error("Only vehicle registrars can register vehicles.")
  }
  const parsed = vehicleSchema.safeParse(input)
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
        isVerified: true,
        registeredBy: scope.id,
        verifiedAt: new Date(),
      })
      .returning({ id: vehicles.id })
    await writeAuditTx(tx, {
      actorId: scope.id,
      actionType: "vehicle_registered",
      vehicleId: created.id,
      reason: `Authoritative registration of ${plate}.`,
    })
    return { id: created.id }
  })
}

/** Registrar work queue: unverified rows first. */
export async function unverifiedVehicles(limit = 25) {
  const scope = await getViewerScope()
  if (scope.role !== "VEHICLE_REGISTRAR") throw new Error("Registrars only.")
  return withUserCtx(scope.id, async (tx) => {
    return tx
      .select({
        id: vehicles.id,
        plateNumber: vehicles.plateNumber,
        make: vehicles.make,
        model: vehicles.model,
        createdAt: vehicles.createdAt,
      })
      .from(vehicles)
      .where(and(eq(vehicles.isVerified, false)))
      .orderBy(desc(vehicles.createdAt))
      .limit(limit)
  })
}
