"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { isValidPhoneNumber } from "react-phone-number-input"
import { ArrowRightIcon, LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { PhoneInput } from "@/components/reui/phone-input"
import { Logo } from "@/components/app/logo"

export default function SignInPage() {
  const router = useRouter()
  const [phone, setPhone] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)

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
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: phone })
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
          Enter your registered phone number — we&apos;ll text you a code.
          New accounts are created by an administrator only.
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
    </div>
  )
}
