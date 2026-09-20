"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDebounce } from "use-debounce"
import { ArrowLeftIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  addPersonFeature,
  getPerson,
  mergePersons,
  removePersonFeature,
  searchPersons,
  updatePerson,
} from "@/lib/actions/persons"
import {
  recordDnaSample,
  recordFingerprint,
  removeDnaSample,
  removeFingerprint,
  updateDnaStatus,
} from "@/lib/actions/biometrics"
import { formatDateShort } from "@/lib/format"
import { DISTRICT_OPTIONS, formatDistrict } from "@/lib/roles"
import { usePaginatedSearch } from "@/hooks/use-paginated-search"
import { ListPagination } from "@/components/app/list-pagination"
import { ListRefreshButton } from "@/components/app/list-refresh-button"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { SearchInput } from "@/components/app/search-input"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
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
import { Textarea } from "@/components/ui/textarea"
import { useUser } from "@/providers/user-context"
import { personFeatureTypeOptions } from "@/validations/admin"
import {
  dnaSampleTypeOptions,
  dnaStatusOptions,
  fingerprintQualityOptions,
} from "@/validations/biometrics"

type PersonDetail = Awaited<ReturnType<typeof getPerson>>

// shadcn Select has no empty state — optional selects offer an explicit
// "None" item mapped back to "" on change.
const NONE = "__none"

function OptionalSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
}) {
  return (
    <Select
      value={value || NONE}
      onValueChange={(next) => onChange(next === NONE ? "" : next)}
    >
      <SelectTrigger aria-label={label} className="h-9">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

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
  const canEdit = user.role === "OFFICER" || isMonitor

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

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["person", id] })
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
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
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
      personId={id}
      person={data.person}
      linkedCases={data.linkedCases}
      physicalFeatures={data.physicalFeatures}
      fingerprints={data.fingerprints}
      dnaSamples={data.dnaSamples}
      isMonitor={isMonitor}
      canEdit={canEdit}
      mergeQuery={mergeQuery}
      setMergeQuery={setMergeQuery}
      candidates={candidates}
      mergeSearched={mergeSearched}
      onFindDuplicates={findDuplicates}
      onMerge={merge}
      refreshing={isFetching}
      onRefresh={refresh}
    />
  )
}

function range(
  from: number | null | undefined,
  to: number | null | undefined,
  unit: string
): string | null {
  if (from == null && to == null) return null
  const core =
    from != null && to != null
      ? from === to
        ? `${from}`
        : `${from}–${to}`
      : from != null
        ? `${from}+`
        : `up to ${to}`
  return `${core} ${unit}`
}

function PersonDetailView({
  personId,
  person,
  linkedCases,
  physicalFeatures,
  fingerprints,
  dnaSamples,
  isMonitor,
  canEdit,
  mergeQuery,
  setMergeQuery,
  candidates,
  mergeSearched,
  onFindDuplicates,
  onMerge,
  refreshing,
  onRefresh,
}: {
  personId: string
  person: PersonDetail["person"]
  linkedCases: PersonDetail["linkedCases"]
  physicalFeatures: PersonDetail["physicalFeatures"]
  fingerprints: PersonDetail["fingerprints"]
  dnaSamples: PersonDetail["dnaSamples"]
  isMonitor: boolean
  canEdit: boolean
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
  const [editOpen, setEditOpen] = useState(false)
  const [markOpen, setMarkOpen] = useState(false)
  const [fingerprintOpen, setFingerprintOpen] = useState(false)
  const [dnaOpen, setDnaOpen] = useState(false)

  const description: [string, string | null][] = [
    ["Sex", person.sex ?? null],
    ["Date of birth", person.dateOfBirth ?? null],
    [
      "Age",
      person.ageYears != null
        ? String(person.ageYears)
        : range(person.ageFrom, person.ageTo, "yrs"),
    ],
    ["Height", range(person.heightCmFrom, person.heightCmTo, "cm")],
    ["Weight", range(person.weightKgFrom, person.weightKgTo, "kg")],
    [
      "Hair",
      [person.hairColor, person.hairLength].filter(Boolean).join(" · ") ||
        null,
    ],
    ["Eyes", person.eyeColor ?? null],
    ["Complexion", person.complexion ?? null],
    ["Build", person.build ?? null],
    ["Clothing", person.clothingDescription ?? null],
    ["Jewelry", person.jewelryDescription ?? null],
    ["Medical notes", person.medicalNotes ?? null],
  ]
  const shownDescription = description.filter(([, value]) => value)

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{person.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          {[person.nationalId, formatDistrict(person.homeDistrict)]
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Physical description
          </h2>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-none print:hidden"
              onClick={() => setEditOpen(true)}
            >
              Edit description
            </Button>
          )}
        </div>
        {shownDescription.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No physical description on file — edit to add one.
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {shownDescription.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5 border-b pb-2">
                <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {label}
                </dt>
                <dd className="text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <MarksSection
        features={physicalFeatures}
        canEdit={canEdit}
        onAdd={() => setMarkOpen(true)}
        onDone={onRefresh}
      />

      <FingerprintsSection
        fingerprints={fingerprints}
        canEdit={canEdit}
        onAdd={() => setFingerprintOpen(true)}
        onDone={onRefresh}
      />

      <DnaSection
        dnaSamples={dnaSamples}
        canEdit={canEdit}
        onAdd={() => setDnaOpen(true)}
        onDone={onRefresh}
      />

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

      {canEdit && (
        <>
          <EditDescriptionDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            personId={personId}
            person={person}
            onDone={onRefresh}
          />
          <MarkDialog
            open={markOpen}
            onOpenChange={setMarkOpen}
            personId={personId}
            onDone={onRefresh}
          />
          <FingerprintDialog
            open={fingerprintOpen}
            onOpenChange={setFingerprintOpen}
            personId={personId}
            onDone={onRefresh}
          />
          <DnaDialog
            open={dnaOpen}
            onOpenChange={setDnaOpen}
            personId={personId}
            onDone={onRefresh}
          />
        </>
      )}
    </div>
  )
}

function numOrUndefined(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const num = Number(trimmed)
  return Number.isNaN(num) ? undefined : num
}

function EditDescriptionDialog({
  open,
  onOpenChange,
  personId,
  person,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  person: PersonDetail["person"]
  onDone?: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fullName: person.fullName,
    nationalId: person.nationalId ?? "",
    dateOfBirth: person.dateOfBirth ?? "",
    sex: person.sex ?? "",
    homeDistrict: person.homeDistrict ?? "",
    distinguishingFeatures: person.distinguishingFeatures ?? "",
    ageYears: person.ageYears != null ? String(person.ageYears) : "",
    ageFrom: person.ageFrom != null ? String(person.ageFrom) : "",
    ageTo: person.ageTo != null ? String(person.ageTo) : "",
    heightCmFrom: person.heightCmFrom != null ? String(person.heightCmFrom) : "",
    heightCmTo: person.heightCmTo != null ? String(person.heightCmTo) : "",
    weightKgFrom: person.weightKgFrom != null ? String(person.weightKgFrom) : "",
    weightKgTo: person.weightKgTo != null ? String(person.weightKgTo) : "",
    hairColor: person.hairColor ?? "",
    hairLength: person.hairLength ?? "",
    eyeColor: person.eyeColor ?? "",
    complexion: person.complexion ?? "",
    build: person.build ?? "",
    clothingDescription: person.clothingDescription ?? "",
    jewelryDescription: person.jewelryDescription ?? "",
    medicalNotes: person.medicalNotes ?? "",
  })
  const set =
    (key: keyof typeof form) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (form.fullName.trim().length < 2) {
      toast.error("Full name needs at least 2 characters.")
      return
    }
    setSaving(true)
    try {
      await updatePerson(personId, {
        fullName: form.fullName,
        nationalId: form.nationalId,
        dateOfBirth: form.dateOfBirth,
        sex: (["male", "female", "other"] as const).includes(
          form.sex as "male"
        )
          ? (form.sex as "male" | "female" | "other")
          : undefined,
        homeDistrict: form.homeDistrict,
        distinguishingFeatures: form.distinguishingFeatures,
        ageYears: numOrUndefined(form.ageYears),
        ageFrom: numOrUndefined(form.ageFrom),
        ageTo: numOrUndefined(form.ageTo),
        heightCmFrom: numOrUndefined(form.heightCmFrom),
        heightCmTo: numOrUndefined(form.heightCmTo),
        weightKgFrom: numOrUndefined(form.weightKgFrom),
        weightKgTo: numOrUndefined(form.weightKgTo),
        hairColor: form.hairColor,
        hairLength: form.hairLength,
        eyeColor: form.eyeColor,
        complexion: form.complexion,
        build: form.build,
        clothingDescription: form.clothingDescription,
        jewelryDescription: form.jewelryDescription,
        medicalNotes: form.medicalNotes,
      })
      toast.success("Description updated.")
      onOpenChange(false)
      await onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
      title="Edit description"
      description="Physical description for this profile — every field optional."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input
          value={form.fullName}
          onChange={set("fullName")}
          placeholder="Full name"
          aria-label="Full name"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            value={form.nationalId}
            onChange={set("nationalId")}
            placeholder="National ID"
            aria-label="National ID"
          />
          <DatePicker
            value={form.dateOfBirth}
            onChange={(next) =>
              setForm((prev) => ({ ...prev, dateOfBirth: next }))
            }
            label="Date of birth"
            placeholder="Date of birth"
          />
          <Select
            value={form.sex || NONE}
            onValueChange={(next) =>
              setForm((prev) => ({ ...prev, sex: next === NONE ? "" : next }))
            }
          >
            <SelectTrigger aria-label="Sex" className="h-9">
              <SelectValue placeholder="Sex" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              <SelectItem value="male">male</SelectItem>
              <SelectItem value="female">female</SelectItem>
              <SelectItem value="other">other</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={form.homeDistrict || NONE}
            onValueChange={(next) =>
              setForm((prev) => ({
                ...prev,
                homeDistrict: next === NONE ? "" : next,
              }))
            }
          >
            <SelectTrigger aria-label="Home district" className="h-9">
              <SelectValue placeholder="Home district" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {DISTRICT_OPTIONS.map((district) => (
                <SelectItem key={district} value={district}>
                  {formatDistrict(district)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={form.ageYears}
            onChange={set("ageYears")}
            placeholder="Age (exact)"
            inputMode="numeric"
            aria-label="Age"
          />
          <Input
            value={form.ageFrom}
            onChange={set("ageFrom")}
            placeholder="Age from"
            inputMode="numeric"
            aria-label="Age from"
          />
          <Input
            value={form.ageTo}
            onChange={set("ageTo")}
            placeholder="Age to"
            inputMode="numeric"
            aria-label="Age to"
          />
          <Input
            value={form.heightCmFrom}
            onChange={set("heightCmFrom")}
            placeholder="Height from (cm)"
            inputMode="numeric"
            aria-label="Height from"
          />
          <Input
            value={form.heightCmTo}
            onChange={set("heightCmTo")}
            placeholder="Height to (cm)"
            inputMode="numeric"
            aria-label="Height to"
          />
          <Input
            value={form.weightKgFrom}
            onChange={set("weightKgFrom")}
            placeholder="Weight from (kg)"
            inputMode="numeric"
            aria-label="Weight from"
          />
          <Input
            value={form.weightKgTo}
            onChange={set("weightKgTo")}
            placeholder="Weight to (kg)"
            inputMode="numeric"
            aria-label="Weight to"
          />
          <Input
            value={form.hairColor}
            onChange={set("hairColor")}
            placeholder="Hair color"
            aria-label="Hair color"
          />
          <Input
            value={form.hairLength}
            onChange={set("hairLength")}
            placeholder="Hair length"
            aria-label="Hair length"
          />
          <Input
            value={form.eyeColor}
            onChange={set("eyeColor")}
            placeholder="Eye color"
            aria-label="Eye color"
          />
          <Input
            value={form.complexion}
            onChange={set("complexion")}
            placeholder="Complexion"
            aria-label="Complexion"
          />
          <Input
            value={form.build}
            onChange={set("build")}
            placeholder="Build"
            aria-label="Build"
          />
        </div>
        <Textarea
          value={form.distinguishingFeatures}
          onChange={set("distinguishingFeatures")}
          placeholder="Distinguishing features…"
          rows={2}
        />
        <Textarea
          value={form.clothingDescription}
          onChange={set("clothingDescription")}
          placeholder="Clothing…"
          rows={2}
        />
        <Textarea
          value={form.jewelryDescription}
          onChange={set("jewelryDescription")}
          placeholder="Jewelry…"
          rows={2}
        />
        <Textarea
          value={form.medicalNotes}
          onChange={set("medicalNotes")}
          placeholder="Medical notes…"
          rows={2}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save description"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function MarksSection({
  features,
  canEdit,
  onAdd,
  onDone,
}: {
  features: PersonDetail["physicalFeatures"]
  canEdit: boolean
  onAdd: () => void
  onDone?: () => Promise<void>
}) {
  const [removing, setRemoving] = useState<string | null>(null)

  async function remove(featureId: string) {
    setRemoving(featureId)
    try {
      await removePersonFeature(featureId)
      toast.success("Mark removed.")
      await onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Distinguishing marks ({features.length})
        </h2>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-none print:hidden"
            onClick={onAdd}
          >
            <PlusIcon data-icon="inline-start" />
            Add mark
          </Button>
        )}
      </div>
      {features.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No marks recorded — tattoos, scars, piercings go here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {features.map((feature) => (
            <li
              key={feature.id}
              className="flex items-start justify-between gap-2 rounded-none border px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{feature.featureType}</span>
                {feature.bodyLocation && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {feature.bodyLocation}
                  </span>
                )}
                {feature.description && (
                  <span className="block text-muted-foreground">
                    {feature.description}
                  </span>
                )}
                {feature.approximateSize && (
                  <span className="block text-xs text-muted-foreground">
                    Size: {feature.approximateSize}
                  </span>
                )}
              </span>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removing === feature.id}
                  onClick={() => remove(feature.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MarkDialog({
  open,
  onOpenChange,
  personId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  onDone?: () => Promise<void>
}) {
  const [featureType, setFeatureType] = useState("")
  const [bodyLocation, setBodyLocation] = useState("")
  const [description, setDescription] = useState("")
  const [size, setSize] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    if (!featureType) {
      toast.error("Choose a mark type.")
      return
    }
    setSaving(true)
    try {
      await addPersonFeature({
        personId,
        featureType,
        bodyLocation,
        description,
        approximateSize: size,
      })
      toast.success("Mark added.")
      setFeatureType("")
      setBodyLocation("")
      setDescription("")
      setSize("")
      onOpenChange(false)
      await onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
      title="Add mark"
      description="A tattoo, scar, piercing, or other distinguishing mark."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Select value={featureType} onValueChange={setFeatureType}>
          <SelectTrigger aria-label="Mark type" className="h-9">
            <SelectValue placeholder="Mark type" />
          </SelectTrigger>
          <SelectContent>
            {personFeatureTypeOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={bodyLocation}
          onChange={(event) => setBodyLocation(event.target.value)}
          placeholder="Body location"
          aria-label="Body location"
        />
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description"
          aria-label="Mark description"
        />
        <Input
          value={size}
          onChange={(event) => setSize(event.target.value)}
          placeholder="Approximate size (optional)"
          aria-label="Approximate size"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !featureType}>
            {saving ? "Adding…" : "Add mark"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function FingerprintsSection({
  fingerprints,
  canEdit,
  onAdd,
  onDone,
}: {
  fingerprints: PersonDetail["fingerprints"]
  canEdit: boolean
  onAdd: () => void
  onDone?: () => Promise<void>
}) {
  const [removing, setRemoving] = useState<string | null>(null)

  async function remove(fingerprintId: string) {
    setRemoving(fingerprintId)
    try {
      await removeFingerprint(fingerprintId)
      toast.success("Fingerprint set removed (correction logged).")
      await onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Fingerprints ({fingerprints.length})
        </h2>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-none print:hidden"
            onClick={onAdd}
          >
            <PlusIcon data-icon="inline-start" />
            Record fingerprints
          </Button>
        )}
      </div>
      {fingerprints.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No fingerprint sets on file.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fingerprints.map((fp) => (
            <li
              key={fp.id}
              className="flex items-start justify-between gap-2 rounded-none border px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">
                  {fp.referenceNo || "Unnumbered set"}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {[
                    fp.quality,
                    fp.dateProcessed,
                    fp.afisReference ? `AFIS ${fp.afisReference}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "no processing detail"}
                </span>
                {fp.notes && (
                  <span className="block text-muted-foreground">{fp.notes}</span>
                )}
              </span>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removing === fp.id}
                  onClick={() => remove(fp.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FingerprintDialog({
  open,
  onOpenChange,
  personId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  onDone?: () => Promise<void>
}) {
  const [referenceNo, setReferenceNo] = useState("")
  const [quality, setQuality] = useState("")
  const [dateProcessed, setDateProcessed] = useState("")
  const [afisReference, setAfisReference] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await recordFingerprint({
        personId,
        referenceNo,
        quality: (
          fingerprintQualityOptions as readonly string[]
        ).includes(quality)
          ? (quality as (typeof fingerprintQualityOptions)[number])
          : undefined,
        dateProcessed,
        afisReference,
        notes,
      })
      toast.success("Fingerprint set recorded.")
      setReferenceNo("")
      setQuality("")
      setDateProcessed("")
      setAfisReference("")
      setNotes("")
      onOpenChange(false)
      await onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
      title="Record fingerprints"
      description="A fingerprint set taken for this profile — every field optional."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input
          value={referenceNo}
          onChange={(event) => setReferenceNo(event.target.value)}
          placeholder="Reference no."
          aria-label="Fingerprint reference number"
        />
        <OptionalSelect
          label="Quality"
          value={quality}
          onChange={setQuality}
          options={fingerprintQualityOptions}
        />
        <DatePicker
          value={dateProcessed}
          onChange={setDateProcessed}
          label="Date processed"
          placeholder="Date processed"
        />
        <Input
          value={afisReference}
          onChange={(event) => setAfisReference(event.target.value)}
          placeholder="AFIS reference (if searched)"
          aria-label="AFIS reference"
        />
        <Input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Notes (optional)"
          aria-label="Fingerprint notes"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Recording…" : "Record fingerprints"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
  )
}

function DnaSection({
  dnaSamples,
  canEdit,
  onAdd,
  onDone,
}: {
  dnaSamples: PersonDetail["dnaSamples"]
  canEdit: boolean
  onAdd: () => void
  onDone?: () => Promise<void>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function advance(sampleId: string, status: string) {
    if (!(dnaStatusOptions as readonly string[]).includes(status)) return
    setBusyId(sampleId)
    try {
      await updateDnaStatus({
        sampleId,
        status: status as (typeof dnaStatusOptions)[number],
      })
      toast.success(`DNA sample → ${status}.`)
      await onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(sampleId: string) {
    setBusyId(sampleId)
    try {
      await removeDnaSample(sampleId)
      toast.success("DNA sample removed (correction logged).")
      await onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          DNA samples ({dnaSamples.length})
        </h2>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-none print:hidden"
            onClick={onAdd}
          >
            <PlusIcon data-icon="inline-start" />
            Record DNA sample
          </Button>
        )}
      </div>
      {dnaSamples.length === 0 ? (
        <p className="text-sm text-muted-foreground">No DNA samples on file.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dnaSamples.map((sample) => (
            <li
              key={sample.id}
              className="flex flex-col gap-2 rounded-none border px-3 py-2 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span>
                  <span className="font-medium">
                    {sample.sampleType ?? "Sample"}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    ·{" "}
                    {[
                      sample.labName,
                      sample.labReference,
                      sample.relationshipToSubject,
                      sample.collectedAt,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "no lab detail"}
                  </span>
                  {sample.notes && (
                    <span className="block text-muted-foreground">
                      {sample.notes}
                    </span>
                  )}
                </span>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === sample.id}
                    onClick={() => remove(sample.id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Status: {sample.status}
                </span>
                {canEdit && (
                  <Select
                    value={sample.status}
                    onValueChange={(next) => advance(sample.id, next)}
                    disabled={busyId === sample.id}
                  >
                    <SelectTrigger
                      aria-label="DNA sample status"
                      className="h-8 w-auto text-xs"
                    >
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {dnaStatusOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DnaDialog({
  open,
  onOpenChange,
  personId,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  onDone?: () => Promise<void>
}) {
  const [sampleType, setSampleType] = useState("")
  const [labName, setLabName] = useState("")
  const [labReference, setLabReference] = useState("")
  const [relationship, setRelationship] = useState("")
  const [collectedAt, setCollectedAt] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: React.SubmitEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await recordDnaSample({
        personId,
        sampleType: (dnaSampleTypeOptions as readonly string[]).includes(
          sampleType
        )
          ? (sampleType as (typeof dnaSampleTypeOptions)[number])
          : undefined,
        labName,
        labReference,
        relationshipToSubject: relationship,
        collectedAt,
        notes,
      })
      toast.success("DNA sample recorded.")
      setSampleType("")
      setLabName("")
      setLabReference("")
      setRelationship("")
      setCollectedAt("")
      setNotes("")
      onOpenChange(false)
      await onDone?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
      title="Record DNA sample"
      description="A sample collected for this profile — lab pipeline tracked after."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <OptionalSelect
          label="Sample type"
          value={sampleType}
          onChange={setSampleType}
          options={dnaSampleTypeOptions}
        />
        <Input
          value={labName}
          onChange={(event) => setLabName(event.target.value)}
          placeholder="Lab name"
          aria-label="Lab name"
        />
        <Input
          value={labReference}
          onChange={(event) => setLabReference(event.target.value)}
          placeholder="Lab reference"
          aria-label="Lab reference"
        />
        <Input
          value={relationship}
          onChange={(event) => setRelationship(event.target.value)}
          placeholder="Relationship (family ref only)"
          aria-label="Relationship to subject"
        />
        <DatePicker
          value={collectedAt}
          onChange={setCollectedAt}
          label="Date collected"
          placeholder="Date collected"
        />
        <Input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Notes (optional)"
          aria-label="DNA notes"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Recording…" : "Record DNA sample"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveModal>
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
