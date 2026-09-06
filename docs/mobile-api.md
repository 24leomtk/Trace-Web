# Mobile API (`/api/v1`)

REST API for the React Native (Expo) version of TRACE. It wraps the
same server actions the web app uses (`lib/actions/*`), so the mobile app gets
identical authorization, RLS scoping, validation, and audit-logging behavior.

## Conventions

- **Base URL:** `https://<your-deployment>/api/v1` (dev: `http://localhost:3000/api/v1`)
- **Success:** `200` with a raw JSON body (no envelope). Actions that return
  nothing return `{ "ok": true }`.
- **Errors:** non-2xx with `{ "error": "human readable message" }`. Messages
  come from the server actions and are written for end users — safe to show
  in a toast/alert as-is.

| Status | Meaning                                                        |
| ------ | -------------------------------------------------------------- |
| `400`  | Malformed JSON body                                            |
| `401`  | No/invalid session — sign in again                             |
| `403`  | Authenticated but not allowed (wrong role, out-of-scope case…) |
| `404`  | Unknown record / vehicle / person                              |
| `422`  | Validation failed — body carries `details.issues: [{ path, message }]` |
| `500`  | Unexpected server error (details logged server-side only)      |

All routes are dynamic (`no-store`); every route except `/health` requires a session.

## Types

Every request/response shape below is typed in
[`docs/mobile-api-types.ts`](./mobile-api-types.ts) — a standalone,
zero-dependency TypeScript file (no Drizzle, no zod). Copy it into the mobile
app (e.g. `types/api.ts`) and import the names used in the endpoint sections.
Keep it in sync with `lib/types.ts` and `validations/record.ts`, the
server-side sources of truth.

**Request types** — `RecordsQuery`, `CreateRecordBody` (+ `AttachmentInput`),
`SafetyLookupBody`

**Response types** — `User`, `RecordsPage` (= `Page<TraceRecord>`),
`CreateRecordResponse`, `UploadCredentials`, `WantedCheckResult`,
`FlagCheckResult`, `AnalyticsEntry`, `HealthResponse`, `OkResponse`

**Errors** — `ApiErrorBody`

## Authentication

Mobile signs in with **phone number + OTP** (same flow as the web app; the
`@better-auth/expo` and `bearer` plugins are already enabled server-side).
There is no self-registration — accounts are provisioned by a system admin.

### Client setup (Expo)

```ts
// lib/auth-client.ts (in the React Native app)
import { createAuthClient } from "better-auth/react"
import { phoneNumberClient } from "better-auth/client/plugins"
import { expoClient } from "@better-auth/expo/client"
import * as SecureStore from "expo-secure-store"

export const authClient = createAuthClient({
  baseURL: "https://<your-deployment>", // no /api/v1 — better-auth endpoints
  plugins: [
    phoneNumberClient(),
    expoClient({
      scheme: "trace",
      storagePrefix: "trace",
      storage: SecureStore,
    }),
  ],
})
```

Session cookies become `Authorization: Bearer <token>` headers via the
server's `bearer()` plugin — the `/api/v1` handlers resolve the session from
either form.

## Endpoints

### Case records

| Method | Path       | Who                     | Description                        |
| ------ | ---------- | ----------------------- | ---------------------------------- |
| `GET`  | `/records` | officer / monitor       | Paginated case feed (own scope)    |
| `POST` | `/records` | officer / monitor       | File a case in the caller's domain |

Query — `RecordsQuery`

| Param    | Type                       | Default | Notes                                    |
| -------- | -------------------------- | ------- | ---------------------------------------- |
| `cursor` | int ≥ 0                    | `0`     | Item offset into the scoped feed         |
| `limit`  | int 1–50                   | `10`    |                                          |
| `type`   | one of 10 `RecordType`     | —       | `missing_person`, `wanted_person`, …     |
| `status` | `active/resolved/closed/archived` | — |                                   |

Response: `RecordsPage` (`{ items: TraceRecord[], nextCursor: number | null }`).

Create — `CreateRecordBody`

```json
{
  "type": "vehicle_offense",
  "data": {
    "plate_number": "MH 1234",
    "offense_type": "Speeding",
    "description": "…",
    "location": "…",
    "date_occurred": "2026-09-06"
  },
  "accessLevel": "branch",
  "branchId": "uuid (monitors only)",
  "attachments": []
}
```

`accessLevel` defaults to `branch`. Officers file under their own branch;
monitors pass `branchId` in scope. The typed `data` payload is validated
against `recordSchemas[type]` — all 10 payloads are typed in
`mobile-api-types.ts` (`MissingPersonData`, `WantedPersonData`, …).

### Safety lookups

| Method | Path        | Who                        | Description                              |
| ------ | ----------- | -------------------------- | ---------------------------------------- |
| `POST` | `/lookups`  | officer / monitor / insurer | Read-only flag checks, always audited   |

Body — `SafetyLookupBody`

```json
{ "check": "wanted", "nationalId": "…" }
{ "check": "plate", "plateNumber": "MH 1234" }
```

- `wanted` (police only) → `WantedCheckResult` (`{ wanted, dangerLevel?, district? }`).
- `plate` → `FlagCheckResult` (`{ flagged }`). Insurer callers get the same
  boolean-only answer via their scoped path. Never returns case detail.

### Analytics

| Method | Path               | Who       | Description                              |
| ------ | ------------------ | --------- | ---------------------------------------- |
| `GET`  | `/analytics/feed`  | monitor   | Volumes, resolution rates, accident trends, citations |

Response: `AnalyticsEntry[]`. Scoped to the caller's domain (and district for
district monitors). Each pull is audit-logged as `report_generated`.

### Account & uploads

| Method | Path                    | Who        | Description                          |
| ------ | ----------------------- | ---------- | ------------------------------------ |
| `GET`  | `/me`                   | any        | Signed-in profile (role, scope)      |
| `GET`  | `/uploads/credentials`  | filing roles | Short-lived Cloudinary signing material |
| `GET`  | `/health`               | public     | Liveness probe                       |

Uploads are images only (`resource_type: image`, folder `trace/records/<userId>`),
then attached to a case via `POST /records` (`AttachmentInput`).
