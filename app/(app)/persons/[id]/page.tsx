"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "sonner"

import { getPerson, mergePersons, searchPersons } from "@/lib/actions/persons"
import { formatDateTime } from "@/lib/format"
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
  const isMonitor =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"

  const { data, isLoading, isError } = useQuery({
    queryKey: ["person", id],
    queryFn: () => getPerson(id),
  })

  if (isLoading) return <Skeleton className="h-32 w-full" />
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

  async function findDuplicates(event: React.FormEvent) {
    event.preventDefault()
    if (!mergeQuery.trim()) return
    setCandidates(
      (await searchPersons(mergeQuery)).filter((row) => row.id !== id)
    )
  }

  async function merge(dropId: string) {
    try {
      await mergePersons({ keepId: id, dropId })
      toast.success("Profiles merged.")
      setCandidates([])
      await queryClient.invalidateQueries({ queryKey: ["person", id] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Merge failed.")
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{data.person.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          {[
            data.person.nationalId,
            data.person.homeDistrict?.replace(/_/g, " "),
          ]
            .filter(Boolean)
            .join(" · ") || "No identifiers on file"}
        </p>
        {data.person.distinguishingFeatures && (
          <p className="text-sm text-muted-foreground">
            {data.person.distinguishingFeatures}
          </p>
        )}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Linked cases ({data.linkedCases.length})
        </h2>
        {data.linkedCases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked cases.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.linkedCases.map((entry) => (
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
                    · {entry.status} · {formatDateTime(entry.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
          <form onSubmit={findDuplicates} className="flex gap-2">
            <Input
              value={mergeQuery}
              onChange={(event) => setMergeQuery(event.target.value)}
              placeholder="Name or national ID…"
            />
            <Button type="submit" size="sm">
              Find
            </Button>
          </form>
          {candidates.map((candidate) => (
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
                onClick={() => merge(candidate.id)}
              >
                Merge into this profile
              </Button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit rounded-full">
      <Link href="/lookup">
        <ArrowLeftIcon data-icon="inline-start" />
        Back to lookup
      </Link>
    </Button>
  )
}
