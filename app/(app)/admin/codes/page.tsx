"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ClipboardListIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  SyringeIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  deleteDiagnosisCode,
  deleteImmunizationCode,
  deleteMedicationCode,
  deleteTreatmentGuideline,
  listDiagnosisCodes,
  listImmunizationCodes,
  listMedicationCodes,
  listTreatmentGuidelines,
  upsertDiagnosisCode,
  upsertImmunizationCode,
  upsertMedicationCode,
  upsertTreatmentGuideline,
} from "@/lib/actions/admin"
import { cn } from "@/lib/utils"
import {
  AdminCombobox,
  AdminField,
  AdminListPagination,
  AdminSearchInput,
  AdminSection,
} from "@/components/app/admin-section"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ResponsiveModal, ResponsiveModalFooter } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const PAGE_SIZE = 10

type Tab = "diagnoses" | "medications" | "immunizations" | "guidelines"

const TABS: Array<{ value: Tab; label: string; icon: typeof ClipboardListIcon }> = [
  { value: "diagnoses", label: "Diagnoses", icon: ClipboardListIcon },
  { value: "medications", label: "Medications", icon: ShieldCheckIcon },
  { value: "immunizations", label: "Vaccines", icon: SyringeIcon },
  { value: "guidelines", label: "Guidelines", icon: ClipboardListIcon },
]

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function AdminCodesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading codebooks…</p>}>
      <CodesBody />
    </Suspense>
  )
}

function CodesBody() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = (searchParams.get("tab") as Tab) || "diagnoses"
  const active: Tab = TABS.some((t) => t.value === tab) ? tab : "diagnoses"

  function setTab(next: Tab) {
    router.replace(`/admin/codes?tab=${next}`, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1 rounded-[min(var(--radius-3xl),20px)] border bg-card p-1.5" role="tablist" aria-label="Codebooks">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={active === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors",
              active === t.value ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {active === "diagnoses" && <DiagnosesPanel />}
      {active === "medications" && <MedicationsPanel />}
      {active === "immunizations" && <ImmunizationsPanel />}
      {active === "guidelines" && <GuidelinesPanel />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diagnoses
// ---------------------------------------------------------------------------

interface DiagnosisRow {
  icd10Code: string
  name: string
  description: string
  isInfectious: boolean
  threatLevel: string | null
}

function DiagnosesPanel() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [page, setPage] = useState(0)
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; row: DiagnosisRow } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DiagnosisRow | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const query = useQuery({ queryKey: ["admin-dx", debounced], queryFn: () => listDiagnosisCodes(debounced) })
  const del = useMutation({
    mutationFn: (code: string) => deleteDiagnosisCode(code),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-dx"] }); toast.success("Diagnosis code deleted") },
    onError: (e) => toast.error(errorMessage(e, "Could not delete that code.")),
  })

  const rows = query.data ?? []
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const paginated = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <AdminSection
      title="Diagnosis codes"
      description="ICD-10 codebook. Threat level drives surveillance — mark infectious diseases carefully."
      icon={<ClipboardListIcon className="size-4" />}
      action={<Button size="sm" onClick={() => setModal({ mode: "create" })}><PlusIcon data-icon="inline-start" />New code</Button>}
    >
      <AdminSearchInput value={search} onChange={setSearch} placeholder="Search code or name…" />
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : query.isError ? <p className="text-sm text-destructive">Could not load codes.</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">No diagnosis codes yet.</p>
        : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {paginated.map((row) => (
                <li key={row.icd10Code} className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{row.icd10Code} · {row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.description}
                      {row.isInfectious ? ` · infectious${row.threatLevel ? ` · ${row.threatLevel}` : ""}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-xs" onClick={() => setModal({ mode: "edit", row })} aria-label={`Edit ${row.icd10Code}`}><PencilIcon className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(row)} aria-label={`Delete ${row.icd10Code}`} className="text-destructive hover:text-destructive"><Trash2Icon className="size-3.5" /></Button>
                </li>
              ))}
            </ul>
            <AdminListPagination page={current} pageCount={pageCount} onPage={setPage} />
          </div>
        )}

      <DiagnosisModal
        modal={modal}
        onClose={() => setModal(null)}
        onSaved={() => { setModal(null); void queryClient.invalidateQueries({ queryKey: ["admin-dx"] }) }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title="Delete diagnosis code?"
        description={`${deleteTarget?.icd10Code} will be removed. Records already coded keep their history.`}
        confirmLabel="Delete code"
        destructive
        onConfirm={() => { if (deleteTarget) void del.mutateAsync(deleteTarget.icd10Code).then(() => setDeleteTarget(null)).catch(() => {}) }}
      />
    </AdminSection>
  )
}

interface DiagnosisFormInitial {
  code: string
  name: string
  description: string
  isInfectious: boolean
  threatLevel: string
}

const EMPTY_DIAGNOSIS_FORM: DiagnosisFormInitial = {
  code: "",
  name: "",
  description: "",
  isInfectious: false,
  threatLevel: "none",
}

const THREAT_LEVEL_OPTIONS = [
  { value: "none", label: "None" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
]

function DiagnosisModal({
  modal, onClose, onSaved,
}: {
  modal: { mode: "create" } | { mode: "edit"; row: DiagnosisRow } | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = modal?.mode === "edit" ? modal.row : null
  return (
    <ResponsiveModal open={modal !== null} onOpenChange={(o) => { if (!o) onClose() }} title={editing ? "Edit diagnosis code" : "New diagnosis code"}>
      {modal?.mode === "edit" ? (
        <DiagnosisForm
          key={modal.row.icd10Code}
          initial={{
            code: modal.row.icd10Code,
            name: modal.row.name,
            description: modal.row.description,
            isInfectious: modal.row.isInfectious,
            threatLevel: modal.row.threatLevel ?? "none",
          }}
          submitLabel="Save changes"
          successMessage="Diagnosis code updated"
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : modal ? (
        <DiagnosisForm
          key="create"
          initial={EMPTY_DIAGNOSIS_FORM}
          submitLabel="Add code"
          successMessage="Diagnosis code added"
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : null}
    </ResponsiveModal>
  )
}

function DiagnosisForm({
  initial, submitLabel, successMessage, onSaved, onClose,
}: {
  initial: DiagnosisFormInitial
  submitLabel: string
  successMessage: string
  onSaved: () => void
  onClose: () => void
}) {
  const [code, setCode] = useState(initial.code)
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [isInfectious, setIsInfectious] = useState(initial.isInfectious)
  const [threatLevel, setThreatLevel] = useState(initial.threatLevel)
  const [saving, setSaving] = useState(false)
  const isEditing = initial.code !== ""

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await upsertDiagnosisCode({ icd10Code: code, name, description, isInfectious, threatLevel: threatLevel as "none" | "moderate" | "high" | "critical" })
      toast.success(successMessage)
      onSaved()
    } catch (error) { toast.error(errorMessage(error, "Could not save that code.")) } finally { setSaving(false) }
  }

  return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="ICD-10 code"><Input value={code} onChange={(e) => setCode(e.target.value)} required disabled={isEditing} placeholder="A00" /></AdminField>
          <AdminField label="Threat level">
            <AdminCombobox
              value={threatLevel}
              onChange={setThreatLevel}
              options={THREAT_LEVEL_OPTIONS}
              placeholder="Select threat level"
              label="Threat level"
            />
          </AdminField>
        </div>
        <AdminField label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></AdminField>
        <AdminField label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} required minLength={2} /></AdminField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isInfectious} onChange={(e) => setIsInfectious(e.target.checked)} className="size-4 accent-current" />
          Infectious / notifiable disease
        </label>
        <ResponsiveModalFooter className="mt-1 flex-row justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
        </ResponsiveModalFooter>
      </form>
  )
}

// ---------------------------------------------------------------------------
// Medications
// ---------------------------------------------------------------------------

interface MedicationRow { code: string; name: string; category: string | null }

function MedicationsPanel() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [page, setPage] = useState(0)
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; row: MedicationRow } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MedicationRow | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const query = useQuery({ queryKey: ["admin-rx", debounced], queryFn: () => listMedicationCodes(debounced) })
  const del = useMutation({
    mutationFn: (code: string) => deleteMedicationCode(code),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-rx"] }); toast.success("Medication deleted") },
    onError: (e) => toast.error(errorMessage(e, "Could not delete that medication.")),
  })

  const rows = query.data ?? []
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const paginated = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <AdminSection
      title="Medication codes"
      description="Formulary behind every prescription."
      icon={<ShieldCheckIcon className="size-4" />}
      action={<Button size="sm" onClick={() => setModal({ mode: "create" })}><PlusIcon data-icon="inline-start" />New medication</Button>}
    >
      <AdminSearchInput value={search} onChange={setSearch} placeholder="Search code or name…" />
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : query.isError ? <p className="text-sm text-destructive">Could not load medications.</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">No medications yet.</p>
        : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {paginated.map((row) => (
                <li key={row.code} className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{row.code} · {row.name}</p>
                    {row.category && <p className="truncate text-xs text-muted-foreground">{row.category}</p>}
                  </div>
                  <Button variant="ghost" size="icon-xs" onClick={() => setModal({ mode: "edit", row })} aria-label={`Edit ${row.code}`}><PencilIcon className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(row)} aria-label={`Delete ${row.code}`} className="text-destructive hover:text-destructive"><Trash2Icon className="size-3.5" /></Button>
                </li>
              ))}
            </ul>
            <AdminListPagination page={current} pageCount={pageCount} onPage={setPage} />
          </div>
        )}

      <MedicationModal modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); void queryClient.invalidateQueries({ queryKey: ["admin-rx"] }) }} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title="Delete medication?"
        description={`${deleteTarget?.code} will be removed from the formulary.`}
        confirmLabel="Delete medication"
        destructive
        onConfirm={() => { if (deleteTarget) void del.mutateAsync(deleteTarget.code).then(() => setDeleteTarget(null)).catch(() => {}) }}
      />
    </AdminSection>
  )
}

interface MedicationFormInitial { code: string; name: string; category: string }

const EMPTY_MEDICATION_FORM: MedicationFormInitial = { code: "", name: "", category: "" }

function MedicationModal({
  modal, onClose, onSaved,
}: {
  modal: { mode: "create" } | { mode: "edit"; row: MedicationRow } | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = modal?.mode === "edit" ? modal.row : null
  return (
    <ResponsiveModal open={modal !== null} onOpenChange={(o) => { if (!o) onClose() }} title={editing ? "Edit medication" : "New medication"}>
      {modal?.mode === "edit" ? (
        <MedicationForm
          key={modal.row.code}
          initial={{ code: modal.row.code, name: modal.row.name, category: modal.row.category ?? "" }}
          submitLabel="Save changes"
          successMessage="Medication updated"
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : modal ? (
        <MedicationForm
          key="create"
          initial={EMPTY_MEDICATION_FORM}
          submitLabel="Add medication"
          successMessage="Medication added"
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : null}
    </ResponsiveModal>
  )
}

function MedicationForm({
  initial, submitLabel, successMessage, onSaved, onClose,
}: {
  initial: MedicationFormInitial
  submitLabel: string
  successMessage: string
  onSaved: () => void
  onClose: () => void
}) {
  const [code, setCode] = useState(initial.code)
  const [name, setName] = useState(initial.name)
  const [category, setCategory] = useState(initial.category)
  const [saving, setSaving] = useState(false)
  const isEditing = initial.code !== ""

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await upsertMedicationCode({ code, name, category })
      toast.success(successMessage)
      onSaved()
    } catch (error) { toast.error(errorMessage(error, "Could not save that medication.")) } finally { setSaving(false) }
  }

  return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <AdminField label="Code"><Input value={code} onChange={(e) => setCode(e.target.value)} required disabled={isEditing} placeholder="AMOXICILLIN_250" /></AdminField>
        <AdminField label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></AdminField>
        <AdminField label="Category"><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Antibiotic" /></AdminField>
        <ResponsiveModalFooter className="mt-1 flex-row justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
        </ResponsiveModalFooter>
      </form>
  )
}

// ---------------------------------------------------------------------------
// Immunizations
// ---------------------------------------------------------------------------

interface VaccineRow { vaccineCode: string; name: string }

function ImmunizationsPanel() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [page, setPage] = useState(0)
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; row: VaccineRow } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VaccineRow | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const query = useQuery({ queryKey: ["admin-vx", debounced], queryFn: () => listImmunizationCodes(debounced) })
  const del = useMutation({
    mutationFn: (code: string) => deleteImmunizationCode(code),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-vx"] }); toast.success("Vaccine deleted") },
    onError: (e) => toast.error(errorMessage(e, "Could not delete that vaccine.")),
  })

  const rows = query.data ?? []
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const paginated = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <AdminSection
      title="Immunization codes"
      description="Vaccine codebook behind the immunization schedule."
      icon={<SyringeIcon className="size-4" />}
      action={<Button size="sm" onClick={() => setModal({ mode: "create" })}><PlusIcon data-icon="inline-start" />New vaccine</Button>}
    >
      <AdminSearchInput value={search} onChange={setSearch} placeholder="Search code or name…" />
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : query.isError ? <p className="text-sm text-destructive">Could not load vaccines.</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">No vaccines yet.</p>
        : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {paginated.map((row) => (
                <li key={row.vaccineCode} className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{row.vaccineCode} · {row.name}</p>
                  </div>
                  <Button variant="ghost" size="icon-xs" onClick={() => setModal({ mode: "edit", row })} aria-label={`Edit ${row.vaccineCode}`}><PencilIcon className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(row)} aria-label={`Delete ${row.vaccineCode}`} className="text-destructive hover:text-destructive"><Trash2Icon className="size-3.5" /></Button>
                </li>
              ))}
            </ul>
            <AdminListPagination page={current} pageCount={pageCount} onPage={setPage} />
          </div>
        )}

      <VaccineModal modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); void queryClient.invalidateQueries({ queryKey: ["admin-vx"] }) }} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title="Delete vaccine?"
        description={`${deleteTarget?.vaccineCode} will be removed from the codebook.`}
        confirmLabel="Delete vaccine"
        destructive
        onConfirm={() => { if (deleteTarget) void del.mutateAsync(deleteTarget.vaccineCode).then(() => setDeleteTarget(null)).catch(() => {}) }}
      />
    </AdminSection>
  )
}

interface VaccineFormInitial { code: string; name: string }

const EMPTY_VACCINE_FORM: VaccineFormInitial = { code: "", name: "" }

function VaccineModal({
  modal, onClose, onSaved,
}: {
  modal: { mode: "create" } | { mode: "edit"; row: VaccineRow } | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = modal?.mode === "edit" ? modal.row : null
  return (
    <ResponsiveModal open={modal !== null} onOpenChange={(o) => { if (!o) onClose() }} title={editing ? "Edit vaccine" : "New vaccine"}>
      {modal?.mode === "edit" ? (
        <VaccineForm
          key={modal.row.vaccineCode}
          initial={{ code: modal.row.vaccineCode, name: modal.row.name }}
          submitLabel="Save changes"
          successMessage="Vaccine updated"
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : modal ? (
        <VaccineForm
          key="create"
          initial={EMPTY_VACCINE_FORM}
          submitLabel="Add vaccine"
          successMessage="Vaccine added"
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : null}
    </ResponsiveModal>
  )
}

function VaccineForm({
  initial, submitLabel, successMessage, onSaved, onClose,
}: {
  initial: VaccineFormInitial
  submitLabel: string
  successMessage: string
  onSaved: () => void
  onClose: () => void
}) {
  const [code, setCode] = useState(initial.code)
  const [name, setName] = useState(initial.name)
  const [saving, setSaving] = useState(false)
  const isEditing = initial.code !== ""

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await upsertImmunizationCode({ vaccineCode: code, name })
      toast.success(successMessage)
      onSaved()
    } catch (error) { toast.error(errorMessage(error, "Could not save that vaccine.")) } finally { setSaving(false) }
  }

  return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <AdminField label="Vaccine code"><Input value={code} onChange={(e) => setCode(e.target.value)} required disabled={isEditing} placeholder="BCG" /></AdminField>
        <AdminField label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></AdminField>
        <ResponsiveModalFooter className="mt-1 flex-row justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
        </ResponsiveModalFooter>
      </form>
  )
}

// ---------------------------------------------------------------------------
// Treatment guidelines
// ---------------------------------------------------------------------------

interface GuidelineRow {
  icd10Code: string
  medicationCode: string
  isFirstLine: boolean
  diagnosisName: string | null
  medicationName: string | null
}

function GuidelinesPanel() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [page, setPage] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<GuidelineRow | null>(null)

  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const query = useQuery({ queryKey: ["admin-stg", debounced], queryFn: () => listTreatmentGuidelines(debounced) })
  const del = useMutation({
    mutationFn: (row: GuidelineRow) => deleteTreatmentGuideline(row.icd10Code, row.medicationCode),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin-stg"] }); toast.success("Guideline removed") },
    onError: (e) => toast.error(errorMessage(e, "Could not remove that guideline.")),
  })

  const rows = query.data ?? []
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const paginated = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <AdminSection
      title="Treatment guidelines"
      description="Which medications are first-line for each diagnosis."
      icon={<ClipboardListIcon className="size-4" />}
      action={<Button size="sm" onClick={() => setCreateOpen(true)}><PlusIcon data-icon="inline-start" />New link</Button>}
    >
      <AdminSearchInput value={search} onChange={setSearch} placeholder="Search diagnosis or medication…" />
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : query.isError ? <p className="text-sm text-destructive">Could not load guidelines.</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">No guideline links yet.</p>
        : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {paginated.map((row) => (
                <li key={`${row.icd10Code}:${row.medicationCode}`} className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{row.icd10Code} → {row.medicationCode}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.diagnosisName ?? row.icd10Code} · {row.medicationName ?? row.medicationCode}
                    </p>
                  </div>
                  <span className={cn("hidden shrink-0 rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline")}>
                    {row.isFirstLine ? "First-line" : "Second-line"}
                  </span>
                  <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(row)} aria-label={`Remove ${row.icd10Code} ${row.medicationCode}`} className="text-destructive hover:text-destructive"><Trash2Icon className="size-3.5" /></Button>
                </li>
              ))}
            </ul>
            <AdminListPagination page={current} pageCount={pageCount} onPage={setPage} />
          </div>
        )}

      <GuidelineModal open={createOpen} onOpenChange={setCreateOpen} onSaved={() => { setCreateOpen(false); void queryClient.invalidateQueries({ queryKey: ["admin-stg"] }) }} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title="Remove guideline link?"
        description={`${deleteTarget?.icd10Code} → ${deleteTarget?.medicationCode} will no longer be suggested.`}
        confirmLabel="Remove link"
        destructive
        onConfirm={() => { if (deleteTarget) void del.mutateAsync(deleteTarget).then(() => setDeleteTarget(null)).catch(() => {}) }}
      />
    </AdminSection>
  )
}

function GuidelineModal({
  open, onOpenChange, onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="New guideline link" description="Links a diagnosis to a first- or second-line medication.">
      {open ? <GuidelineForm key="create" onSaved={onSaved} onClose={() => onOpenChange(false)} /> : null}
    </ResponsiveModal>
  )
}

function GuidelineForm({
  onSaved, onClose,
}: {
  onSaved: () => void
  onClose: () => void
}) {
  const [icd10Code, setIcd10Code] = useState("")
  const [medicationCode, setMedicationCode] = useState("")
  const [isFirstLine, setIsFirstLine] = useState(true)
  const [saving, setSaving] = useState(false)

  const { data: dxOptions } = useQuery({ queryKey: ["admin-dx-options"], queryFn: () => listDiagnosisCodes() })
  const { data: rxOptions } = useQuery({ queryKey: ["admin-rx-options"], queryFn: () => listMedicationCodes() })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!icd10Code || !medicationCode) {
      toast.error("Select both a diagnosis and a medication.")
      return
    }
    setSaving(true)
    try {
      await upsertTreatmentGuideline({ icd10Code, medicationCode, isFirstLine })
      toast.success("Guideline link saved")
      onSaved()
    } catch (error) { toast.error(errorMessage(error, "Could not save that link. Check both codes exist.")) } finally { setSaving(false) }
  }

  return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <AdminField label="Diagnosis">
          <AdminCombobox
            value={icd10Code}
            onChange={setIcd10Code}
            options={(dxOptions ?? []).map((d) => ({
              value: d.icd10Code,
              label: d.name,
              detail: d.icd10Code,
            }))}
            placeholder="Select diagnosis…"
            label="Diagnosis"
          />
        </AdminField>
        <AdminField label="Medication">
          <AdminCombobox
            value={medicationCode}
            onChange={setMedicationCode}
            options={(rxOptions ?? []).map((m) => ({
              value: m.code,
              label: m.name,
              detail: m.code,
            }))}
            placeholder="Select medication…"
            label="Medication"
          />
        </AdminField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFirstLine} onChange={(e) => setIsFirstLine(e.target.checked)} className="size-4 accent-current" />
          First-line treatment
        </label>
        <ResponsiveModalFooter className="mt-1 flex-row justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save link"}</Button>
        </ResponsiveModalFooter>
      </form>
  )
}
