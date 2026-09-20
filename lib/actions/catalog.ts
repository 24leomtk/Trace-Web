"use server"

import { asc, eq } from "drizzle-orm"

import { branches } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { RECORD_TYPE_META, RECORD_TYPE_ORDER } from "@/lib/record-meta"
import type { Domain } from "@/lib/types"
import type { RecordType } from "@/validations/record"
import { requireUser } from "@/lib/session"

export interface RecordTypeOption {
  value: RecordType
  label: string
  shortLabel: string
  domain: Domain
}

/** The 10 TRACE case types, grouped by domain — drives the filing UI. */
export async function listRecordTypeOptions(
  domain?: Domain
): Promise<RecordTypeOption[]> {
  const types = domain
    ? RECORD_TYPE_ORDER.filter((type) => RECORD_TYPE_META[type].domain === domain)
    : RECORD_TYPE_ORDER
  return types.map((type) => ({
    value: type,
    label: RECORD_TYPE_META[type].label,
    shortLabel: RECORD_TYPE_META[type].shortLabel,
    domain: RECORD_TYPE_META[type].domain,
  }))
}

export interface BranchOption {
  id: string
  name: string
  district: string
}

export async function listBranchOptions(domain: Domain): Promise<BranchOption[]> {
  // Runs as app_user so the branches_read RLS policy scopes rows to the
  // viewer (district monitors see only their own district) — the filing
  // branch picker can never offer branches the user can't file under.
  const user = await requireUser()
  return withUserCtx(user.id, async (tx) =>
    tx
      .select({ id: branches.id, name: branches.name, district: branches.district })
      .from(branches)
      .where(eq(branches.domain, domain))
      .orderBy(asc(branches.name))
      .limit(200)
  )
}
