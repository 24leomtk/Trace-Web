"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { listPolicies } from "@/lib/actions/insurance"
import { insurerPlateLookup } from "@/lib/actions/access"
import { isPolicyLive } from "@/lib/visibility"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

export function InsurerHome() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-policies"],
    queryFn: listPolicies,
  })
  const [plate, setPlate] = useState("")
  const [flagResult, setFlagResult] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  async function checkFlag(event: React.FormEvent) {
    event.preventDefault()
    if (!plate.trim()) return
    setChecking(true)
    try {
      const result = await insurerPlateLookup(plate)
      setFlagResult(result.flagged)
      void queryClient.invalidateQueries({ queryKey: ["my-policies"] })
    } catch {
      toast.error("Lookup failed.")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Insurance portal</h1>
        <p className="text-sm text-muted-foreground">
          Your organization&apos;s policies. Flag checks return yes/no only.
        </p>
      </header>

      <form onSubmit={checkFlag} className="flex gap-2">
        <Input
          value={plate}
          onChange={(event) => setPlate(event.target.value)}
          placeholder="Plate number, e.g. MH 1234"
          className="rounded-2xl"
        />
        <Button type="submit" disabled={checking}>
          {checking ? "Checking…" : "Flag check"}
        </Button>
      </form>
      {flagResult !== null && (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            flagResult
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
        >
          {flagResult
            ? "Flagged — this plate has an open case."
            : "Clear — no open case on this plate."}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Our policies
        </h2>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : isError ? (
          <p className="rounded-3xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            Could not load policies.
          </p>
        ) : !data || data.length === 0 ? (
          <p className="rounded-3xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            No policies yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.map((policy) => {
              const live = isPolicyLive(policy)
              return (
                <li
                  key={policy.id}
                  className="rounded-3xl border bg-card px-4 py-3"
                >
                  <p className="text-[15px] font-medium">
                    {policy.plateNumber} · {policy.policyNumber}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {policy.coverageType || "Standard cover"} · {policy.startDate} →{" "}
                    {policy.endDate} · {live ? "live" : "expired/lapsed"}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
