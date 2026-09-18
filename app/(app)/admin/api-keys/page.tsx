"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/actions/apikeys"
import { listManagedUsers } from "@/lib/actions/admin"
import {
  AdminCombobox,
  AdminField,
  AdminSection,
} from "@/components/app/admin-section"
import { ListPagination } from "@/components/app/list-pagination"
import { SearchInput } from "@/components/app/search-input"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

const EMPTY_FORM = { userId: "", name: "", expiresAt: "" }

/**
 * N4 machine keys (Phase 3) — system admins issue per-user keys bound by
 * scopes. Plaintext shows once; only hashes are stored.
 */
export default function AdminApiKeysPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [freshKey, setFreshKey] = useState<string | null>(null)

  const { data: keys, isLoading } = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: listApiKeys,
  })

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
    items: keys ?? [],
    search: (key, q) =>
      `${key.name} ${key.keyPrefix} ${key.userName} ${key.scopes.join(" ")}`
        .toLowerCase()
        .includes(q),
  })
  const { data: users } = useQuery({
    queryKey: ["admin-user-options"],
    queryFn: () => listManagedUsers({ pageSize: 100 }),
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] })
  }

  function openDialog() {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  async function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!form.userId) {
      toast.error("Choose the user this key acts as.")
      return
    }
    setSaving(true)
    try {
      const result = await createApiKey({
        userId: form.userId,
        name: form.name,
        scopes: ["plate:read"],
        expiresAt: form.expiresAt || undefined,
      })
      setFreshKey(result.key)
      setForm(EMPTY_FORM)
      setDialogOpen(false)
      await refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not issue key."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ResponsiveModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Issue API key"
        description="Acts as one user with the plate:read scope (ANPR readers)."
      >
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <AdminField label="Acting user">
            <AdminCombobox
              label="Acting user"
              value={form.userId}
              onChange={(userId) => setForm({ ...form, userId })}
              placeholder="Select user"
              options={(users?.users ?? []).map((user) => ({
                value: user.id,
                label: `${user.name} · ${user.role}`,
              }))}
            />
          </AdminField>
          <AdminField label="Key name" hint="e.g. Lilongwe ANPR camera 3.">
            <Input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
              minLength={2}
            />
          </AdminField>
          <AdminField label="Expires" hint="Blank = no expiry.">
            <DatePicker
              value={form.expiresAt}
              onChange={(expiresAt) => setForm({ ...form, expiresAt })}
              label="Expiry date"
              placeholder="No expiry"
              min={new Date().toISOString().slice(0, 10)}
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
              {saving ? "Issuing…" : "Issue key"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveModal>

      {freshKey && (
        <div className="rounded-none border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/10">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Copy now — this is the only time it shows:
          </p>
          <p className="mt-1 font-mono text-sm break-all select-all">
            {freshKey}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard.writeText(freshKey)
              toast.success("Copied.")
            }}
          >
            Copy
          </Button>
        </div>
      )}

      <AdminSection
        title="Active keys"
        description="Acts as one user with the plate:read scope (ANPR readers). Copy the
            key now — it never shows again."
        action={
          <Button onClick={openDialog} className="shrink-0">
            <PlusIcon data-icon="inline-start" />
            Issue key
          </Button>
        }
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search keys by name, user, prefix…"
        />
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !keys || keys.length === 0 ? (
          <p className="rounded-none border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No API keys issued.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-none border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No keys match “{debouncedQuery}”.
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {visible.map((key) => (
                <li
                  key={key.id}
                  className="flex items-center justify-between gap-3 rounded-none border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {key.name} ·{" "}
                      <span className="font-mono">{key.keyPrefix}…</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {key.userName} · {key.scopes.join(", ")}
                      {key.expiresAt
                        ? ` · expires ${key.expiresAt.slice(0, 10)}`
                        : " · no expiry"}
                      {!key.isActive && " · revoked"}
                    </p>
                  </div>
                  {key.isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await revokeApiKey(key.id)
                          toast.success("Key revoked.")
                          await refresh()
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : "Failed."
                          )
                        }
                      }}
                    >
                      Revoke
                    </Button>
                  )}
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
