"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  FilePlus2Icon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  addReferralDocument,
  getReferralBundle,
  removeReferralDocument,
} from "@/lib/actions/referrals"
import { getUploadCredentials } from "@/lib/actions/uploads"
import { uploadFileToCloudinary } from "@/lib/upload"
import { referralDocumentLabels } from "@/validations/admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

const CHECKLIST: { label: (typeof referralDocumentLabels)[number]; title: string }[] = [
  { label: "charge_sheet", title: "Charge sheet" },
  { label: "witness_statement", title: "Witness statement" },
  { label: "exhibit_photo", title: "Exhibit / photo" },
  { label: "id_document", title: "ID document" },
  { label: "medical_report", title: "Medical report" },
]

/**
 * F4 e-Brief bundle (Phase 2) — referred record + structured exhibits in one
 * pane, with a statement checklist and monitor tranche uploads. Rendered for
 * the grant's liaison (read) and in-scope monitors (read + upload/remove).
 */
export function ReferralBundle({
  referralId,
  canUpload,
  caseAttachmentCount,
}: {
  referralId: string
  canUpload: boolean
  caseAttachmentCount: number
}) {
  const queryClient = useQueryClient()
  const bundleQuery = useQuery({
    queryKey: ["referral-bundle", referralId],
    queryFn: () => getReferralBundle(referralId),
  })

  const [label, setLabel] =
    useState<(typeof referralDocumentLabels)[number]>("charge_sheet")
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["referral-bundle", referralId] })
  }

  async function submitDocument(event: React.FormEvent) {
    event.preventDefault()
    if (!file) {
      toast.error("Choose a file first.")
      return
    }
    setUploading(true)
    try {
      const credentials = await getUploadCredentials()
      const uploaded = await uploadFileToCloudinary(file, credentials)
      await addReferralDocument({
        referralId,
        label,
        url: uploaded.url,
        storagePath: uploaded.publicId,
        fileType: uploaded.fileType,
        fileHash: uploaded.fileHash,
      })
      toast.success("Brief document added.")
      setFile(null)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.")
    } finally {
      setUploading(false)
    }
  }

  if (bundleQuery.isLoading) return <Skeleton className="h-40 w-full" />
  if (bundleQuery.isError || !bundleQuery.data) {
    return (
      <p className="rounded-3xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
        Could not load the brief bundle.
      </p>
    )
  }

  const bundle = bundleQuery.data
  const present = new Set(bundle.documents.map((doc) => doc.label))

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-3xl border bg-card px-4 py-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          E-Brief · referred to {bundle.liaisonName}
        </p>
        <p className="mt-0.5 text-[15px] font-medium">{bundle.recordTitle}</p>
        <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">
          {bundle.recordSummary}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {[
            bundle.personName,
            bundle.vehiclePlate,
            bundle.reason,
            bundle.outcome !== "pending" ? `Outcome: ${bundle.outcome}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>

      <section className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Statement checklist
        </h2>
        <ul className="flex flex-col gap-1.5">
          {CHECKLIST.map((item) => {
            const done =
              present.has(item.label) ||
              (item.label === "exhibit_photo" && caseAttachmentCount > 0)
            return (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                {done ? (
                  <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
                ) : (
                  <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className={done ? "" : "text-muted-foreground"}>
                  {item.title}
                </span>
                {item.label === "exhibit_photo" &&
                  !present.has(item.label) &&
                  caseAttachmentCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      · {caseAttachmentCount} case photo{caseAttachmentCount === 1 ? "" : "s"}
                    </span>
                  )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-3xl border bg-card p-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Brief documents ({bundle.documents.length})
        </h2>
        {bundle.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No brief documents yet — the checklist above shows what to attach.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {bundle.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-sm"
              >
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:underline"
                >
                  {doc.label.replace(/_/g, " ")}
                </a>
                {canUpload && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${doc.label.replace(/_/g, " ")}`}
                    onClick={async () => {
                      try {
                        await removeReferralDocument(doc.id)
                        toast.success("Document removed.")
                        await refresh()
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed.")
                      }
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canUpload && (
          <form onSubmit={submitDocument} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Select
                value={label}
                onValueChange={(value) =>
                  setLabel(value as (typeof referralDocumentLabels)[number])
                }
              >
                <SelectTrigger aria-label="Document type" className="h-9 flex-1">
                  <SelectValue placeholder="Document type" />
                </SelectTrigger>
                <SelectContent>
                  {referralDocumentLabels.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="file"
                accept="image/*,application/pdf,video/*,audio/*,.doc,.docx,.txt"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                aria-label="Brief file"
                className="flex-1"
              />
            </div>
            <Button type="submit" size="sm" className="w-fit" disabled={uploading || !file}>
              <FilePlus2Icon data-icon="inline-start" />
              {uploading ? "Uploading…" : "Attach tranche"}
            </Button>
          </form>
        )}
      </section>
    </div>
  )
}
