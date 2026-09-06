"use server"

import { and, eq, gte, sql } from "drizzle-orm"

import {
  diagnoses,
  diagnosisCodes,
  hospitals,
  immunizations,
  prescriptions,
} from "@/db/schema"
import { withUserCtx, type DbTransaction } from "@/lib/db-context"
import { requireUser } from "@/lib/session"
import type { AnalyticsEntry, DiseaseStat, Role } from "@/lib/types"

const WEEKS = 8

type ThreatLevel = "none" | "moderate" | "high" | "critical"

interface Scope {
  userId: string
  role: Role
  /** Raw PG enum district for district-scoped admins, null for national. */
  district: string | null
}

async function resolveScope(): Promise<Scope> {
  const user = await requireUser()
  let district: string | null = null
  if (user.role === "DISTRICT_ADMIN") {
    // user.district is display-formatted; read the raw enum back for queries.
    district = (user.district ?? "").toLowerCase().replace(/ /g, "_") || null
  }
  return { userId: user.id, role: user.role, district }
}

function scopeLabel(scope: Scope): string {
  if (!scope.district) return "National · all districts"
  const label = scope.district.replace(/_/g, " ")
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} district`
}

// Integer window constants are inlined (sql.raw) because Postgres cannot
// infer a type for `current_date - $1` from an untyped bind parameter.
function weeksAgoSql(weeks: number) {
  return sql.raw(`current_date - ${weeks * 7}`)
}

function weekBucketSql() {
  return sql.raw(`least(floor((current_date - "diagnoses"."diagnosed_at") / 7), ${WEEKS - 1})`)
}

/** Weekly case rows per ICD-10 code inside the trailing window,
 * already scoped to the viewer's jurisdiction. */
async function infectiousCaseRows(
  tx: DbTransaction,
  scope: Scope
): Promise<
  Array<{ icd10Code: string; name: string; threatLevel: ThreatLevel; weeksAgo: number; count: number }>
> {
  const conditions = [
    eq(diagnosisCodes.isInfectious, true),
    gte(diagnoses.diagnosedAt, weeksAgoSql(WEEKS - 1)),
  ]
  if (scope.district) {
    conditions.push(eq(diagnoses.district, scope.district as never))
  }

  const bucket = weekBucketSql()
  const rows = await tx
    .select({
      icd10Code: diagnoses.icd10Code,
      name: diagnosisCodes.name,
      threatLevel: diagnosisCodes.threatLevel,
      weeksAgo: sql<number>`${bucket}::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(diagnoses)
    .innerJoin(diagnosisCodes, eq(diagnoses.icd10Code, diagnosisCodes.icd10Code))
    .where(and(...conditions))
    .groupBy(
      diagnoses.icd10Code,
      diagnosisCodes.name,
      diagnosisCodes.threatLevel,
      bucket
    )

  return rows.map((row) => ({
    icd10Code: row.icd10Code,
    name: row.name,
    threatLevel: (row.threatLevel ?? "none") as ThreatLevel,
    weeksAgo: row.weeksAgo,
    count: row.count,
  }))
}

async function hotspotRows(
  tx: DbTransaction,
  scope: Scope,
  icd10Code: string
): Promise<Array<{ label: string; cases: number }>> {
  const conditions = [
    eq(diagnoses.icd10Code, icd10Code),
    gte(diagnoses.diagnosedAt, weeksAgoSql(WEEKS - 1)),
  ]
  if (scope.district) {
    conditions.push(eq(diagnoses.district, scope.district as never))
  }

  if (scope.role === "DISTRICT_ADMIN") {
    // Hospital-level detail inside the district.
    const rows = await tx
      .select({
        label: sql<string>`coalesce(${hospitals.name}, 'Other facilities')`,
        cases: sql<number>`count(*)::int`,
      })
      .from(diagnoses)
      .leftJoin(hospitals, eq(diagnoses.hospitalId, hospitals.id))
      .where(and(...conditions))
      .groupBy(sql`coalesce(${hospitals.name}, 'Other facilities')`)
      .orderBy(sql`count(*) desc`)
    return rows.map((row) => ({ label: row.label, cases: row.cases }))
  }

  // district is a PG enum — cast to text before coalescing with a string.
  const labelExpr = sql<string>`coalesce(${diagnoses.district}::text, 'unknown')`
  const rows = await tx
    .select({
      label: labelExpr,
      cases: sql<number>`count(*)::int`,
    })
    .from(diagnoses)
    .where(and(...conditions))
    .groupBy(labelExpr)
    .orderBy(sql`count(*) desc`)
  return rows.map((row) => ({
    label: row.label.replace(/_/g, " "),
    cases: row.cases,
  }))
}

function buildStat(
  icd10Code: string,
  name: string,
  threatLevel: ThreatLevel,
  weeklyCounts: number[],
  hotspots: Array<{ label: string; cases: number }>
): DiseaseStat {
  const totalCases = weeklyCounts.reduce((sum, count) => sum + count, 0)
  const thisWeek = weeklyCounts[0] ?? 0
  const prevWeek = weeklyCounts[1] ?? 0
  const deltaPct =
    prevWeek === 0 ? (thisWeek > 0 ? 100 : 0) : Math.round(((thisWeek - prevWeek) / prevWeek) * 100)

  const threshold = 5
  const status =
    (threatLevel === "critical" && thisWeek >= threshold) ||
    (thisWeek >= threshold && deltaPct >= 50)
      ? "outbreak"
      : (threatLevel === "critical" || threatLevel === "high") && thisWeek > 0
        ? "watch"
        : "stable"

  // k-anonymity: suppress groups smaller than 5.
  const visibleHotspots = hotspots.filter((hotspot) => hotspot.cases >= threshold)
  const hotTotal = visibleHotspots.reduce((sum, hotspot) => sum + hotspot.cases, 0)

  return {
    id: icd10Code,
    name,
    totalCases,
    weeklyCounts,
    deltaPct,
    status,
    hotspots: visibleHotspots.map((hotspot) => ({
      label: hotspot.label,
      cases: hotspot.cases,
      share: hotTotal > 0 ? Math.round((hotspot.cases / hotTotal) * 100) : 0,
    })),
  }
}

export async function getDiseaseStats(): Promise<DiseaseStat[]> {
  const scope = await resolveScope()
  if (scope.role !== "DISTRICT_ADMIN" && scope.role !== "NATIONAL_ADMIN") {
    throw new Error("Analytics are only available to administrators.")
  }

  // RLS (`app_can_read_patient`) permits country admins nationwide and
  // district admins within their district, so aggregates only ever see
  // permitted rows.
  return withUserCtx(scope.userId, async (tx) => {
    const rows = await infectiousCaseRows(tx, scope)
    const grouped = new Map<
      string,
      { name: string; threatLevel: ThreatLevel; weeks: number[] }
    >()

    for (const row of rows) {
      let entry = grouped.get(row.icd10Code)
      if (!entry) {
        entry = { name: row.name, threatLevel: row.threatLevel ?? "none", weeks: new Array(WEEKS).fill(0) }
        grouped.set(row.icd10Code, entry)
      }
      entry.weeks[row.weeksAgo] += row.count
    }

    const stats: DiseaseStat[] = []
    for (const [icd10Code, entry] of grouped.entries()) {
      stats.push(
        buildStat(
          icd10Code,
          entry.name,
          entry.threatLevel,
          entry.weeks,
          await hotspotRows(tx, scope, icd10Code)
        )
      )
    }

    const order = { outbreak: 0, watch: 1, stable: 2 } as const
    return stats.sort(
      (a, b) => order[a.status] - order[b.status] || b.weeklyCounts[0] - a.weeklyCounts[0]
    )
  })
}

export interface DiseaseOption {
  id: string
  name: string
  status: string
}

export async function listDiseaseOptions(): Promise<DiseaseOption[]> {
  const stats = await getDiseaseStats()
  return stats.map(({ id, name, status }) => ({ id, name, status }))
}

// ---------------------------------------------------------------------------
// Aggregate feed
// ---------------------------------------------------------------------------

export async function getAnalyticsFeed(): Promise<AnalyticsEntry[]> {
  const scope = await resolveScope()
  if (scope.role !== "DISTRICT_ADMIN" && scope.role !== "NATIONAL_ADMIN") {
    throw new Error("Analytics are only available to administrators.")
  }

  const today = new Date().toISOString().slice(0, 10)
  const entries: AnalyticsEntry[] = []
  const label = scopeLabel(scope)

  const stats = await getDiseaseStats()

  const thisWeekTotal = stats.reduce((sum, stat) => sum + stat.weeklyCounts[0], 0)
  const prevWeekTotal = stats.reduce((sum, stat) => sum + stat.weeklyCounts[1], 0)
  const feedDelta =
    prevWeekTotal === 0
      ? thisWeekTotal > 0
        ? 100
        : 0
      : Math.round(((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100)

  const [prescriptionRow, immunizationRow] = await withUserCtx(
    scope.userId,
    async (tx) => {
      const [rx] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(prescriptions)
        .where(
          and(
            gte(prescriptions.prescribedAt, weeksAgoSql(1)),
            scope.district
              ? eq(prescriptions.district, scope.district as never)
              : undefined
          )
        )
      const [im] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(immunizations)
        .where(
          and(
            gte(immunizations.administeredAt, weeksAgoSql(1)),
            scope.district
              ? eq(immunizations.district, scope.district as never)
              : undefined
          )
        )
      return [rx, im] as const
    }
  )

  const outbreaks = stats.filter((stat) => stat.status === "outbreak")
  const watching = stats.filter((stat) => stat.status === "watch")

  entries.push({
    id: "weekly-digest",
    date: today,
    scopeLabel: label,
    title: "Weekly surveillance digest",
    description: `Infectious-disease notifications recorded across your jurisdiction in the last seven days, compared with the week before.`,
    severity: outbreaks.length > 0 ? "critical" : watching.length > 0 ? "warning" : "info",
    metrics: [
      { label: "Infections this week", value: String(thisWeekTotal), deltaPct: feedDelta },
      {
        label: "Active outbreaks",
        value: String(outbreaks.length),
      },
      {
        label: "New prescriptions",
        value: String(prescriptionRow?.count ?? 0),
      },
      {
        label: "Doses administered",
        value: String(immunizationRow?.count ?? 0),
      },
    ],
  })

  const notable = [...outbreaks, ...watching].slice(0, 3)
  for (const stat of notable) {
    entries.push({
      id: `disease-${stat.id}`,
      date: today,
      scopeLabel: label,
      title: `${stat.name}: ${stat.status === "outbreak" ? "cluster detected" : "continued transmission"}`,
      description:
        stat.status === "outbreak"
          ? `Case counts meet the outbreak threshold this week (${stat.weeklyCounts[0]} new notifications, ${stat.deltaPct >= 0 ? "+" : ""}${stat.deltaPct}% vs prior week). Rapid response actions apply.`
          : `${stat.weeklyCounts[0]} new notification${stat.weeklyCounts[0] === 1 ? "" : "s"} this week (${stat.deltaPct >= 0 ? "+" : ""}${stat.deltaPct}% vs prior week). Monitoring continues.`,
      severity: stat.status === "outbreak" ? "critical" : "warning",
      metrics: [
        { label: "Cases this week", value: String(stat.weeklyCounts[0]), deltaPct: stat.deltaPct },
        { label: `Total · ${WEEKS} weeks`, value: String(stat.totalCases) },
      ],
      breakdown: stat.hotspots.slice(0, 4).map((hotspot) => ({
        label: hotspot.label,
        count: hotspot.cases,
        share: hotspot.share,
      })),
    })
  }

  if (entries.length === 1 && thisWeekTotal === 0) {
    entries.push({
      id: "all-clear",
      date: today,
      scopeLabel: label,
      title: "No notifiable activity",
      description:
        "Zero infectious-disease notifications were recorded in your jurisdiction this week.",
      severity: "info",
      metrics: [{ label: "Infections this week", value: "0", deltaPct: 0 }],
    })
  }

  return entries
}
