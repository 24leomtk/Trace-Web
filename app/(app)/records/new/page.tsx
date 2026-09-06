"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"
import type { ZodType } from "zod"

import {
  createRecord,
  type UploadedAttachment,
} from "@/lib/actions/records"
import { getUploadCredentials } from "@/lib/actions/uploads"
import { uploadImageToCloudinary } from "@/lib/upload"
import { recordSchemas } from "@/validations/record"
import type { RecordType } from "@/validations/record"
import { useFileUpload } from "@/hooks/use-file-upload"
import {
  DynamicFields,
  type FormValues,
} from "@/components/app/record-form/dynamic-fields"
import {
  RECORD_FORM_FIELDS,
  type AnyFieldDef,
} from "@/components/app/record-form/fields"
import { RecordTypeSelector } from "@/components/app/record-form/record-type-selector"
import { AttachmentsField } from "@/components/app/record-form/attachments-field"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useHomeView } from "@/providers/home-view-context"
import { useUser } from "@/providers/user-context"

function initialValues(fields: AnyFieldDef[]): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    if (field.kind === "stringlist") values[field.path] = []
    else if (field.kind === "rowlist") values[field.path] = []
    else values[field.path] = ""
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
  if (
    typeof value === "string" &&
    path.endsWith("_at") &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  ) {
    return `${value}:00Z`
  }
  if (typeof value === "string" && value.trim() === "") return undefined
  if (path === "dose_number" && typeof value === "string" && value !== "") {
    return Number.parseInt(value, 10)
  }
  return value
}

export default function NewRecordPage() {
  const router = useRouter()
  const { user } = useUser()
  const homeView = useHomeView()

  const activePatient = user.role === "DOCTOR" ? homeView.activePatient : null
  const canCreate = user.role === "DOCTOR" && !!activePatient

  useEffect(() => {
    if (!canCreate) router.replace("/")
  }, [canCreate, router])

  const [recordType, setRecordType] = useState<RecordType>("outpatient_visit")
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(RECORD_FORM_FIELDS.outpatient_visit)
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [fileState, fileActions] = useFileUpload({
    multiple: true,
    maxFiles: 6,
    maxSize: 10 * 1024 * 1024,
    accept: "image/*",
  })

  const fields = RECORD_FORM_FIELDS[recordType]

  function chooseType(next: RecordType) {
    setRecordType(next)
    setValues(initialValues(RECORD_FORM_FIELDS[next]))
    setErrors({})
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!activePatient) {
      toast.error("Select a patient chart before recording.")
      router.replace("/")
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
      toast.error("Some fields need attention before saving.")
      return
    }

    setSubmitting(true)
    try {
      const imageFiles = fileState.files
        .map((entry) => entry.file)
        .filter(
          (file): file is File =>
            file instanceof File && file.type.startsWith("image/")
        )

      let uploadedAttachments: UploadedAttachment[] = []
      if (imageFiles.length > 0) {
        const credentials = await getUploadCredentials()
        uploadedAttachments = await Promise.all(
          imageFiles.map((file) => uploadImageToCloudinary(file, credentials))
        )
      }

      await createRecord({
        patientId: activePatient.id,
        type: recordType,
        data: payload,
        attachments: uploadedAttachments,
      })
      toast.success("Record saved to the timeline.")
      router.push("/")
    } catch {
      toast.error("Could not save the record. Try again.")
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon-sm" className="rounded-full">
          <Link href="/" aria-label="Back home">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h2 className="text-base font-medium">
          New record · {activePatient.name}
        </h2>
      </div>

      <section className="flex flex-col gap-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Record type
        </span>
        <RecordTypeSelector value={recordType} onChange={chooseType} />
      </section>

      <DynamicFields
        key={recordType}
        fields={fields}
        values={values}
        setValue={setValue}
        errors={errors}
      />

      <AttachmentsField state={fileState} actions={fileActions} />

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? (
          <>
            <LoaderCircleIcon className="size-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save record"
        )}
      </Button>
    </form>
  )
}
