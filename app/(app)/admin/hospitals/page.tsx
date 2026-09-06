"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BuildingIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  deleteHospital,
  getHospitalDeletePreview,
  listHospitals,
  upsertHospital,
} from "@/lib/actions/admin"
import { formatDistrict, DISTRICT_OPTIONS } from "@/lib/roles"
import { formatPhone } from "@/lib/format"
import {
  AdminCombobox,
  AdminDeleteDialog,
  AdminField,
  AdminListPagination,
  AdminSearchInput,
  AdminSection,
  pluralCount,
} from "@/components/app/admin-section"
import { ResponsiveModal, ResponsiveModalFooter } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const PAGE_SIZE = 10

interface HospitalRow {
  id: string
  name: string
  district: string
  location: string | null
  contactPhone: string | null
}

export default function AdminHospitalsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(0)
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; hospital: HospitalRow } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<HospitalRow | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const hospitalsQuery = useQuery({
    queryKey: ["admin-hospitals", debouncedSearch],
    queryFn: () => listHospitals(debouncedSearch),
  })

  const rows = hospitalsQuery.data ?? []
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const paginated = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-4">
      <AdminSection
        title="Hospitals"
        description="Facilities that doctors belong to. Deleting unassigns staff and clears facility links — history is kept."
        icon={<BuildingIcon className="size-4" />}
        action={
          <Button size="sm" onClick={() => setModal({ mode: "create" })}>
            <PlusIcon data-icon="inline-start" />
            New hospital
          </Button>
        }
      >
        <AdminSearchInput value={search} onChange={setSearch} placeholder="Search hospitals…" />
        {hospitalsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading hospitals…</p>
        ) : hospitalsQuery.isError ? (
          <p className="text-sm text-destructive">Could not load hospitals.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hospitals yet. Add the first one.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {paginated.map((row) => (
                <li key={row.id} className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDistrict(row.district)}
                      {row.location ? ` · ${row.location}` : ""}
                      {row.contactPhone ? ` · ${formatPhone(row.contactPhone)}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-xs" onClick={() => setModal({ mode: "edit", hospital: row })} aria-label={`Edit ${row.name}`}>
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
            <AdminListPagination page={currentPage} pageCount={pageCount} onPage={setPage} />
          </div>
        )}
      </AdminSection>

      <HospitalModal
        modal={modal}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null)
          void queryClient.invalidateQueries({ queryKey: ["admin-hospitals"] })
        }}
      />

      {deleteTarget && (
        <HospitalDeleteDialog
          key={deleteTarget.id}
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null)
            void queryClient.invalidateQueries({ queryKey: ["admin-hospitals"] })
          }}
        />
      )}
    </div>
  )
}

function HospitalDeleteDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: HospitalRow
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const { data: preview } = useQuery({
    queryKey: ["admin-hospital-delete-preview", target.id],
    queryFn: () => getHospitalDeletePreview(target.id),
  })

  async function handleConfirm() {
    setDeleting(true)
    try {
      await deleteHospital(target.id)
      toast.success("Hospital deleted")
      onDeleted()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that hospital.")
      setDeleting(false)
    }
  }

  const consequences =
    preview === undefined
      ? ["Counting linked records…"]
      : [
          preview.staffCount > 0
            ? `${pluralCount(preview.staffCount, "staff member")} will be unassigned from this hospital.`
            : "No staff are currently assigned to this hospital.",
          preview.recordCount > 0
            ? `${pluralCount(preview.recordCount, "medical record")} keep their history but lose this facility link.`
            : "No medical records reference this hospital.",
          "This hospital cannot be recovered after deletion.",
        ]

  return (
    <AdminDeleteDialog
      title="Delete hospital?"
      intro={`${target.name} (${formatDistrict(target.district)}) will be removed. Review what else changes:`}
      consequences={consequences}
      requireText={target.name}
      requireLabel="Type the hospital's name"
      confirmLabel="Delete hospital"
      deleting={deleting}
      onConfirm={() => void handleConfirm()}
      onClose={onClose}
    />
  )
}

interface HospitalFormInitial {
  name: string
  district: string
  location: string
  contactPhone: string
}

const EMPTY_HOSPITAL_FORM: HospitalFormInitial = {
  name: "",
  district: "lilongwe",
  location: "",
  contactPhone: "",
}

function HospitalModal({
  modal,
  onClose,
  onSaved,
}: {
  modal: { mode: "create" } | { mode: "edit"; hospital: HospitalRow } | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = modal?.mode === "edit" ? modal.hospital : null
  return (
    <ResponsiveModal
      open={modal !== null}
      onOpenChange={(open) => { if (!open) onClose() }}
      title={editing ? "Edit hospital" : "New hospital"}
      description="Districts use the national 28-district list."
    >
      {modal?.mode === "edit" ? (
        <HospitalForm
          key={modal.hospital.id}
          initial={{
            name: modal.hospital.name,
            district: modal.hospital.district,
            location: modal.hospital.location ?? "",
            contactPhone: modal.hospital.contactPhone ?? "",
          }}
          hospitalId={modal.hospital.id}
          submitLabel="Save changes"
          successMessage="Hospital updated"
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : modal ? (
        <HospitalForm
          key="create"
          initial={EMPTY_HOSPITAL_FORM}
          hospitalId={undefined}
          submitLabel="Add hospital"
          successMessage="Hospital added"
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : null}
    </ResponsiveModal>
  )
}

function HospitalForm({
  initial,
  hospitalId,
  submitLabel,
  successMessage,
  onSaved,
  onClose,
}: {
  initial: HospitalFormInitial
  hospitalId: string | undefined
  submitLabel: string
  successMessage: string
  onSaved: () => void
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(initial.name)
  const [district, setDistrict] = useState(initial.district)
  const [location, setLocation] = useState(initial.location)
  const [contactPhone, setContactPhone] = useState(initial.contactPhone)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await upsertHospital({
        id: hospitalId,
        name,
        district,
        location,
        contactPhone: contactPhone.replace(/[\s-]/g, ""),
      })
      toast.success(successMessage)
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that hospital.")
    } finally {
      setSaving(false)
    }
  }

  return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <AdminField label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Kamuzu Central Hospital" />
        </AdminField>
        <AdminField label="District">
          <AdminCombobox
            value={district}
            onChange={setDistrict}
            options={DISTRICT_OPTIONS.map((d) => ({ value: d, label: formatDistrict(d) }))}
            placeholder="Select district"
            label="District"
          />
        </AdminField>
        <AdminField label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Area, street or landmark" />
        </AdminField>
        <AdminField label="Contact phone" hint="+265 followed by 9 digits">
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+265991234567" inputMode="tel" />
        </AdminField>
        <ResponsiveModalFooter className="mt-1 flex-row justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
        </ResponsiveModalFooter>
      </form>
  )
}
