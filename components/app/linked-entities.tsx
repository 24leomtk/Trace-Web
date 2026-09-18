"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { CarFrontIcon, UserRoundIcon } from "lucide-react"

import { getPerson } from "@/lib/actions/persons"
import { getVehicle } from "@/lib/actions/vehicles"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * U5 linked entities (Phase 2) — the person and vehicle a case points at,
 * shown inside the consolidated case pane instead of only on separate
 * profile screens. Police roles only (person/vehicle actions gate this).
 */
export function LinkedEntities({
  personId,
  vehicleId,
}: {
  personId?: string
  vehicleId?: string
}) {
  if (!personId && !vehicleId) {
    return (
      <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
        No linked person or vehicle on this case.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {personId && <PersonCard id={personId} />}
      {vehicleId && <VehicleCard id={vehicleId} />}
    </div>
  )
}

function PersonCard({ id }: { id: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["person", id],
    queryFn: () => getPerson(id),
  })
  if (isLoading) return <Skeleton className="h-20 w-full" />
  if (isError || !data) {
    return (
      <p className="rounded-none border border-dashed px-6 py-6 text-center text-sm text-muted-foreground">
        Person profile unavailable.
      </p>
    )
  }
  const person = data.person
  return (
    <Link
      href={`/persons/${id}`}
      className="block rounded-none border bg-card px-4 py-3 transition-colors hover:bg-accent"
    >
      <p className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <UserRoundIcon className="size-3.5" />
        Person of interest · {data.linkedCases.length} linked case
        {data.linkedCases.length === 1 ? "" : "s"}
      </p>
      <p className="mt-0.5 text-[15px] font-medium">{person.fullName}</p>
      <p className="text-sm text-muted-foreground">
        {[person.nationalId, person.homeDistrict?.replace(/_/g, " ")]
          .filter(Boolean)
          .join(" · ") || "No identifiers on file"}
      </p>
    </Link>
  )
}

function VehicleCard({ id }: { id: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => getVehicle(id),
  })
  if (isLoading) return <Skeleton className="h-20 w-full" />
  if (isError || !data) {
    return (
      <p className="rounded-none border border-dashed px-6 py-6 text-center text-sm text-muted-foreground">
        Vehicle profile unavailable.
      </p>
    )
  }
  const vehicle = data.vehicle
  return (
    <Link
      href={`/vehicles/${id}`}
      className="block rounded-none border bg-card px-4 py-3 transition-colors hover:bg-accent"
    >
      <p className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <CarFrontIcon className="size-3.5" />
        Vehicle · {data.caseCount} linked case{data.caseCount === 1 ? "" : "s"}
        {vehicle.isFlagged && (
          <span className="font-semibold text-red-600">· FLAGGED</span>
        )}
      </p>
      <p className="mt-0.5 text-[15px] font-medium">{vehicle.plateNumber}</p>
      <p className="text-sm text-muted-foreground">
        {[vehicle.make, vehicle.model, vehicle.color]
          .filter(Boolean)
          .join(" ") || "No details yet"}
        {vehicle.isVerified ? " · verified" : " · unverified"}
      </p>
    </Link>
  )
}
