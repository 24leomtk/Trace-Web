# TRACE — How It Works (Implementation Reference for Competitive Comparison)

> Purpose of this document: describe what TRACE **actually does today** (verified against `trace-web` codebase), how it is built, and how each part behaves — so it can be compared feature-by-feature against professional peers (police RMS, traffic enforcement systems, e-justice / prosecution portals, insurer self-service portals, vehicle registries). Last verified: 2026-09-17 from source (`app/`, `lib/`, `db/schema/`, `validations/`, `docs/mobile-api.md`, `TRACE-platform-concept.md`).

## 1. Executive summary

TRACE (**Tracking, Records & Case Evidence**) is a shared digital records platform for law-enforcement in Malawi, with two operational domains on one infrastructure:

| Domain | Covers (10 record types total) |
|---|---|
| **Regular** | `missing_person`, `wanted_person`, `stolen_property`, `crime_incident`, `arrest_record` |
| **Traffic** | `missing_vehicle`, `vehicle_offense`, `road_accident`, `traffic_citation`, `vehicle_impoundment` |

Three **external organizations** hold real scoped portal accounts (not batch feeds): **courts** (`court_liaison`), **insurers** (`insurance_portal_user`), **vehicle registry authority** (`vehicle_registrar`). Two platform roles (`system_admin`, `compliance_auditor`) have **no case-data access by design** (separation of duties).

Core design principle: **default-narrow visibility that widens deliberately.** Officer sees own branch; `access_level` (`branch → district → country`) escalates explicitly; court access is a per-case time-boxed grant; every out-of-scope read is audit-logged.

## 2. Tech stack & repo map

| Layer | Implementation |
|---|---|
| App | Next.js 16.2.6 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn / Radix UI, `next-themes` (dark mode) |
| Data | PostgreSQL (Neon serverless), Drizzle ORM (`db/schema/*.ts`), PostgreSQL Row-Level Security enforced via `withUserCtx()` (`lib/db-context.ts`: `SET LOCAL ROLE app_user` + `set_user_id()`) |
| Auth | `better-auth` with **phone-number + 6-digit OTP only** (`lib/auth.ts`); Malawi-only validator `+265XXXXXXXXX`; **no self-registration** — accounts provisioned by `system_admin`; `bearer` + `expo` plugins so native mobile uses `Authorization: Bearer` while web uses cookies; sessions/accounts/verifications tables in `db/schema/auth.ts` |
| Validation | Zod (`validations/record.ts` — 10 typed payloads; `validations/admin.ts` — referrals, outcomes, policies, admin provisioning) |
| Files | Cloudinary signed uploads (`lib/cloudinary.ts`, `lib/upload.ts`, `app/api/v1/uploads/credentials/route.ts`); **images only**, folder `trace/records/<userId>` |
| State / UX | TanStack React Query + server actions (`lib/actions/*`); `useInfiniteList` cursor pagination; `sonner` toasts; QR libs installed (`@yudiel/react-qr-scanner`, `qrcode`, `qrcode.react`) |
| Mobile | Expo React Native client consumes `GET/POST /api/v1/*` (`docs/mobile-api.md` + `docs/mobile-api-types.ts`), which **wrap the same server actions** as web (identical authz/validation/audit) |
| Tests / tooling | `tests/visibility.test.js` (`canViewRecord`), ESLint, Prettier, `drizzle-kit` |

Key paths:

```text
app/(app)/            role-routed web UI (page.tsx switches on role)
app/(auth)/           sign-in + OTP verify
app/api/v1/           mobile REST (records, lookups, notifications, analytics/feed, me, uploads, health)
lib/actions/          records, access (referrals/lookups/audit), vehicles, persons,
                      insurance, reviews, analytics, catalog, admin, notifications, uploads
lib/visibility.ts     canViewRecord() / isOwnScopeRead() — the permission kernel
lib/roles.ts          8 roles, police/monitor/external/platform helpers
lib/record-meta.ts    per-type label/icon/tone/domain; lib/record-view.ts → title/summary/badges
db/schema/            auth, branches, organizations, records, vehicles, persons,
                      coded (projections), court, insurance, reviews, actions (audit), notifications
db/sql/               Functions&Policies.sql (RLS helpers), Seed*.sql
```

## 3. Data model (what is stored)

### 3.1 Core tables

| Table | Grain | Key fields |
|---|---|---|
| `records` | 1 row per report | `record_type` (10), `domain` (derived + stored/indexed), `reported_by`, `branch_id`, `district` (28 Malawi districts enum), `vehicle_id?`, `person_id?`, `access_level`, `status` (`active/resolved/closed/archived`), `data` (jsonb typed payload) |
| `record_attachments` | photo per case/person/vehicle | `record_id?`, `person_id?`, `vehicle_id?`, `url`, `storage_path`, `file_type`; inherits parent record's `access_level` |
| `vehicles` | 1 row per plate (shared across domains) | `plate_number` (unique, uppercased), make/model/year/color/chassis/engine, owner fields, `is_flagged` (indexed boolean), `is_verified` + `registered_by`/`verified_at` |
| `persons_of_interest` | members of public, **not** system users | `full_name`, `national_id` (indexed), DOB, sex, home district, features, photo; linked across cases |
| `missing_person_cases`, `wanted_person_cases`, `vehicle_cases`, `accidents` + `accident_vehicles`, `traffic_citations` | **coded projections** (fast lookup, no jsonb scans) | Written in app code (`writeCodedProjections()` in `lib/actions/records.ts`), e.g. `vehicle_cases(plate_number, case_type, status)`, `accidents(location, date, fatalities, injuries)` |
| `branches` | police station/post | `name`, `domain`, `district`, location/phone; a building with both functions = 2 rows |
| `organizations` | external body | `name` (unique), `org_type` (`court/insurer/vehicle_registry`), district (courts), contacts |
| `users` | provisioned account | `phone_number` (unique, login), `badge_number` (police), `role` (8), `domain?`, `branch_id?`, `district?`, `organization_id?`, `is_active` |
| `court_case_access` | per-case grant | `record_id`, `court_liaison_id`, `referred_by`, `reason`, `expires_at` (default +90d), `renewed_at`, `renewal_count`, `revoked_at`, `outcome` (`pending/charged/withdrawn/dismissed/convicted/acquitted/other`) + notes/who/when |
| `insurance_policies` | insurer-entered policy | `vehicle_id`, `insurer_id` (org), `policy_number` (unique per vehicle), coverage, `start/end_date`, `is_active`, `external_reference`, `entered_by` |
| `case_reviews` | append-only monitor note | `record_id`, `reviewer_id`, `note` (not an edit of the case) |
| `actions` | append-only audit log (never UPDATE/DELETE) | `record_id?`, `vehicle_id?` (covers vehicle-only lookups incl. "no match"), `actor_id`, `action_type` (19 values), `reason`, IP/device |
| `notifications` | inbox | `user_id`, `type` (`referral_received/referral_updated/outcome_recorded/status_changed/review_added`), `record_id?`, `message`, `is_read` |

### 3.2 Record payloads (`validations/record.ts`)

Each `record_type` has a strict Zod shape stored in `records.data`. Examples:

- **missing_person**: person link?, name, national ID?, age, sex, last-seen place/date, reporter + relationship + contact.
- **wanted_person**: person link?, name, national ID?, offense, `danger_level` (low/medium/high/extreme), warrant?, last-known location, description.
- **crime_incident**: type, description, location, date, victims[], witnesses[], linked person IDs.
- **arrest_record**: person link?, name, charges[], location/date/officer, linked wanted-record ID.
- **vehicle types**: always carry `plate_number`; accident carries `vehicles_involved[{plate_number, role}]` + fatalities/injuries; citation carries violation + `fine_amount` + `is_paid` (in projection).

`records.domain` is derived from type via `domainForRecordType()` and stored for indexed filtering.

## 4. Roles & permissions (as implemented)

| Role | Scope | Feed | Create | Update / status | Escalate | Court referral | Audit | Special |
|---|---|---|---|---|---|---|---|---|
| `OFFICER` | own branch + domain | own branch + `district` (own district) + `country` (domain-wide) | own domain, own branch only | own filings while `active` | widen own filing upward only (never de-escalate) | no | no | safety lookups (minimal); ad-hoc vehicle create (`is_verified:false`); citation paid toggle on own |
| `DISTRICT_MONITOR` | district + domain | all in district+domain | same + district bulletins (via `branchId` in scope) | anything in district (incl. status, reassign within district+domain) | up/down | refer/renew/revoke | district-scoped | reviews; analytics (district) |
| `COUNTRY_MONITOR` | domain nationwide | only `access_level:country` in domain (+ aggregates for the rest) | national bulletins (any branch in domain) | only `country`-level in domain | to `country` only | refer/renew/revoke nationwide | domain-wide | analytics (national + district breakdown with `<5` suppression) |
| `SYSTEM_ADMIN` | platform | none | users/branches/orgs/phones | no case data at all | — | — | full | provisioning only |
| `COMPLIANCE_AUDITOR` | cross-domain | none (audit log only, no drill-down to cases) | none | none | — | — | full | read-only |
| `COURT_LIAISON` | own account + live grants | `getMyReferrals()` (live only) | none | outcome + notes on own referral (allowed even after expiry so loop can close) | — | cannot self-renew | no | attachments on referred case |
| `INSURANCE_PORTAL_USER` | own insurer org | own org policies (max 100) | policies for own org (vehicle must pre-exist) | own org policies | — | — | own actions logged | boolean-only `insurerPlateLookup(plate)` |
| `VEHICLE_REGISTRAR` | national registry | full vehicle registry | authoritative vehicles (`is_verified:true`) | verify/enrich ad-hoc rows **in place** (ID stable, case links preserved) | — | — | own actions logged | no case/person/insurance access; flag visibility is policy-gated |

Permission kernel (`lib/visibility.ts:canViewRecord`): officer = same-branch OR (`district` + same district) OR (`country` in domain); district monitor = same district+domain (all levels); country monitor = same domain + `country` only; all others = no direct case access (court via `hasLiveGrant()`). Cross-domain full files are never exposed — only **safety lookups** (`wanted` → `{wanted, dangerLevel?, district?}`; `plate` → `{flagged}`), always audited + throttled (>20/min or >300/hr → 403).

## 5. End-to-end workflows

1. **Provisioning → sign-in.** Admin creates user (role+domain+branch/district/org, phone, badge) → user signs in with phone + OTP (5-min expiry, `+265` only; no SMS gateway yet — OTP logged server-side; demo OTP/numbers routes exist). No public registration.
2. **Filing a case** (`POST /records` / `createRecord`). Officer files in own domain+branch; monitors pass `branchId` (validated in scope). Payload validated by Zod; plate auto-normalized (uppercase/trim) and **find-or-created** as unverified vehicle; `person_id` links if matched; coded projections + `is_flagged` refreshed; attachments (Cloudinary URLs) linked; `record_created` audited. Mobile sends `Idempotency-Key` — replays return original response with `idempotentReplay:true` (offline-safe).
3. **Viewing / listing.** `listRecords({cursor, limit≤50, type?, status?})` pushes visibility into SQL (stable pagination, unreadable rows never leave DB). `getRecord(id)` gates via `canViewRecord` or live court grant; own-branch officer reads are unlogged, **everything wider is audited** (`record_viewed` / `cross_branch_access` / `cross_district_access` / `court_case_viewed`), denied reads also logged.
4. **Editing.** Only while `status=active`, by filer or in-scope monitor; content otherwise locked (use status/notes). Rewrites projections; `record_updated` with "Filing officer edit" vs "Monitor reviewed change".
5. **Escalation.** Officers widen own; district monitors up/down; country monitors to `country` only. Deliberate logged action — never implicit.
6. **Review queue.** Monitor (or filer on own) adds `case_reviews` note → `review_added` + notify filer.
7. **Court loop.** Monitor refers (`courtReferralSchema`, default expiry +90d) → liaison notified → liaison opens via grant (`court_case_viewed`) → liaison records outcome (`courtOutcomeSchema`) → referring officer notified + `court_case_outcome_recorded`. Monitors renew (+90d, unlimited, counted) or revoke early. Listing referrals is unaudited; opening is audited.
8. **Insurance loop.** Insurer creates/updates own-org policies (`insurancePolicySchema`; vehicle must exist) → `policy_entered/updated`. Plus self-serve boolean flag lookup (`insurer_flag_lookup`). Reads use `isPolicyLive()` (active + within dates).
9. **Registry loop.** Registrar creates verified rows or verifies/enriches officer ad-hoc rows without changing ID → `vehicle_registered`. `isFlagged` maintained automatically while an active `missing_vehicle`/`vehicle_offense`/`vehicle_impoundment` points at the plate.
10. **Safety checks.** `checkWantedByNationalId` (person index → active wanted projections → fallback bounded scan of 50 active wanteds for unlinked filings) and `checkPlateFlag` (single indexed `isFlagged` read). Minimal returns, throttled, audited.
11. **Analytics.** Monitors pull `getAnalyticsFeed()` → cards: volumes by type, resolution rate, accident last-30d (traffic), citations issued/paid, district caseload (country; groups `<5` suppressed but counted in total). Each pull = `report_generated`.
12. **Notifications.** Poll `GET /notifications` (`{unread, items}`); badge in nav (60s refetch); mark one/all read. Covers referrals, outcomes, status changes, reviews.
13. **Uploads.** `GET /uploads/credentials` → short-lived Cloudinary signature → client uploads image → URL attached at filing.

## 6. Web UI (mobile-first) — what each role sees

Design language: narrow centered column (`max-w-2xl`), card/timeline feed, floating pill nav (bottom-center on mobile, right-rail on desktop), tone-coded dots/badges per record type (`lib/record-meta.ts`), dark-mode toggle, global loader/skeletons, `cmk`-powered filter command, responsive modals, confirm dialogs.

| Route | Who | What |
|---|---|---|
| `/` (Home) | officer/monitor | "Branch cases" / "District oversight" / "National oversight" + posting label; monitors get Cases/Reports tab (`AnalyticsFeed` vs `RecordTimeline`); timeline rows: date, `TYPE · access · status`, title (link), summary, attachment count button, author + badges; infinite scroll (`cursor`), type+status filters |
| `/records/new` | police | filing form per type (Zod-driven) + access-level picker + branch picker (monitors) + image upload |
| `/records/[id]` | police / referred liaison | detail: title/summary/badges, payload fields, linked vehicle/person links, attachments modal, status + access controls (monitors), referral panel (monitors), outcome panel (liaison), reviews thread, reassignment (district monitor) |
| `/vehicles/[id]`, `/persons/[id]` | police | registry profile + linked-case counts + case links |
| `/lookup` | police + insurers | wanted-by-national-ID (police) and plate-flag (police boolean + insurer self-serve) forms with throttle messaging |
| `/audit` | monitors/admin/auditor | `AuditLog`: actor, action, time, detail (district monitor filtered to own district + own actions) |
| `/admin/*` | system_admin | users / branches / organizations management + section nav; **no case views** |
| `/` | court_liaison | `CourtHome`: live referrals + outcome history |
| `/` | insurer | `InsurerHome`: own policies table + flag lookup |
| `/` | registrar | `RegistrarHome`: registry search + verify/enrich queue |
| `/` | auditor | audit-only home (`limit 100`) |
| `/notifications`, `/profile` | all | inbox (unread badge `9+` cap); profile (posting, role, domain/district/org, phone, badge) |

## 7. Mobile API surface (`/api/v1`)

| Method | Path | Who | Notes |
|---|---|---|---|
| `GET /records?cursor&limit&type&status` | officer/monitor | scoped paginated feed |
| `GET /records/{id}` | officer/monitor/liaison | visibility-gated single |
| `POST /records` (+ `Idempotency-Key`) | officer/monitor | file case; `accessLevel` default `branch` |
| `POST /lookups` `{check:"wanted",nationalId}` / `{check:"plate",plateNumber}` | police (+ insurer plate path) | audited, throttled, minimal returns |
| `GET /notifications`, `POST /notifications` (`{id}` or `{all:true}`) | any authed | inbox |
| `GET /analytics/feed` | monitors | scoped cards, audited |
| `GET /me` | any | profile + scope |
| `GET /uploads/credentials` | filing roles | Cloudinary signing |
| `GET /health` | public | liveness |
| `POST /api/auth/[...all]` | public | better-auth (OTP) |

Errors: `{error}` + `details.issues[]` on 422; statuses 400/401/403/404/422/500 per `docs/mobile-api.md`. All (except health) require session; `no-store`.

## 8. Security, audit & compliance model

- **Defense in depth:** app-level `canViewRecord` gates + RLS (`app_user` + `app_can_read_record()`) + visibility pushed into SQL + append-only `actions` log + denied-attempt logging.
- **19 audit actions:** record CRUD/view, status, cross-branch/district, report generation, full court lifecycle (referred/viewed/outcome/renewed/expired), policy entered/updated, review added, insurer lookup, vehicle registered, user provisioned.
- **Privacy controls:** country-monitor aggregates with `<5` suppression; insurer/registrar/court/auditor hard scope walls; lookup throttling against enumeration; minimal safety-lookup returns.
- **Known gaps to probe in comparison:** no CHECK-constraint enforcement of user-scope nullability (app-level only, noted in `db/schema/auth.ts`); OTP without SMS gateway; images-only uploads; free-text locations (no GIS); no per-officer assignment (branch-level only); no citizen-facing portal.

## 9. Malawi localization

28-district enum everywhere (branch, record, person home, vehicle owner, org for courts); `+265` phone auth; district-scoped monitors; posting labels ("Lilongwe Central (Regular)"); accident/citation/district analytics tuned to local reporting.

## 10. Comparison framework (use against peers)

### 10.1 Dimensions to score 0–5 per platform

1. **Case coverage:** regular vs traffic vs specialized (GBV, cyber, forensics) — TRACE has 10 types, no dedicated GBV/cyber/forensics modules.
2. **Registry model:** shared person/vehicle entities vs free-text per case — TRACE links; check deduplication/fuzzy-match, biometric/national-ID integration.
3. **Access model:** branch/district/country tiers + per-case court grants vs RBAC/ABAC, case-level ACLs, break-glass.
4. **External portals:** courts/insurers/registry natively vs API-only vs none — compare onboarding, scoping, expiry/renewal, outcome close-the-loop.
5. **Field usability:** phone-OTP login, mobile-first UI, offline/idempotency, throttled low-bandwidth lookups — compare offline-first depth, USSD/SMS fallback, device management.
6. **Evidence handling:** image-only Cloudinary vs chain-of-custody, hashing, retention, video/audio, redaction.
7. **Analytics:** static feed cards vs dashboards, maps/hotspots, time-series, exports, data-warehouse hooks.
8. **Audit & compliance:** append-only log with denied-attempt capture vs tamper-evident WORM, SIEM export, auditor drill-down policy.
9. **Interoperability:** REST for one mobile client vs OpenAPI, webhooks, national ID / court CMS / insurance bureau / DVLA integrations, standards (NIEM, GJXDM, UCR/NIBRS equivalents).
10. **Ops & admin:** provisioned-only users, branch/org management, deactivation, bulk import, seeded districts — compare SSO, MFA, lifecycle automation.

### 10.2 Feature checklist (TRACE = ✓/◐/✗)

| Capability | TRACE today | Ask of peers |
|---|---|---|
| File/search 10 police case types | ✓ | same + which extra types |
| Branch/district/country visibility tiers | ✓ | same + custom tiers |
| Per-case time-boxed external grants + renewal/revoke | ✓ (courts) | same for other externals? |
| Outcome close-the-loop to filer | ✓ | same + SLA tracking? |
| Insurer self-service policies (not batch) | ✓ | same + bureau sync? |
| Registrar verify-in-place (no duplicate rows) | ✓ | same + deduplication rules? |
| Boolean-only safety lookups, throttled + audited | ✓ | same + rate limits? |
| Reviews/notes without editing history | ✓ | same + @mentions/tasks? |
| Status lifecycle + citation paid flag | ✓ (◐ citations only) | fines ledger, receipts, reconciliation? |
| Notifications inbox + badge | ✓ | push/SMS/email? |
| Analytics feed (volumes, resolution, accidents, citations, districts) | ✓ (◐ static cards) | dashboards, maps, exports? |
| Image attachments | ✓ (◐ images only) | video/audio/docs, chain-of-custody? |
| Offline filing (idempotency key) | ◐ (replay-safe, no full offline queue/sync) | full offline-first? conflict resolution? |
| Maps/GIS/hotspots | ✗ (free-text location) | GIS, geofencing, hotspot policing? |
| Individual assignment/dispatch/escalation SLA | ✗ (branch-level + reassignment) | tasking, workload, SLA timers? |
| Citizen reporting / public portal | ✗ (provisioned staff only) | public intake, tracking numbers? |
| Messaging / collaboration | ✗ (reviews + notifications only) | case chat, mentions, audit-safe comms? |
| Biometrics / national-ID lookup | ✗ (manual ID match) | live ID verification, fingerprint? |
| Document generation (warrants, dockets, citations print) | ✗ (no evidence of templates) | templates, e-signature, print? |
| Full-text / fuzzy / cross-case link analysis | ✗ (type/status + indexed plate/ID) | search, entity resolution, link charts? |

### 10.3 UI questions to carry into demos

- How many taps from home to file each case type? to run a plate/wanted check? (TRACE: home → floating-nav File/Lookups; timeline filter via command palette.)
- Is the default view narrow-by-posting with explicit escalation, or broad-by-default? How is escalation surfaced/undone?
- How are external users kept from "browse everything"? Is expiry automatic (TRACE: 90d default) and is post-expiry outcome entry preserved?
- How does the feed distinguish *my branch* vs *escalated-to-me* vs *national bulletin* at a glance (TRACE: `TYPE · access · status` + tone dots)?
- What happens on poor connectivity — queued drafts, replay-safety, throttle messaging?
- How do monitors triage: review queue, reassignment, district vs national reports, small-group suppression?
- What does the auditor see, and can they *not* open cases (TRACE: yes, log-only)?

### 10.4 Highest-leverage improvements suggested by this gap scan

**Functionality:** (1) full-text + fuzzy person/plate search with entity-resolution queue; (2) GIS capture + hotspot maps; (3) per-officer assignment with SLA/due-dates; (4) citation fine ledger (balance, receipts); (5) citizen intake with tracking + staff triage; (6) richer evidence (video/audio/PDF, hash + retention); (7) case link graph (person↔vehicle↔case); (8) dashboard exports + scheduled reports; (9) SMS/push notifications + SMS OTP gateway; (10) document templates (docket, warrant, impound receipt).

**UI/UX:** (1) distinguish scope visually (My branch / District / National / Referred tabs or filters); (2) one-tap field actions (Scan plate/ID → flag result) with offline states; (3) filing wizard with drafts + resume; (4) registrar/insurer/court queues with expiry countdowns and bulk actions; (5) analytics with charts + district drill-down (keeping `<5` suppression); (6) accessibility/contrast + Chichewa labels for field flows; (7) empty/error/skeleton states already good — extend to lookup "clear" vs "flagged" with next-action guidance.

---

*Sources: `TRACE-platform-concept.md` (roles/access intent), `db/schema/*.ts` + `db/sql/` (actual model/RLS), `lib/visibility.ts` + `lib/actions/*` (enforcement), `validations/*` (payload truth), `app/(app)/*` + `components/app/*` (role UI), `docs/mobile-api.md` (mobile contract), `lib/auth.ts` + `lib/session.ts` (auth truth). Where concept and code differed, code wins above.*
