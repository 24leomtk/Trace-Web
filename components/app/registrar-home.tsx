"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDebounce } from "use-debounce"
import Link from "next/link"
import ExcelJS from "exceljs"
import { PencilLineIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  bulkRegisterVehicles,
  listRegistrarVehicles,
  registerVehicle,
  searchVehicles,
  setVehicleStatus,
  updateVehicle,
  type RegistrarVehicleRow,
} from "@/lib/actions/vehicles"
import { daysSince, normalizePlate, parseVehicleCsv, VEHICLE_CSV_TEMPLATE } from "@/lib/format"
import { cn } from "@/lib/utils"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { AdminField, AdminToggle } from "@/components/app/admin-section"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { GridCardListSkeleton } from "@/components/app/list-skeletons"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { SearchInput } from "@/components/app/search-input"
import { TabGroup } from "@/components/app/tab-group"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type RegistrarTab = "queue" | "registry" | "out_of_service"

const VEHICLE_IMPORT_COLUMNS = [
  "plate_number",
  "make",
  "model",
  "year",
  "color",
  "chassis_number",
  "engine_number",
  "owner_name",
  "owner_national_id",
  "owner_phone",
  "owner_district",
  "is_verified",
] as const

export function RegistrarHome() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<RegistrarTab>("queue")
  const registryQuery = useQuery({
    queryKey: ["registrar-vehicles"],
    queryFn: () => listRegistrarVehicles(500),
  })

  const [lookup, setLookup] = useState("")
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchVehicles>>>([])
  const [searching, setSearching] = useState(false)
  const [debouncedLookup] = useDebounce(lookup.trim(), 350)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RegistrarVehicleRow | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<RegistrarVehicleRow | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)

  const registry = useMemo(() => registryQuery.data ?? [], [registryQuery.data])
  const queue = useMemo(
    () => registry.filter((v) => !v.isVerified && v.status === "active"),
    [registry]
  )
  const active = useMemo(
    () => registry.filter((v) => v.status === "active"),
    [registry]
  )
  const outOfService = useMemo(
    () => registry.filter((v) => v.status === "out_of_service"),
    [registry]
  )

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["registrar-vehicles"] })
    await queryClient.invalidateQueries({ queryKey: ["unverified-vehicles"] })
  }

  async function search(event: React.SubmitEvent) {
    event.preventDefault()
    const term = debouncedLookup || lookup.trim()
    if (!term) return
    setSearching(true)
    try {
      setResults(await searchVehicles(term, 12))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Search failed.")
    } finally {
      setSearching(false)
    }
  }

  const tabs: { value: RegistrarTab; label: string; count: number | null }[] = [
    { value: "queue", label: "Awaiting verification", count: registryQuery.data ? queue.length : null },
    { value: "registry", label: "Registry", count: registryQuery.data ? active.length : null },
    { value: "out_of_service", label: "Out of service", count: registryQuery.data ? outOfService.length : null },
  ]

  async function confirmStatusChange(restore: boolean) {
    if (!statusTarget || statusBusy) return
    setStatusBusy(true)
    try {
      await setVehicleStatus({
        id: statusTarget.id,
        status: restore ? "active" : "out_of_service",
      })
      toast.success(
        restore
          ? `${statusTarget.plateNumber} restored to active.`
          : `${statusTarget.plateNumber} marked out of service.`
      )
      setStatusTarget(null)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status change failed.")
    } finally {
      setStatusBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Vehicle registry</h1>
          <p className="text-sm text-muted-foreground">
            Verify officer-filed plates, manage the registry, import from Excel.
            Verification enriches the row — case links never break.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TabGroup
            label="Registry sections"
            options={tabs}
            value={tab}
            onChange={setTab}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            Import Excel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Add vehicle
          </Button>
        </div>
      </header>

      <form onSubmit={search} className="flex gap-2">
        <Input
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          placeholder="Search plate number…"
          className="rounded-none"
          aria-label="Search plate number"
        />
        <Button type="submit" disabled={searching}>
          {searching ? "…" : "Search"}
        </Button>
      </form>

      {results.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {results.map((vehicle) => (
            <VehicleRow key={vehicle.id} vehicle={vehicle} />
          ))}
        </ul>
      )}

      {tab === "queue" && (
        <RegistryTab
          items={queue}
          isLoading={registryQuery.isLoading}
          isFetching={registryQuery.isFetching}
          emptyTitle="Queue clear — every plate is verified."
          searchPlaceholder="Filter queue by plate, make, model…"
          onRefresh={refresh}
          onEdit={(vehicle) => {
            setEditing(vehicle)
            setDialogOpen(true)
          }}
          onStatus={setStatusTarget}
        />
      )}
      {tab === "registry" && (
        <RegistryTab
          items={active}
          isLoading={registryQuery.isLoading}
          isFetching={registryQuery.isFetching}
          emptyTitle="No vehicles on file yet."
          searchPlaceholder="Search registry by plate, make, model, owner…"
          onRefresh={refresh}
          onEdit={(vehicle) => {
            setEditing(vehicle)
            setDialogOpen(true)
          }}
          onStatus={setStatusTarget}
        />
      )}
      {tab === "out_of_service" && (
        <RegistryTab
          items={outOfService}
          isLoading={registryQuery.isLoading}
          isFetching={registryQuery.isFetching}
          emptyTitle="No out-of-service vehicles."
          searchPlaceholder="Search out-of-service by plate…"
          onRefresh={refresh}
          onEdit={(vehicle) => {
            setEditing(vehicle)
            setDialogOpen(true)
          }}
          onStatus={setStatusTarget}
          restoreMode
        />
      )}

      {dialogOpen && (
        <VehicleDialog
          key={editing?.id ?? "new"}
          editing={editing}
          existingPlates={registry.map((v) => v.plateNumber)}
          onClose={() => {
            setDialogOpen(false)
            setEditing(null)
          }}
          onSaved={refresh}
        />
      )}

      {importOpen && (
        <VehicleImportDialog
          existingPlates={registry.map((v) => v.plateNumber)}
          onClose={() => setImportOpen(false)}
          onImported={refresh}
        />
      )}

      <ConfirmDialog
        open={!!statusTarget}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null)
        }}
        title={
          statusTarget?.status === "out_of_service"
            ? "Restore vehicle?"
            : "Mark out of service?"
        }
        description={
          statusTarget?.status === "out_of_service"
            ? `${statusTarget?.plateNumber} returns to the active registry. Case links are untouched.`
            : `${statusTarget?.plateNumber} leaves active queues but stays on file — case links and history are kept. This is the registry soft-delete.`
        }
        confirmLabel={statusBusy ? "Saving…" : statusTarget?.status === "out_of_service" ? "Restore" : "Mark out of service"}
        destructive={statusTarget?.status !== "out_of_service"}
        onConfirm={() => void confirmStatusChange(statusTarget?.status === "out_of_service")}
      />
    </div>
  )
}

function RegistryTab({
  items,
  isLoading,
  isFetching,
  emptyTitle,
  searchPlaceholder,
  onRefresh,
  onEdit,
  onStatus,
  restoreMode,
}: {
  items: RegistrarVehicleRow[]
  isLoading: boolean
  isFetching: boolean
  emptyTitle: string
  searchPlaceholder: string
  onRefresh: () => Promise<void>
  onEdit: (vehicle: RegistrarVehicleRow) => void
  onStatus: (vehicle: RegistrarVehicleRow) => void
  restoreMode?: boolean
}) {
  const { query, setQuery, debouncedQuery, page, setPage, pageCount, total, visible } =
    usePaginatedSearch({
      items,
      search: (vehicle, q) =>
        `${vehicle.plateNumber} ${vehicle.make ?? ""} ${vehicle.model ?? ""} ${vehicle.color ?? ""}`
          .toLowerCase()
          .includes(q),
    })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder}
          className="flex-1"
        />
        <ListRefreshButton onRefresh={onRefresh} loading={isFetching} />
      </div>
      {isLoading ? (
        <GridCardListSkeleton count={4} />
      ) : items.length === 0 ? (
        <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          {emptyTitle}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          No plates match “{debouncedQuery}”.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {visible.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                onEdit={() => onEdit(vehicle)}
                onStatus={() => onStatus(vehicle)}
                restoreMode={restoreMode}
              />
            ))}
          </ul>
          <ListPagination page={page} pageCount={pageCount} onPage={setPage} total={total} />
        </>
      )}
    </section>
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
  const waiting =
    vehicle.createdAt != null &&
    (typeof vehicle.createdAt === "string" || vehicle.createdAt instanceof Date)
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
          {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "No details yet"}
        </p>
      </Link>
    </li>
  )
}

function VehicleCard({
  vehicle,
  onEdit,
  onStatus,
  restoreMode,
}: {
  vehicle: RegistrarVehicleRow
  onEdit: () => void
  onStatus: () => void
  restoreMode?: boolean
}) {
  return (
    <li className="rounded-none border bg-card px-4 py-3">
      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
        <Link href={`/vehicles/${vehicle.id}`} className="hover:underline">
          {vehicle.plateNumber}
        </Link>
        <span
          className={cn(
            "inline-flex items-center rounded-none border px-1.5 py-0.5 text-xs",
            vehicle.isVerified
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
          )}
        >
          {vehicle.isVerified ? "VERIFIED" : "UNVERIFIED"}
        </span>
        {vehicle.status === "out_of_service" && (
          <span className="inline-flex items-center rounded-none border px-1.5 py-0.5 text-xs text-muted-foreground">
            OUT OF SERVICE
          </span>
        )}
        {vehicle.isFlagged && (
          <span className="inline-flex items-center rounded-none border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            FLAGGED
          </span>
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {[vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(" · ") ||
          "No details yet"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <PencilLineIcon data-icon="inline-start" />
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onStatus}
          className={restoreMode ? undefined : "text-destructive hover:text-destructive"}
        >
          {restoreMode ? (
            <>
              <RotateCcwIcon data-icon="inline-start" />
              Restore
            </>
          ) : (
            <>
              <Trash2Icon data-icon="inline-start" />
              Out of service
            </>
          )}
        </Button>
      </div>
    </li>
  )
}

const EMPTY_FORM = {
  plateNumber: "",
  make: "",
  model: "",
  year: "",
  color: "",
  chassisNumber: "",
  engineNumber: "",
  ownerName: "",
  ownerNationalId: "",
  ownerPhone: "",
  ownerDistrict: "",
}

function VehicleDialog({
  editing,
  existingPlates,
  onClose,
  onSaved,
}: {
  editing: RegistrarVehicleRow | null
  existingPlates: string[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM }))
  const [isVerified, setIsVerified] = useState(true)
  const [saving, setSaving] = useState(false)

  const normalizedPlate = normalizePlate(form.plateNumber)
  const duplicate =
    !editing &&
    normalizedPlate !== "" &&
    existingPlates.some((plate) => normalizePlate(plate) === normalizedPlate)

  function set(key: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!editing && duplicate) {
      toast.error("That plate is already on file — search it and verify instead.")
      return
    }
    if (!normalizePlate(editing ? editing.plateNumber : form.plateNumber)) {
      toast.error("Enter the plate number.")
      return
    }
    setSaving(true)
    try {
      const payload = {
        plateNumber: editing ? editing.plateNumber : normalizedPlate,
        make: form.make,
        model: form.model,
        year: form.year ? Number(form.year) : undefined,
        color: form.color,
        chassisNumber: form.chassisNumber,
        engineNumber: form.engineNumber,
        ownerName: form.ownerName,
        ownerNationalId: form.ownerNationalId,
        ownerPhone: form.ownerPhone,
        ownerDistrict: form.ownerDistrict,
      }
      if (editing) {
        await updateVehicle({ id: editing.id, ...payload, isVerified })
        toast.success(`${editing.plateNumber} updated.`)
      } else {
        await registerVehicle({ ...payload, isVerified })
        toast.success(
          isVerified ? `${normalizedPlate} registered as verified.` : `${normalizedPlate} queued as unverified.`
        )
      }
      await onSaved()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={editing ? `Edit ${editing.plateNumber}` : "Add vehicle"}
      description={
        editing
          ? "Plates never change here — corrections need a system administrator."
          : "Duplicates are blocked — search first, then verify instead."
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <AdminField label="Plate number" hint={editing ? "Locked — plate corrections need an admin." : undefined}>
          <Input
            value={editing ? editing.plateNumber : form.plateNumber}
            onChange={(event) => set("plateNumber", event.target.value)}
            placeholder="MH 1234"
            disabled={!!editing}
            aria-label="Plate number"
          />
        </AdminField>
        {duplicate && (
          <p className="rounded-none border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            That plate is already on file — verify it instead of creating a duplicate.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <AdminField label="Make">
            <Input value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Toyota" />
          </AdminField>
          <AdminField label="Model">
            <Input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Corolla" />
          </AdminField>
          <AdminField label="Year">
            <Input value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="2019" inputMode="numeric" />
          </AdminField>
          <AdminField label="Color">
            <Input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="White" />
          </AdminField>
          <AdminField label="Chassis number">
            <Input value={form.chassisNumber} onChange={(e) => set("chassisNumber", e.target.value)} />
          </AdminField>
          <AdminField label="Engine number">
            <Input value={form.engineNumber} onChange={(e) => set("engineNumber", e.target.value)} />
          </AdminField>
          <AdminField label="Owner name">
            <Input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
          </AdminField>
          <AdminField label="Owner national ID">
            <Input value={form.ownerNationalId} onChange={(e) => set("ownerNationalId", e.target.value)} />
          </AdminField>
          <AdminField label="Owner phone">
            <Input value={form.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} placeholder="+265991234567" />
          </AdminField>
          <AdminField label="Owner district">
            <Input value={form.ownerDistrict} onChange={(e) => set("ownerDistrict", e.target.value)} placeholder="lilongwe" />
          </AdminField>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-none border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Verified against registry</p>
            <p className="text-xs text-muted-foreground">
              Off = queued for later verification.
            </p>
          </div>
          <AdminToggle checked={isVerified} onChange={setIsVerified} label="Verified against registry" />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || duplicate}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add vehicle"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  )
}

function VehicleImportDialog({
  existingPlates,
  onClose,
  onImported,
}: {
  existingPlates: string[]
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const [fileName, setFileName] = useState("")
  const [csvText, setCsvText] = useState<string | null>(null)
  const [xlsxRows, setXlsxRows] = useState<Record<string, string>[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [result, setResult] = useState<{
    created: number
    failed: { row: number; plate: string; error: string }[]
  } | null>(null)

  const existing = useMemo(
    () => new Set(existingPlates.map((plate) => normalizePlate(plate))),
    [existingPlates]
  )

  function downloadCsvTemplate() {
    const blob = new Blob([VEHICLE_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "trace-vehicles-template.csv"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  async function downloadExcelTemplate() {
    setDownloading(true)
    try {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet("vehicles")
      sheet.columns = VEHICLE_IMPORT_COLUMNS.map((column) => ({
        header: column,
        key: column,
        width: 20,
      }))
      sheet.addRow({
        plate_number: "MH 1234",
        make: "Toyota",
        model: "Corolla",
        year: 2019,
        color: "White",
        chassis_number: "CHS-001",
        engine_number: "ENG-001",
        owner_name: "John Banda",
        owner_national_id: "NID-001",
        owner_phone: "+265991234567",
        owner_district: "lilongwe",
        is_verified: true,
      })
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "trace-vehicles-template.xlsx"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Could not build the Excel template.")
    } finally {
      setDownloading(false)
    }
  }

  async function handleFile(file: File | undefined) {
    setResult(null)
    if (!file) {
      setCsvText(null)
      setXlsxRows(null)
      setFileName("")
      return
    }
    setFileName(file.name)
    if (/\.xlsx$/i.test(file.name)) {
      try {
        const buffer = await file.arrayBuffer()
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(buffer)
        const sheet = workbook.worksheets[0]
        if (!sheet) throw new Error("No worksheet found.")
        const headerRow = sheet.getRow(1)
        const headers: string[] = []
        headerRow.eachCell((cell) => {
          headers.push(String(cell.value ?? "").toLowerCase().replace(/[\s-]+/g, "_"))
        })
        const rows: Record<string, string>[] = []
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return
          const record: Record<string, string> = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1]
            if (header) record[header] = String(cell.value ?? "").trim()
          })
          if (Object.values(record).some((value) => value !== "")) rows.push(record)
        })
        setXlsxRows(rows)
        setCsvText(null)
      } catch {
        toast.error("Could not read that Excel file — try the CSV template.")
        setXlsxRows(null)
        setCsvText(null)
      }
      return
    }
    setCsvText(await file.text())
    setXlsxRows(null)
  }

  const preview = useMemo(() => {
    if (xlsxRows) {
      const rows = xlsxRows.map((record) => ({
        plateNumber: record.plate_number ?? "",
        make: record.make,
        model: record.model,
        year: record.year ? Number(record.year) : undefined,
        color: record.color,
        chassisNumber: record.chassis_number,
        engineNumber: record.engine_number,
        ownerName: record.owner_name,
        ownerNationalId: record.owner_national_id,
        ownerPhone: record.owner_phone,
        ownerDistrict: record.owner_district,
        isVerified: (record.is_verified ?? "true").trim().toLowerCase() !== "false",
      }))
      const errors = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => !normalizePlate(row.plateNumber))
        .map(({ index }) => ({ line: index + 2, message: "Missing plate_number." }))
      return { rows, errors }
    }
    if (csvText == null) return null
    return parseVehicleCsv(csvText)
  }, [csvText, xlsxRows])

  const duplicateCount = useMemo(() => {
    if (!preview) return 0
    return preview.rows.filter((row) => existing.has(normalizePlate(row.plateNumber))).length
  }, [preview, existing])

  async function runImport() {
    if (!preview || preview.rows.length === 0) {
      toast.error(preview?.errors[0]?.message ?? "No valid rows found.")
      return
    }
    if (preview.rows.length > 500) {
      toast.error("Split the file — 500 rows max per import.")
      return
    }
    setImporting(true)
    try {
      const yearFixed = preview.rows.map((row) => ({
        ...row,
        year: typeof row.year === "number" && Number.isFinite(row.year) ? row.year : undefined,
      }))
      const outcome = await bulkRegisterVehicles({ rows: yearFixed })
      setResult(outcome)
      if (preview.errors.length > 0) {
        toast.error(`${preview.errors.length} row(s) skipped before import.`)
      } else {
        toast.success(`${outcome.created} vehicle(s) imported.`)
      }
      await onImported()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Import vehicles"
      description="Excel or CSV. Duplicates — inside the file or already on file — are reported per row, never imported twice."
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Columns: plate_number (required), make, model, year, color, chassis_number,
          engine_number, owner_name, owner_national_id, owner_phone, owner_district,
          is_verified. 500 rows max.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={downloading} onClick={() => void downloadExcelTemplate()}>
            {downloading ? "Building…" : "Excel template"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={downloadCsvTemplate}>
            CSV template
          </Button>
          <Input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Vehicle import file"
            className="max-w-64"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </div>
        {preview && (
          <p className="text-xs text-muted-foreground">
            {preview.rows.length} valid row(s)
            {preview.errors.length > 0 && ` · ${preview.errors.length} skipped: ${preview.errors[0]?.message}`}
            {duplicateCount > 0 && ` · ${duplicateCount} already on file (will fail per row)`}
            {fileName && ` · ${fileName}`}
          </p>
        )}
        {result && (
          <div className="rounded-none border px-3 py-2 text-sm">
            <p className="font-medium">
              {result.created} created
              {result.failed.length > 0 && ` · ${result.failed.length} failed`}
            </p>
            {result.failed.length > 0 && (
              <ul className="mt-1 flex max-h-32 flex-col gap-0.5 overflow-y-auto text-xs text-muted-foreground">
                {result.failed.map((failure) => (
                  <li key={`${failure.row}-${failure.plate}`}>
                    Row {failure.row} ({failure.plate || "—"}): {failure.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" disabled={!preview || preview.rows.length === 0 || importing} onClick={() => void runImport()}>
            {importing ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  )
}
