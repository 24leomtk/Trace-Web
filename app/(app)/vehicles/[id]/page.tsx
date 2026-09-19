"use client"

import { use, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "sonner"

import { getVehicle, setVehicleStatus, updateVehicle, verifyVehicle } from "@/lib/actions/vehicles"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
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
  const { data, isLoading, isError, isFetching } = useQuery({
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
  const [statusOpen, setStatusOpen] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
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

  const { vehicle, caseCount, linkedCases, taxes } = data
  const outOfService = (vehicle as { status?: string }).status === "out_of_service"

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["vehicle", id] })
    await queryClient.invalidateQueries({ queryKey: ["registrar-vehicles"] })
    await queryClient.invalidateQueries({ queryKey: ["unverified-vehicles"] })
  }

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
      setForm({
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
      await refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Verification failed."
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(event: React.SubmitEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await updateVehicle({
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        make: form.make || vehicle.make || "",
        model: form.model || vehicle.model || "",
        year: form.year ? Number(form.year) : (vehicle.year as number | undefined),
        color: form.color || vehicle.color || "",
        chassisNumber: form.chassisNumber || vehicle.chassisNumber || "",
        engineNumber: form.engineNumber || vehicle.engineNumber || "",
        ownerName: form.ownerName || vehicle.ownerName || "",
        ownerNationalId: form.ownerNationalId || vehicle.ownerNationalId || "",
        ownerPhone: form.ownerPhone || vehicle.ownerPhone || "",
      })
      toast.success("Vehicle updated.")
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.")
    } finally {
      setSaving(false)
    }
  }

  async function confirmStatus() {
    setStatusBusy(true)
    try {
      await setVehicleStatus({
        id: vehicle.id,
        status: outOfService ? "active" : "out_of_service",
      })
      toast.success(outOfService ? "Vehicle restored to active." : "Vehicle marked out of service.")
      setStatusOpen(false)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status change failed.")
    } finally {
      setStatusBusy(false)
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
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {vehicle.isVerified
              ? `Verified${vehicle.registrarName ? ` by ${vehicle.registrarName}` : ""}`
              : "Unverified ad-hoc entry"}
            {vehicle.isFlagged && " · FLAGGED"}
            {outOfService && " · OUT OF SERVICE"}
          </span>
          {isRegistrar && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStatusOpen(true)}
            >
              {outOfService ? "Restore to active" : "Mark out of service"}
            </Button>
          )}
        </p>
        {outOfService && (
          <p className="rounded-none border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Out of service — soft-deleted from active queues. Case links and history are kept.
          </p>
        )}
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
        <VehicleLinkedCases
          linkedCases={linkedCases}
          caseCount={caseCount}
          refreshing={isFetching}
          onRefresh={refresh}
        />
      )}

      {!isRegistrar && taxes.length > 0 && (
        <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Taxes ({taxes.length})
          </h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {taxes.map((tax) => {
              const state = tax.isPaid
                ? "paid"
                : tax.isExempt
                  ? "exempt"
                  : tax.isWaived
                    ? "waived"
                    : tax.dueDate < new Date().toISOString().slice(0, 10)
                      ? "OVERDUE"
                      : "unpaid"
              return (
                <li
                  key={tax.id}
                  className="flex items-center justify-between gap-2 rounded-none border px-3 py-2"
                >
                  <span>
                    {tax.taxType.replace(/_/g, " ")} · MWK {tax.amountDue}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {state}
                    {tax.waiverStatus !== "none" ? ` (${tax.waiverStatus})` : ""} ·
                    due {tax.dueDate}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {isRegistrar && !outOfService && (
        <section className="flex flex-col gap-3 rounded-none border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {vehicle.isVerified ? "Edit registry entry" : "Verify / enrich"}
          </h2>
          <form
            onSubmit={vehicle.isVerified ? handleEdit : handleVerify}
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
                {saving
                  ? "Saving…"
                  : vehicle.isVerified
                    ? "Save changes"
                    : "Verify against registry"}
              </Button>
            </div>
          </form>
        </section>
      )}

      <ConfirmDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        title={outOfService ? "Restore vehicle?" : "Mark out of service?"}
        description={
          outOfService
            ? `${vehicle.plateNumber} returns to the active registry.`
            : `${vehicle.plateNumber} leaves active queues but stays on file — the registry soft-delete.`
        }
        confirmLabel={statusBusy ? "Saving…" : outOfService ? "Restore" : "Mark out of service"}
        destructive={!outOfService}
        onConfirm={() => void confirmStatus()}
      />
    </div>
  )
}

function VehicleLinkedCases({
  linkedCases,
  caseCount,
  refreshing,
  onRefresh,
}: {
  linkedCases: { id: string; recordId: string; caseType: string; status: string }[]
  caseCount: number
  refreshing?: boolean
  onRefresh?: () => Promise<void>
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
      {linkedCases.length > 4 ? (
        <div className="flex items-start gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search linked cases…"
            className="flex-1"
          />
          {onRefresh && <ListRefreshButton onRefresh={onRefresh} loading={refreshing} />}
        </div>
      ) : null}
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
