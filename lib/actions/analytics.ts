"use server"

import { and, count, eq, sql } from "drizzle-orm"

import { accidents, citationPayments, courtCaseAccess, records, trafficCitations } from "@/db/schema"
import { withUserCtx } from "@/lib/db-context"
import { lastWeekBuckets, referralSla } from "@/lib/format"
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

/** Zero-filled weekly series from sparse {week, total} DB rows. */
function toWeeklySeries(
  rows: { week: string; total: number }[],
  weeks = 12
): { label: string; value: number }[] {
  const buckets = lastWeekBuckets(weeks)
  const byWeek = new Map(rows.map((row) => [row.week, row.total]))
  return buckets.map((bucket) => ({
    label: bucket.label,
    value: byWeek.get(bucket.key) ?? 0,
  }))
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
    // U6 trend: filings per week, last 12 weeks.
    const weeklyFilings = await tx
      .select({
        week: sql<string>`to_char(date_trunc('week', ${records.createdAt}), 'YYYY-MM-DD')`,
        total: sql<number>`count(*)::int`,
      })
      .from(records)
      .where(
        and(...base, sql`${records.createdAt} >= current_date - interval '84 days'`)
      )
      .groupBy(sql`date_trunc('week', ${records.createdAt})`)
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
        key: row.recordType,
        label: row.recordType.replace(/_/g, " "),
        count: row.total,
        share: totalCases > 0 ? row.total / totalCases : 0,
      })),
      series: toWeeklySeries(weeklyFilings),
      severity: "info",
    })

    // 2. Resolution funnel (U6: active → resolved/closed → archived).
    const [resolution] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        resolved: sql<number>`count(*) filter (where ${records.status} in ('resolved','closed'))::int`,
      })
      .from(records)
      .where(and(...base))
    const funnel = await tx
      .select({
        status: records.status,
        total: sql<number>`count(*)::int`,
      })
      .from(records)
      .where(and(...base))
      .groupBy(records.status)
    const funnelOrder = ["active", "resolved", "closed", "archived"] as const
    const rate =
      resolution.total > 0 ? Math.round((resolution.resolved / resolution.total) * 100) : 0
    entries.push({
      id: "resolution",
      date: today,
      scopeLabel: scopeLabel(scope),
      title: "Resolution rate",
      description: `${resolution.resolved} of ${resolution.total} cases resolved or closed.`,
      metrics: [{ label: "Resolved", value: `${rate}%` }],
      breakdown: funnelOrder
        .map((status) => funnel.find((row) => row.status === status))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map((row) => ({
          label: row.status,
          count: row.total,
          share: resolution.total > 0 ? row.total / resolution.total : 0,
        })),
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
      // U6 trend: casualties per week, last 12 weeks.
      const weeklyCasualties = await tx
        .select({
          week: sql<string>`to_char(date_trunc('week', ${accidents.accidentDate}::timestamptz), 'YYYY-MM-DD')`,
          total: sql<number>`coalesce(sum(${accidents.fatalities} + ${accidents.injuries}), 0)::int`,
        })
        .from(accidents)
        .innerJoin(records, eq(accidents.recordId, records.id))
        .where(
          and(
            ...scopedConditions(scope, records),
            sql`${accidents.accidentDate} >= current_date - 84`
          )
        )
        .groupBy(sql`date_trunc('week', ${accidents.accidentDate}::timestamptz)`)
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
        series: toWeeklySeries(weeklyCasualties),
        severity: fatalities > 0 ? "critical" : injuries > 5 ? "warning" : "info",
      })

      // 4. Citations: totals + collection (Phase 6: money view).
      const citationRows = await tx
        .select({
          recordId: trafficCitations.recordId,
          isPaid: trafficCitations.isPaid,
          fine: trafficCitations.fineAmount,
          dueDate: trafficCitations.dueDate,
          voidedAt: trafficCitations.voidedAt,
        })
        .from(trafficCitations)
        .innerJoin(records, eq(trafficCitations.recordId, records.id))
        .where(and(...scopedConditions(scope, records)))
      const live = citationRows.filter((row) => !row.voidedAt)
      const paid = live.filter((row) => row.isPaid).length
      const voids = citationRows.length - live.length
      const assessed = live.reduce(
        (sum, row) => sum + (row.fine != null ? Number(row.fine) : 0),
        0
      )
      const liveIds = new Set(live.map((row) => row.recordId))
      const moneyRows =
        liveIds.size === 0
          ? []
          : await tx
              .select({
                recordId: citationPayments.recordId,
                amount: citationPayments.amount,
              })
              .from(citationPayments)
              .innerJoin(records, eq(citationPayments.recordId, records.id))
              .where(and(...scopedConditions(scope, records)))
              .limit(5000)
      const collected = moneyRows
        .filter((row) => liveIds.has(row.recordId))
        .reduce((sum, row) => sum + Number(row.amount), 0)
      const rate =
        assessed > 0 ? Math.round((collected / assessed) * 100) : 0
      const overdue = live.filter(
        (row) => !row.isPaid && row.dueDate != null && row.dueDate < today
      ).length
      // U6 trend: kwacha collected per week, last 12 weeks.
      const weeklyCollected = await tx
        .select({
          week: sql<string>`to_char(date_trunc('week', ${citationPayments.createdAt}), 'YYYY-MM-DD')`,
          total: sql<number>`coalesce(sum(${citationPayments.amount}), 0)::int`,
        })
        .from(citationPayments)
        .innerJoin(records, eq(citationPayments.recordId, records.id))
        .where(
          and(
            ...scopedConditions(scope, records),
            sql`${citationPayments.createdAt} >= current_date - interval '84 days'`
          )
        )
        .groupBy(sql`date_trunc('week', ${citationPayments.createdAt})`)
      entries.push({
        id: "citations",
        date: today,
        scopeLabel: scopeLabel(scope),
        title: "Traffic citations & collection",
        description: `${live.length} live citations (${voids} voided) · ${paid} paid · ${overdue} overdue.`,
        metrics: [
          { label: "Issued", value: String(live.length) },
          { label: "Paid", value: String(paid) },
          {
            label: "Assessed MWK",
            value: assessed.toLocaleString(),
          },
          {
            label: "Collected MWK",
            value: `${Math.round(collected).toLocaleString()} (${rate}%)`,
          },
          { label: "Overdue", value: String(overdue) },
          { label: "Voided", value: String(voids) },
        ],
        series: toWeeklySeries(weeklyCollected),
        severity: overdue > 0 ? "warning" : "info",
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
      // Privacy rule: groups smaller than 5 are never shown — they stay in
      // the total but not in any attributable breakdown row.
      const publishable = byDistrict.filter((row) => row.total >= 5)
      const suppressed = districtTotal - publishable.reduce((sum, row) => sum + row.total, 0)
      entries.push({
        id: "districts",
        date: today,
        scopeLabel: scopeLabel(scope),
        title: "Caseload by district",
        description:
          suppressed > 0
            ? `Top districts by volume. ${suppressed} case(s) in groups smaller than 5 are withheld.`
            : "Top districts by open + closed volume.",
        metrics: publishable.slice(0, 3).map((row) => ({
          label: formatDistrict(row.district),
          value: String(row.total),
        })),
        breakdown: publishable.map((row) => ({
          label: formatDistrict(row.district),
          count: row.total,
          share: districtTotal > 0 ? row.total / districtTotal : 0,
        })),
        severity: "info",
      })
    }

    // 6. Court referral timeliness (F4) — referred → viewed → outcome.
    {
      const grants = await tx
        .select({
          createdAt: courtCaseAccess.createdAt,
          firstViewedAt: courtCaseAccess.firstViewedAt,
          outcomeRecordedAt: courtCaseAccess.outcomeRecordedAt,
          revokedAt: courtCaseAccess.revokedAt,
          recordDistrict: records.district,
        })
        .from(courtCaseAccess)
        .innerJoin(records, eq(courtCaseAccess.recordId, records.id))
        .where(eq(records.domain, scope.domain))
        .limit(200)
      const inScope = grants.filter(
        (grant) =>
          !grant.revokedAt &&
          (!scope.district || grant.recordDistrict === scope.district)
      )
      const slas = inScope.map((grant) =>
        referralSla(
          grant.createdAt.toISOString(),
          grant.firstViewedAt?.toISOString() ?? null,
          grant.outcomeRecordedAt?.toISOString() ?? null
        )
      )
      const overdue = slas.filter((s) => s.viewOverdue || s.outcomeOverdue).length
      const viewedAvg = slas
        .map((s) => s.daysToView)
        .filter((d): d is number => d != null)
      entries.push({
        id: "referrals",
        date: today,
        scopeLabel: scopeLabel(scope),
        title: "Court referrals",
        description:
          inScope.length === 0
            ? "No referrals in scope yet."
            : `${inScope.length} referred · ${slas.filter((s) => s.daysToView != null).length} viewed · ${slas.filter((s) => s.daysToOutcome != null).length} decided.`,
        metrics: [
          { label: "Referred", value: String(inScope.length) },
          {
            label: "Avg days to view",
            value:
              viewedAvg.length > 0
                ? (viewedAvg.reduce((a, b) => a + b, 0) / viewedAvg.length).toFixed(1)
                : "—",
          },
          { label: "Overdue", value: String(overdue) },
        ],
        severity: overdue > 0 ? "warning" : "info",
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
