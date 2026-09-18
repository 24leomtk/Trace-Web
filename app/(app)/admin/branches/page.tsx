"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { deleteBranch, listBranches, upsertBranch } from "@/lib/actions/admin"
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
  domain: "regular",
  district: "",
  location: "",
  contactPhone: "",
}

export default function AdminBranchesPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-branches"],
    queryFn: () => listBranches(),
  })

  function openDialog() {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await upsertBranch({
        name: form.name,
        domain: form.domain as never,
        district: form.district,
        location: form.location,
        contactPhone: form.contactPhone,
      })
      toast.success("Branch saved.")
      setForm(EMPTY_FORM)
      setDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: ["admin-branches"] })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save branch."
      )
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
          <h1 className="mt-1 text-xl font-medium">Branches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A station/post belongs to one domain and one district.
          </p>
        </div>
        <Button onClick={openDialog} className="shrink-0">
          <PlusIcon data-icon="inline-start" />
          Add branch
        </Button>
      </header>

      <ResponsiveModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Add branch"
        description="A station/post belongs to one domain and one district."
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
          <AdminField label="Domain">
            <AdminCombobox
              label="Domain"
              value={form.domain}
              onChange={(domain) => setForm({ ...form, domain })}
              placeholder="Select domain"
              options={[
                { value: "regular", label: "Regular" },
                { value: "traffic", label: "Traffic" },
              ]}
            />
          </AdminField>
          <AdminField label="District">
            <AdminCombobox
              label="District"
              value={form.district}
              onChange={(district) => setForm({ ...form, district })}
              placeholder="Select district"
              options={DISTRICT_OPTIONS.map((value) => ({
                value,
                label: formatDistrict(value),
              }))}
            />
          </AdminField>
          <AdminField label="Location">
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Optional"
            />
          </AdminField>
          <AdminField label="Contact phone">
            <Input
              value={form.contactPhone}
              onChange={(e) =>
                setForm({ ...form, contactPhone: e.target.value })
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
              {saving ? "Saving…" : "Add branch"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveModal>

      <AdminSection title="Branches">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="rounded-none border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No branches yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.map((branch) => (
              <li
                key={branch.id}
                className="flex items-center justify-between gap-3 rounded-none border px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{branch.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {branch.domain} · {formatDistrict(branch.district)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await deleteBranch(branch.id)
                      toast.success("Branch removed.")
                      await queryClient.invalidateQueries({
                        queryKey: ["admin-branches"],
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
