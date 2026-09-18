"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, PlusIcon } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

const PAGE_SIZE = 15

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
  const [role, setRole] = useState("all")
  const [page, setPage] = useState(0)
  const [form, setForm] = useState(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["managed-users", query, role, page],
    queryFn: () => listManagedUsers({ query, role, page, pageSize: PAGE_SIZE }),
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
    setPage(0)
  }, [query, role])

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["managed-users"] })
  }

  function openDialog() {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  async function handleCreate(event: React.FormEvent) {
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
      toast.error(error instanceof Error ? error.message : "Could not create account.")
    } finally {
      setCreating(false)
    }
  }

  const scopedBranches = (branches ?? []).filter((branch) => branch.domain === form.domain)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 w-fit rounded-full px-2">
            <Link href="/">
              <ArrowLeftIcon data-icon="inline-start" />
              Administration
            </Link>
          </Button>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            TRACE administration
          </p>
          <h1 className="mt-1 text-xl font-medium">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            No self-registration — every account is created here. Deactivation revokes sessions immediately; history is kept.
          </p>
        </div>
        <Button onClick={openDialog} className="shrink-0">
          <PlusIcon data-icon="inline-start" />
          Provision account
        </Button>
      </header>

      <ResponsiveModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Provision account"
        description="No self-registration — every account is created here."
        className="sm:max-w-lg"
      >
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdminField label="Full name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Officer name" required minLength={2} />
          </AdminField>
          <AdminField label="Phone (+265…)">
            <Input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+265991234567" required />
          </AdminField>
          <AdminField label="Role" hint={ROLE_HINT[form.role]}>
            <AdminCombobox
              label="Role"
              value={form.role}
              onChange={(role) => setForm({ ...form, role })}
              placeholder="Select role"
              options={managedRoleOptions.map((value) => ({ value, label: value.replace(/_/g, " ") }))}
            />
          </AdminField>
          <AdminField label="Badge number (police)">
            <Input value={form.badgeNumber} onChange={(e) => setForm({ ...form, badgeNumber: e.target.value })} placeholder="Optional" />
          </AdminField>
          {(form.role === "OFFICER" || form.role === "DISTRICT_MONITOR" || form.role === "COUNTRY_MONITOR") && (
            <AdminField label="Domain">
              <AdminCombobox
                label="Domain"
                value={form.domain}
                onChange={(domain) => setForm({ ...form, domain, branchId: "" })}
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
                options={DISTRICT_OPTIONS.map((value) => ({ value, label: formatDistrict(value) }))}
              />
            </AdminField>
          )}
          {(form.role === "COURT_LIAISON" || form.role === "INSURANCE_PORTAL_USER" || form.role === "VEHICLE_REGISTRAR") && (
            <AdminField label="Organization">
              <AdminCombobox
                label="Organization"
                value={form.organizationId}
                onChange={(organizationId) => setForm({ ...form, organizationId })}
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
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Provisioning…" : "Provision account"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveModal>

      <AdminSection title="Accounts" description="Deactivation revokes sessions immediately; history is kept.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <AdminSearchInput value={query} onChange={setQuery} placeholder="Search name or phone…" />
            </div>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Filter by role" className="w-full sm:w-48">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {managedRoleOptions.map((value) => (
                  <SelectItem key={value} value={value}>{value.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !data || data.users.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No accounts found.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.users.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {account.name}
                      {!account.isActive && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {account.role.replace(/_/g, " ")} · {account.phone}
                      {account.branchName && ` · ${account.branchName}`}
                      {account.organizationName && ` · ${account.organizationName}`}
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
          <AdminListPagination page={page} pageCount={data && data.users.length === PAGE_SIZE ? page + 2 : page + 1} onPage={setPage} />
        </div>
      </AdminSection>
    </div>
  )
}
