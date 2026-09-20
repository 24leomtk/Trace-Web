"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArchiveIcon, PlusIcon, ShieldCheckIcon } from "lucide-react"
import { toast } from "sonner"

import {
  bulkCreatePolicies,
  createPolicy,
  listPolicies,
} from "@/lib/actions/insurance"
import { insurerPlateLookup } from "@/lib/actions/access"
import { searchVehicles } from "@/lib/actions/vehicles"
import { isPolicyLive } from "@/lib/visibility"
import {
  daysUntil,
  expiryTone,
  formatCountdown,
  formatDateShort,
  normalizePlate,
  parsePolicyCsv,
  POLICY_CSV_TEMPLATE,
} from "@/lib/format"
import { TONE_BADGE_CLASS } from "@/lib/record-meta"
import { cn } from "@/lib/utils"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListFilter, ListFilterBadges } from "@/components/app/list-filter"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { GridCardListSkeleton } from "@/components/app/list-skeletons"
import { SearchInput } from "@/components/app/search-input"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function InsurerHome() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-policies"],
    queryFn: listPolicies,
  })
  const [plate, setPlate] = useState("")
  const [flagResult, setFlagResult] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [csvText, setCsvText] = useState<string | null>(null)
  const [csvName, setCsvName] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    created: number
    failed: { row: number; plate: string; error: string }[]
  } | null>(null)
  const [policyOpen, setPolicyOpen] = useState(false)

  async function checkFlag(event: React.SubmitEvent) {
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

  function downloadTemplate() {
    const blob = new Blob([POLICY_CSV_TEMPLATE], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "trace-policies-template.csv"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  async function handleCsvFile(file: File | undefined) {
    setImportResult(null)
    if (!file) {
      setCsvText(null)
      setCsvName("")
      return
    }
    setCsvName(file.name)
    setCsvText(await file.text())
  }

  async function runImport() {
    if (!csvText) return
    const parsed = parsePolicyCsv(csvText)
    if (parsed.rows.length === 0) {
      toast.error(parsed.errors[0]?.message ?? "No valid rows found.")
      return
    }
    if (parsed.rows.length > 500) {
      toast.error("Split the file — 500 rows max per import.")
      return
    }
    setImporting(true)
    try {
      const result = await bulkCreatePolicies({ rows: parsed.rows })
      setImportResult(result)
      if (parsed.errors.length > 0) {
        toast.error(`${parsed.errors.length} row(s) skipped before import.`)
      } else {
        toast.success(`${result.created} polic(ies) imported.`)
      }
      void queryClient.invalidateQueries({ queryKey: ["my-policies"] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Insurance portal</h1>
          <p className="text-sm text-muted-foreground">
            Your organization&apos;s policies. Flag checks return yes/no only.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setPolicyOpen(true)}
          className="shrink-0"
        >
          <PlusIcon data-icon="inline-start" />
          New policy
        </Button>
      </header>

      <PolicyDialog
        open={policyOpen}
        onOpenChange={setPolicyOpen}
        onDone={() =>
          void queryClient.invalidateQueries({ queryKey: ["my-policies"] })
        }
      />

      <form onSubmit={checkFlag} className="flex gap-2">
        <Input
          value={plate}
          onChange={(event) => setPlate(event.target.value)}
          placeholder="Plate number, e.g. MH 1234"
          className="rounded-none"
        />
        <Button type="submit" disabled={checking}>
          {checking ? "Checking…" : "Flag check"}
        </Button>
      </form>
      {flagResult !== null && (
        <p
          className={`rounded-none border px-4 py-3 text-sm font-medium ${
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
          Bulk import
        </h2>
        <p className="text-xs text-muted-foreground">
          CSV with plate_number, policy_number, start_date, end_date (optional
          coverage_type, is_active, external_reference). Vehicles must already
          be on file — unknown plates come back as row errors. 500 rows max.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadTemplate}
          >
            Template
          </Button>
          <Input
            type="file"
            accept=".csv,text/csv"
            aria-label="Policy CSV file"
            className="max-w-64"
            onChange={(event) => void handleCsvFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            size="sm"
            disabled={!csvText || importing}
            onClick={() => void runImport()}
          >
            {importing ? "Importing…" : `Import${csvName ? ` ${csvName}` : ""}`}
          </Button>
        </div>
        {csvText != null &&
          (() => {
            const preview = parsePolicyCsv(csvText)
            return (
              <p className="text-xs text-muted-foreground">
                {preview.rows.length} valid row(s)
                {preview.errors.length > 0 &&
                  ` · ${preview.errors.length} skipped: ${preview.errors[0]?.message}`}
              </p>
            )
          })()}
        {importResult && (
          <div className="rounded-none border px-3 py-2 text-sm">
            <p className="font-medium">
              {importResult.created} created
              {importResult.failed.length > 0 &&
                ` · ${importResult.failed.length} failed`}
            </p>
            {importResult.failed.length > 0 && (
              <ul className="mt-1 flex max-h-32 flex-col gap-0.5 overflow-y-auto text-xs text-muted-foreground">
                {importResult.failed.map((failure) => (
                  <li key={`${failure.row}-${failure.plate}`}>
                    Row {failure.row} ({failure.plate || "—"}): {failure.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <PoliciesSection data={data} isLoading={isLoading} isError={isError} />
    </div>
  )
}

const POLICY_STATUS_OPTIONS = [
  { value: "live", label: "Live", icon: ShieldCheckIcon },
  { value: "expired", label: "Expired / lapsed", icon: ArchiveIcon },
]

/**
 * Manual single-policy entry — same shape as a bulk-import row, but the
 * vehicle is resolved by plate first (policies only attach to vehicles
 * already on file). Mirrors the tax AssessDialog layout.
 */
function PolicyDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [plate, setPlate] = useState("")
  const [vehicle, setVehicle] = useState<{
    id: string
    plateNumber: string
  } | null>(null)
  const [looking, setLooking] = useState(false)
  const [policyNumber, setPolicyNumber] = useState("")
  const [coverageType, setCoverageType] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [status, setStatus] = useState("active")
  const [externalReference, setExternalReference] = useState("")
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  function reset() {
    setPlate("")
    setVehicle(null)
    setPolicyNumber("")
    setCoverageType("")
    setStartDate("")
    setEndDate("")
    setStatus("active")
    setExternalReference("")
    setServerError(null)
  }

  async function lookup() {
    const normalized = normalizePlate(plate)
    if (!normalized) return
    setLooking(true)
    try {
      const matches = await searchVehicles(normalized, 5)
      const found =
        matches.find((row) => normalizePlate(row.plateNumber) === normalized) ??
        null
      setVehicle(found)
      if (!found)
        toast.error("Vehicle not on file — it must be registered first.")
    } catch {
      toast.error("Lookup failed.")
    } finally {
      setLooking(false)
    }
  }

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!vehicle) {
      toast.error("Look up the vehicle first.")
      return
    }
    if (!policyNumber.trim()) {
      toast.error("Enter a policy number.")
      return
    }
    if (!startDate || !endDate) {
      toast.error("Choose a start and end date.")
      return
    }
    if (endDate < startDate) {
      toast.error("End date can't be before the start date.")
      return
    }
    setSaving(true)
    setServerError(null)
    try {
      await createPolicy({
        vehicleId: vehicle.id,
        policyNumber: policyNumber.trim(),
        coverageType: coverageType.trim(),
        startDate,
        endDate,
        isActive: status === "active",
        externalReference: externalReference.trim(),
      })
      toast.success("Policy recorded.")
      reset()
      onOpenChange(false)
      await onDone()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="New policy"
      description="The policy attaches to a vehicle already on file — unknown plates can't be insured here."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Vehicle
          </span>
          <div className="flex gap-2">
            <Input
              value={plate}
              onChange={(event) => {
                setPlate(event.target.value)
                setVehicle(null)
              }}
              placeholder="Plate number, e.g. MH 1234"
              aria-label="Plate number"
            />
            <Button
              type="button"
              variant="outline"
              disabled={looking}
              onClick={lookup}
            >
              {looking ? "…" : "Find"}
            </Button>
          </div>
          {vehicle && (
            <p className="text-xs text-emerald-700">
              On file: {vehicle.plateNumber}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Policy number
          </span>
          <Input
            value={policyNumber}
            onChange={(event) => setPolicyNumber(event.target.value)}
            placeholder="e.g. POL-2026-001"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Coverage{" "}
            <span className="font-normal normal-case opacity-60">optional</span>
          </span>
          <Input
            value={coverageType}
            onChange={(event) => setCoverageType(event.target.value)}
            placeholder="e.g. Comprehensive"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Start date
            </span>
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              label="Start date"
              placeholder="Start date"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              End date
            </span>
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              label="End date"
              placeholder="End date"
              min={startDate || undefined}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Status
          </span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Policy status">
              <SelectValue placeholder="Select status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            External reference{" "}
            <span className="font-normal normal-case opacity-60">optional</span>
          </span>
          <Input
            value={externalReference}
            onChange={(event) => setExternalReference(event.target.value)}
            placeholder="Reference in your own system"
          />
        </div>
        {serverError && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {serverError}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !vehicle}>
            {saving ? "Recording…" : "Record policy"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function PoliciesSection({
  data,
  isLoading,
  isError,
}: {
  data: Awaited<ReturnType<typeof listPolicies>> | undefined
  isLoading: boolean
  isError: boolean
}) {
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const [status, setStatus] = useState("all")

  const preFiltered = useMemo(
    () =>
      (data ?? []).filter((policy) => {
        const live = isPolicyLive(policy)
        if (status === "live") return live
        if (status === "expired") return !live
        return true
      }),
    [data, status]
  )

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
    items: preFiltered,
    resetKey: status,
    search: (policy, q) =>
      `${policy.plateNumber} ${policy.policyNumber} ${policy.coverageType ?? ""}`
        .toLowerCase()
        .includes(q),
  })

  const hasActiveFilter = status !== "all" || debouncedQuery !== ""

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Our policies
      </h2>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search plate or policy number…"
            className="flex-1"
          />
          <ListRefreshButton
            onRefresh={async () => {
              setRefreshing(true)
              try {
                await queryClient.invalidateQueries({
                  queryKey: ["my-policies"],
                })
              } finally {
                setRefreshing(false)
              }
            }}
            loading={refreshing}
          />
          <ListFilter
            title="Filter policies"
            description="Narrow by policy status."
            heading="Status"
            allLabel="All statuses"
            options={POLICY_STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
            showBadges={false}
          />
        </div>
        <ListFilterBadges
          heading="Status"
          options={POLICY_STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
        />
      </div>
      {isLoading ? (
        <GridCardListSkeleton count={4} />
      ) : isError ? (
        <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          Could not load policies.
        </p>
      ) : !data || data.length === 0 ? (
        <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          No policies yet.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          {hasActiveFilter
            ? "No policies match the current search and filters."
            : "No policies yet."}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {visible.map((policy) => {
              const live = isPolicyLive(policy)
              const left = daysUntil(
                typeof policy.endDate === "string"
                  ? policy.endDate
                  : new Date(policy.endDate).toISOString()
              )
              const tone = live ? expiryTone(left) : "slate"
              return (
                <li
                  key={policy.id}
                  className="rounded-none border bg-card px-4 py-3"
                >
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                    <span>
                      {policy.plateNumber} · {policy.policyNumber}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-none border px-1.5 py-0.5 text-xs",
                        TONE_BADGE_CLASS[tone]
                      )}
                    >
                      {live ? formatCountdown(left) : "expired/lapsed"}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {policy.coverageType || "Standard cover"} ·{" "}
                    {formatDateShort(policy.startDate)} →{" "}
                    {formatDateShort(policy.endDate)}
                  </p>
                </li>
              )
            })}
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
