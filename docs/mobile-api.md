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
`SafetyLookupBody`, `NotificationsQuery`, `MarkNotificationsReadBody`,
`UpdateRecordBody`, `CaseStatusBody`, `RecordAccessBody`,
`CreateAssignmentBody`, `AssignmentActionBody`, `CreateReferralBody`,
`ReferralActionBody`, `CustodyActionBody`, `LocateActionBody`,
`CitationPaymentBody`, `ProposeMatchBody`, `ReviewMatchBody`, `SearchQuery`

**Response types** — `User`, `RecordsPage` (= `Page<TraceRecord>`),
`TraceRecord`, `CreateRecordResponse`, `UploadCredentials`, `WantedCheckResult`,
`FlagCheckResult`, `NotificationList`, `NotificationItem`, `AnalyticsEntry`,
`HealthResponse`, `OkResponse`

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

Machine integrations (N4 pilot) use admin-issued API keys instead of a user
session: `X-API-Key: trace_…` header (or `?api_key=trace_…`). Keys act as one
provisioned user — role gates, scope, throttle, and audit apply unchanged —
and are further bound by scopes. Pilot scope: `plate:read` on
`GET /lookups/plate`. See `docs/openapi.yaml` for the machine contract.

## Endpoints

### Case records

| Method | Path       | Who                     | Description                        |
| ------ | ---------- | ----------------------- | ---------------------------------- |
| `GET`  | `/records` | officer / monitor       | Paginated case feed (own scope)    |
| `GET`  | `/records/{id}` | officer / monitor / referred liaison | Single case (visibility-gated) |
| `POST` | `/records` | officer / monitor       | File a case in the caller's domain |
| `PATCH` | `/records/{id}` | filer / monitor      | Edit an active case's typed payload |
| `GET/POST` | `/records/{id}/status` | monitor | Transition hints / change status (`{ status, reason }`) |
| `POST` | `/records/{id}/access` | filer / monitor | `{ action: access-level/reassign/link-person, ... }` |
| `POST` | `/records/{id}/attachments` | filer / monitor | Append files (upload to Cloudinary first) |
| `GET/POST` | `/records/{id}/reviews` | filer / monitor | Follow-up notes thread |
| `GET`  | `/records/{id}/assignments` | viewer | Everyone tasked on the case |
| `GET`  | `/records/{id}/matches?view=matches\|candidates` | police | Live matches / link candidates |
| `GET/POST` | `/records/{id}/custody` | police | Hold state / `{ action: hold/release/owner-notice, ... }` |
| `GET/POST` | `/records/{id}/locate` | police | Locate state / `{ action: report/confirm/disposition, ... }` |
| `GET`  | `/records/{id}/citation` | police / liaison | Fine ledger (payments, balance) |
| `GET`  | `/records/{id}/referrals` | monitor | Live court grants on the case |
| `GET`  | `/records/{id}/audit` | monitor / auditor | Per-record activity trail |

Query — `RecordsQuery`

| Param    | Type                       | Default | Notes                                    |
| -------- | -------------------------- | ------- | ---------------------------------------- |
| `cursor` | int ≥ 0                    | `0`     | Item offset into the scoped feed         |
| `limit`  | int 1–50                   | `10`    |                                          |
| `type`   | one of 10 `RecordType`     | —       | `missing_person`, `wanted_person`, …     |
| `status` | `active/resolved/closed/archived` | — |                                   |
| `scope`  | `all/mine/district/country` | `all`  | Feed tab narrowing only, never widens visibility |

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

**Offline-first filing (idempotency).** Field connectivity drops mid-request,
so `POST /records` accepts an `Idempotency-Key: <uuid>` header. The first
request stores its response; retries with the same key get the original
response back (`{ …, "idempotentReplay": true }`) instead of filing twice.
Generate one UUID per filing attempt on the device and reuse it across
retries of that attempt only.

### Tasking, referrals & matches

| Method | Path | Who | Description |
| ------ | ---- | --- | ----------- |
| `GET`  | `/assignments?view=mine\|assignable` | police / monitor | My task queue / users a monitor may task |
| `POST` | `/assignments` | monitor | Assign a case (`recordId, assigneeId, dueAt?, note?`) |
| `POST` | `/assignments/{id}` | assignee / monitor | `{ action: complete/cancel }` |
| `GET`  | `/referrals?view=mine\|outcomes` | liaison | Live referrals (with files) / outcome history |
| `POST` | `/referrals` | monitor | Refer a case to a court liaison |
| `POST` | `/referrals/{id}` | monitor / liaison | `{ action: renew/revoke/outcome, ... }` |
| `GET`  | `/court-liaisons` | monitor | Referral target picker |
| `POST` | `/matches` | police | Propose a record link |
| `POST` | `/matches/review` | monitor | Confirm / exclude a proposed match |

### Search & directory

| Method | Path | Who | Description |
| ------ | ---- | --- | ----------- |
| `GET`  | `/search?q=&limit=` | officer / monitor / registrar / insurer | Vehicles + persons + citations in one call |
| `GET/POST` | `/persons` (+ `GET /persons/{id}`) | police | Profile search / create / detail |
| `GET`  | `/vehicles/search?q=` (+ `GET /vehicles/{id}`) | police / registrar | Plate search / detail |
| `GET`  | `/catalog/record-types?domain=` | any | Filing type picker |
| `GET`  | `/catalog/branches?domain=` | any | Filing branch picker (scoped) |

### Citations, custody queues & audit

| Method | Path | Who | Description |
| ------ | ---- | --- | ----------- |
| `POST` | `/citations/payments` | police | Record a fine payment (countersign when issuer receipts own ticket) |
| `POST` | `/citations/void` | monitor | Void a spoiled/duplicate ticket |
| `POST` | `/citations/court-schedule` | monitor | Set the court appearance date |
| `GET`  | `/citations/search?q=` | police | Ticket / violation / plate search |
| `GET`  | `/citations/lookup?ticket=` | police | Resolve a ticket number |
| `GET`  | `/courts` | police | Court picker |
| `GET`  | `/reconciliation/summary` | monitor | Daily money reconciliation |
| `GET`  | `/locates/dormant` | monitor | Locates awaiting confirmation |
| `GET`  | `/watchlist/flagged?limit=` | police | Flagged plates in scope |
| `GET`  | `/audit/log?limit=` | monitor / auditor | Scoped audit trail |

### Notifications

| Method | Path              | Who  | Description                                    |
| ------ | ----------------- | ---- | ---------------------------------------------- |
| `GET`  | `/notifications`  | any  | `{ unread, items }` — referrals, outcomes, status changes, reviews |
| `POST` | `/notifications`  | any  | Mark read: `{ "id" }` for one, `{ "all": true }` for all |
| `DELETE` | `/notifications/{id}` | any | Dismiss one notification |

Poll `GET /notifications` on app foreground (or before showing a badge) —
referral recipients and filing officers learn about outcomes and status
changes here instead of out-of-band.

### Safety lookups

| Method | Path               | Who                        | Description                              |
| ------ | ------------------ | -------------------------- | ---------------------------------------- |
| `POST` | `/lookups`         | officer / monitor / insurer | Read-only flag checks, always audited   |
| `GET`  | `/lookups/plate?plate=` | officer / monitor / insurer | ANPR-ready flag check: `{ flagged, reasons }` |

Body — `SafetyLookupBody`

```json
{ "check": "wanted", "nationalId": "…" }
{ "check": "plate", "plateNumber": "MH 1234" }
```

- `wanted` (police only) → `WantedCheckResult` (`{ wanted, dangerLevel?, district? }`).
- `plate` → `FlagCheckResult` (`{ flagged }`). Insurer callers get the same
  boolean-only answer via their scoped path. Never returns case detail.
- `GET /lookups/plate?plate=MH+1234` → `PlateLookupResult`
  (`{ flagged, reasons }`): same throttle + audit as POST; `reasons` lists
  the active case classes (`missing_vehicle`, …) for police callers and is
  always `[]` for insurers. Built for camera/reader integrations.

Lookups are throttled per user (>20/min or >300/hr → `403` with a slow-down
message) and every attempt is audit-logged — surface the message, don't
auto-retry in a loop.

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
| `DELETE` | `/me`                 | any        | Self-service deactivation            |
| `POST` | `/me/phone`             | any        | `{ action: check/sync, phone }` number-change helpers |
| `GET`  | `/uploads/credentials`  | filing roles | Short-lived Cloudinary signing material |
| `GET`  | `/health`               | public     | Liveness probe                       |

Uploads accept images, PDFs, video, audio, and documents (endpoint follows the file kind, folder `trace/records/<userId>`),
then attached to a case via `POST /records` (`AttachmentInput`, optional `fileHash` SHA-256).
