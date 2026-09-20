"use client"

import { useEffect, useState } from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileAudioIcon,
  FileTextIcon,
  FileVideoIcon,
  ImageIcon,
  MicroscopeIcon,
} from "lucide-react"
import { toast } from "sonner"

import { formatBytes, formatDateKey, shortFileHash } from "@/lib/format"
import type { AttachmentMeta } from "@/lib/types"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import {
  Attachment,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"

const KIND_ICON: Record<AttachmentMeta["kind"], typeof FileTextIcon> = {
  pdf: FileTextIcon,
  image: ImageIcon,
  lab: MicroscopeIcon,
  video: FileVideoIcon,
  audio: FileAudioIcon,
  doc: FileTextIcon,
}

const PAGE_SIZE = 6

interface AttachmentsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordTitle: string
  attachments: AttachmentMeta[]
}

export function AttachmentsModal({
  open,
  onOpenChange,
  recordTitle,
  attachments,
}: AttachmentsModalProps) {
  const galleryMode =
    attachments.length > 0 && attachments.every((a) => a.kind === "image")

  function openFile(attachment: AttachmentMeta) {
    if (!attachment.url) {
      toast.error("This attachment has no stored file.")
      return
    }
    window.open(attachment.url, "_blank", "noopener,noreferrer")
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Attachments"
      description={recordTitle}
      className="sm:max-w-md"
    >
      <div className="flex flex-col gap-3">
        {attachments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No files attached to this record.
          </p>
        ) : (
          <AttachmentList
            attachments={attachments}
            galleryMode={galleryMode}
            onOpenFile={openFile}
          />
        )}
      </div>
    </ResponsiveModal>
  )
}

function AttachmentList({
  attachments,
  galleryMode,
  onOpenFile,
}: {
  attachments: AttachmentMeta[]
  galleryMode: boolean
  onOpenFile: (attachment: AttachmentMeta) => void
}) {
  const [page, setPage] = useState(0)

  // New record / new file set starts on page one, not a stale page.
  useEffect(() => {
    setPage(0)
  }, [attachments])

  const pageCount = Math.max(1, Math.ceil(attachments.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = attachments.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  )

  return (
    <>
      {galleryMode ? (
        <div className="grid grid-cols-3 gap-2">
          {visible.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              aria-label={`Open ${attachment.name}`}
              onClick={() => onOpenFile(attachment)}
              className="group relative aspect-square overflow-hidden rounded-none border bg-muted outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              {attachment.url ? (
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-5" />
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((attachment) => {
            const Icon = KIND_ICON[attachment.kind]
            const hash = shortFileHash(attachment.fileHash)
            return (
              <Attachment key={attachment.id} className="w-full">
                <AttachmentMedia>
                  <Icon />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{attachment.name}</AttachmentTitle>
                  <AttachmentDescription>
                    {formatBytes(attachment.sizeBytes)} ·{" "}
                    {attachment.kind.toUpperCase()}
                    {hash ? ` · SHA ${hash}` : ""}
                    {attachment.retentionUntil
                      ? ` · kept until ${formatDateKey(attachment.retentionUntil.slice(0, 10))}`
                      : ""}
                  </AttachmentDescription>
                </AttachmentContent>
                <AttachmentAction
                  aria-label={`Download ${attachment.name}`}
                  onClick={() => onOpenFile(attachment)}
                >
                  <DownloadIcon />
                </AttachmentAction>
              </Attachment>
            )
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            Prev
          </Button>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </div>
      )}
    </>
  )
}
