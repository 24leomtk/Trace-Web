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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

type DemoNumber = {
  name: string
  phoneNumber: string
  role: string
  domain?: string
}

// DEMO-COMPETITION-ONLY — page size for the test-numbers dialog.
const DEMO_PAGE_SIZE = 6

// DEMO-COMPETITION-ONLY — in-memory fallback when /api/demo/numbers is
// unreachable. Mirrors the query-level filter + pagination below.
function queryFallbackNumbers(role: string, page: number) {
  const filtered =
    role === "all"
      ? FALLBACK_DEMO_NUMBERS
      : FALLBACK_DEMO_NUMBERS.filter((entry) => entry.role === role)
  const counts = new Map<string, number>()
  for (const entry of FALLBACK_DEMO_NUMBERS) {
    counts.set(entry.role, (counts.get(entry.role) ?? 0) + 1)
  }
  return {
    numbers: filtered.slice(page * DEMO_PAGE_SIZE, page * DEMO_PAGE_SIZE + DEMO_PAGE_SIZE),
    total: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / DEMO_PAGE_SIZE)),
    roles: [...counts.entries()]
      .map(([roleName, count]) => ({ role: roleName, count }))
      .sort((a, b) => a.role.localeCompare(b.role)),
  }
}

export default function SignInPage() {
  const router = useRouter()
  const [phone, setPhone] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  // DEMO-COMPETITION-ONLY state — remove with the dialog below.
  const [demoOpen, setDemoOpen] = useState(false)
  const [demoItems, setDemoItems] = useState<DemoNumber[]>([])
  const [demoTotal, setDemoTotal] = useState(0)
  const [demoTotalPages, setDemoTotalPages] = useState(1)
  const [demoRoles, setDemoRoles] = useState<{ role: string; count: number }[]>(
    []
  )
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoPage, setDemoPage] = useState(0)
  const [demoRole, setDemoRole] = useState("all")

  // DEMO-COMPETITION-ONLY — role filter + pagination live in the query.
  useEffect(() => {
    if (!demoOpen) return
    let cancelled = false
    async function load() {
      setDemoLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(demoPage),
          pageSize: String(DEMO_PAGE_SIZE),
        })
        if (demoRole !== "all") params.set("role", demoRole)
        const res = await fetch(`/api/demo/numbers?${params}`)
        if (!res.ok) throw new Error("fetch failed")
        const data = (await res.json()) as {
          numbers?: DemoNumber[]
          total?: number
          totalPages?: number
          roles?: { role: string; count: number }[]
        }
        if (!cancelled && Array.isArray(data.numbers)) {
          setDemoItems(data.numbers)
          setDemoTotal(data.total ?? data.numbers.length)
          setDemoTotalPages(data.totalPages ?? 1)
          if (Array.isArray(data.roles)) setDemoRoles(data.roles)
        }
      } catch {
        if (!cancelled) {
          const fallback = queryFallbackNumbers(demoRole, demoPage)
          setDemoItems(fallback.numbers)
          setDemoTotal(fallback.total)
          setDemoTotalPages(fallback.totalPages)
          setDemoRoles(fallback.roles)
        }
      } finally {
        if (!cancelled) setDemoLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [demoOpen, demoRole, demoPage])

  async function handleSubmit(event: React.SubmitEvent) {
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
      <Dialog
        open={demoOpen}
        onOpenChange={(open) => {
          if (open) {
            setDemoPage(0)
            setDemoRole("all")
          }
          setDemoOpen(open)
        }}
      >
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
          {demoLoading && demoItems.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Loading seeded numbers…
            </p>
          ) : (
            <>
              <Select
                value={demoRole}
                disabled={demoLoading}
                onValueChange={(value) => {
                  setDemoRole(value)
                  setDemoPage(0)
                }}
              >
                <SelectTrigger aria-label="Filter by role">
                  <SelectValue placeholder="Filter by role…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles ({demoTotal})</SelectItem>
                  {demoRoles.map(({ role, count }) => (
                    <SelectItem key={role} value={role}>
                      {role.replace(/_/g, " ")} ({count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {demoItems.length === 0 ? (
                <p className="rounded-none border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
                  No test numbers for this role.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {demoItems.map((entry) => (
                    <li
                      key={entry.phoneNumber}
                      className="flex items-center justify-between gap-3 rounded-none border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {entry.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.phoneNumber} · {entry.role} · {entry.domain}
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
              )}
              {demoTotalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={demoLoading || demoPage === 0}
                    onClick={() => setDemoPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Page {demoPage + 1} of {demoTotalPages}
                    {demoLoading ? " · Loading…" : ""}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={demoLoading || demoPage >= demoTotalPages - 1}
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
