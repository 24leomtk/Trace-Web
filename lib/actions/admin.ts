"use server"

import { and, asc, count, eq, gte, ilike, or, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  actions,
  branches,
  organizations,
  sessions,
  taxAutomationRules,
  users,
} from "@/db/schema"
import { requireUser } from "@/lib/session"
import { toDbRole, toUiRole } from "@/lib/roles"
import {
  branchSchema,
  createManagedUserSchema,
  organizationSchema,
  taxRuleSchema,
  updateManagedUserSchema,
  type BranchInput,
  type CreateManagedUserInput,
  type OrganizationInput,
  type TaxRuleInput,
  type UpdateManagedUserInput,
} from "@/validations/admin"
import { withUserCtx } from "@/lib/db-context"
import { writeAudit, writeAuditTx } from "@/lib/server/audit"

export async function requireSystemAdmin() {
  const user = await requireUser()
  if (user.role !== "SYSTEM_ADMIN") {
    throw new Error("Only system administrators can manage accounts and reference data.")
  }
  return user
}

function emptyToUndefined(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined
  return value.trim()
}

function tempEmailFor(phone: string): string {
  return `${phone}@phone.trace.mw`
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/** Postgres FK violation (23503) means live case history still points at
 * the row — surface that instead of a raw database error. */
function friendlyReferenceError(error: unknown, what: string): Error {
  const code = (error as { code?: string } | null)?.code
  if (code === "23503") {
    return new Error(
      `That ${what} is still referenced by case history and cannot be removed.`
    )
  }
  return error instanceof Error ? error : new Error("Could not delete.")
}

/** Enforce per-role scope columns (Q23: single scope per user). */
function validateScope(input: { role: string; domain?: string; branchId?: string; district?: string; organizationId?: string }) {
  const branchId = emptyToUndefined(input.branchId)
  const district = emptyToUndefined(input.district)
  const organizationId = emptyToUndefined(input.organizationId)
  switch (input.role) {
    case "OFFICER":
      if (!input.domain || !branchId) {
        throw new Error("Officers need a domain and a branch.")
      }
      if (district || organizationId) {
        throw new Error("Officers are scoped by branch only.")
      }
      break
    case "DISTRICT_MONITOR":
      if (!input.domain || !district) {
        throw new Error("District monitors need a domain and a district.")
      }
      if (branchId || organizationId) {
        throw new Error("District monitors are scoped by district only.")
      }
      break
    case "COUNTRY_MONITOR":
      if (!input.domain) throw new Error("Country monitors need a domain.")
      if (branchId || district || organizationId) {
        throw new Error("Country monitors are nationwide — no branch/district/org.")
      }
      break
    case "SYSTEM_ADMIN":
    case "COMPLIANCE_AUDITOR":
      if (input.domain || branchId || district || organizationId) {
        throw new Error("Platform roles carry no branch/district/org scope.")
      }
      break
    case "COURT_LIAISON":
    case "INSURANCE_PORTAL_USER":
    case "VEHICLE_REGISTRAR":
    case "TAX_OFFICER":
    case "TAX_COMPLIANCE_OFFICER":
      if (!organizationId) {
        throw new Error("External users must belong to an organization.")
      }
      if (input.domain || branchId || district) {
        throw new Error("External users are scoped by organization only.")
      }
      break
    default:
      throw new Error("Unknown role.")
  }
}

// ---------------------------------------------------------------------------
// Users (provisioned by system_admin — no self-registration)
// ---------------------------------------------------------------------------

export interface ManagedUserRow {
  id: string
  name: string
  phone: string
  role: string
  badgeNumber: string | null
  domain: string | null
  branchId: string | null
  branchName: string | null
  district: string | null
  organizationId: string | null
  organizationName: string | null
  isActive: boolean
  createdAt: string
}

export async function listManagedUsers(
  params: { query?: string; role?: string; page?: number; pageSize?: number } = {}
): Promise<{ users: ManagedUserRow[]; total: number }> {
  await requireSystemAdmin()
  const { query = "", role = "all", page = 0, pageSize = 15 } = params

  const conditions = []
  if (role && role !== "all") {
    conditions.push(eq(users.role, toDbRole(role as never)))
  }
  const q = query.trim()
  if (q) {
    conditions.push(
      or(ilike(users.name, `%${q}%`), ilike(users.phoneNumber, `%${q}%`))
    )
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phoneNumber,
      role: users.role,
      badgeNumber: users.badgeNumber,
      domain: users.domain,
      branchId: users.branchId,
      branchName: branches.name,
      district: users.district,
      organizationId: users.organizationId,
      organizationName: organizations.name,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(branches, eq(users.branchId, branches.id))
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(users.name))
    .limit(pageSize)
    .offset(page * pageSize)

  return {
    users: rows.map((row) => ({
      ...row,
      phone: row.phone ?? "",
      role: toUiRole(row.role),
      createdAt: row.createdAt.toISOString(),
    })),
    total: rows.length,
  }
}

export async function createManagedUser(
  input: CreateManagedUserInput
): Promise<{ id: string }> {
  const admin = await requireSystemAdmin()
  const parsed = createManagedUserSchema.safeParse(input)
  if (!parsed.success) throw new Error("The user details didn't pass validation.")
  const data = parsed.data
  validateScope({
    role: data.role,
    domain: data.domain,
    branchId: data.branchId,
    district: data.district,
    organizationId: data.organizationId,
  })

  // Verify referenced branch / organization exist and match the domain/type.
  if (data.branchId) {
    const [branch] = await db
      .select()
      .from(branches)
      .where(eq(branches.id, data.branchId))
      .limit(1)
    if (!branch) throw new Error("Branch not found.")
    if (data.domain && branch.domain !== data.domain) {
      throw new Error("The branch belongs to a different domain.")
    }
  }
  if (data.organizationId) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, data.organizationId))
      .limit(1)
    if (!org) throw new Error("Organization not found.")
  }

  const id = newId("user")
  await withUserCtx(admin.id, async (tx) => {
    await tx.insert(users).values({
      id,
      name: data.name.trim(),
      email: tempEmailFor(data.phoneNumber),
      phoneNumber: data.phoneNumber,
      badgeNumber: emptyToUndefined(data.badgeNumber),
      role: toDbRole(data.role),
      domain: (data.domain ?? undefined) as "regular" | "traffic" | undefined,
      branchId: emptyToUndefined(data.branchId),
      district: (emptyToUndefined(data.district) ?? undefined) as never,
      organizationId: emptyToUndefined(data.organizationId),
      isActive: true,
    })
    await writeAuditTx(tx, {
      actorId: admin.id,
      actionType: "user_provisioned",
      reason: `Provisioned ${data.name} as ${data.role}.`,
    })
  })
  return { id }
}

export async function updateManagedUser(
  input: UpdateManagedUserInput
): Promise<void> {
  const admin = await requireSystemAdmin()
  const parsed = updateManagedUserSchema.safeParse(input)
  if (!parsed.success) throw new Error("The user details didn't pass validation.")
  const { id, ...data } = parsed.data
  if (data.role) {
    validateScope({
      role: data.role,
      domain: data.domain,
      branchId: data.branchId,
      district: data.district,
      organizationId: data.organizationId,
    })
  }
  await withUserCtx(admin.id, async (tx) => {
    await tx
      .update(users)
      .set({
        name: data.name?.trim(),
        phoneNumber: data.phoneNumber,
        badgeNumber: data.badgeNumber !== undefined ? emptyToUndefined(data.badgeNumber) : undefined,
        role: data.role ? toDbRole(data.role) : undefined,
        domain: (data.domain ?? undefined) as "regular" | "traffic" | undefined,
        branchId: data.branchId !== undefined ? emptyToUndefined(data.branchId) : undefined,
        district: (data.district !== undefined ? emptyToUndefined(data.district) : undefined) as never,
        organizationId:
          data.organizationId !== undefined
            ? emptyToUndefined(data.organizationId)
            : undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
    await writeAuditTx(tx, {
      actorId: admin.id,
      actionType: "user_provisioned",
      reason: `Updated account ${id}.`,
    })
  })
}

/** Deactivation revokes access immediately; cases and audit rows are kept. */
export async function setUserActive(id: string, isActive: boolean): Promise<void> {
  const admin = await requireSystemAdmin()
  await withUserCtx(admin.id, async (tx) => {
    await tx.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, id))
    if (!isActive) {
      // Force logout everywhere by dropping sessions.
      const { sessions } = await import("@/db/schema")
      await tx.delete(sessions).where(eq(sessions.userId, id))
    }
    await writeAuditTx(tx, {
      actorId: admin.id,
      actionType: "user_provisioned",
      reason: isActive ? `Reactivated account ${id}.` : `Deactivated account ${id}.`,
    })
  })
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export async function listBranches(domain?: string) {
  await requireSystemAdmin()
  const rows = await db
    .select()
    .from(branches)
    .where(
      domain === "regular" || domain === "traffic"
        ? eq(branches.domain, domain as "regular" | "traffic")
        : undefined
    )
    .orderBy(asc(branches.district), asc(branches.name))
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }))
}

export interface BranchSearchRow {
  id: string
  name: string
  domain: string
  district: string
}

/**
 * Paginated branch search for entity pickers (provisioning, reassignment).
 * Separate from listBranches so existing full-list callers are untouched.
 */
export async function searchBranches(
  params: { domain?: string; query?: string; page?: number; pageSize?: number } = {}
): Promise<{ items: BranchSearchRow[]; hasMore: boolean }> {
  await requireSystemAdmin()
  const { domain, query = "", page = 0, pageSize = 8 } = params
  const conditions = []
  if (domain === "regular" || domain === "traffic") {
    conditions.push(eq(branches.domain, domain as "regular" | "traffic"))
  }
  const q = query.trim()
  if (q) {
    conditions.push(
      or(ilike(branches.name, `%${q}%`), ilike(branches.location, `%${q}%`))
    )
  }
  const rows = await db
    .select({
      id: branches.id,
      name: branches.name,
      domain: branches.domain,
      district: branches.district,
    })
    .from(branches)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(branches.district), asc(branches.name))
    .limit(pageSize + 1)
    .offset(page * pageSize)
  return {
    items: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
  }
}

export async function upsertBranch(input: BranchInput): Promise<{ id: string }> {
  await requireSystemAdmin()
  const parsed = branchSchema.safeParse(input)
  if (!parsed.success) throw new Error("The branch details didn't pass validation.")
  const data = parsed.data
  if (data.id) {
    await db
      .update(branches)
      .set({
        name: data.name.trim(),
        domain: data.domain,
        district: data.district as never,
        location: emptyToUndefined(data.location),
        contactPhone: emptyToUndefined(data.contactPhone),
      })
      .where(eq(branches.id, data.id))
    return { id: data.id }
  }
  const [created] = await db
    .insert(branches)
    .values({
      name: data.name.trim(),
      domain: data.domain,
      district: data.district as never,
      location: emptyToUndefined(data.location),
      contactPhone: emptyToUndefined(data.contactPhone),
    })
    .returning({ id: branches.id })
  return { id: created.id }
}

export async function deleteBranch(id: string): Promise<void> {
  await requireSystemAdmin()
  try {
    await db.delete(branches).where(eq(branches.id, id))
  } catch (error) {
    throw friendlyReferenceError(error, "branch")
  }
}

// ---------------------------------------------------------------------------
// Organizations (courts, insurers, vehicle registry)
// ---------------------------------------------------------------------------

export async function listOrganizations(orgType?: string) {
  await requireSystemAdmin()
  const rows = await db
    .select()
    .from(organizations)
    .where(
      orgType === "court" || orgType === "insurer" || orgType === "vehicle_registry"
        ? eq(organizations.orgType, orgType as "court" | "insurer" | "vehicle_registry")
        : undefined
    )
    .orderBy(asc(organizations.name))
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }))
}

export interface OrganizationSearchRow {
  id: string
  name: string
  orgType: string
}

/**
 * Paginated organization search for entity pickers (provisioning).
 * Separate from listOrganizations so existing full-list callers are untouched.
 */
export async function searchOrganizations(
  params: { query?: string; page?: number; pageSize?: number } = {}
): Promise<{ items: OrganizationSearchRow[]; hasMore: boolean }> {
  await requireSystemAdmin()
  const { query = "", page = 0, pageSize = 8 } = params
  const q = query.trim()
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(q ? ilike(organizations.name, `%${q}%`) : undefined)
    .orderBy(asc(organizations.name))
    .limit(pageSize + 1)
    .offset(page * pageSize)
  return {
    items: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
  }
}

export async function upsertOrganization(
  input: OrganizationInput
): Promise<{ id: string }> {
  await requireSystemAdmin()
  const parsed = organizationSchema.safeParse(input)
  if (!parsed.success) throw new Error("The organization details didn't pass validation.")
  const data = parsed.data
  if (data.id) {
    await db
      .update(organizations)
      .set({
        name: data.name.trim(),
        orgType: data.orgType,
        district: (emptyToUndefined(data.district) ?? null) as never,
        contactPhone: emptyToUndefined(data.contactPhone),
        contactEmail: emptyToUndefined(data.contactEmail),
      })
      .where(eq(organizations.id, data.id))
    return { id: data.id }
  }
  const [created] = await db
    .insert(organizations)
    .values({
      name: data.name.trim(),
      orgType: data.orgType,
      district: (emptyToUndefined(data.district) ?? null) as never,
      contactPhone: emptyToUndefined(data.contactPhone),
      contactEmail: emptyToUndefined(data.contactEmail),
    })
    .returning({ id: organizations.id })
  return { id: created.id }
}

export async function deleteOrganization(id: string): Promise<void> {
  await requireSystemAdmin()
  try {
    await db.delete(organizations).where(eq(organizations.id, id))
  } catch (error) {
    throw friendlyReferenceError(error, "organization")
  }
}

// ---------------------------------------------------------------------------
// Branch/org pickers for non-admin flows (filing, provisioning forms)
// ---------------------------------------------------------------------------

export async function branchOptions(domain: "regular" | "traffic") {
  const user = await requireUser()
  if (user.role !== "SYSTEM_ADMIN" && user.role !== "DISTRICT_MONITOR" && user.role !== "COUNTRY_MONITOR" && user.role !== "OFFICER") {
    throw new Error("Not allowed.")
  }
  const conditions = [eq(branches.domain, domain)]
  if (user.role === "DISTRICT_MONITOR" && user.district) {
    conditions.push(eq(branches.district, user.district as never))
  }
  const rows = await db
    .select({ id: branches.id, name: branches.name, district: branches.district })
    .from(branches)
    .where(and(...conditions))
    .orderBy(asc(branches.name))
    .limit(200)
  return rows
}

export async function deactivateUser(id: string): Promise<void> {
  await setUserActive(id, false)
}

export async function reactivateUser(id: string): Promise<void> {
  await setUserActive(id, true)
}

export async function getUserDetail(id: string): Promise<ManagedUserRow | null> {
  await requireSystemAdmin()
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phoneNumber,
      role: users.role,
      badgeNumber: users.badgeNumber,
      domain: users.domain,
      branchId: users.branchId,
      branchName: branches.name,
      district: users.district,
      organizationId: users.organizationId,
      organizationName: organizations.name,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(branches, eq(users.branchId, branches.id))
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.id, id))
    .limit(1)
  if (!row) return null
  return {
    ...row,
    phone: row.phone ?? "",
    role: toUiRole(row.role),
    createdAt: row.createdAt.toISOString(),
  }
}

export interface AccessReviewRow {
  id: string
  name: string
  role: string
  scope: string
  isActive: boolean
  lastActiveAt: string | null
  dormant: boolean
  rejectedTransitions: number
}

export interface AccessReview {
  generatedAt: string
  users: AccessReviewRow[]
  dormantCount: number
  rejectedTotal: number
}

/**
 * Phase 6: periodic access recertification (Mark43 Scottsdale lesson).
 * Every account with last activity, plus friction signals: dormant active
 * accounts (>90 days) and blocked status transitions (status_rejected)
 * in the last 30 days. System admins only; no case data.
 */
export async function getAccessReview(): Promise<AccessReview> {
  await requireSystemAdmin()
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      domain: users.domain,
      branchName: branches.name,
      district: users.district,
      organizationName: organizations.name,
      isActive: users.isActive,
    })
    .from(users)
    .leftJoin(branches, eq(users.branchId, branches.id))
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .orderBy(asc(users.name))
    .limit(500)

  const sessionRows = await db
    .select({
      userId: sessions.userId,
      lastActive: sql<string>`max(${sessions.updatedAt})::text`,
    })
    .from(sessions)
    .groupBy(sessions.userId)
  const lastActiveByUser = new Map(
    sessionRows.map((row) => [row.userId, row.lastActive])
  )

  const rejectedRows = await db
    .select({
      actorId: actions.actorId,
      total: count(),
    })
    .from(actions)
    .where(
      and(
        eq(actions.actionType, "status_rejected" as never),
        gte(actions.createdAt, sql`now() - interval '30 days'`)
      )
    )
    .groupBy(actions.actorId)
  const rejectedByUser = new Map(
    rejectedRows.map((row) => [row.actorId, row.total])
  )

  const now = Date.now()
  const NINETY_DAYS = 90 * 86_400_000
  const usersOut: AccessReviewRow[] = rows.map((row) => {
    const lastActive = lastActiveByUser.get(row.id) ?? null
    const lastActiveMs = lastActive ? new Date(lastActive).getTime() : null
    const dormant =
      row.isActive &&
      (lastActiveMs == null || Number.isNaN(lastActiveMs) || now - lastActiveMs > NINETY_DAYS)
    const scope =
      row.branchName ??
      (row.district ? row.district.replace(/_/g, " ") : null) ??
      row.organizationName ??
      (row.domain ? `${row.domain} · national` : null) ??
      "platform"
    return {
      id: row.id,
      name: row.name,
      role: toUiRole(row.role),
      scope,
      isActive: row.isActive,
      lastActiveAt: lastActiveMs ? new Date(lastActiveMs).toISOString() : null,
      dormant,
      rejectedTransitions: rejectedByUser.get(row.id) ?? 0,
    }
  })
  return {
    generatedAt: new Date().toISOString(),
    users: usersOut,
    dormantCount: usersOut.filter((u) => u.dormant).length,
    rejectedTotal: [...rejectedByUser.values()].reduce((a, b) => a + b, 0),
  }
}

// ---------------------------------------------------------------------------
// Tax automation rules — REFERENCE DATA (system_admin only). Amounts, bands
// and toggles are management-set policy; the junior tax_officer role never
// sees this surface. Every change is audited.
// ---------------------------------------------------------------------------

export interface TaxRuleRow {
  id: string
  ownerOrgId: string
  ownerOrgName: string | null
  taxType: string
  period: string
  isEnabled: boolean
  amount: string | null
  engineBands: Record<string, number> | null
  dueDayOffset: number
  updatedAt: string
}

export async function listTaxRules(): Promise<TaxRuleRow[]> {
  await requireSystemAdmin()
  const rows = await db
    .select({
      id: taxAutomationRules.id,
      ownerOrgId: taxAutomationRules.ownerOrgId,
      ownerOrgName: organizations.name,
      taxType: taxAutomationRules.taxType,
      period: taxAutomationRules.period,
      isEnabled: taxAutomationRules.isEnabled,
      amount: taxAutomationRules.amount,
      engineBands: taxAutomationRules.engineBands,
      dueDayOffset: taxAutomationRules.dueDayOffset,
      updatedAt: taxAutomationRules.updatedAt,
    })
    .from(taxAutomationRules)
    .leftJoin(organizations, eq(taxAutomationRules.ownerOrgId, organizations.id))
    .orderBy(asc(taxAutomationRules.taxType), asc(taxAutomationRules.period))
    .limit(100)
  return rows.map((row) => ({
    ...row,
    engineBands: (row.engineBands ?? null) as Record<string, number> | null,
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function upsertTaxRule(input: TaxRuleInput): Promise<{ id: string }> {
  const admin = await requireSystemAdmin()
  const parsed = taxRuleSchema.safeParse(input)
  if (!parsed.success) throw new Error("The rule didn't pass validation.")
  const data = parsed.data

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, data.ownerOrgId))
    .limit(1)
  if (!org) throw new Error("Revenue organization not found.")

  const [existing] = await db
    .select({ id: taxAutomationRules.id })
    .from(taxAutomationRules)
    .where(
      and(
        eq(taxAutomationRules.ownerOrgId, data.ownerOrgId),
        eq(taxAutomationRules.taxType, data.taxType),
        eq(taxAutomationRules.period, data.period)
      )
    )
    .limit(1)
  const values = {
    ownerOrgId: data.ownerOrgId,
    taxType: data.taxType,
    period: data.period,
    isEnabled: data.isEnabled,
    amount: data.amount == null ? null : String(data.amount),
    engineBands: (data.engineBands ?? null) as Record<string, number> | null,
    dueDayOffset: data.dueDayOffset,
    updatedBy: admin.id,
    updatedAt: new Date(),
  }
  let id: string
  if (existing) {
    await db
      .update(taxAutomationRules)
      .set(values)
      .where(eq(taxAutomationRules.id, existing.id))
    id = existing.id
  } else {
    const [created] = await db
      .insert(taxAutomationRules)
      .values(values)
      .returning({ id: taxAutomationRules.id })
    id = created.id
  }
  await writeAudit({
    actorId: admin.id,
    actionType: "tax_rule_updated",
    reason: `rule ${data.taxType}/${data.period} ${data.isEnabled ? "enabled" : "disabled"}.`,
  })
  return { id }
}
