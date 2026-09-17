"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { isValidPhoneNumber } from "react-phone-number-input"
import {
  ArrowRightIcon,
  FlaskConicalIcon,
  LoaderCircleIcon,
} from "lucide-react"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { PhoneInput } from "@/components/reui/phone-input"
import { Logo } from "@/components/app/logo"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// DEMO-COMPETITION-ONLY — fallback if /api/demo/numbers is unreachable.
// Matches the staff users in db/sql/Seed.sql. Removed by
// `node scripts/revert-competition-demo.mjs`.
const FALLBACK_DEMO_NUMBERS = [
  {
    name: "Tamanda Chirwa (administrator)",
    phoneNumber: "+265990000001",
    role: "system_admin",
  },
  {
    name: "Mphatso Zimba (Compliance Auditor)",
    phoneNumber: "+265990000002",
    role: "compliance_auditor",
  },
  {
    name: "Patrick Kamanga (Officer)",
    phoneNumber: "+265990000003",
    role: "officer",
  },
  {
    name: "Grace Kachale (District Monitor)",
    phoneNumber: "+265990000004",
    role: "district_monitor",
  },
  {
    name: "Yohane Tembo (Country Monitor)",
    phoneNumber: "+265990000005",
    role: "country_monitor",
  },
]

type DemoNumber = { name: string; phoneNumber: string; role: string }

// DEMO-COMPETITION-ONLY — page size for the test-numbers dialog.
const DEMO_PAGE_SIZE = 6

export default function SignInPage() {
  const router = useRouter()
  const [phone, setPhone] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  // DEMO-COMPETITION-ONLY state — remove with the dialog below.
  const [demoOpen, setDemoOpen] = useState(false)
  const [demoNumbers, setDemoNumbers] = useState<DemoNumber[]>(
    FALLBACK_DEMO_NUMBERS
  )
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoPage, setDemoPage] = useState(0)

  // DEMO-COMPETITION-ONLY — fetch seeded numbers when the dialog opens.
  useEffect(() => {
    if (!demoOpen) return
    setDemoPage(0)
    let cancelled = false
    async function load() {
      setDemoLoading(true)
      try {
        const res = await fetch("/api/demo/numbers")
        if (!res.ok) throw new Error("fetch failed")
        const data = (await res.json()) as { numbers?: DemoNumber[] }
        if (
          !cancelled &&
          Array.isArray(data.numbers) &&
          data.numbers.length > 0
        ) {
          setDemoNumbers(data.numbers)
        }
      } catch {
        if (!cancelled) setDemoNumbers(FALLBACK_DEMO_NUMBERS)
      } finally {
        if (!cancelled) setDemoLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [demoOpen])

  // DEMO-COMPETITION-ONLY — paginate the dialog list, 6 per view.
  const demoTotalPages = Math.max(
    1,
    Math.ceil(demoNumbers.length / DEMO_PAGE_SIZE)
  )
  const demoSafePage = Math.min(demoPage, demoTotalPages - 1)
  const demoPageItems = demoNumbers.slice(
    demoSafePage * DEMO_PAGE_SIZE,
    demoSafePage * DEMO_PAGE_SIZE + DEMO_PAGE_SIZE
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!phone || !isValidPhoneNumber(phone)) {
      toast.error("Enter a valid Malawian phone number.")
      return
    }
    if (!phone.startsWith("+265")) {
      toast.error("Only Malawian numbers (+265) can sign in.")
      return
    }
    setSubmitting(true)
    const { error } = await authClient.phoneNumber.sendOtp({
      phoneNumber: phone,
    })
    if (error) {
      toast.error(
        error.message === "SEND_OTP_NOT_IMPLEMENTED"
          ? "SMS delivery isn't configured on the server yet."
          : "Could not send the code. Try again."
      )
      setSubmitting(false)
      return
    }
    router.push(`/verify?phone=${encodeURIComponent(phone)}`)
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col items-center text-center">
        <Logo size="xl" containerClassName="mb-3" />
        <h1 className="text-lg font-medium">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your registered phone number — we&apos;ll text you a code. New
          accounts are created by an administrator only.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <PhoneInput
          value={phone}
          onChange={setPhone}
          countries={["MW"]}
          defaultCountry="MW"
          variant="lg"
          placeholder="991 234 567"
          autoComplete="tel-national"
          aria-label="Phone number"
        />
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <>
              Continue
              <ArrowRightIcon data-icon="inline-end" />
            </>
          )}
        </Button>
      </form>
      {/* DEMO-COMPETITION-ONLY — delete this Dialog before production / after the competition. */}
      <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="lg" type="button">
            <FlaskConicalIcon data-icon="inline-start" />
            View test numbers for testing
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test numbers (seeded)</DialogTitle>
            <DialogDescription>
              Only already-registered numbers can sign in. Pick one below — no
              real SMS is sent; the code appears on the verify page.
            </DialogDescription>
          </DialogHeader>
          {demoLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Loading seeded numbers…
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {demoPageItems.map((entry) => (
                  <li
                    key={entry.phoneNumber}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {entry.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.phoneNumber} · {entry.role}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setPhone(entry.phoneNumber)
                        setDemoOpen(false)
                      }}
                    >
                      Use
                    </Button>
                  </li>
                ))}
              </ul>
              {demoTotalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={demoSafePage === 0}
                    onClick={() => setDemoPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Page {demoSafePage + 1} of {demoTotalPages}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={demoSafePage >= demoTotalPages - 1}
                    onClick={() =>
                      setDemoPage((p) => Math.min(demoTotalPages - 1, p + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
