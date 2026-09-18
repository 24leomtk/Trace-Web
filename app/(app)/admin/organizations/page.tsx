"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  deleteOrganization,
  listOrganizations,
  upsertOrganization,
} from "@/lib/actions/admin"
import { DISTRICT_OPTIONS, formatDistrict } from "@/lib/roles"
import {
  AdminCombobox,
  AdminField,
  AdminSection,
} from "@/components/app/admin-section"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

const EMPTY_FORM = {
  name: "",
  orgType: "court",
  district: "",
  contactPhone: "",
  contactEmail: "",
}

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: () => listOrganizations(),
  })

  function openDialog() {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await upsertOrganization({
        name: form.name,
        orgType: form.orgType as never,
        district: form.district,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
      })
      toast.success("Organization saved.")
      setForm(EMPTY_FORM)
      setDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["admin-organizations"] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="mb-2 w-fit rounded-full px-2"
          >
            <Link href="/">
              <ArrowLeftIcon data-icon="inline-start" />
              Administration
            </Link>
          </Button>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            TRACE administration
          </p>
          <h1 className="mt-1 text-xl font-medium">Organizations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Courts, insurers, and the vehicle registry authority.
          </p>
        </div>
        <Button onClick={openDialog} className="shrink-0">
          <PlusIcon data-icon="inline-start" />
          Add organization
        </Button>
      </header>

      <ResponsiveModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Add organization"
        description="Courts, insurers, and the vehicle registry authority."
      >
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <AdminField label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              minLength={2}
            />
          </AdminField>
          <AdminField label="Type">
            <AdminCombobox
              label="Type"
              value={form.orgType}
              onChange={(orgType) => setForm({ ...form, orgType })}
              placeholder="Select type"
              options={[
                { value: "court", label: "Court" },
                { value: "insurer", label: "Insurer" },
                { value: "vehicle_registry", label: "Vehicle registry" },
              ]}
            />
          </AdminField>
          <AdminField
            label="District (courts)"
            hint="Leave empty for insurers and the registry."
          >
            <AdminCombobox
              label="District"
              value={form.district}
              onChange={(district) => setForm({ ...form, district })}
              placeholder="None"
              options={[
                { value: "", label: "None" },
                ...DISTRICT_OPTIONS.map((value) => ({
                  value,
                  label: formatDistrict(value),
                })),
              ]}
            />
          </AdminField>
          <AdminField label="Contact phone">
            <Input
              value={form.contactPhone}
              onChange={(e) =>
                setForm({ ...form, contactPhone: e.target.value })
              }
              placeholder="+265… (optional)"
            />
          </AdminField>
          <AdminField label="Contact email">
            <Input
              type="email"
              value={form.contactEmail}
              onChange={(e) =>
                setForm({ ...form, contactEmail: e.target.value })
              }
              placeholder="Optional"
            />
          </AdminField>
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Add organization"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveModal>

      <AdminSection title="Organizations">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="rounded-none border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No organizations yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.map((org) => (
              <li
                key={org.id}
                className="flex items-center justify-between gap-3 rounded-none border px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {org.orgType.replace(/_/g, " ")}
                    {org.district ? ` · ${formatDistrict(org.district)}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await deleteOrganization(org.id)
                      toast.success("Organization removed.")
                      await queryClient.invalidateQueries({
                        queryKey: ["admin-organizations"],
                      })
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Could not remove."
                      )
                    }
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  )
}
