"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { bulkCreatePolicies, listPolicies } from "@/lib/actions/insurance"
import { insurerPlateLookup } from "@/lib/actions/access"
import { isPolicyLive } from "@/lib/visibility"
import {
  daysUntil,
  expiryTone,
  formatCountdown,
  parsePolicyCsv,
  POLICY_CSV_TEMPLATE,
} from "@/lib/format"
import { TONE_BADGE_CLASS } from "@/lib/record-meta"
import { cn } from "@/lib/utils"
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
  const [csvText, setCsvText] = useState<string | null>(null)
  const [csvName, setCsvName] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    created: number
    failed: { row: number; plate: string; error: string }[]
  } | null>(null)

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

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Our policies
        </h2>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : isError ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            Could not load policies.
          </p>
        ) : !data || data.length === 0 ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            No policies yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.map((policy) => {
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
                    {policy.startDate} → {policy.endDate}
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
