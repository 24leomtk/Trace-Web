"use client"

import { useState } from "react"
import { CopyIcon, QrCodeIcon, RefreshCwIcon } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"

import { createAccessGrant } from "@/lib/actions/access"
import { formatFullDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ResponsiveModal } from "@/components/app/responsive-modal"

interface QrAccessModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DURATION_CHOICES = [
  { label: "30 min", seconds: 30 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
  { label: "4 hours", seconds: 4 * 60 * 60 },
  { label: "24 hours", seconds: 24 * 60 * 60 },
] as const

export function QrAccessModal({ open, onOpenChange }: QrAccessModalProps) {
  const [durationSeconds, setDurationSeconds] = useState<number>(
    DURATION_CHOICES[1].seconds
  )
  const [code, setCode] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  async function generate() {
    setGenerating(true)
    try {
      const { code: newCode } = await createAccessGrant({ durationSeconds })
      setCode(newCode)
      setExpiresAt(new Date().toISOString())
    } catch {
      toast.error("Could not generate a code. Try again.")
    } finally {
      setGenerating(false)
    }
  }

  function copyCode() {
    if (!code) return
    void navigator.clipboard?.writeText(code)
    toast.success("Access code copied")
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Your access code"
      description="Show this to a doctor to let them open your records. It expires automatically."
    >
      <div className="flex flex-col items-center gap-4">
        <div className="grid w-full grid-cols-4 gap-1.5">
          {DURATION_CHOICES.map((choice) => (
            <button
              key={choice.seconds}
              type="button"
              disabled={generating}
              onClick={() => {
                setDurationSeconds(choice.seconds)
                setCode(null)
              }}
              className={cn(
                "rounded-xl border px-2 py-2 text-xs font-medium transition-colors",
                durationSeconds === choice.seconds
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {choice.label}
            </button>
          ))}
        </div>

        {code ? (
          <>
            <div className="rounded-[min(var(--radius-3xl),20px)] border bg-background p-4 shadow-xs">
              <QRCodeSVG
                value={`chipatala://access/${code}`}
                size={176}
                level="M"
                className="text-foreground"
              />
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="group inline-flex items-center gap-2 rounded-2xl border border-dashed px-4 py-2 font-mono text-sm font-medium tracking-wider transition-colors hover:bg-muted"
            >
              {code}
              <CopyIcon className="size-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Works once, for {DURATION_CHOICES.find((c) => c.seconds === durationSeconds)?.label} after the doctor redeems it · codes expire if unused after 24 h
              {expiresAt ? ` · generated ${formatFullDate(expiresAt)}` : ""}
            </p>
            <Button
              variant="outline"
              onClick={() => void generate()}
              disabled={generating}
            >
              <RefreshCwIcon data-icon="inline-start" />
              New code
            </Button>
          </>
        ) : (
          <>
            <div className="flex aspect-square w-52 items-center justify-center rounded-[min(var(--radius-3xl),20px)] border border-dashed bg-muted/40 text-muted-foreground">
              <QrCodeIcon className="size-10 opacity-40" />
            </div>
            <Button size="lg" onClick={() => void generate()} disabled={generating}>
              {generating ? "Generating…" : "Generate access code"}
            </Button>
          </>
        )}
      </div>
    </ResponsiveModal>
  )
}
