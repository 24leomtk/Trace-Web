"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { SearchIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { redeemAccessCode } from "@/lib/actions/access"
import type { PatientSummary } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { BreakGlassModal } from "@/components/app/break-glass-modal"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { PatientSearchCommand } from "@/components/app/patient-search-command"

const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        Starting camera...
      </div>
    ),
  }
)

interface ConnectPatientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectedPatients: PatientSummary[]
  onConnected: (patientId: string) => void
  onBreakGlass: (patientId: string, reason: string) => void
}

export function ConnectPatientModal({
  open,
  onOpenChange,
  connectedPatients,
  onConnected,
  onBreakGlass,
}: ConnectPatientModalProps) {
  const queryClient = useQueryClient()
  const [manualCode, setManualCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [breakGlassOpen, setBreakGlassOpen] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setManualCode("")
      setError(null)
    }
    onOpenChange(next)
  }

  async function connectCode(rawCode: string) {
    const code = rawCode.trim()
    if (!code || connecting) return
    setConnecting(true)
    setError(null)
    try {
      const result = await redeemAccessCode(code)
      if (!result.ok) {
        setError(result.error)
        return
      }
      await queryClient.invalidateQueries({
        queryKey: ["connected-patients"],
      })
      setManualCode("")
      handleOpenChange(false)
      toast.success(`Connected to ${result.patient.name}`)
      onConnected(result.patient.id)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setConnecting(false)
    }
  }

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={handleOpenChange}
        title="Connect to a patient"
        description="Scan the access code your patient is showing, or search an already-connected patient."
      >
        <div className="overflow-hidden rounded-[min(var(--radius-3xl),20px)] border bg-black">
          <Scanner
            onScan={(codes) => {
              const value = codes[0]?.rawValue ?? ""
              const code = value.replace("chipatala://access/", "").trim()
              if (code) void connectCode(code)
            }}
            onError={() =>
              setError("Camera unavailable — use the code field below.")
            }
            classNames={{
              container: "aspect-video w-full",
              video: "object-cover",
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={manualCode}
            onChange={(event) => {
              setManualCode(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && manualCode.trim()) {
                void connectCode(manualCode)
              }
            }}
            placeholder="Enter the code your patient is showing…"
            aria-invalid={!!error}
            disabled={connecting}
          />
          <Button
            variant="secondary"
            disabled={!manualCode.trim() || connecting}
            onClick={() => void connectCode(manualCode)}
          >
            {connecting ? <Spinner className="size-4" /> : "Connect"}
          </Button>
        </div>
        {error ? (
          <p className="text-xs font-medium text-destructive">{error}</p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5" />
            Access opens exactly as long as the patient chose. Every read is logged.
          </p>
        )}

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" onClick={() => setSearchOpen(true)}>
          <SearchIcon data-icon="inline-start" />
          Search connected patients
        </Button>
        <Button variant="outline" onClick={() => setBreakGlassOpen(true)}>
          <TriangleAlertIcon data-icon="inline-start" className="text-destructive" />
          Break-glass emergency access
        </Button>
      </ResponsiveModal>

      <PatientSearchCommand
        open={searchOpen}
        onOpenChange={setSearchOpen}
        patients={connectedPatients}
        onSelect={onConnected}
      />

      <BreakGlassModal
        open={breakGlassOpen}
        onOpenChange={setBreakGlassOpen}
        patients={connectedPatients}
        onConfirm={(patientId, reason) => {
          setBreakGlassOpen(false)
          handleOpenChange(false)
          onBreakGlass(patientId, reason)
        }}
      />
    </>
  )
}
