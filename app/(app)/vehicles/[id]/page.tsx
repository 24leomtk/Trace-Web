"use client"

import { use, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "sonner"

import { getVehicle, verifyVehicle } from "@/lib/actions/vehicles"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListPagination } from "@/components/app/list-pagination"
import { SearchInput } from "@/components/app/search-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useUser } from "@/providers/user-context"

export default function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user } = useUser()
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => getVehicle(id),
  })
  const [form, setForm] = useState({
    make: "",
    model: "",
    year: "",
    color: "",
    chassisNumber: "",
    engineNumber: "",
    ownerName: "",
    ownerNationalId: "",
    ownerPhone: "",
  })
  const [saving, setSaving] = useState(false)
  const isRegistrar = user.role === "VEHICLE_REGISTRAR"

  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Vehicle not found.
        </p>
      </div>
    )
  }

  const { vehicle, caseCount, linkedCases } = data

  async function handleVerify(event: React.SubmitEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await verifyVehicle({
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        make: form.make || vehicle.make || "",
        model: form.model || vehicle.model || "",
        year: form.year ? Number(form.year) : undefined,
        color: form.color || vehicle.color || "",
        chassisNumber: form.chassisNumber || vehicle.chassisNumber || "",
        engineNumber: form.engineNumber || vehicle.engineNumber || "",
        ownerName: form.ownerName || vehicle.ownerName || "",
        ownerNationalId: form.ownerNationalId || vehicle.ownerNationalId || "",
        ownerPhone: form.ownerPhone || vehicle.ownerPhone || "",
      })
      toast.success("Vehicle verified.")
      await queryClient.invalidateQueries({ queryKey: ["vehicle", id] })
      await queryClient.invalidateQueries({ queryKey: ["unverified-vehicles"] })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Verification failed."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{vehicle.plateNumber}</h1>
        <p className="text-sm text-muted-foreground">
          {[vehicle.make, vehicle.model, vehicle.color]
            .filter(Boolean)
            .join(" · ") || "No details yet"}
        </p>
        <p className="text-xs text-muted-foreground">
          {vehicle.isVerified
            ? `Verified${vehicle.registrarName ? ` by ${vehicle.registrarName}` : ""}`
            : "Unverified ad-hoc entry"}
          {vehicle.isFlagged && " · FLAGGED"}
        </p>
      </header>

      {vehicle.ownerName && (
        <section className="rounded-none border bg-card p-4 text-sm">
          <p className="font-medium">{vehicle.ownerName}</p>
          <p className="text-muted-foreground">
            {[vehicle.ownerNationalId, vehicle.ownerPhone]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
      )}

      {!isRegistrar && (
        <VehicleLinkedCases linkedCases={linkedCases} caseCount={caseCount} />
      )}

      {isRegistrar && (
        <section className="flex flex-col gap-3 rounded-none border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Verify / enrich
          </h2>
          <form
            onSubmit={handleVerify}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {(
              [
                ["make", "Make"],
                ["model", "Model"],
                ["year", "Year"],
                ["color", "Color"],
                ["chassisNumber", "Chassis number"],
                ["engineNumber", "Engine number"],
                ["ownerName", "Owner name"],
                ["ownerNationalId", "Owner national ID"],
                ["ownerPhone", "Owner phone"],
              ] as const
            ).map(([key, label]) => (
              <Input
                key={key}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={`${label} (current: ${String(vehicle[key as keyof typeof vehicle] ?? "—")})`}
              />
            ))}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Verifying…" : "Verify against registry"}
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}

function VehicleLinkedCases({
  linkedCases,
  caseCount,
}: {
  linkedCases: { id: string; recordId: string; caseType: string; status: string }[]
  caseCount: number
}) {
  const { query, setQuery, debouncedQuery, page, setPage, pageCount, total, visible } =
    usePaginatedSearch({
      items: linkedCases,
      search: (entry, q) =>
        `${entry.caseType.replace(/_/g, " ")} ${entry.status}`.toLowerCase().includes(q),
    })

  if (linkedCases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No linked cases ({caseCount} coded rows).
      </p>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Linked cases ({caseCount})
      </h2>
      {linkedCases.length > 4 && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search linked cases…"
        />
      )}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No linked cases match “{debouncedQuery}”.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {visible.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/records/${entry.recordId}`}
                  className="block rounded-none border px-3 py-2 text-sm hover:bg-accent"
                >
                  <span className="font-medium">
                    {entry.caseType.replace(/_/g, " ")}
                  </span>
                  <span className="text-muted-foreground"> · {entry.status}</span>
                </Link>
              </li>
            ))}
          </ul>
          <ListPagination
            page={page}
            pageCount={pageCount}
            onPage={setPage}
            total={total}
          />
        </>
      )}
    </section>
  )
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit rounded-none">
      <Link href="/">
        <ArrowLeftIcon data-icon="inline-start" />
        Back
      </Link>
    </Button>
  )
}
