"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import {
  checkPlateFlag,
  checkWantedByNationalId,
  insurerPlateLookup,
} from "@/lib/actions/access"
import { searchPersons } from "@/lib/actions/persons"
import { searchVehicles } from "@/lib/actions/vehicles"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useUser } from "@/providers/user-context"

export default function LookupPage() {
  const { user } = useUser()
  const isPolice =
    user.role === "OFFICER" ||
    user.role === "DISTRICT_MONITOR" ||
    user.role === "COUNTRY_MONITOR"
  const isInsurer = user.role === "INSURANCE_PORTAL_USER"

  const [nationalId, setNationalId] = useState("")
  const [wanted, setWanted] = useState<null | { wanted: boolean; dangerLevel?: string; district?: string }>(null)
  const [plate, setPlate] = useState("")
  const [flagged, setFlagged] = useState<boolean | null>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{ vehicles: Awaited<ReturnType<typeof searchVehicles>>; persons: Awaited<ReturnType<typeof searchPersons>> } | null>(null)
  const [busy, setBusy] = useState(false)

  async function runWantedCheck(event: React.FormEvent) {
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

  async function runFlagCheck(event: React.FormEvent) {
    event.preventDefault()
    if (!plate.trim()) return
    setBusy(true)
    try {
      const result = isInsurer
        ? await insurerPlateLookup(plate)
        : await checkPlateFlag(plate)
      setFlagged(result.flagged)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check failed.")
    } finally {
      setBusy(false)
    }
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    try {
      const [vehicles, persons] = await Promise.all([
        searchVehicles(query),
        searchPersons(query),
      ])
      setResults({ vehicles, persons })
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
          Read-only safety checks. Minimal detail, always logged.
        </p>
      </header>

      {isPolice && (
        <section className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Wanted check · national ID
          </h2>
          <form onSubmit={runWantedCheck} className="flex gap-2">
            <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="National ID" />
            <Button type="submit" disabled={busy}>Check</Button>
          </form>
          {wanted && (
            <p className={`rounded-2xl border px-4 py-3 text-sm font-medium ${wanted.wanted ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
              {wanted.wanted
                ? `WANTED${wanted.dangerLevel ? ` · danger ${wanted.dangerLevel}` : ""}${wanted.district ? ` · ${wanted.district.replace(/_/g, " ")}` : ""}`
                : "No active wanted record."}
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Plate flag check
        </h2>
        <form onSubmit={runFlagCheck} className="flex gap-2">
          <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Plate number" />
          <Button type="submit" disabled={busy}>Check</Button>
        </form>
        {flagged !== null && (
          <p className={`rounded-2xl border px-4 py-3 text-sm font-medium ${flagged ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
            {flagged ? "Flagged — open case on this plate." : "Clear — no open case."}
          </p>
        )}
      </section>

      {isPolice && (
        <section className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Vehicle & person search
          </h2>
          <form onSubmit={runSearch} className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Plate, name, or national ID…" />
            <Button type="submit" disabled={busy}>Search</Button>
          </form>
          {results && (
            <div className="flex flex-col gap-2">
              {results.vehicles.map((vehicle) => (
                <Link key={vehicle.id} href={`/vehicles/${vehicle.id}`} className="rounded-2xl border px-3 py-2 text-sm hover:bg-accent">
                  <span className="font-medium">{vehicle.plateNumber}</span>
                  <span className="text-muted-foreground"> · {[vehicle.make, vehicle.model].filter(Boolean).join(" ")}</span>
                  {vehicle.isFlagged && <span className="ml-2 text-xs font-semibold text-red-600">FLAGGED</span>}
                </Link>
              ))}
              {results.persons.map((person) => (
                <Link key={person.id} href={`/persons/${person.id}`} className="rounded-2xl border px-3 py-2 text-sm hover:bg-accent">
                  <span className="font-medium">{person.fullName}</span>
                  {person.nationalId && <span className="text-muted-foreground"> · {person.nationalId}</span>}
                </Link>
              ))}
              {results.vehicles.length === 0 && results.persons.length === 0 && (
                <p className="text-sm text-muted-foreground">No matches.</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
