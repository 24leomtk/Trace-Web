"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, LoaderCircleIcon, ScanLineIcon } from "lucide-react"
import { toast } from "sonner"
import type { ZodType } from "zod"

import { createRecord, type UploadedAttachment } from "@/lib/actions/records"
import { getUploadCredentials } from "@/lib/actions/uploads"
import { formatDateShortWithTime, normalizePlate } from "@/lib/format"
import { uploadFileToCloudinary } from "@/lib/upload"
import { domainForRecordType } from "@/lib/record-meta"
import { recordSchemas } from "@/validations/record"
import type { RecordType } from "@/validations/record"
import type { AccessLevel } from "@/lib/types"
import { useFileUpload } from "@/hooks/use-file-upload"
import {
  DynamicFields,
  scrollToField,
  type FormValues,
} from "@/components/app/record-form/dynamic-fields"
import {
  RECORD_FORM_FIELDS,
  type AnyFieldDef,
} from "@/components/app/record-form/fields"
import { RecordTypeSelector } from "@/components/app/record-form/record-type-selector"
import { RECORD_TYPE_META } from "@/lib/record-meta"
import { AttachmentsField } from "@/components/app/record-form/attachments-field"
import { GeoCapture } from "@/components/app/geo-capture"
import { ScanSheet } from "@/components/app/scan-sheet"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useUser } from "@/providers/user-context"

const NUMERIC_PATHS = new Set([
  "age",
  "estimated_value",
  "fine_amount",
  "fatalities",
  "injuries",
  "year",
  "dose_number",
])

function initialValues(fields: AnyFieldDef[]): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    if (field.kind === "stringlist") values[field.path] = []
    else if (field.kind === "rowlist") values[field.path] = []
    else if (field.kind === undefined && field.type === "checkbox") {
      values[field.path] = false
    } else values[field.path] = ""
  }
  return values
}

function setDeep(
  target: Record<string, unknown>,
  path: string,
  value: unknown
) {
  const segments = path.split(".")
  let node = target
  for (let index = 0; index < segments.length - 1; index++) {
    const key = segments[index]
    if (typeof node[key] !== "object" || node[key] === null) {
      node[key] = {}
    }
    node = node[key] as Record<string, unknown>
  }
  node[segments[segments.length - 1]] = value
}

function normalizeValue(path: string, value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return undefined
  if (NUMERIC_PATHS.has(path) && typeof value === "string" && value !== "") {
    const num = Number(value)
    return Number.isNaN(num) ? value : num
  }
  return value
}

export default function NewRecordPage() {
  const router = useRouter()
  const { user } = useUser()

  const canCreate =
    user.role === "OFFICER" ||
    user.role === "DISTRICT_MONITOR" ||
    user.role === "COUNTRY_MONITOR"

  useEffect(() => {
    if (!canCreate) router.replace("/")
  }, [canCreate, router])

  const defaultType: RecordType =
    user.domain === "traffic" ? "vehicle_offense" : "crime_incident"
  const [recordType, setRecordType] = useState<RecordType>(defaultType)
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(RECORD_FORM_FIELDS[defaultType])
  )
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("branch")
  const [branchId, setBranchId] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [fileState, fileActions] = useFileUpload({
    multiple: true,
    maxFiles: 6,
    // Hook-level ceiling; tighter per-kind caps are enforced at upload time.
    maxSize: 100 * 1024 * 1024,
    accept: "image/*,application/pdf,video/*,audio/*,.doc,.docx,.txt",
  })

  const fields = RECORD_FORM_FIELDS[recordType]
  const needsBranchPicker =
    user.role === "DISTRICT_MONITOR" || user.role === "COUNTRY_MONITOR"
  // F1 scan-to-prefill: vehicle forms carry plate_number, person forms carry
  // national_id — a scan fills whichever the current type asks for.
  const scannablePath = fields.some((field) => field.path === "plate_number")
    ? "plate_number"
    : fields.some((field) => field.path === "national_id")
      ? "national_id"
      : null
  // F10: types with a free-text place also accept an optional GPS fix.
  const hasLocationField = fields.some((field) =>
    field.path.includes("location")
  )
  const [scanOpen, setScanOpen] = useState(false)

  // F2 offline safety: one idempotency key per filing attempt — retries of
  // this attempt replay instead of double-filing. Drafts already autosave.
  const attemptKey = useRef<string | null>(null)
  if (attemptKey.current == null && typeof crypto !== "undefined") {
    attemptKey.current = crypto.randomUUID()
  }
  const [online, setOnline] = useState(true)
  useEffect(() => {
    setOnline(navigator.onLine)
    const update = () => setOnline(navigator.onLine)
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  // ── U3 wizard + drafts ──────────────────────────────────────────────
  const STEPS = ["Type", "Details", "Visibility & files", "Review"] as const
  const [step, setStep] = useState(0)

  function draftKey(type: RecordType) {
    return `trace:filing-draft:v1:${user.id}:${type}`
  }

  function isPristine(formValues: FormValues): boolean {
    return Object.values(formValues).every((value) =>
      Array.isArray(value)
        ? value.length === 0
        : value === "" || value == null || value === false
    )
  }

  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)

  // Offer a saved draft when the form is still empty.
  useEffect(() => {
    setDraftSavedAt(null)
    if (!isPristine(values)) return
    try {
      const raw = localStorage.getItem(draftKey(recordType))
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        values?: FormValues
        savedAt?: string
      }
      if (parsed.values && !isPristine(parsed.values)) {
        setDraftSavedAt(parsed.savedAt ?? null)
      }
    } catch {
      // Corrupt draft — ignore it.
    }
    // Run when the record type changes; values are pristine-checked once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordType, user.id])

  // Autosave while the officer types (attachments are not stored in drafts).
  useEffect(() => {
    if (isPristine(values)) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey(recordType),
          JSON.stringify({
            values,
            accessLevel,
            branchId,
            savedAt: new Date().toISOString(),
          })
        )
      } catch {
        // Storage full or unavailable — filing still works, just no draft.
      }
    }, 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, accessLevel, branchId, recordType, user.id])

  function resumeDraft() {
    try {
      const raw = localStorage.getItem(draftKey(recordType))
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        values?: FormValues
        accessLevel?: AccessLevel
        branchId?: string
      }
      setValues({ ...initialValues(fields), ...(parsed.values ?? {}) })
      if (parsed.accessLevel) setAccessLevel(parsed.accessLevel)
      if (parsed.branchId) setBranchId(parsed.branchId)
      setErrors({})
      setDraftSavedAt(null)
      setStep(1)
      toast.success("Draft resumed.")
    } catch {
      toast.error("Could not read the saved draft.")
    }
  }

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey(recordType))
    } catch {
      // ignore
    }
    setDraftSavedAt(null)
  }

  function chooseType(next: RecordType) {
    // Filing is locked to the filer's own domain.
    if (user.domain && domainForRecordType(next) !== user.domain) {
      toast.error(`Your domain files ${user.domain} records only.`)
      return
    }
    setRecordType(next)
    setValues(initialValues(RECORD_FORM_FIELDS[next]))
    setErrors({})
    discardDraft()
  }

  function setValue(path: string, value: unknown) {
    setValues((prev) => ({ ...prev, [path]: value }))
    setErrors((prev) => {
      if (!prev[path]) return prev
      const next = { ...prev }
      delete next[path]
      return next
    })
  }

  async function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault()

    if (needsBranchPicker && !branchId) {
      toast.error("Choose the branch to file this under.")
      return
    }

    const payload: Record<string, unknown> = {}
    const defsByPath = new Map(fields.map((field) => [field.path, field]))
    for (const [path, raw] of Object.entries(values)) {
      const field = defsByPath.get(path)
      if (!field) {
        if (typeof raw === "string" ? raw !== "" : raw != null) {
          setDeep(payload, path, raw)
        }
        continue
      }
      if (field.kind === undefined && field.required === false && !raw) continue
      if (Array.isArray(raw)) {
        if (raw.length > 0 || field.kind === undefined) {
          setDeep(payload, path, raw)
        }
        continue
      }
      const normalized = normalizeValue(path, raw)
      if (normalized !== undefined) setDeep(payload, path, normalized)
    }

    const schema = recordSchemas[recordType] as unknown as ZodType
    const parsed = schema.safeParse(payload)

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.filter((p) => typeof p === "string").join(".")
        if (!(key in nextErrors)) nextErrors[key] = issue.message
      }
      setErrors(nextErrors)
      setStep(1)
      toast.error("Some fields need attention before saving.")
      window.setTimeout(() => {
        document
          .getElementById("filing-errors")
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      }, 50)
      return
    }

    setSubmitting(true)
    try {
      const filesToUpload = fileState.files
        .map((entry) => entry.file)
        .filter((file): file is File => file instanceof File)

      let uploadedAttachments: UploadedAttachment[] = []
      if (filesToUpload.length > 0) {
        const credentials = await getUploadCredentials()
        uploadedAttachments = await Promise.all(
          filesToUpload.map((file) => uploadFileToCloudinary(file, credentials))
        )
      }

      await createRecord({
        type: recordType,
        data: payload,
        accessLevel,
        branchId: needsBranchPicker ? branchId : undefined,
        attachments: uploadedAttachments,
        idempotencyKey: attemptKey.current ?? undefined,
      })
      toast.success("Case filed.")
      try {
        localStorage.removeItem(draftKey(recordType))
      } catch {
        // ignore
      }
      router.push("/")
    } catch (error) {
      toast.error(
        !navigator.onLine
          ? "You're offline — the draft is saved on this device. Reconnect and retry; it won't file twice."
          : error instanceof Error
            ? error.message
            : "Could not file the case. Retry — a retry won't file twice."
      )
      setSubmitting(false)
    }
  }

  if (!canCreate) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    )
  }

  const defsByPath = new Map(fields.map((field) => [field.path, field]))
  const errorEntries = Object.entries(errors)
  const filledCount = Object.values(values).filter((value) =>
    Array.isArray(value) ? value.length > 0 : value !== "" && value != null
  ).length
  const attachmentCount = fileState.files.length
  const typeMeta = RECORD_TYPE_META[recordType]

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon-sm" className="rounded-none">
          <Link href="/" aria-label="Back home">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h2 className="text-base font-medium">File a case</h2>
      </div>

      {/* Wizard progress */}
      <ol aria-label="Filing progress" className="flex items-center gap-1">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (index < step) setStep(index)
              }}
              disabled={index > step}
              aria-current={index === step ? "step" : undefined}
              className={`flex h-1.5 flex-1 rounded-none transition-colors ${
                index < step
                  ? "bg-primary"
                  : index === step
                    ? "bg-primary/70"
                    : "bg-muted"
              }`}
              title={label}
            />
            <span className="sr-only">{label}</span>
          </li>
        ))}
      </ol>
      <p className="-mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>

      {!online && (
        <p
          role="alert"
          className="rounded-none border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
        >
          You&apos;re offline — keep editing, the draft autosaves on this
          device. Filing needs a connection.
        </p>
      )}

      {draftSavedAt && (
        <div className="flex flex-col gap-2 rounded-none border border-dashed px-4 py-3">
          <p className="text-sm">
            <span className="font-medium">Unfinished draft</span>
            <span className="text-muted-foreground">
              {" "}
              · saved {formatDateShortWithTime(draftSavedAt)} on this device.
              Photos are not kept in drafts.
            </span>
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={resumeDraft}>
              Resume draft
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={discardDraft}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      {step === 0 && (
        <section className="flex flex-col gap-3">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Case type · {user.domain === "traffic" ? "Traffic" : "Regular"}{" "}
            domain
          </span>
          <RecordTypeSelector value={recordType} onChange={chooseType} />
          <div className="flex justify-end">
            <Button type="button" onClick={() => setStep(1)}>
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-4">
          {errorEntries.length > 0 && (
            <div
              id="filing-errors"
              role="alert"
              className="flex scroll-mt-28 flex-col gap-2 rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3"
            >
              <p className="text-sm font-medium">
                {errorEntries.length} field
                {errorEntries.length === 1 ? "" : "s"} need
                {errorEntries.length === 1 ? "s" : ""} attention:
              </p>
              <ul className="flex flex-col gap-1">
                {errorEntries.map(([path, message]) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => scrollToField(path)}
                      className="text-left text-sm text-destructive underline underline-offset-2"
                    >
                      {defsByPath.get(path)?.label ?? path} — {message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DynamicFields
            key={recordType}
            fields={fields}
            values={values}
            setValue={setValue}
            errors={errors}
          />

          {scannablePath && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-none"
                onClick={() => setScanOpen(true)}
              >
                <ScanLineIcon data-icon="inline-start" />
                {scannablePath === "plate_number"
                  ? "Scan plate code"
                  : "Scan ID barcode"}
              </Button>
              <ScanSheet
                open={scanOpen}
                onOpenChange={setScanOpen}
                onScanned={(raw) => {
                  setValue(
                    scannablePath,
                    scannablePath === "plate_number"
                      ? normalizePlate(raw)
                      : raw.trim()
                  )
                  toast.success(
                    "Field filled from scan — verify before filing."
                  )
                }}
                title={
                  scannablePath === "plate_number"
                    ? "Scan plate code"
                    : "Scan ID barcode"
                }
              />
            </div>
          )}

          {hasLocationField && (
            <GeoCapture
              latitude={values.latitude}
              longitude={values.longitude}
              onCaptured={(coords) => {
                setValue("latitude", coords.latitude)
                setValue("longitude", coords.longitude)
              }}
              onCleared={() => {
                setValue("latitude", undefined)
                setValue("longitude", undefined)
              }}
            />
          )}

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-6">
          {needsBranchPicker && (
            <section className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted-foreground">
                Filing branch
              </span>
              <DynamicFields
                fields={[
                  {
                    kind: "ref",
                    ref: "branch",
                    domain: user.domain ?? "regular",
                    path: "__branch",
                    label: "Branch",
                  },
                ]}
                values={{ __branch: branchId }}
                setValue={(_, value) => setBranchId(String(value ?? ""))}
                errors={{}}
              />
            </section>
          )}

          <section className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              Visibility
            </span>
            <div className="flex gap-2">
              {(["branch", "district", "country"] as AccessLevel[]).map(
                (level) => (
                  <Button
                    key={level}
                    type="button"
                    variant={accessLevel === level ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAccessLevel(level)}
                  >
                    {level === "branch"
                      ? "Branch only"
                      : level === "district"
                        ? "District-wide"
                        : "Country-wide"}
                  </Button>
                )
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Escalation is deliberate and logged. Branch-only stays at your
              station.
            </p>
          </section>

          <AttachmentsField state={fileState} actions={fileActions} />

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep(3)}>
              Review
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-4">
          <div className="rounded-none border bg-card px-4 py-3">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {typeMeta.label} ·{" "}
              {user.domain === "traffic" ? "Traffic" : "Regular"}
            </p>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Fields filled</dt>
                <dd className="font-medium">
                  {filledCount} of {fields.length}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Photos</dt>
                <dd className="font-medium">{attachmentCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Visibility</dt>
                <dd className="font-medium">
                  {accessLevel === "branch"
                    ? "Branch only"
                    : accessLevel === "district"
                      ? "District-wide"
                      : "Country-wide"}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
              >
                Edit details
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep(2)}
              >
                Edit visibility
              </Button>
            </div>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="submit" size="lg" disabled={submitting || !online}>
              {submitting ? (
                <>
                  <LoaderCircleIcon className="size-4 animate-spin" />
                  Filing…
                </>
              ) : (
                "File case"
              )}
            </Button>
          </div>
        </section>
      )}
    </form>
  )
}
