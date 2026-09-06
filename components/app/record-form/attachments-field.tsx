"use client"

import { FileTextIcon, PaperclipIcon, XIcon } from "lucide-react"

import {
  type FileUploadState,
  type FileUploadActions,
  formatBytes,
} from "@/hooks/use-file-upload"
import {
  Attachment,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"

interface AttachmentsFieldProps {
  state: FileUploadState
  actions: FileUploadActions
}

export function AttachmentsField({ state, actions }: AttachmentsFieldProps) {
  return (
    <div className="flex flex-col gap-3">
      <input {...actions.getInputProps()} className="sr-only" />

      <button
        type="button"
        onClick={actions.openFileDialog}
        onDragEnter={actions.handleDragEnter}
        onDragLeave={actions.handleDragLeave}
        onDragOver={actions.handleDragOver}
        onDrop={actions.handleDrop}
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-[min(var(--radius-3xl),20px)] border border-dashed bg-input/30 px-4 py-6 text-center transition-colors hover:bg-muted/50 aria-invalid:border-destructive data-dragging:border-ring data-dragging:bg-muted/60"
        data-dragging={state.isDragging || undefined}
      >
        <PaperclipIcon className="size-5 text-muted-foreground" />
        <span className="text-sm font-medium">
          Attach scans or photos
        </span>
        <span className="text-xs text-muted-foreground">
          Images only · drag files here or click to browse · up to 10 MB each
        </span>
      </button>

      {state.errors.length > 0 && (
        <div className="flex flex-col gap-0.5 text-xs text-destructive">
          {state.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      {state.files.length > 0 && (
        <div className="flex flex-col gap-2">
          {state.files.map((file) => {
            const isImage = file.file.type.startsWith("image/")
            return (
              <Attachment key={file.id}>
                <AttachmentMedia variant={isImage ? "image" : "icon"}>
                  {isImage && file.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.preview} alt={file.file.name} />
                  ) : (
                    <FileTextIcon />
                  )}
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{file.file.name}</AttachmentTitle>
                  <AttachmentDescription>
                    {formatBytes(file.file.size)}
                  </AttachmentDescription>
                </AttachmentContent>
                <AttachmentAction
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${file.file.name}`}
                  onClick={() => actions.removeFile(file.id)}
                >
                  <XIcon />
                </AttachmentAction>
              </Attachment>
            )
          })}
        </div>
      )}
    </div>
  )
}
