import { sql } from "drizzle-orm"

import { db } from "@/db"
import { actions } from "@/db/schema"

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type AuditInput = {
  profileId: string // whose data was touched
  actorId: string // who did it
  actionType:
    | "code_issued"
    | "code_redeemed"
    | "code_expired"
    | "code_revoked"
    | "foreign_access"
    | "admin_access"
    | "emergency_access"
    | "analytics_report_access"
  accessGrantId?: string | null
  reason?: string | null
  doctorName?: string | null
  medicalLicenseNo?: string | null
  hospitalName?: string | null
  district?: string | null
  location?: string | null
}

/** Append an audit entry using an existing transaction (preferred — runs under
 * the same app_user context as the operation it records). Never throws. */
export async function writeAuditTx(
  tx: DbTransaction,
  input: AuditInput
): Promise<void> {
  try {
    await tx.insert(actions).values({
      profileId: input.profileId,
      actorId: input.actorId,
      actionType: input.actionType,
      accessGrantId: input.accessGrantId ?? undefined,
      reason: input.reason ?? undefined,
      doctorName: input.doctorName ?? undefined,
      medicalLicenseNo: input.medicalLicenseNo ?? undefined,
      hospitalName: input.hospitalName ?? undefined,
      district: input.district ?? undefined,
    })
  } catch (error) {
    console.error("[audit] failed to record action", error)
  }
}

/** Append an entry to the append-only audit log on the plain connection.
 * Only for use outside of withUserCtx. Never throws. */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(actions).values({
      profileId: input.profileId,
      actorId: input.actorId,
      actionType: input.actionType,
      accessGrantId: input.accessGrantId ?? undefined,
      reason: input.reason ?? undefined,
      doctorName: input.doctorName ?? undefined,
      medicalLicenseNo: input.medicalLicenseNo ?? undefined,
      hospitalName: input.hospitalName ?? undefined,
      district: input.district ?? undefined,
    })
  } catch (error) {
    console.error("[audit] failed to record action", error)
  }
}
