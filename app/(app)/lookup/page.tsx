"use client"

import { useState } from "react"
import Link from "next/link"
import { ScanLineIcon } from "lucide-react"
import { toast } from "sonner"

import {
  checkPlateFlag,
  checkWantedByNationalId,
  flaggedVehicleWatchlist,
  insurerPlateLookup,
} from "@/lib/actions/access"
import { findCitationByTicket } from "@/lib/actions/citations"
import { unifiedSearch } from "@/lib/actions/search"
import { daysSince, normalizePlate } from "@/lib/format"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListEmptyState } from "@/components/app/list-empty-state"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { SearchInput } from "@/components/app/search-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScanSheet } from "@/components/app/scan-sheet"
import { useUser } from "@/providers/user-context"

type ScanTarget = "plate" | "nationalId" | null

export default function LookupPage() {
  const { user } = useUser()
  const isPolice =
    user.role === "OFFICER" ||
    user.role === "DISTRICT_MONITOR" ||
    user.role === "COUNTRY_MONITOR"
  const isInsurer = user.role === "INSURANCE_PORTAL_USER"

  const [nationalId, setNationalId] = useState("")
  const [wanted, setWanted] = useState<null | {
    wanted: boolean
    dangerLevel?: string
    district?: string
  }>(null)
  const [plate, setPlate] = useState("")
  const [flagged, setFlagged] = useState<boolean | null>(null)
  const [ticket, setTicket] = useState("")
  const [ticketResult, setTicketResult] = useState<null | {
    recordId: string
    plateNumber: string | null
    balance: number | null
    isPaid: boolean
  }>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Awaited<
    ReturnType<typeof unifiedSearch>
  > | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanTarget, setScanTarget] = useState<ScanTarget>(null)
  const [watchlist, setWatchlist] = useState<Awaited<
    ReturnType<typeof flaggedVehicleWatchlist>
  > | null>(null)
  const [watchBusy, setWatchBusy] = useState(false)

  function handleScanned(raw: string) {
    if (scanTarget === "plate") {
      setPlate(normalizePlate(raw))
      toast.success("Plate filled from scan — verify before checking.")
    } else if (scanTarget === "nationalId") {
      setNationalId(raw.trim())
      toast.success("ID filled from scan — verify before checking.")
    }
    setScanTarget(null)
  }

  async function runWantedCheck(event: React.SubmitEvent) {
    event.preventDefault()
    if (!nationalId.trim()) return
    setBusy(true)
    try {
      setWanted(await checkWantedByNationalId(nationalId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check failed.")
    } finally {
      setBusy(false)
    }
  }

  async function runFlagCheck(event: React.SubmitEvent) {
    event.preventDefault()
    const normalized = normalizePlate(plate)
    if (!normalized) return
    setPlate(normalized)
    setBusy(true)
    try {
      const result = isInsurer
        ? await insurerPlateLookup(normalized)
        : await checkPlateFlag(normalized)
      setFlagged(result.flagged)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check failed.")
    } finally {
      setBusy(false)
    }
  }

  async function runTicketSearch(event: React.SubmitEvent) {
    event.preventDefault()
    if (!ticket.trim()) return
    setBusy(true)
    try {
      setTicketResult(await findCitationByTicket(ticket))
    } catch (error) {
      setTicketResult(null)
      toast.error(
        error instanceof Error ? error.message : "Ticket lookup failed."
      )
    } finally {
      setBusy(false)
    }
  }

  async function loadWatchlist() {
    setWatchBusy(true)
    try {
      setWatchlist(await flaggedVehicleWatchlist())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Watchlist failed.")
    } finally {
      setWatchBusy(false)
    }
  }

  async function runSearch(event: React.SubmitEvent) {
    event.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    try {
      setResults(await unifiedSearch(query))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Search failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Lookups</h1>
        <p className="text-sm text-muted-foreground">
          Roadside mode: enter → check → act. Read-only safety checks with
          minimal detail, always logged. Slow down if asked to retry — checks
          are rate-limited.
        </p>
      </header>

      {isPolice && (
        <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Wanted check · national ID
          </h2>
          <form onSubmit={runWantedCheck} className="flex gap-2">
            <Input
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              placeholder="National ID"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Scan ID barcode"
              title="Scan ID barcode"
              onClick={() => setScanTarget("nationalId")}
            >
              <ScanLineIcon />
            </Button>
            <Button type="submit" disabled={busy}>
              Check
            </Button>
          </form>
          {wanted && (
            <div
              className={`rounded-none border px-4 py-3 ${wanted.wanted ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"}`}
            >
              <p className="text-sm font-medium">
                {wanted.wanted
                  ? `WANTED${wanted.dangerLevel ? ` · danger ${wanted.dangerLevel}` : ""}${wanted.district ? ` · ${wanted.district.replace(/_/g, " ")}` : ""}`
                  : "CLEAR — no active wanted record for this ID."}
              </p>
              <p className="mt-1 text-xs opacity-80">
                {wanted.wanted
                  ? "Exercise caution. Verify through your monitor before acting — this check never shows the case file."
                  : "Proceed per standard procedure."}
              </p>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Plate flag check
        </h2>
        <form onSubmit={runFlagCheck} className="flex gap-2">
          <Input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Plate number"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Scan plate code"
            title="Scan plate code"
            onClick={() => setScanTarget("plate")}
          >
            <ScanLineIcon />
          </Button>
          <Button type="submit" disabled={busy}>
            Check
          </Button>
        </form>
        {flagged !== null && (
          <div
            className={`rounded-none border px-4 py-3 ${flagged ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"}`}
          >
            <p className="text-sm font-medium">
              {flagged
                ? `FLAGGED — open case or unpaid tax on ${plate}.`
                : `CLEAR — no open case or unpaid tax on ${plate}.`}
            </p>
            <p className="mt-1 text-xs opacity-80">
              {flagged
                ? "Treat with caution. Open the vehicle profile or escalate to your monitor — do not disclose case detail roadside."
                : "Proceed per standard stop."}
            </p>
          </div>
        )}
      </section>

      {isPolice && (
        <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Ticket lookup · receive payment at any counter
          </h2>
          <form onSubmit={runTicketSearch} className="flex gap-2">
            <Input
              value={ticket}
              onChange={(e) => setTicket(e.target.value.toUpperCase())}
              placeholder="Ticket no. e.g. T-2026-ABC123"
            />
            <Button type="submit" disabled={busy}>
              Find
            </Button>
          </form>
          {ticketResult && (
            <Link
              href={`/records/${ticketResult.recordId}`}
              className="rounded-none border px-3 py-2 text-sm hover:bg-accent"
            >
              <span className="font-medium">{ticket.trim().toUpperCase()}</span>
              <span className="text-muted-foreground">
                {" "}
                · {ticketResult.plateNumber ?? "No plate"} ·{" "}
                {ticketResult.isPaid
                  ? "PAID"
                  : ticketResult.balance != null
                    ? `Balance MWK ${ticketResult.balance.toLocaleString()}`
                    : "Balance unknown"}
              </span>
              <span className="ml-2 text-xs font-medium text-muted-foreground">
                Open to receipt →
              </span>
            </Link>
          )}
        </section>
      )}

      {isPolice && (
        <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Flagged watchlist · in scope
          </h2>
          <p className="text-xs text-muted-foreground">
            Every flagged plate below has an active case. Flags clear
            automatically when their cases close — review ages, don&apos;t
            re-flag by hand.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={watchBusy}
              onClick={loadWatchlist}
            >
              {watchBusy
                ? "Loading…"
                : watchlist
                  ? "Refresh"
                  : "Load watchlist"}
            </Button>
          </div>
          {watchlist && (
            <WatchlistList
              entries={watchlist}
              onRefresh={loadWatchlist}
              refreshing={watchBusy}
            />
          )}
        </section>
      )}

      {isPolice && (
        <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Vehicle & person search
          </h2>
          <form onSubmit={runSearch} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Plate, name, national ID, or ticket…"
            />
            <Button type="submit" disabled={busy}>
              Search
            </Button>
          </form>
          {results && <UnifiedResultsView results={results} />}
        </section>
      )}
      <ScanSheet
        open={scanTarget !== null}
        onOpenChange={(open) => {
          if (!open) setScanTarget(null)
        }}
        onScanned={handleScanned}
        title={
          scanTarget === "nationalId" ? "Scan ID barcode" : "Scan plate code"
        }
      />
    </div>
  )
}

function WatchlistList({
  entries,
  onRefresh,
  refreshing,
}: {
  entries: Awaited<ReturnType<typeof flaggedVehicleWatchlist>>
  onRefresh: () => void
  refreshing?: boolean
}) {
  const {
    query,
    setQuery,
    debouncedQuery,
    page,
    setPage,
    pageCount,
    total,
    visible,
  } = usePaginatedSearch({
    items: entries,
    search: (entry, q) =>
      `${entry.plateNumber} ${entry.caseTypes.join(" ").replace(/_/g, " ")} ${entry.district ?? ""}`
        .toLowerCase()
        .includes(q),
  })

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing flagged in scope.</p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Filter watchlist by plate…"
          className="flex-1"
        />
        <ListRefreshButton onRefresh={onRefresh} loading={refreshing} />
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No flagged plates match “{debouncedQuery}”.
        </p>
      ) : (
        <>
          {visible.map((entry) => {
            const age = daysSince(entry.since)
            return (
              <Link
                key={entry.vehicleId}
                href={`/vehicles/${entry.vehicleId}`}
                className="rounded-none border px-3 py-2 text-sm hover:bg-accent"
              >
                <span className="font-medium">{entry.plateNumber}</span>
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {entry.caseTypes.map((t) => t.replace(/_/g, " ")).join(", ")}
                  {entry.district
                    ? ` · ${entry.district.replace(/_/g, " ")}`
                    : ""}
                  {age != null && ` · flagged ${age}d ago`}
                </span>
              </Link>
            )
          })}
          <ListPagination
            page={page}
            pageCount={pageCount}
            onPage={setPage}
            total={total}
          />
        </>
      )}
    </div>
  )
}

function UnifiedResultsView({
  results,
}: {
  results: Awaited<ReturnType<typeof unifiedSearch>>
}) {
  const combined = [
    ...results.vehicles.map((vehicle) => ({
      kind: "vehicle" as const,
      vehicle,
    })),
    ...results.persons.map((person) => ({ kind: "person" as const, person })),
    ...(results.citations ?? []).map((citation) => ({
      kind: "citation" as const,
      citation,
    })),
  ]
  const {
    query,
    setQuery,
    debouncedQuery,
    page,
    setPage,
    pageCount,
    total,
    visible,
  } = usePaginatedSearch({
    items: combined,
    search: (item, q) =>
      item.kind === "vehicle"
        ? `${item.vehicle.plateNumber} ${item.vehicle.make ?? ""} ${item.vehicle.model ?? ""}`
            .toLowerCase()
            .includes(q)
        : item.kind === "person"
          ? `${item.person.fullName} ${item.person.nationalId ?? ""}`
              .toLowerCase()
              .includes(q)
          : `${item.citation.ticketNumber ?? ""} ${item.citation.violationType} ${item.citation.plateNumber ?? ""}`
              .toLowerCase()
              .includes(q),
  })

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {results.vehicles.length} vehicle(s) · {results.persons.length}{" "}
        person(s)
        {(results.citations ?? []).length > 0 &&
          ` · ${results.citations.length} ticket(s)`}
        — exact matches first, then partial.
      </p>
      {combined.length > 12 && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Filter these results…"
        />
      )}
      {visible.length === 0 ? (
        <ListEmptyState
          message={
            debouncedQuery
              ? `No results match “${debouncedQuery}”.`
              : "No matches."
          }
        />
      ) : (
        <>
          {visible.map((item) =>
            item.kind === "vehicle" ? (
              <Link
                key={item.vehicle.id}
                href={`/vehicles/${item.vehicle.id}`}
                className="rounded-none border px-3 py-2 text-sm hover:bg-accent"
              >
                <span className="font-medium">{item.vehicle.plateNumber}</span>
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {[item.vehicle.make, item.vehicle.model]
                    .filter(Boolean)
                    .join(" ")}
                </span>
                {item.vehicle.isFlagged && (
                  <span className="ml-2 text-xs font-semibold text-red-600">
                    FLAGGED
                  </span>
                )}
              </Link>
            ) : item.kind === "citation" ? (
              <Link
                key={item.citation.recordId}
                href={`/records/${item.citation.recordId}`}
                className="rounded-none border px-3 py-2 text-sm hover:bg-accent"
              >
                <span className="font-medium">
                  {item.citation.ticketNumber ?? "No ticket no."}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {item.citation.violationType} ·{" "}
                  {item.citation.plateNumber ?? "No plate"}
                </span>
                {item.citation.isPaid ? (
                  <span className="ml-2 text-xs font-semibold text-emerald-600">
                    PAID
                  </span>
                ) : (
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    Open to receipt →
                  </span>
                )}
              </Link>
            ) : (
              <Link
                key={item.person.id}
                href={`/persons/${item.person.id}`}
                className="rounded-none border px-3 py-2 text-sm hover:bg-accent"
              >
                <span className="font-medium">{item.person.fullName}</span>
                {item.person.nationalId && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {item.person.nationalId}
                  </span>
                )}
              </Link>
            )
          )}
          <ListPagination
            page={page}
            pageCount={pageCount}
            onPage={setPage}
            total={total}
          />
        </>
      )}
    </div>
  )
}
