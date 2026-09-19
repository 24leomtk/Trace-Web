"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { isValidPhoneNumber } from "react-phone-number-input"
import {
  ArrowLeftIcon,
  LoaderCircleIcon,
  PencilLineIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import {
  checkPhoneAvailable,
  deleteMyAccount,
  syncPhoneAfterChange,
} from "@/lib/actions/account"
import { formatPhone } from "@/lib/format"
import { formatDistrict } from "@/lib/roles"
import type { User } from "@/lib/types"
import { AdminDeleteDialog } from "@/components/app/admin-section"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { NavButton } from "@/components/app/nav-button"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { PhoneInput } from "@/components/reui/phone-input"
import { Button } from "@/components/ui/button"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { useUser } from "@/providers/user-context"

const ROLE_LABEL: Record<string, string> = {
  OFFICER: "Officer",
  DISTRICT_MONITOR: "District monitor",
  COUNTRY_MONITOR: "Country monitor",
  SYSTEM_ADMIN: "System administrator",
  COMPLIANCE_AUDITOR: "Compliance auditor",
  COURT_LIAISON: "Court liaison",
  INSURANCE_PORTAL_USER: "Insurance portal user",
  VEHICLE_REGISTRAR: "Vehicle registrar",
}

type ProfileView = "info" | "phone" | "verify"

/** Floating-nav trigger + dialog. Replaces the old /profile page. */
export function ProfileDialogButton() {
  const { user } = useUser()
  const [open, setOpen] = useState(false)

  return (
    <>
      <NavButton
        key="profile"
        label="Profile"
        onClick={() => setOpen(true)}
        active={open}
      >
        <UserRoundIcon className="size-5" />
      </NavButton>
      <ProfileDialog
        key={user.id}
        user={user}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

function ProfileDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [view, setView] = useState<ProfileView>("info")
  const [confirmSend, setConfirmSend] = useState(false)
  const [sending, setSending] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newPhone, setNewPhone] = useState("")

  function close() {
    onOpenChange(false)
    // Reset to the info view when the dialog closes mid-flow.
    setView("info")
    setConfirmSend(false)
  }

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
          else onOpenChange(true)
        }}
        title={
          view === "info"
            ? user.name
            : view === "phone"
              ? "Change phone number"
              : "Check your messages"
        }
        description={
          view === "info"
            ? "Your TRACE account."
            : view === "phone"
              ? "Your number is how you sign in — the new one must verify by SMS code."
              : `We sent a 6-digit code to ${formatPhone(newPhone)}.`
        }
      >
        {view === "info" && (
          <InfoView
            user={user}
            onChangePhone={() => setView("phone")}
            onDelete={() => setShowDelete(true)}
          />
        )}
        {view === "phone" && (
          <PhoneView
            currentPhone={user.phone}
            newPhone={newPhone}
            setNewPhone={setNewPhone}
            onBack={() => setView("info")}
            onContinue={() => setConfirmSend(true)}
          />
        )}
        {view === "verify" && (
          <VerifyView
            newPhone={newPhone}
            onBack={() => setView("phone")}
            onVerified={() => {
              setView("info")
              setNewPhone("")
            }}
          />
        )}
      </ResponsiveModal>

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Change phone number?"
        description={`We'll text a 6-digit code to ${formatPhone(newPhone)}. Your old number stops working as soon as the new one verifies.`}
        confirmLabel={sending ? "Sending…" : "Send code"}
        onConfirm={() => void sendCode()}
      />

      {showDelete && (
        <DeleteAccountDialog
          key={user.id}
          user={user}
          deleting={deleting}
          onClose={() => {
            if (!deleting) setShowDelete(false)
          }}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </>
  )

  async function sendCode() {
    if (sending) return
    setSending(true)
    try {
      await checkPhoneAvailable(newPhone)
      const { error } = await authClient.phoneNumber.sendOtp({
        phoneNumber: newPhone.trim(),
      })
      if (error) throw new Error("Could not send the code. Try again.")
      setConfirmSend(false)
      setView("verify")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the code."
      )
    } finally {
      setSending(false)
    }
  }

  async function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteMyAccount()
      await authClient.signOut()
      toast.success("Account deleted.")
      window.location.href = "/sign-in"
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete account."
      )
      setDeleting(false)
    }
  }
}

function InfoView({
  user,
  onChangePhone,
  onDelete,
}: {
  user: User
  onChangePhone: () => void
  onDelete: () => void
}) {
  const rows: [string, string | undefined][] = [
    ["Name", user.name],
    ["Phone", user.phone],
    ["Role", ROLE_LABEL[user.role] ?? user.role],
    ["Badge number", user.badgeNumber],
    [
      "Domain",
      user.domain === "traffic"
        ? "Traffic"
        : user.domain === "regular"
          ? "Regular"
          : undefined,
    ],
    ["Posting", user.posting],
    ["District", user.district ? formatDistrict(user.district) : undefined],
    ["Organization", user.organizationName],
  ]

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-2">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 text-sm"
            >
              <dt className="shrink-0 text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
      </dl>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onChangePhone}
          className="w-full"
        >
          <PencilLineIcon data-icon="inline-start" />
          Change phone number
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDelete}
          className="w-full text-destructive hover:text-destructive"
        >
          <Trash2Icon data-icon="inline-start" />
          Delete account
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Postings, roles and reactivation are handled by a system administrator.
      </p>
    </div>
  )
}

function PhoneView({
  currentPhone,
  newPhone,
  setNewPhone,
  onBack,
  onContinue,
}: {
  currentPhone: string
  newPhone: string
  setNewPhone: (value: string) => void
  onBack: () => void
  onContinue: () => void
}) {
  function valid(): boolean {
    return (
      !!newPhone &&
      isValidPhoneNumber(newPhone) &&
      newPhone.startsWith("+265") &&
      newPhone.trim() !== currentPhone.trim()
    )
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid()) {
          toast.error(
            newPhone.trim() === currentPhone.trim()
              ? "That is already your phone number."
              : "Enter a valid Malawian phone number."
          )
          return
        }
        onContinue()
      }}
    >
      <PhoneInput
        value={newPhone}
        onChange={setNewPhone}
        countries={["MW"]}
        defaultCountry="MW"
        placeholder="991 234 567"
        autoComplete="tel-national"
        aria-label="New phone number"
      />
      <p className="text-xs text-muted-foreground">
        Currently {formatPhone(currentPhone)}. You&apos;ll verify the new
        number with a code before anything changes.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={!valid()}>
          Continue
        </Button>
      </div>
    </form>
  )
}

function VerifyView({
  newPhone,
  onBack,
  onVerified,
}: {
  newPhone: string
  onBack: () => void
  onVerified: () => void
}) {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(30)
  const containerRef = useRef<HTMLDivElement>(null)
  // DEMO-COMPETITION-ONLY state — remove with the demo box below.
  const [demoCode, setDemoCode] = useState<string | null>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  // DEMO-COMPETITION-ONLY — poll /api/demo/otp so judges without the SIM
  // can see the code. Removed by `node scripts/revert-competition-demo.mjs`.
  const fetchDemoCode = useCallback(async () => {
    if (!newPhone) return
    try {
      const res = await fetch(
        `/api/demo/otp?phone=${encodeURIComponent(newPhone)}`
      )
      if (!res.ok) {
        setDemoCode(null)
        return
      }
      const data = (await res.json()) as { code?: string }
      setDemoCode(typeof data.code === "string" ? data.code : null)
    } catch {
      setDemoCode(null)
    }
  }, [newPhone])

  useEffect(() => {
    void fetchDemoCode()
    const interval = setInterval(() => void fetchDemoCode(), 4000)
    return () => clearInterval(interval)
  }, [fetchDemoCode])

  async function verify(submitted: string) {
    if (status === "verifying") return
    setStatus("verifying")
    setErrorMessage(null)
    const { error } = await authClient.phoneNumber.verify({
      phoneNumber: newPhone.trim(),
      code: submitted,
      updatePhoneNumber: true,
    })
    if (error) {
      setStatus("error")
      // PHONE_NUMBER_EXIST surfaces here when the number was taken after
      // the availability check — keep the message human.
      setErrorMessage(
        error.message === "PHONE_NUMBER_EXIST"
          ? "That number is already registered to another account."
          : (error.message ?? null)
      )
      setCode("")
      containerRef.current?.focus()
      return
    }
    try {
      await syncPhoneAfterChange(newPhone.trim())
    } catch (syncError) {
      toast.error(
        syncError instanceof Error ? syncError.message : "Could not update."
      )
      setStatus("error")
      setCode("")
      return
    }
    toast.success(`Phone number changed to ${formatPhone(newPhone)}.`)
    router.refresh()
    onVerified()
  }

  async function resend() {
    if (!newPhone) return
    setResendIn(30)
    setStatus("idle")
    setErrorMessage(null)
    await authClient.phoneNumber.sendOtp({ phoneNumber: newPhone.trim() })
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
    <div className="flex flex-col items-center gap-4">
      {/* DEMO-COMPETITION-ONLY — delete this box before production / after the competition. */}
      {demoCode && (
        <div className="w-full rounded-none border border-dashed border-amber-500/60 bg-amber-500/10 px-4 py-3 text-center">
          <p className="text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
            Competition demo — no SMS needed
          </p>
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
              if (status === "error") {
                setStatus("idle")
                setErrorMessage(null)
              }
              void verify(otp)
            }}
            disabled={status === "verifying"}
          >
            {status === "verifying" ? "Verifying…" : "Autofill & verify"}
          </Button>
        </div>
      )}

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
            {errorMessage ?? "That code didn't match. Try again."}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Code expires after 5 minutes
          </span>
        )}
      </p>

      <div className="flex w-full gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="flex-1 rounded-none text-muted-foreground"
          disabled={resendIn > 0 || status === "verifying"}
          onClick={() => void resend()}
        >
          {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
        </Button>
      </div>
    </div>
  )
}

function DeleteAccountDialog({
  user,
  deleting,
  onClose,
  onConfirm,
}: {
  user: User
  deleting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <AdminDeleteDialog
      title="Delete account?"
      intro="This deactivates your TRACE account immediately and signs you out on every device."
      consequences={[
        "You won't be able to sign back in — only a system administrator can reactivate the number.",
        "Cases you filed, reviews and audit history are kept, as required for policing records.",
      ]}
      requireText={user.name}
      requireLabel="Type your full name"
      confirmLabel="Delete my account"
      deleting={deleting}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  )
}
