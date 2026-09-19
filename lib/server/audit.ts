import { db } from "@/db"
import { actions } from "@/db/schema"

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type AuditActionType =
  | "record_created"
  | "record_viewed"
  | "record_updated"
  | "status_changed"
  | "cross_district_access"
  | "cross_branch_access"
  | "report_generated"
  | "court_case_referred"
  | "court_case_viewed"
  | "court_case_outcome_recorded"
  | "court_access_renewed"
  | "court_access_expired"
  | "policy_entered"
  | "policy_updated"
  | "payment_received"
  | "citation_voided"
  | "status_rejected"
  | "locate_reported"
  | "locate_confirmed"
  | "hold_placed"
  | "hold_released"
  | "owner_notified"
  | "review_added"
  | "insurer_flag_lookup"
  | "vehicle_registered"
  | "user_provisioned"

export type AuditInput = {
  actorId: string // who did it
  actionType: AuditActionType
  recordId?: string | null // the case concerned, if any
  vehicleId?: string | null // the vehicle concerned, if any (flag lookups)
  reason?: string | null
}

/** Append an audit entry using an existing transaction (preferred — runs under
 * the same app_user context as the operation it records). Never throws. */
export async function writeAuditTx(
  tx: DbTransaction,
  input: AuditInput
): Promise<void> {
  try {
    await tx.insert(actions).values({
      actorId: input.actorId,
      actionType: input.actionType,
      recordId: input.recordId ?? undefined,
      vehicleId: input.vehicleId ?? undefined,
      reason: input.reason ?? undefined,
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
      actorId: input.actorId,
      actionType: input.actionType,
      recordId: input.recordId ?? undefined,
      vehicleId: input.vehicleId ?? undefined,
      reason: input.reason ?? undefined,
    })
  } catch (error) {
    console.error("[audit] failed to record action", error)
  }
}
