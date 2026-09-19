"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeftIcon, LoaderCircleIcon } from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { formatPhone } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifySkeleton />}>
      <VerifyForm />
    </Suspense>
  )
}

function VerifyForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const phone = searchParams.get("phone") ?? ""

  const [code, setCode] = useState("")
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(30)
  const containerRef = useRef<HTMLDivElement>(null)
  // DEMO-COMPETITION-ONLY state — remove with the demo box below.
  const [demoCode, setDemoCode] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  // DEMO-COMPETITION-ONLY — poll /api/demo/otp so judges without the SIM
  // can see the code. Removed by `node scripts/revert-competition-demo.mjs`.
  const fetchDemoCode = useCallback(async () => {
    if (!phone) return
    setDemoLoading(true)
    try {
      const res = await fetch(
        `/api/demo/otp?phone=${encodeURIComponent(phone)}`
      )
      if (!res.ok) {
        setDemoCode(null)
        return
      }
      const data = (await res.json()) as { code?: string }
      setDemoCode(typeof data.code === "string" ? data.code : null)
    } catch {
      setDemoCode(null)
    } finally {
      setDemoLoading(false)
    }
  }, [phone])

  useEffect(() => {
    void fetchDemoCode()
    const interval = setInterval(() => void fetchDemoCode(), 4000)
    return () => clearInterval(interval)
  }, [fetchDemoCode])

  async function verify(submitted: string) {
    setStatus("verifying")
    setErrorMessage(null)
    const { error } = await authClient.phoneNumber.verify({
      phoneNumber: phone,
      code: submitted,
    })
    if (error || !phone) {
      setStatus("error")
      // Surfaces server-side rejections (e.g. deactivated accounts) while
      // keeping the generic fallback for wrong codes.
      setErrorMessage(error?.message ?? null)
      setCode("")
      containerRef.current?.focus()
      return
    }
    router.replace("/")
    router.refresh()
  }

  async function resend() {
    if (!phone) return
    setResendIn(30)
    await authClient.phoneNumber.sendOtp({ phoneNumber: phone })
    // DEMO-COMPETITION-ONLY — refresh the visible code after resending.
    setTimeout(() => void fetchDemoCode(), 1000)
  }

  function handleChange(value: string) {
    setCode(value)
    if (status === "error") {
      setStatus("idle")
      setErrorMessage(null)
    }
    if (value.length === 6) void verify(value)
  }

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="text-center">
        <h1 className="text-lg font-medium">Check your messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-foreground">
            {phone ? formatPhone(phone) : "your phone"}
          </span>
          .
        </p>
      </div>

      {/* DEMO-COMPETITION-ONLY — delete this box before production / after the competition. */}
      <div className="w-full rounded-none border border-dashed border-amber-500/60 bg-amber-500/10 px-4 py-3 text-center">
        <p className="text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
          Competition demo — no SMS needed
        </p>
        {demoLoading && !demoCode ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Looking up your code…
          </p>
        ) : demoCode ? (
          <>
            <p className="mt-1 text-2xl font-bold tracking-[0.3em]">
              {demoCode}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => {
                const otp = demoCode.trim()
                setCode(otp)
                if (status === "error") setStatus("idle")
                void verify(otp)
              }}
              disabled={status === "verifying"}
            >
              {status === "verifying" ? "Verifying…" : "Autofill & verify"}
            </Button>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            No code found yet — wait a moment or tap Resend, then this box will
            show it.
          </p>
        )}
      </div>

      <div ref={containerRef} tabIndex={-1} className="outline-none">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={handleChange}
          disabled={status === "verifying"}
          aria-label="One-time code"
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <InputOTPSlot key={index} index={index} className="size-10" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <p
        aria-live="polite"
        className="flex h-5 items-center justify-center gap-2 text-sm"
      >
        {status === "verifying" ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-4" />
            Verifying…
          </span>
        ) : status === "error" ? (
          <span className="text-destructive">
            {errorMessage ??
              "That code didn&apos;t match, or this number isn&apos;t registered. Contact your administrator."}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Code expires after 5 minutes
          </span>
        )}
      </p>

      <div className="flex flex-col items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={resendIn > 0 || status === "verifying"}
          onClick={() => void resend()}
          className="rounded-none text-muted-foreground"
        >
          {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
        </Button>
        <Button
          asChild
          variant="link"
          size="sm"
          className="h-auto p-0 text-muted-foreground underline-offset-4"
        >
          <Link href="/sign-in">
            <ArrowLeftIcon data-icon="inline-start" />
            Use a different number
          </Link>
        </Button>
      </div>
    </div>
  )
}

function VerifySkeleton() {
  return (
    <div className="flex flex-col items-center gap-5">
      <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />
    </div>
  )
}
