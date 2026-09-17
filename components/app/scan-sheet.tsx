"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { QrCodeIcon } from "lucide-react"
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner"

import { Button } from "@/components/ui/button"
import {
  ResponsiveModal,
  ResponsiveModalFooter,
} from "@/components/app/responsive-modal"

// Browser-only: the scanner touches the camera on mount, so it must never SSR.
const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  { ssr: false }
)

interface ScanSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired once with the first decoded value; the sheet closes itself. */
  onScanned: (rawValue: string) => void
  title?: string
  description?: string
}

/**
 * F1 camera scan (Phase 1) — QR / barcode → prefill. Decodes driver-licence
 * barcodes, plate QR stickers, or any code carrying the identifier, then hands
 * the raw value back for the caller to normalise into its field. Camera
 * failures degrade to manual entry instead of blocking.
 */
export function ScanSheet({
  open,
  onOpenChange,
  onScanned,
  title = "Scan code",
  description = "Point the camera at the licence barcode or plate code. The value fills the field — verify it before continuing.",
}: ScanSheetProps) {
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)

  function handleScan(codes: IDetectedBarcode[]) {
    const first = codes[0]?.rawValue?.trim()
    if (!first) return
    setError(null)
    onOpenChange(false)
    onScanned(first)
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        setStarting(next)
        onOpenChange(next)
      }}
      title={title}
      description={description}
    >
      {error ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {error} Type the value instead — nothing is lost.
          </p>
          <ResponsiveModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full"
            >
              Type instead
            </Button>
          </ResponsiveModalFooter>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-black">
          {open && (
            <Scanner
              onScan={handleScan}
              onError={(err) =>
                setError(
                  typeof err === "string"
                    ? err
                    : "message" in (err as object) &&
                        typeof (err as { message: unknown }).message === "string"
                      ? String((err as { message: unknown }).message)
                      : "Camera unavailable."
                )
              }
              allowMultiple={false}
              sound={false}
            />
          )}
          {starting && (
            <p className="flex items-center justify-center gap-2 px-4 py-3 text-xs text-white/70">
              <QrCodeIcon className="size-4" />
              Starting camera…
            </p>
          )}
        </div>
      )}
    </ResponsiveModal>
  )
}
