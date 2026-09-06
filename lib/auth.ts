import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
// The app defines its schema relations with defineRelations (RQB v2), so the
// adapter must come from the relations-v2 entrypoint.
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import { expo } from "@better-auth/expo"
import { db } from "@/db"
import * as schema from "@/db/schema"
import { bearer, phoneNumber } from "better-auth/plugins"

export const auth = betterAuth({
  appName: "Chipatala Registry",
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
      // Only accounts provisioned by an administrator (single create or
      // patient Excel import) can sign in — unknown numbers fail verification.
      sendOTP: async ({ phoneNumber, code }) => {
        // No SMS gateway is wired up yet — the OTP is logged server-side so
        // development sign-in works. Plug an SMS provider in here.
        console.log(`[OTP] ${phoneNumber} -> ${code}`)
      },
      callbackOnVerification: async () => {
        // Roles are assigned at provisioning time by administrators.
        // There is no public registration path.
      },
    }),
  ],
})
