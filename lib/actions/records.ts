"use server"

import { and, desc, eq, gt, gte, inArray, lte } from "drizzle-orm"

import { db } from "@/db"
import {
  accessGrants,
  hospitals,
  medicalRecords,
  recordAttachments,
  users,
} from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { describeRecord } from "@/lib/record-view"
import { isStaffRole, toUiRole } from "@/lib/roles"
import { requireUser } from "@/lib/session"
import { writeAuditTx } from "@/lib/server/audit"
import type { MedicalRecord } from "@/lib/types"
import { recordSchemas, type RecordType } from "@/validations/record"

export interface Page<T> {
  items: T[]
  nextCursor: number | null
}

export interface UploadedAttachment {
  name: string
  url: string
  publicId: string
  fileType: string
  fileSizeBytes: number
}

/** True when `doctorId` currently holds a redeemed, unrevoked, unexpired
 * access window (regular or break-glass) for `patientId`. */
async function hasActiveGrant(
  patientId: string,
  doctorId: string
): Promise<boolean> {
  const [grant] = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.profileId, patientId),
        eq(accessGrants.doctorId, doctorId),
        eq(accessGrants.isUsed, true),
        eq(accessGrants.isRevoked, false),
        gt(accessGrants.expiresAt, new Date())
      )
    )
    .limit(1)
  return Boolean(grant)
}

async function resolveHospitalIdByName(name: string): Promise<string | null> {
  const [facility] = await db
    .select({ id: hospitals.id })
    .from(hospitals)
    .where(eq(hospitals.name, name))
    .limit(1)
  return facility?.id ?? null
}

interface GetPatientRecordsInput {
  patientId: string
  cursor?: number
  limit?: number
  type?: RecordType
  dateFrom?: string
  dateTo?: string
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export async function getPatientRecords({
  patientId,
  cursor = 0,
  limit = 8,
  type,
  dateFrom,
  dateTo,
}: GetPatientRecordsInput): Promise<Page<MedicalRecord>> {
  const viewer = await requireUser()
  const isSelfRead = viewer.id === patientId

  if (!isSelfRead) {
    if (isStaffRole(viewer.role)) {
      throw new Error(
        "Admins work with aggregate reports instead of opening raw charts."
      )
    }
    const granted = await hasActiveGrant(patientId, viewer.id)
    if (!granted) {
      throw new Error("You don't have an active access window for this patient.")
    }
  }

  return withUserCtx(viewer.id, async (tx) => {
    // RLS (`app_can_read_patient`) is the real gatekeeper here; the checks
    // above exist to fail fast with a friendly message.
    const conditions = [eq(medicalRecords.profileId, patientId)]
    if (type) conditions.push(eq(medicalRecords.recordType, type))
    if (dateFrom && ISO_DAY.test(dateFrom)) {
      conditions.push(
        gte(medicalRecords.createdAt, new Date(`${dateFrom}T00:00:00.000Z`))
      )
    }
    if (dateTo && ISO_DAY.test(dateTo)) {
      conditions.push(
        lte(medicalRecords.createdAt, new Date(`${dateTo}T23:59:59.999Z`))
      )
    }

    const rows = await tx
      .select({
        record: medicalRecords,
        authorName: users.name,
        authorRole: users.role,
        hospitalName: hospitals.name,
      })
      .from(medicalRecords)
      .leftJoin(users, eq(medicalRecords.createdBy, users.id))
      .leftJoin(hospitals, eq(medicalRecords.hospitalId, hospitals.id))
      .where(and(...conditions))
      .orderBy(desc(medicalRecords.createdAt), desc(medicalRecords.id))
      .limit(limit + 1)
      .offset(cursor)

    const pageRows = rows.length > limit ? rows.slice(0, limit) : rows

    const recordIds = pageRows.map((row) => row.record.id)
    const attachments = recordIds.length
      ? await tx
          .select()
          .from(recordAttachments)
          .where(inArray(recordAttachments.recordId, recordIds))
      : []

    const items: MedicalRecord[] = pageRows.map((row) => {
      const view = describeRecord(
        row.record.recordType,
        (row.record.data ?? {}) as Record<string, unknown>
      )
      return {
        id: row.record.id,
        patientId: row.record.profileId,
        recordedAt: row.record.createdAt.toISOString(),
        type: row.record.recordType,
        title: view.title,
        summary: view.summary,
        author: {
          name: row.authorName ?? "Self-reported",
          role: row.authorRole ? toUiRole(row.authorRole) : "PATIENT",
        },
        facility: row.hospitalName ?? "",
        badges: view.badges,
        attachments: attachments
          .filter((attachment) => attachment.recordId === row.record.id)
          .map((attachment) => ({
            id: attachment.id,
            name: attachment.storagePath.split("/").pop() ?? "image",
            sizeBytes: attachment.fileSizeBytes ?? 0,
            kind: "image" as const,
            url: attachment.url,
          })),
      }
    })

    if (!isSelfRead && cursor === 0 && items.length > 0) {
      await writeAuditTx(tx, {
        profileId: patientId,
        actorId: viewer.id,
        actionType: "foreign_access",
        reason:
          "Opened the patient's full history during an active access window.",
        doctorName: viewer.name,
        medicalLicenseNo: viewer.licenseNumber ?? null,
        hospitalName: viewer.facility ?? null,
        district: viewer.district ?? null,
      })
    }

    return {
      items,
      nextCursor: rows.length > limit ? cursor + limit : null,
    }
  })
}

interface CreateRecordInput {
  patientId: string
  type: RecordType
  data: Record<string, unknown>
  attachments: UploadedAttachment[]
}

export async function createRecord({
  patientId,
  type,
  data,
  attachments,
}: CreateRecordInput): Promise<{ id: string }> {
  const user = await requireUser()

  if (user.id === patientId) {
    throw new Error(
      "Records can only be added while viewing a patient's chart."
    )
  }
  if (isStaffRole(user.role)) {
    throw new Error("Admins cannot create records.")
  }

  const granted = await hasActiveGrant(patientId, user.id)
  if (!granted) {
    throw new Error("You don't have an active access window for this patient.")
  }

  const schema = recordSchemas[type]
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new Error("The record payload didn't pass validation.")
  }

  // Attach the recording clinician's facility when they belong to one.
  let facilityId: string | null = null
  if (user.facility) {
    facilityId = await resolveHospitalIdByName(user.facility)
  }

  return withUserCtx(user.id, async (tx) => {
    const [inserted] = await tx
      .insert(medicalRecords)
      .values({
        profileId: patientId,
        createdBy: user.id,
        hospitalId: facilityId,
        recordType: type,
        recordDate: new Date().toISOString().slice(0, 10),
        data: parsed.data as unknown as Record<string, unknown>,
      })
      .returning({ id: medicalRecords.id })

    if (attachments.length > 0) {
      await tx.insert(recordAttachments).values(
        attachments.map((attachment) => ({
          recordId: inserted.id,
          url: attachment.url,
          storagePath: `${attachment.publicId}`,
          fileType: attachment.fileType,
          fileSizeBytes: attachment.fileSizeBytes,
          uploadedBy: user.id,
        }))
      )
    }

    return { id: inserted.id }
  })
}
