"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  listTaxRules,
  searchOrganizations,
  upsertTaxRule,
  type TaxRuleRow,
} from "@/lib/actions/admin"
import { taxPeriodOptions, taxTypeOptions } from "@/validations/admin"
import { EntityPicker } from "@/components/app/entity-picker"
import { AdminCombobox, AdminField } from "@/components/app/admin-section"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

const EMPTY_FORM = {
  ownerOrgId: "",
  taxType: "license_fee",
  period: "annual",
  isEnabled: false,
  amount: "",
  engineBands: "",
  dueDayOffset: "30",
}

export default function AdminTaxRulesPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-tax-rules"],
    queryFn: listTaxRules,
  })
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-tax-rules"] })
  }

  async function save(input: {
    ownerOrgId: string
    taxType: string
    period: string
    isEnabled: boolean
    amount: string
    engineBands: string
    dueDayOffset: string
  }) {
    let bands: Record<string, number> | null = null
    if (input.engineBands.trim()) {
      try {
        const parsed: unknown = JSON.parse(input.engineBands)
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("bands must be a JSON object")
        }
        bands = parsed as Record<string, number>
      } catch {
        setServerError("Engine bands must be valid JSON, e.g. {\"2000\":40000}.")
        return
      }
    }
    const amount = input.amount.trim() === "" ? null : Number(input.amount)
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setServerError("Amount must be zero or positive.")
      return
    }
    setSaving(true)
    setServerError(null)
    try {
      await upsertTaxRule({
        ownerOrgId: input.ownerOrgId,
        taxType: input.taxType as (typeof taxTypeOptions)[number],
        period: input.period as (typeof taxPeriodOptions)[number],
        isEnabled: input.isEnabled,
        amount,
        engineBands: bands,
        dueDayOffset: Number(input.dueDayOffset) || 30,
      })
      toast.success("Rule saved.")
      setForm(EMPTY_FORM)
      setCreateOpen(false)
      await refresh()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Tax automation</h1>
        <p className="text-sm text-muted-foreground">
          Reference data: which cyclical taxes self-generate, at what amounts.
          Managed by administrators — tax officers only see active rules.
        </p>
      </header>

      <div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          New rule
        </Button>
      </div>
      <ResponsiveModal
        open={createOpen}
        onOpenChange={(next) => {
          if (!next) {
            setForm(EMPTY_FORM)
            setServerError(null)
          }
          setCreateOpen(next)
        }}
        title="New automation rule"
        description="Rules generate assessments on schedule. Amounts and bands are management-set policy."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdminField label="Revenue organization">
            <EntityPicker
              label="Organization"
              placeholder="Select organization"
              value={form.ownerOrgId}
              onChange={(ownerOrgId) => setForm({ ...form, ownerOrgId })}
              source={{
                mode: "server",
                queryKey: "rule-organizations",
                fetchPage: async (query, page, pageSize) => {
                  const res = await searchOrganizations({
                    query,
                    page,
                    pageSize: pageSize + 1,
                  })
                  return {
                    items: res.items.slice(0, pageSize).map((org) => ({
                      value: org.id,
                      label: org.name,
                      detail: org.orgType.replace(/_/g, " "),
                    })),
                    hasMore: res.items.length > pageSize,
                  }
                },
              }}
            />
          </AdminField>
          <AdminField label="Tax type">
            <AdminCombobox
              label="Tax type"
              value={form.taxType}
              onChange={(taxType) => setForm({ ...form, taxType })}
              placeholder="Select tax type"
              options={taxTypeOptions.map((value) => ({
                value,
                label: value.replace(/_/g, " "),
              }))}
            />
          </AdminField>
          <AdminField label="Period">
            <AdminCombobox
              label="Period"
              value={form.period}
              onChange={(period) => setForm({ ...form, period })}
              placeholder="Select period"
              options={taxPeriodOptions.map((value) => ({
                value,
                label: value,
              }))}
            />
          </AdminField>
          <AdminField label="Due day offset">
            <Input
              value={form.dueDayOffset}
              onChange={(event) =>
                setForm({ ...form, dueDayOffset: event.target.value })
              }
              inputMode="numeric"
              className="rounded-none"
            />
          </AdminField>
          <AdminField label="Flat amount (MWK, optional)">
            <Input
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              inputMode="decimal"
              placeholder="e.g. 15000"
              className="rounded-none"
            />
          </AdminField>
          <AdminField label="Engine bands JSON (optional)">
            <Textarea
              value={form.engineBands}
              onChange={(event) =>
                setForm({ ...form, engineBands: event.target.value })
              }
              placeholder='{"2000":40000,"3000":60000,"above":90000}'
              rows={3}
            />
          </AdminField>
        </div>
        {serverError && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
            {serverError}
          </p>
        )}
        <DialogFooter className="mt-3 sm:col-span-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreateOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving || !form.ownerOrgId}
            onClick={() => void save({ ...form, isEnabled: false })}
          >
            Create disabled
          </Button>
          <Button
            type="button"
            disabled={saving || !form.ownerOrgId}
            onClick={() => void save({ ...form, isEnabled: true })}
          >
            {saving ? "Saving…" : "Create enabled"}
          </Button>
        </DialogFooter>
      </ResponsiveModal>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Rules ({data?.length ?? 0})
        </h2>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : isError ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            Could not load rules.
          </p>
        ) : !data || data.length === 0 ? (
          <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
            No rules yet — create the first above.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {data.map((rule) => (
              <RuleCard key={rule.id} rule={rule} onDone={refresh} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function RuleCard({ rule, onDone }: { rule: TaxRuleRow; onDone: () => void }) {
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    try {
      await upsertTaxRule({
        ownerOrgId: rule.ownerOrgId,
        taxType: rule.taxType as (typeof taxTypeOptions)[number],
        period: rule.period as (typeof taxPeriodOptions)[number],
        isEnabled: !rule.isEnabled,
        amount: rule.amount == null ? null : Number(rule.amount),
        engineBands: rule.engineBands,
        dueDayOffset: rule.dueDayOffset,
      })
      toast.success(rule.isEnabled ? "Rule disabled." : "Rule enabled.")
      await onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-none border bg-card px-4 py-3">
      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
        <span>
          {rule.taxType.replace(/_/g, " ")} · {rule.period}
        </span>
        <span
          className={
            rule.isEnabled
              ? "inline-flex items-center rounded-none border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700"
              : "inline-flex items-center rounded-none border px-1.5 py-0.5 text-xs text-muted-foreground"
          }
        >
          {rule.isEnabled ? "enabled" : "disabled"}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">
        {rule.ownerOrgName ?? rule.ownerOrgId}
        {rule.amount != null ? ` · MWK ${rule.amount}` : ""}
        {rule.engineBands ? ` · bands ${Object.keys(rule.engineBands).length}` : ""}
        {` · due +${rule.dueDayOffset}d`}
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={rule.isEnabled ? "outline" : "default"}
          disabled={busy}
          onClick={() => void toggle()}
        >
          {rule.isEnabled ? "Disable" : "Enable"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setEditOpen(true)}
        >
          Edit
        </Button>
      </div>
      <EditRuleDialog
        rule={rule}
        open={editOpen}
        onOpenChange={setEditOpen}
        onDone={onDone}
      />
    </li>
  )
}

function EditRuleDialog({
  rule,
  open,
  onOpenChange,
  onDone,
}: {
  rule: TaxRuleRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState(rule.amount ?? "")
  const [dueDayOffset, setDueDayOffset] = useState(String(rule.dueDayOffset))
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    const parsedAmount = amount === "" ? null : Number(amount)
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      setServerError("Amount must be zero or positive.")
      return
    }
    setSaving(true)
    setServerError(null)
    try {
      await upsertTaxRule({
        ownerOrgId: rule.ownerOrgId,
        taxType: rule.taxType as (typeof taxTypeOptions)[number],
        period: rule.period as (typeof taxPeriodOptions)[number],
        isEnabled: rule.isEnabled,
        amount: parsedAmount,
        engineBands: rule.engineBands,
        dueDayOffset: Number(dueDayOffset) || 30,
      })
      toast.success("Rule saved.")
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
        if (!next) {
          setAmount(rule.amount ?? "")
          setDueDayOffset(String(rule.dueDayOffset))
          setServerError(null)
        }
        onOpenChange(next)
      }}
      title="Edit rule"
      description={`${rule.taxType.replace(/_/g, " ")} · ${rule.period} · ${rule.ownerOrgName ?? ""}. Band changes go through the create form.`}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <AdminField label="Flat amount (MWK, empty = bands only)">
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="e.g. 15000"
            className="rounded-none"
          />
        </AdminField>
        <AdminField label="Due day offset">
          <Input
            value={dueDayOffset}
            onChange={(event) => setDueDayOffset(event.target.value)}
            inputMode="numeric"
            className="rounded-none"
          />
        </AdminField>
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
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save rule"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}
