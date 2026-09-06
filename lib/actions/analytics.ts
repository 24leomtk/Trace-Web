"use server"

import { and, count, eq, sql } from "drizzle-orm"

import { accidents, records, trafficCitations } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { formatDistrict } from "@/lib/roles"
import { writeAuditTx } from "@/lib/server/audit"
import type { AnalyticsEntry, Domain } from "@/lib/types"
import { getViewerScope } from "@/lib/actions/records"

interface Scope {
  userId: string
  domain: Domain
  /** Raw district enum for district monitors, null for country monitors. */
  district: string | null
}

async function resolveScope(): Promise<Scope> {
  const scope = await getViewerScope()
  if (scope.role !== "DISTRICT_MONITOR" && scope.role !== "COUNTRY_MONITOR") {
    throw new Error("Reports are for monitors.")
  }
  if (!scope.domain) throw new Error("Your account has no domain.")
  return {
    userId: scope.id,
    domain: scope.domain,
    district: scope.role === "DISTRICT_MONITOR" ? scope.district : null,
  }
}

function scopeLabel(scope: Scope): string {
  const domain = scope.domain === "regular" ? "Regular" : "Traffic"
  if (!scope.district) return `${domain} · national · all districts`
  return `${domain} · ${formatDistrict(scope.district)} district`
}

function scopedConditions(scope: Scope, table: typeof records) {
  const conditions = [eq(table.domain, scope.domain)]
  if (scope.district) conditions.push(eq(table.district, scope.district as never))
  return conditions
}

/** v1 catalog (Q28: E) — volumes, resolution rates, accident trends, citations. */
export async function getAnalyticsFeed(): Promise<AnalyticsEntry[]> {
  const scope = await resolveScope()
  return withUserCtx(scope.userId, async (tx) => {
    const entries: AnalyticsEntry[] = []
    const base = scopedConditions(scope, records)
    const today = new Date().toISOString().slice(0, 10)

    // 1. Case volumes by type.
    const volumes = await tx
      .select({
        recordType: records.recordType,
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${records.status} = 'active')::int`,
      })
      .from(records)
      .where(and(...base))
      .groupBy(records.recordType)
    const totalCases = volumes.reduce((sum, row) => sum + row.total, 0)
    entries.push({
      id: "volumes",
      date: today,
      scopeLabel: scopeLabel(scope),
      title: "Case volumes by type",
      description: `${totalCases} cases on file in scope.`,
      metrics: volumes.slice(0, 4).map((row) => ({
        label: row.recordType.replace(/_/g, " "),
        value: String(row.total),
      })),
      breakdown: volumes.map((row) => ({
        label: row.recordType.replace(/_/g, " "),
        count: row.total,
        share: totalCases > 0 ? row.total / totalCases : 0,
      })),
      severity: "info",
    })

    // 2. Resolution rate.
    const [resolution] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        resolved: sql<number>`count(*) filter (where ${records.status} in ('resolved','closed'))::int`,
      })
      .from(records)
      .where(and(...base))
    const rate =
      resolution.total > 0 ? Math.round((resolution.resolved / resolution.total) * 100) : 0
    entries.push({
      id: "resolution",
      date: today,
      scopeLabel: scopeLabel(scope),
      title: "Resolution rate",
      description: `${resolution.resolved} of ${resolution.total} cases resolved or closed.`,
      metrics: [{ label: "Resolved", value: `${rate}%` }],
      severity: rate < 30 ? "warning" : "info",
    })

    // 3. Accident trends (traffic domain): fatalities + injuries, last 30 days.
    if (scope.domain === "traffic") {
      const accidentRows = await tx
        .select({
          fatalities: accidents.fatalities,
          injuries: accidents.injuries,
        })
        .from(accidents)
        .innerJoin(records, eq(accidents.recordId, records.id))
        .where(
          and(
            ...scopedConditions(scope, records),
            sql`${accidents.accidentDate} >= current_date - 30`
          )
        )
      const fatalities = accidentRows.reduce((sum, row) => sum + (row.fatalities ?? 0), 0)
      const injuries = accidentRows.reduce((sum, row) => sum + (row.injuries ?? 0), 0)
      entries.push({
        id: "accidents",
        date: today,
        scopeLabel: scopeLabel(scope),
        title: "Road accidents — last 30 days",
        description: `${accidentRows.length} accidents recorded.`,
        metrics: [
          { label: "Fatalities", value: String(fatalities) },
          { label: "Injuries", value: String(injuries) },
        ],
        severity: fatalities > 0 ? "critical" : injuries > 5 ? "warning" : "info",
      })

      // 4. Citations: totals + collection.
      const citationRows = await tx
        .select({
          isPaid: trafficCitations.isPaid,
          fine: trafficCitations.fineAmount,
        })
        .from(trafficCitations)
        .innerJoin(records, eq(trafficCitations.recordId, records.id))
        .where(and(...scopedConditions(scope, records)))
      const paid = citationRows.filter((row) => row.isPaid).length
      entries.push({
        id: "citations",
        date: today,
        scopeLabel: scopeLabel(scope),
        title: "Traffic citations",
        description: `${citationRows.length} citations issued, ${paid} paid.`,
        metrics: [
          { label: "Issued", value: String(citationRows.length) },
          { label: "Paid", value: String(paid) },
        ],
        severity: "info",
      })
    }

    // 5. District breakdown (country monitors: where is the load?).
    if (!scope.district) {
      const byDistrict = await tx
        .select({
          district: records.district,
          total: count(),
        })
        .from(records)
        .where(eq(records.domain, scope.domain))
        .groupBy(records.district)
        .orderBy(sql`count(*) desc`)
        .limit(8)
      const districtTotal = byDistrict.reduce((sum, row) => sum + row.total, 0)
      entries.push({
        id: "districts",
        date: today,
        scopeLabel: scopeLabel(scope),
        title: "Caseload by district",
        description: "Top districts by open + closed volume.",
        metrics: byDistrict.slice(0, 3).map((row) => ({
          label: formatDistrict(row.district),
          value: String(row.total),
        })),
        breakdown: byDistrict.map((row) => ({
          label: formatDistrict(row.district),
          count: row.total,
          share: districtTotal > 0 ? row.total / districtTotal : 0,
        })),
        severity: "info",
      })
    }

    await writeAuditTx(tx, {
      actorId: scope.userId,
      actionType: "report_generated",
      reason: `Pulled ${scope.domain} analytics feed (${scope.district ?? "national"}).`,
    })
    return entries
  })
}
