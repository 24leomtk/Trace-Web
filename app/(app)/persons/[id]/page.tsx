"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDebounce } from "use-debounce"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "sonner"

import { getPerson, mergePersons, searchPersons } from "@/lib/actions/persons"
import { formatDateShort } from "@/lib/format"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { SearchInput } from "@/components/app/search-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useUser } from "@/providers/user-context"

export default function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { user } = useUser()
  const queryClient = useQueryClient()
  const [mergeQuery, setMergeQuery] = useState("")
  const [candidates, setCandidates] = useState<
    Awaited<ReturnType<typeof searchPersons>>
  >([])
  // Tracks whether a duplicate search has run — the empty shell below only
  // shows after a search, never on first paint.
  const [mergeSearched, setMergeSearched] = useState(false)
  const isMonitor =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["person", id],
    queryFn: () => getPerson(id),
  })

  const [debouncedMergeQuery] = useDebounce(mergeQuery.trim(), 350)

  async function findDuplicates(event: React.SubmitEvent) {
    event.preventDefault()
    const term = debouncedMergeQuery || mergeQuery.trim()
    if (!term) return
    setCandidates((await searchPersons(term)).filter((row) => row.id !== id))
    setMergeSearched(true)
  }

  async function merge(dropId: string) {
    try {
      await mergePersons({ keepId: id, dropId })
      toast.success("Profiles merged.")
      setCandidates([])
      setMergeSearched(false)
      await queryClient.invalidateQueries({ queryKey: ["person", id] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed.")
    }
  }

  if (isLoading)
    return (
      <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading person">
        <Skeleton className="h-8 w-32" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="rounded-none border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Person not found.
        </p>
      </div>
    )
  }

  return (
    <PersonDetailView
      person={data.person}
      linkedCases={data.linkedCases}
      isMonitor={isMonitor}
      mergeQuery={mergeQuery}
      setMergeQuery={setMergeQuery}
      candidates={candidates}
      mergeSearched={mergeSearched}
      onFindDuplicates={findDuplicates}
      onMerge={merge}
      refreshing={isFetching}
      onRefresh={() =>
        queryClient.invalidateQueries({ queryKey: ["person", id] })
      }
    />
  )
}

function PersonDetailView({
  person,
  linkedCases,
  isMonitor,
  mergeQuery,
  setMergeQuery,
  candidates,
  mergeSearched,
  onFindDuplicates,
  onMerge,
  refreshing,
  onRefresh,
}: {
  person: {
    fullName: string
    nationalId?: string | null
    homeDistrict?: string | null
    distinguishingFeatures?: string | null
  }
  linkedCases: {
    id: string
    recordType: string
    status: string
    createdAt: string
  }[]
  isMonitor: boolean
  mergeQuery: string
  setMergeQuery: (value: string) => void
  candidates: Awaited<ReturnType<typeof searchPersons>>
  mergeSearched: boolean
  onFindDuplicates: (event: React.SubmitEvent) => void
  onMerge: (dropId: string) => void
  refreshing?: boolean
  onRefresh?: () => Promise<void>
}) {
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
    items: linkedCases,
    search: (entry, q) =>
      `${entry.recordType.replace(/_/g, " ")} ${entry.status}`
        .toLowerCase()
        .includes(q),
  })

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{person.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          {[person.nationalId, person.homeDistrict?.replace(/_/g, " ")]
            .filter(Boolean)
            .join(" · ") || "No identifiers on file"}
        </p>
        {person.distinguishingFeatures && (
          <p className="text-sm text-muted-foreground">
            {person.distinguishingFeatures}
          </p>
        )}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Linked cases ({linkedCases.length})
        </h2>
        {linkedCases.length > 4 && (
          <div className="flex items-start gap-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search linked cases…"
              className="flex-1"
            />
            <ListRefreshButton
              onRefresh={onRefresh ?? (() => Promise.resolve())}
              loading={refreshing}
            />
          </div>
        )}
        {linkedCases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked cases.</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No linked cases match “{debouncedQuery}”.
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {visible.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/records/${entry.id}`}
                    className="block rounded-none border px-3 py-2 text-sm hover:bg-accent"
                  >
                    <span className="font-medium">
                      {entry.recordType.replace(/_/g, " ")}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {entry.status} · {formatDateShort(entry.createdAt)}
                    </span>
                  </Link>
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
      </section>

      {isMonitor && (
        <section className="flex flex-col gap-2 rounded-none border bg-card p-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Merge duplicate
          </h2>
          <p className="text-xs text-muted-foreground">
            Find the duplicate profile — its cases, coded rows, and files move
            here, then it is removed.
          </p>
          <form onSubmit={onFindDuplicates} className="flex gap-2">
            <Input
              value={mergeQuery}
              onChange={(event) => setMergeQuery(event.target.value)}
              placeholder="Name or national ID…"
              aria-label="Search duplicate profiles"
            />
            <Button type="submit" size="sm">
              Find
            </Button>
          </form>
          {candidates.length > 0 ? (
            candidates.map((candidate) => (
            <div
              key={candidate.id}
              className="flex items-center justify-between gap-2 rounded-none border px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{candidate.fullName}</span>
                {candidate.nationalId && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {candidate.nationalId}
                  </span>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onMerge(candidate.id)}
              >
                Merge into this profile
              </Button>
            </div>
            ))
          ) : mergeSearched ? (
            <p className="rounded-none border border-dashed px-6 py-6 text-center text-sm text-muted-foreground">
              No duplicates found — this looks like the only profile.
            </p>
          ) : null}
        </section>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit rounded-none">
      <Link href="/lookup">
        <ArrowLeftIcon data-icon="inline-start" />
        Back to lookup
      </Link>
    </Button>
  )
}
