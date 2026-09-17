// ---------------------------------------------------------------------------
// N1 SMS seam (Phase 3) — one place to send texts, provider behind config.
//
// Without SMS_API_URL + SMS_API_KEY the provider is "log" (dev behaviour
// identical to before: the message goes to the server console). Set:
//   SMS_API_URL   generic HTTP gateway endpoint (POST JSON)
//   SMS_API_KEY   bearer token for the gateway
//   SMS_SENDER_ID sender ID / short code shown to recipients
// The generic JSON contract is { to, from?, text } with a Bearer token —
// adapt the payload in sendSms() if the chosen aggregator differs.
// ---------------------------------------------------------------------------

export interface SmsConfig {
  provider: "log" | "http"
  apiUrl?: string
  apiKey?: string
  senderId?: string
}

export function resolveSmsConfig(
  env: Record<string, string | undefined> = process.env
): SmsConfig {
  const apiUrl = env.SMS_API_URL?.trim()
  const apiKey = env.SMS_API_KEY?.trim()
  if (apiUrl && apiKey) {
    return {
      provider: "http",
      apiUrl,
      apiKey,
      senderId: env.SMS_SENDER_ID?.trim() || undefined,
    }
  }
  return { provider: "log" }
}

/** Standard OTP text (5-minute expiry, matching the phoneNumber plugin). */
export function otpMessage(code: string): string {
  return `Your TRACE verification code is ${code}. It expires in 5 minutes.`
}

/**
 * Sends one SMS. Throws on gateway failure so callers can fall back
 * (e.g. log the OTP for dev sign-in) — never silently drop.
 */
export async function sendSms(
  to: string,
  message: string,
  config: SmsConfig = resolveSmsConfig()
): Promise<{ sent: boolean }> {
  if (config.provider === "http" && config.apiUrl && config.apiKey) {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        to,
        ...(config.senderId ? { from: config.senderId } : {}),
        text: message,
      }),
    })
    if (!response.ok) {
      throw new Error(`SMS gateway failed (${response.status}).`)
    }
    return { sent: true }
  }
  console.log(`[SMS] ${to} -> ${message}`)
  return { sent: false }
}
