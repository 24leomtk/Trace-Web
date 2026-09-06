# Mobile API (`/api/v1`)

REST API for the React Native (Expo) version of Chipatala Registry. It wraps the
same server actions the web app uses (`lib/actions/*`), so the mobile app gets
identical authorization, RLS scoping, validation, and audit-logging behavior.

## Conventions

- **Base URL:** `https://<your-deployment>/api/v1` (dev: `http://localhost:3000/api/v1`)
- **Success:** `200` with a raw JSON body (no envelope). Actions that return
  nothing return `{ "ok": true }`.
- **Errors:** non-2xx with `{ "error": "human readable message" }`. Messages
  come from the server actions and are written for end users — safe to show
  in a toast/alert as-is.

| Status | Meaning                                                                |
| ------ | ---------------------------------------------------------------------- |
| `400`  | Malformed JSON body                                                    |
| `401`  | No/invalid session — sign in again                                     |
| `403`  | Authenticated but not allowed (no active access window, wrong role, …) |
| `404`  | Unknown access code / grant / patient                                  |
| `422`  | Validation failed — body carries `details.issues: [{ path, message }]` |
| `500`  | Unexpected server error (details logged server-side only)              |

All routes are dynamic (`no-store`); every route except `/health` requires a session.

## Types

Every request/response shape below is typed in
[`docs/mobile-api-types.ts`](./mobile-api-types.ts) — a standalone,
zero-dependency TypeScript file (no Drizzle, no zod). Copy it into the mobile
app (e.g. `types/api.ts`) and import the names used in the endpoint sections.
Keep it in sync with `lib/types.ts` and `validations/record.ts`, the
server-side sources of truth.

**Request types** → `RecordsQuery`, `CreateRecordBody` (+ `AttachmentInput`),
`CreateAccessCodeBody`, `RedeemCodeBody`, `BreakGlassBody`,
`EmergencyLookupQuery`, `UpdateEmergencyInfoBody`

**Response types** → `User`, `RecordsPage` (= `Page<MedicalRecord>`),
`CreateRecordResponse`, `UploadCredentials`, `IssueCodeResponse`,
`AccessGrant`, `AccessLogEntry`, `PatientSummary`, `BreakGlassResponse`,
`EmergencyLookupEntry`, `DiagnosisOption`, `MedicationOption`,
`VaccineOption`, `DiseaseOption`, `DiseaseStat`, `AnalyticsEntry`,
`HealthResponse`, `OkResponse`

**Errors** → `ApiErrorBody`

## Authentication

Mobile signs in with **phone number + OTP** (same flow as the web app; the
`@better-auth/expo` and `bearer` plugins are already enabled server-side).

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
      scheme: "chipatala",
      storagePrefix: "chipatala",
      storage: SecureStore,
    }),
  ],
})
```

```ts
// Sign-in flow (mirrors the web app)
await authClient.phoneNumber.sendOtp({ phoneNumber: "+265991123456" })
// user receives the 6-digit code, then:
await authClient.phoneNumber.verify({
  phoneNumber: "+265991123456",
  code: "123456",
})
```

### Calling the API

**Option A — cookies (preferred):** use `authClient.$fetch`; the Expo client
attaches the stored session cookie automatically:

```ts
const records = await authClient.$fetch("/api/v1/records?limit=20")
```

**Option B — bearer token:** for plain `fetch` calls, read the stored token
(`authClient.getCookie()` → value of `better-auth.session_token`) and send it
as `Authorization: Bearer <token>`. The server-side `bearer` plugin converts
it to a session.

```ts
const res = await fetch(`${API}/records`, {
  headers: { Authorization: `Bearer ${token}` },
})
```

## Endpoints

### Session

| Method | Path      | Who  | Purpose                  |
| ------ | --------- | ---- | ------------------------ |
| `GET`  | `/health` | none | Connectivity probe       |
| `GET`  | `/me`     | any  | Signed-in user's profile |

Types — `/health`: `HealthResponse` · `/me`: `User`

### Records

| Method | Path       | Who                                         | Purpose           |
| ------ | ---------- | ------------------------------------------- | ----------------- |
| `GET`  | `/records` | patient (self) or doctor with active window | Paginated history |
| `POST` | `/records` | doctor during an active window              | Add a record      |

`GET /records` query params (all optional unless noted):

| Param                 | Type                       | Default  | Notes                                           |
| --------------------- | -------------------------- | -------- | ----------------------------------------------- |
| `patientId`           | uuid                       | **self** | Patients omit it; doctors pass the patient's id |
| `cursor`              | int ≥ 0                    | `0`      | Offset cursor from `nextCursor`                 |
| `limit`               | int 1–50                   | `8`      |                                                 |
| `type`                | one of the 16 record types | —        | e.g. `lab_test_result`                          |
| `dateFrom` / `dateTo` | `YYYY-MM-DD`               | —        | Filter on created date                          |

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "patientId": "…",
      "recordedAt": "2026-08-29T10:12:00.000Z",
      "type": "lab_test_result",
      "title": "Malaria RDT",
      "summary": "Positive",
      "author": { "name": "Dr Banda", "role": "DOCTOR" },
      "facility": "Kamuzu Central Hospital",
      "badges": [{ "label": "Lab", "tone": "cyan" }],
      "attachments": [
        {
          "id": "uuid",
          "name": "image",
          "sizeBytes": 40960,
          "kind": "image",
          "url": "https://res.cloudinary.com/…"
        }
      ]
    }
  ],
  "nextCursor": 8
}
```

`nextCursor: null` means no more pages. Timeline rendering (title, summary,
badges) is computed server-side.

Types — query: `RecordsQuery` · response: `RecordsPage` (= `Page<MedicalRecord>`)

`POST /records` body:

```json
{
  "patientId": "uuid",
  "type": "medication_prescription",
  "data": {
    "medication": "Coartem",
    "dose": "20/120mg",
    "route": "ORAL",
    "frequency": "Twice daily",
    "duration": "3 days",
    "indication": "Uncomplicated malaria"
  },
  "attachments": [
    {
      "url": "…",
      "publicId": "chipatala/records/…/img",
      "fileType": "image/jpeg",
      "fileSizeBytes": 40960
    }
  ]
}
```

- `data` must match the schema for `type` — see `validations/record.ts` for
  all 16 payloads (`outpatient_visit`, `emergency_visit`, `inpatient_admission`,
  `lab_test_result`, `imaging_report`, `pathology_report`,
  `medication_prescription`, `medication_administration`, `surgical_procedure`,
  `nursing_notes`, `intake_output_chart`, `immunization_record`,
  `screening_test`, `psychiatric_evaluation`, `discharge_summary`,
  `referral_record`).
- Invalid `data` → `422` with per-field `details.issues`.

Types — body: `CreateRecordBody` (discriminated union on `type`, with
`AttachmentInput[]` attachments) · response: `CreateRecordResponse` (`{ id }`)

### Attachments (images)

| Method | Path                   | Who           | Purpose                            |
| ------ | ---------------------- | ------------- | ---------------------------------- |
| `GET`  | `/uploads/credentials` | any non-admin | Cloudinary direct-upload signature |

The mobile app uploads images **directly to Cloudinary** (signed upload,
`resource_type: image`, folder `chipatala/records/<userId>`), then passes
`url` + `publicId` in `POST /records` attachments.

Types — response: `UploadCredentials`

### Access control — patient side

| Method   | Path                       | Who     | Purpose                                                                                                       |
| -------- | -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/access/codes`            | patient | Issue an access code. Body `{ "durationSeconds": 3600 }` (300–86400). Returns `{ "code": "CR-MW-XXXX-XXXX" }` |
| `GET`    | `/access/grants`           | patient | Active (redeemed, unrevoked, unexpired) windows                                                               |
| `DELETE` | `/access/grants/{grantId}` | patient | Revoke early — `{ "ok": true }`                                                                               |
| `GET`    | `/access/log`              | patient | Audit trail ("who viewed your records", latest 50)                                                            |

Types — `POST /access/codes` body: `CreateAccessCodeBody` · response:
`IssueCodeResponse` (`{ code }`)
Types — `GET /access/grants` response: `AccessGrant[]` —
`[{ id, doctorName, facility, grantedAt, expiresAt }]`
Types — `DELETE /access/grants/{grantId}` response: `OkResponse`
Types — `GET /access/log` response: `AccessLogEntry[]`

### Access control — doctor side

| Method | Path                  | Who    | Purpose                                                                                               |
| ------ | --------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `POST` | `/access/redeem`      | doctor | Redeem a code. Body `{ "code": "CR-MW-XXXX-XXXX" }` → `PatientSummary` incl. `accessExpiresAt`        |
| `GET`  | `/patients`           | doctor | Connected patients (active windows). Non-doctors get `[]`                                             |
| `POST` | `/access/break-glass` | doctor | Emergency override. Body `{ "patientId", "reason" }` (reason ≥ 10 chars, audited) → `{ "patientId" }` |

`PatientSummary`: `{ id, name, phone, sex: "F" | "M", age, lastVisitAt, primaryCondition, accessExpiresAt? }`

Types — `POST /access/redeem` body: `RedeemCodeBody` · response:
`PatientSummary`
Types — `GET /patients` response: `PatientSummary[]`
Types — `POST /access/break-glass` body: `BreakGlassBody` · response:
`BreakGlassResponse`

### Emergency info

| Method | Path                  | Who     | Purpose                                                                                                                                                                           |
| ------ | --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT`  | `/me/emergency-info`  | patient | Update own emergency medical info (blood type, allergies, conditions, contact) — `{ "ok": true }`                                                                                 |
| `GET`  | `/emergency-lookup`   | staff   | Blood type / allergies / chronic conditions / contact. Query `?nationalId=` and/or `?phone=`. Returns the entry or `null`. Every lookup (including misses) is audited server-side |

Types — `PUT /me/emergency-info` body: `UpdateEmergencyInfoBody` · response: `OkResponse`
Types — `GET /emergency-lookup` query: `EmergencyLookupQuery` · response: `EmergencyLookupEntry | null`

### Catalog (read-only reference data)

| Method | Path                   | Purpose                                              |
| ------ | ---------------------- | ---------------------------------------------------- |
| `GET`  | `/catalog/diagnoses`   | ICD-10 options `[{ icd10Code, name, description }]`  |
| `GET`  | `/catalog/medications` | Formulary `[{ code, name, category }]`               |
| `GET`  | `/catalog/vaccines`    | Vaccines `[{ vaccineCode, name }]`                   |
| `GET`  | `/catalog/diseases`    | Diseases under surveillance `[{ id, name, status }]` |

Types — `DiagnosisOption[]` · `MedicationOption[]` · `VaccineOption[]` ·
`DiseaseOption[]`

### Analytics (admins; district-scoped automatically)

| Method | Path                  | Purpose                                                   |
| ------ | --------------------- | --------------------------------------------------------- |
| `GET`  | `/analytics/diseases` | `DiseaseStat[]` — weekly counts, deltas, hotspots, status |
| `GET`  | `/analytics/feed`     | `AnalyticsEntry[]` — aggregate report cards               |

Types — `DiseaseStat[]` · `AnalyticsEntry[]`

Shapes live in `lib/types.ts`; the mobile app can copy these types directly.

## Example: minimal typed client

```ts
// api/client.ts (in the React Native app)
import type {
  ApiErrorBody,
  MedicalRecord,
  RecordsPage,
  RecordsQuery,
} from "./types"

const API = "https://<your-deployment>/api/v1"

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()), // Authorization: Bearer <session token>
      ...init?.headers,
    },
  })
  const body = await res.json()
  if (!res.ok) {
    const err = body as ApiErrorBody
    throw Object.assign(new Error(err.error ?? res.statusText), {
      status: res.status,
      body: err,
    })
  }
  return body as T
}

function query(params: RecordsQuery): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  return search.toString()
}

// Records timeline with cursor pagination
const page = await api<RecordsPage>(
  `/records?${query({ limit: 20, cursor: 0 })}`
)
const records: MedicalRecord[] = page.items
if (page.nextCursor !== null) {
  const next = await api<RecordsPage>(
    `/records?${query({ cursor: page.nextCursor })}`
  )
}
```

## Notes

- **CORS is not required** for native iOS/Android (it only applies to
  browsers). If you later build for Expo Web in dev, proxy `/api` through the
  Metro dev server rather than enabling cross-origin cookies.
- **Rate limiting** currently covers better-auth endpoints (OTP requests
  included). The v1 data routes rely on session auth + RLS.
- Sharing this API from the same deployment keeps one source of truth for
  permissions; deploy the web app as usual and point the mobile app's
  `baseURL` at it.
