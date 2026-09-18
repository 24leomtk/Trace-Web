"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

import { searchVehicles, unverifiedVehicles } from "@/lib/actions/vehicles"
import { daysSince } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

export function RegistrarHome() {
  const { data: queue, isLoading } = useQuery({
    queryKey: ["unverified-vehicles"],
    queryFn: () => unverifiedVehicles(),
  })
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<
    Awaited<ReturnType<typeof searchVehicles>>
  >([])
  const [searching, setSearching] = useState(false)

  async function search(event: React.SubmitEvent) {
    event.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      setResults(await searchVehicles(query))
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Vehicle registry</h1>
        <p className="text-sm text-muted-foreground">
          Verify officer-filed plates against the official registry.
          Verification enriches the row — case links never break.
        </p>
      </header>

      <form onSubmit={search} className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search plate number…"
          className="rounded-none"
        />
        <Button type="submit" disabled={searching}>
          {searching ? "…" : "Search"}
        </Button>
      </form>

      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((vehicle) => (
            <VehicleRow key={vehicle.id} vehicle={vehicle} />
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Awaiting verification
        </h2>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !queue || queue.length === 0 ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            Queue clear — every plate is verified.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {queue.map((vehicle) => (
              <VehicleRow key={vehicle.id} vehicle={vehicle} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function VehicleRow({
  vehicle,
}: {
  vehicle: {
    id: string
    plateNumber: string
    make: string | null
    model: string | null
    createdAt?: string | Date
  }
}) {
  const waiting = vehicle.createdAt
    ? daysSince(new Date(vehicle.createdAt).toISOString())
    : null
  return (
    <li>
      <Link
        href={`/vehicles/${vehicle.id}`}
        className="block rounded-none border bg-card px-4 py-3 transition-colors hover:bg-accent"
      >
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
          <span>{vehicle.plateNumber}</span>
          {waiting != null && (
            <span className="rounded-none border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              {waiting <= 0 ? "filed today" : `waiting ${waiting}d`}
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {[vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
            "No details yet"}
        </p>
      </Link>
    </li>
  )
}
