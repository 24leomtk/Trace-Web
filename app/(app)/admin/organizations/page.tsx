"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  CarFrontIcon,
  GavelIcon,
  LandmarkIcon,
  PlusIcon,
} from "lucide-react"
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
import { ListFilter, ListFilterBadges } from "@/components/app/list-filter"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { SearchInput } from "@/components/app/search-input"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
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

const ORG_TYPE_OPTIONS = [
  { value: "court", label: "Court", icon: GavelIcon },
  { value: "insurer", label: "Insurer", icon: LandmarkIcon },
  { value: "vehicle_registry", label: "Vehicle registry", icon: CarFrontIcon },
]

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: () => listOrganizations(),
  })
  const [orgType, setOrgType] = useState("all")

  const preFiltered = useMemo(
    () =>
      (data ?? []).filter(
        (org) => orgType === "all" || org.orgType === orgType
      ),
    [data, orgType]
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
    search: (org, q) =>
      `${org.name} ${org.orgType.replace(/_/g, " ")} ${org.district ? formatDistrict(org.district) : ""}`
        .toLowerCase()
        .includes(q),
  })

  const hasActiveFilter = orgType !== "all" || debouncedQuery !== ""

  function openDialog() {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  async function handleSubmit(event: React.SubmitEvent) {
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

      <AdminSection
        title="Organizations"
        description="Courts, insurers, and the vehicle registry authority."
        action={
          <Button onClick={openDialog} className="shrink-0">
            <PlusIcon data-icon="inline-start" />
            Add organization
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search organizations…"
              className="flex-1"
            />
            <ListRefreshButton
              onRefresh={() =>
                queryClient.invalidateQueries({ queryKey: ["admin-organizations"] })
              }
              loading={isFetching}
            />
            <ListFilter
              title="Filter organizations"
              description="Narrow by organization type."
              heading="Type"
              allLabel="All types"
              options={ORG_TYPE_OPTIONS}
              value={orgType}
              onChange={setOrgType}
              showBadges={false}
            />
          </div>
          <ListFilterBadges
            heading="Type"
            options={ORG_TYPE_OPTIONS}
            value={orgType}
            onChange={setOrgType}
          />
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="rounded-none border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No organizations yet.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-none border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {hasActiveFilter
              ? "No organizations match the current search and filters."
              : "No organizations yet."}
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {visible.map((org) => (
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
            <ListPagination
              page={page}
              pageCount={pageCount}
              onPage={setPage}
              total={total}
            />
          </>
        )}
      </AdminSection>
    </div>
  )
}
