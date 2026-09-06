"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  createManagedUser,
  deleteManagedUser,
  getUserDeletePreview,
  importPatientUsers,
  listHospitals,
  listManagedUsers,
  updateManagedUser,
  type ManagedUserRow,
} from "@/lib/actions/admin"
import { formatDistrict, DISTRICT_OPTIONS } from "@/lib/roles"
import { formatPhone } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  downloadPatientTemplate,
  parsePatientImportFile,
  type ParsedImportFile,
} from "@/lib/admin-import"
import type { ImportPatientRow } from "@/validations/admin"
import { managedRoleOptions } from "@/validations/admin"
import {
  AdminCombobox,
  AdminDateField,
  AdminDeleteDialog,
  AdminField,
  AdminListPagination,
  AdminSearchInput,
  AdminSection,
  AdminToggle,
  pluralCount,
} from "@/components/app/admin-section"
import { ResponsiveModal, ResponsiveModalFooter } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const PAGE_SIZE = 10

const ROLE_LABEL: Record<string, string> = {
  PATIENT: "Patient",
  DOCTOR: "Doctor",
  DISTRICT_ADMIN: "District admin",
  NATIONAL_ADMIN: "National admin",
  ADMINISTRATOR: "Administrator",
  patient: "Patient",
  doctor: "Doctor",
  district_admin: "District admin",
  country_admin: "National admin",
  administrator: "Administrator",
}

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role
}

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "doctor", label: "Doctors" },
  { value: "district_admin", label: "District admins" },
  { value: "country_admin", label: "National admins" },
  { value: "administrator", label: "Administrators" },
  { value: "patient", label: "Patients" },
]

const SEX_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
]

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  // Patients are hidden by default so medical staff stay in focus.
  const [includePatients, setIncludePatients] = useState(false)
  const [page, setPage] = useState(0)
  const [userModal, setUserModal] = useState<{ mode: "create" } | { mode: "edit"; user: ManagedUserRow } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ManagedUserRow | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const usersQuery = useQuery({
    queryKey: ["admin-users", debouncedSearch, roleFilter, includePatients, page],
    queryFn: () =>
      listManagedUsers({
        query: debouncedSearch,
        role: roleFilter === "all" ? "all" : roleFilter,
        includePatients,
        page,
        pageSize: PAGE_SIZE,
      }),
  })

  const total = usersQuery.data?.total ?? 0
  const rows = usersQuery.data?.users ?? []
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4">
      <AdminSection
        title="Users"
        description="Medical staff first — toggle patients on only when you need them."
        icon={<UsersIcon className="size-4" />}
        action={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <UploadIcon data-icon="inline-start" />
              Import
            </Button>
            <Button size="sm" onClick={() => setUserModal({ mode: "create" })}>
              <PlusIcon data-icon="inline-start" />
              New user
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <AdminSearchInput value={search} onChange={setSearch} placeholder="Search name, phone or national ID…" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="shrink-0">Role</span>
              <div className="w-44">
                <AdminCombobox
                  value={roleFilter}
                  onChange={(next) => {
                    setRoleFilter(next)
                    setPage(0)
                  }}
                  options={ROLE_FILTER_OPTIONS}
                  placeholder="All roles"
                  label="Filter by role"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AdminToggle checked={includePatients} onChange={(next) => { setIncludePatients(next); setPage(0) }} label="Show patients" />
              <span className="text-xs text-muted-foreground">
                Show patients {includePatients ? "on" : "off"}
              </span>
            </div>
          </div>
        </div>

        {usersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading users…</p>
        ) : usersQuery.isError ? (
          <p className="text-sm text-destructive">Could not load users.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {includePatients
              ? "No users match that search."
              : "No staff match that search. Toggle patients on to include patient accounts."}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatPhone(row.phone)}
                      {row.hospitalName ? ` · ${row.hospitalName}` : ""}
                      {row.district ? ` · ${formatDistrict(row.district)}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "hidden shrink-0 rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline"
                    )}
                  >
                    {roleLabel(row.role)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setUserModal({ mode: "edit", user: row })}
                    aria-label={`Edit ${row.name}`}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setDeleteTarget(row)}
                    aria-label={`Delete ${row.name}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
            <AdminListPagination page={Math.min(page, pageCount - 1)} pageCount={pageCount} onPage={setPage} />
          </div>
        )}
      </AdminSection>

      <UserModal
        modal={userModal}
        onClose={() => setUserModal(null)}
        onSaved={() => {
          setUserModal(null)
          void queryClient.invalidateQueries({ queryKey: ["admin-users"] })
        }}
      />

      {deleteTarget && (
        <UserDeleteDialog
          key={deleteTarget.id}
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null)
            void queryClient.invalidateQueries({ queryKey: ["admin-users"] })
          }}
        />
      )}

      <PatientImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          setImportOpen(false)
          void queryClient.invalidateQueries({ queryKey: ["admin-users"] })
        }}
      />
    </div>
  )
}

function UserDeleteDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: ManagedUserRow
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const { data: preview } = useQuery({
    queryKey: ["admin-user-delete-preview", target.id],
    queryFn: () => getUserDeletePreview(target.id),
  })

  async function handleConfirm() {
    setDeleting(true)
    try {
      await deleteManagedUser(target.id)
      toast.success("User deleted")
      onDeleted()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that user.")
      setDeleting(false)
    }
  }

  const consequences =
    preview === undefined
      ? ["Counting linked records…"]
      : [
          `Sign-in for ${formatPhone(target.phone)} stops immediately.`,
          preview.recordCount > 0
            ? `${pluralCount(preview.recordCount, "medical record")} under this account will be permanently deleted.`
            : "No medical records are stored under this account.",
          ...(preview.grantCount > 0
            ? [`${pluralCount(preview.grantCount, "access grant")} involving this user will be removed.`]
            : []),
          ...(preview.auditCount > 0
            ? [`${pluralCount(preview.auditCount, "audit trail entry", "audit trail entries")} tied to this user will be removed.`]
            : []),
          "Records they authored for other people are kept (author cleared).",
        ]

  return (
    <AdminDeleteDialog
      title="Delete user?"
      intro={`${target.name} (${formatPhone(target.phone)}) will lose access. Review what else goes away:`}
      consequences={consequences}
      requireText={target.name}
      requireLabel="Type the user's full name"
      confirmLabel="Delete user"
      deleting={deleting}
      onConfirm={() => void handleConfirm()}
      onClose={onClose}
    />
  )
}

interface UserFormInitial {  name: string
  phone: string
  role: string
  nationalId: string
  dateOfBirth: string
  sex: string
  district: string
  hospitalId: string
  license: string
}

const EMPTY_USER_FORM: UserFormInitial = {
  name: "",
  phone: "",
  role: "DOCTOR",
  nationalId: "",
  dateOfBirth: "",
  sex: "",
  district: "",
  hospitalId: "",
  license: "",
}

function dbRoleToUiRole(role: string): string {
  if (role === "country_admin") return "NATIONAL_ADMIN"
  return role.toUpperCase()
}

function UserModal({
  modal,
  onClose,
  onSaved,
}: {
  modal: { mode: "create" } | { mode: "edit"; user: ManagedUserRow } | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = modal?.mode === "edit" ? modal.user : null
  return (
    <ResponsiveModal
      open={modal !== null}
      onOpenChange={(open) => { if (!open) onClose() }}
      title={editing ? "Edit user" : "New user"}
      description={editing ? "Changes apply immediately." : "The user signs in with this phone number — no registration step."}
      className="sm:max-w-lg"
    >
      {modal?.mode === "edit" ? (
        <UserForm
          key={modal.user.id}
          initial={{
            name: modal.user.name,
            phone: modal.user.phone,
            role: dbRoleToUiRole(modal.user.role),
            nationalId: modal.user.nationalId ?? "",
            dateOfBirth: modal.user.dateOfBirth ?? "",
            sex: modal.user.sex ?? "",
            district: modal.user.district ?? "",
            hospitalId: modal.user.hospitalId ?? "",
            license: modal.user.medicalLicenseNo ?? "",
          }}
          submitLabel="Save changes"
          successMessage="User updated"
          onSubmit={(payload) => updateManagedUser({ ...payload, id: modal.user.id })}
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : modal ? (
        <UserForm
          key="create"
          initial={EMPTY_USER_FORM}
          submitLabel="Create user"
          successMessage="User created — they can now sign in with their phone number"
          onSubmit={createManagedUser}
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : null}
    </ResponsiveModal>
  )
}

function UserForm({
  initial,
  submitLabel,
  successMessage,
  onSubmit,
  onSaved,
  onClose,
}: {
  initial: UserFormInitial
  submitLabel: string
  successMessage: string
  onSubmit: (payload: {
    name: string
    phoneNumber: string
    role: (typeof managedRoleOptions)[number]
    nationalId: string
    dateOfBirth: string
    sex: "male" | "female" | "other" | undefined
    district: string | undefined
    hospitalId: string
    medicalLicenseNo: string
  }) => Promise<unknown>
  onSaved: () => void
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone)
  const [role, setRole] = useState<string>(initial.role)
  const [nationalId, setNationalId] = useState(initial.nationalId)
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth)
  const [sex, setSex] = useState(initial.sex)
  const [district, setDistrict] = useState(initial.district)
  const [hospitalId, setHospitalId] = useState(initial.hospitalId)
  const [license, setLicense] = useState(initial.license)

  const { data: hospitalOptions } = useQuery({
    queryKey: ["admin-hospital-options"],
    queryFn: () => listHospitals(),
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit({
        name,
        phoneNumber: phone.replace(/[\s-]/g, ""),
        role: role as (typeof managedRoleOptions)[number],
        nationalId,
        dateOfBirth,
        sex: (sex || undefined) as "male" | "female" | "other" | undefined,
        district: district || undefined,
        hospitalId,
        medicalLicenseNo: license,
      })
      toast.success(successMessage)
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that user.")
    } finally {
      setSaving(false)
    }
  }

  return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Alinafe Banda" />
          </AdminField>
          <AdminField label="Phone number" hint="+265 followed by 9 digits">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+265991234567" inputMode="tel" />
          </AdminField>
          <AdminField label="Role">
            <AdminCombobox
              value={role}
              onChange={setRole}
              options={managedRoleOptions.map((option) => ({
                value: option,
                label: roleLabel(option),
              }))}
              placeholder="Select role"
              label="Role"
            />
          </AdminField>
          <AdminField label="National ID">
            <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="Optional" />
          </AdminField>
          <AdminField label="Date of birth">
            <AdminDateField value={dateOfBirth} onChange={setDateOfBirth} label="Date of birth" />
          </AdminField>
          <AdminField label="Sex">
            <AdminCombobox
              value={sex}
              onChange={setSex}
              options={SEX_OPTIONS}
              placeholder="Not set"
              label="Sex"
            />
          </AdminField>
          <AdminField label="District">
            <AdminCombobox
              value={district}
              onChange={setDistrict}
              options={[
                { value: "", label: "Not set" },
                ...DISTRICT_OPTIONS.map((d) => ({ value: d, label: formatDistrict(d) })),
              ]}
              placeholder="Not set"
              label="District"
            />
          </AdminField>
          <AdminField label="Hospital" hint="Doctors only">
            <AdminCombobox
              value={hospitalId}
              onChange={setHospitalId}
              options={[
                { value: "", label: "None" },
                ...(hospitalOptions ?? []).map((h) => ({ value: h.id, label: h.name })),
              ]}
              placeholder="None"
              label="Hospital"
            />
          </AdminField>
        </div>
        <AdminField label="Medical licence no." hint="Doctors only">
          <Input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="Optional" />
        </AdminField>
        <ResponsiveModalFooter className="mt-1 flex-row justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
        </ResponsiveModalFooter>
      </form>
  )
}

function PatientImportModal({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null)
  const [fileName, setFileName] = useState("")

  async function handleFile(file: File | undefined) {
    if (!file) return
    setParsing(true)
    setFileName(file.name)
    try {
      setParsed(await parsePatientImportFile(file))
    } catch {
      toast.error("Could not read that file. Use the .xlsx template.")
      setParsed(null)
    } finally {
      setParsing(false)
    }
  }

  async function handleImport() {
    const rows: ImportPatientRow[] = parsed?.valid ?? []
    if (rows.length === 0) return
    setImporting(true)
    try {
      const result = await importPatientUsers(rows)
      if (result.created > 0) toast.success(`${result.created} patient${result.created === 1 ? "" : "s"} imported`)
      if (result.skipped > 0) toast.warning(`${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped (already registered)`)
      onImported()
      setParsed(null)
      setFileName("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Import patients"
      description="Excel only (.xlsx). Every row becomes a patient account — staff roles are never imported."
      className="sm:max-w-lg"
    >
      <div className="flex flex-col gap-3">
        <Button type="button" variant="outline" size="sm" onClick={downloadPatientTemplate} className="self-start">
          <DownloadIcon data-icon="inline-start" />
          Download template
        </Button>
        <AdminField label="Excel file">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => void handleFile(e.target.files?.[0])}
            aria-label="Patient Excel file"
          />
        </AdminField>
        {parsing && <p className="text-sm text-muted-foreground">Reading {fileName}…</p>}
        {parsed && (
          <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 px-3 py-2.5 text-sm">
            <p><span className="font-medium">{parsed.valid.length}</span> <span className="text-muted-foreground">ready to import</span></p>
            {parsed.invalid.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-destructive">{parsed.invalid.length} row{parsed.invalid.length === 1 ? "" : "s"} need{parsed.invalid.length === 1 ? "s" : ""} attention:</p>
                <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto text-xs text-muted-foreground">
                  {parsed.invalid.slice(0, 20).map((row) => (
                    <li key={row.rowNumber}>Row {row.rowNumber}: {row.issues.join("; ")}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <ResponsiveModalFooter className="mt-1 flex-row justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!parsed || parsed.valid.length === 0 || importing} onClick={() => void handleImport()}>
            {importing ? "Importing…" : `Import ${parsed?.valid.length ?? 0} patients`}
          </Button>
        </ResponsiveModalFooter>
      </div>
    </ResponsiveModal>
  )
}
