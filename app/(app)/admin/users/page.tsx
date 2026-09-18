"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDebounce } from "use-debounce"
import {
  ArrowLeftIcon,
  ListFilterIcon,
  PlusIcon,
  UserRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  createManagedUser,
  deactivateUser,
  listBranches,
  listManagedUsers,
  listOrganizations,
  reactivateUser,
} from "@/lib/actions/admin"
import { DISTRICT_OPTIONS } from "@/lib/roles"
import { formatDistrict } from "@/lib/roles"
import { managedRoleOptions } from "@/validations/admin"
import {
  AdminCombobox,
  AdminField,
  AdminListPagination,
  AdminSearchInput,
  AdminSection,
} from "@/components/app/admin-section"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import {
  BaseFiltersCommand,
  type ActiveFilter,
} from "@/components/base-filters-command"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

const PAGE_SIZE = 8

const ROLE_HINT: Record<string, string> = {
  OFFICER: "Needs domain + branch.",
  DISTRICT_MONITOR: "Needs domain + district.",
  COUNTRY_MONITOR: "Needs domain only.",
  SYSTEM_ADMIN: "No scope.",
  COMPLIANCE_AUDITOR: "No scope.",
  COURT_LIAISON: "Needs a court organization.",
  INSURANCE_PORTAL_USER: "Needs an insurer organization.",
  VEHICLE_REGISTRAR: "Needs the registry organization.",
}

const EMPTY_FORM = {
  name: "",
  phoneNumber: "",
  role: "OFFICER",
  badgeNumber: "",
  domain: "regular",
  branchId: "",
  district: "",
  organizationId: "",
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [debouncedQuery] = useDebounce(query.trim(), 350)
  const [role, setRole] = useState("all")
  const [draftRole, setDraftRole] = useState("all")
  const [page, setPage] = useState(0)
  const [form, setForm] = useState(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["managed-users", debouncedQuery, role, page],
    queryFn: () =>
      listManagedUsers({
        query: debouncedQuery,
        role,
        page,
        pageSize: PAGE_SIZE,
      }),
  })
  const { data: branches } = useQuery({
    queryKey: ["all-branches"],
    queryFn: () => listBranches(),
  })
  const { data: organizations } = useQuery({
    queryKey: ["all-organizations"],
    queryFn: () => listOrganizations(),
  })

  useEffect(() => {
    setDraftRole(role)
  }, [role])

  useEffect(() => {
    setPage(0)
  }, [debouncedQuery, role])

  const roleActiveFilters: ActiveFilter[] =
    role === "all"
      ? []
      : [
          {
            key: "role",
            label: "Role",
            value: role.replace(/_/g, " "),
            onClear: () => setRole("all"),
          },
        ]

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["managed-users"] })
  }

  function openDialog() {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  async function handleCreate(event: React.SubmitEvent) {
    event.preventDefault()
    setCreating(true)
    try {
      await createManagedUser({
        name: form.name,
        phoneNumber: form.phoneNumber,
        role: form.role as never,
        badgeNumber: form.badgeNumber,
        domain: form.domain as never,
        branchId: form.branchId,
        district: form.district,
        organizationId: form.organizationId,
      })
      toast.success("Account provisioned.")
      setForm(EMPTY_FORM)
      setDialogOpen(false)
      await refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create account."
      )
    } finally {
      setCreating(false)
    }
  }

  const scopedBranches = (branches ?? []).filter(
    (branch) => branch.domain === form.domain
  )

  return (
    <div className="flex flex-col gap-5">
      <ResponsiveModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Provision account"
        description="No self-registration — every account is created here."
        className="sm:max-w-lg"
      >
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <AdminField label="Full name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Officer name"
              required
              minLength={2}
            />
          </AdminField>
          <AdminField label="Phone (+265…)">
            <Input
              value={form.phoneNumber}
              onChange={(e) =>
                setForm({ ...form, phoneNumber: e.target.value })
              }
              placeholder="+265991234567"
              required
            />
          </AdminField>
          <AdminField label="Role" hint={ROLE_HINT[form.role]}>
            <AdminCombobox
              label="Role"
              value={form.role}
              onChange={(role) => setForm({ ...form, role })}
              placeholder="Select role"
              options={managedRoleOptions.map((value) => ({
                value,
                label: value.replace(/_/g, " "),
              }))}
            />
          </AdminField>
          <AdminField label="Badge number (police)">
            <Input
              value={form.badgeNumber}
              onChange={(e) =>
                setForm({ ...form, badgeNumber: e.target.value })
              }
              placeholder="Optional"
            />
          </AdminField>
          {(form.role === "OFFICER" ||
            form.role === "DISTRICT_MONITOR" ||
            form.role === "COUNTRY_MONITOR") && (
            <AdminField label="Domain">
              <AdminCombobox
                label="Domain"
                value={form.domain}
                onChange={(domain) =>
                  setForm({ ...form, domain, branchId: "" })
                }
                placeholder="Select domain"
                options={[
                  { value: "regular", label: "Regular" },
                  { value: "traffic", label: "Traffic" },
                ]}
              />
            </AdminField>
          )}
          {form.role === "OFFICER" && (
            <AdminField label="Branch">
              <AdminCombobox
                label="Branch"
                value={form.branchId}
                onChange={(branchId) => setForm({ ...form, branchId })}
                placeholder="Select branch"
                options={scopedBranches.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                  detail: formatDistrict(branch.district),
                }))}
              />
            </AdminField>
          )}
          {form.role === "DISTRICT_MONITOR" && (
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
          )}
          {(form.role === "COURT_LIAISON" ||
            form.role === "INSURANCE_PORTAL_USER" ||
            form.role === "VEHICLE_REGISTRAR") && (
            <AdminField label="Organization">
              <AdminCombobox
                label="Organization"
                value={form.organizationId}
                onChange={(organizationId) =>
                  setForm({ ...form, organizationId })
                }
                placeholder="Select organization"
                options={(organizations ?? []).map((org) => ({
                  value: org.id,
                  label: org.name,
                  detail: org.orgType,
                }))}
              />
            </AdminField>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Provisioning…" : "Provision account"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveModal>

      <AdminSection
        title="Accounts"
        description="Deactivation revokes sessions immediately; history is kept."
        action={
          <Button onClick={openDialog} className="shrink-0">
            <PlusIcon data-icon="inline-start" />
            Provision account
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <AdminSearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search name or phone…"
              />
            </div>
            <BaseFiltersCommand
              title="Filter accounts"
              description="Narrow the list by role."
              filterGroups={[
                {
                  key: "role",
                  heading: "Role",
                  currentValue: draftRole,
                  onSelect: (value) =>
                    setDraftRole(value === draftRole ? "all" : value),
                  options: [
                    { value: "all", label: "All roles", icon: ListFilterIcon },
                    ...managedRoleOptions.map((value) => ({
                      value,
                      label: value.replace(/_/g, " "),
                      icon: UserRoundIcon,
                    })),
                  ],
                },
              ]}
              activeFilters={roleActiveFilters}
              onClearAll={() => {
                setDraftRole("all")
                setRole("all")
              }}
              onApplyFilters={() => setRole(draftRole)}
              hasChanges={draftRole !== role}
            />
          </div>

          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !data || data.users.length === 0 ? (
            <p className="rounded-none border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No accounts found.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.users.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded-none border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {account.name}
                      {!account.isActive && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (inactive)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {account.role.replace(/_/g, " ")} · {account.phone}
                      {account.branchName && ` · ${account.branchName}`}
                      {account.organizationName &&
                        ` · ${account.organizationName}`}
                    </p>
                  </div>
                  {account.isActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await deactivateUser(account.id)
                        toast.success("Account deactivated.")
                        await refresh()
                      }}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await reactivateUser(account.id)
                        toast.success("Account reactivated.")
                        await refresh()
                      }}
                    >
                      Reactivate
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <AdminListPagination
            page={page}
            pageCount={
              data && data.users.length === PAGE_SIZE ? page + 2 : page + 1
            }
            onPage={setPage}
          />
        </div>
      </AdminSection>
    </div>
  )
}
