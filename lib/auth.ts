import { betterAuth } from "better-auth"
import { APIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"
// The app defines its schema relations with defineRelations (RQB v2), so the
// adapter must come from the relations-v2 entrypoint.
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { expo } from "@better-auth/expo"
import { db } from "@/db"
import * as schema from "@/db/schema"
import { otpMessage, sendSms } from "@/lib/sms"
import { bearer, phoneNumber } from "better-auth/plugins"

export const auth = betterAuth({
  appName: "TRACE",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: false,
  },
  rateLimit: {
    enabled: true,
  },
  // NOTE: advanced.database.joins must stay off — with usePlural the
  // relational-query path looks up relation keys like "users" on "sessions",
  // which don't match this app's singular relation names.
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema,
  }),
  plugins: [
    // ── Mobile clients (React Native / Expo) ───────────────────────────────
    // bearer(): lets native apps authenticate with the raw session token via
    // `Authorization: Bearer <token>` — converted to a session cookie on every
    // auth call, including the getSession inside the /api/v1 route handlers.
    // Web cookie sessions keep working exactly as before.
    bearer(),
    // expo(): required by @better-auth/expo/client on the mobile side —
    // trusts exp:// origins in development and proxies OAuth redirects for
    // native apps.
    expo(),
    nextCookies(),
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      // Malawian numbers only
      phoneNumberValidator: (phoneNumber) => /^\+265\d{9}$/.test(phoneNumber),
      // No signUpOnVerification: public self-registration is disabled.
      // Only accounts provisioned by a system administrator can sign in —
      // unknown numbers fail verification.
      sendOTP: async ({ phoneNumber, code }) => {
        // N1: goes through the SMS seam — console fallback in dev, gateway
        // when SMS_API_URL + SMS_API_KEY are set. A gateway failure must
        // never break sign-in, so fall back to the dev log.
        try {
          await sendSms(phoneNumber, otpMessage(code))
        } catch (error) {
          console.log(
            `[OTP fallback] ${phoneNumber} -> ${code} (${error instanceof Error ? error.message : "gateway error"})`
          )
        }
      },
      callbackOnVerification: async ({ user }) => {
        // Roles are assigned at provisioning time by administrators.
        // There is no public registration path.
        // Deactivated users (including self-deleted accounts) must not be
        // able to sign back in — this runs before session creation, so
        // throwing here blocks sign-in at the OTP step.
        if ((user as { isActive?: boolean }).isActive === false) {
          throw new APIError("FORBIDDEN", {
            message:
              "This account has been deactivated. Contact your administrator.",
          })
        }
      },
    }),
  ],
})
