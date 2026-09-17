# TRACE — Implementation Tracker (Improvement Plan → Build)

> Tracks every item from `TRACE-platform-improvement-plan.md`. Status: `done` = merged + verified, `in_progress` = being built, `pending` = not started, `deferred` = explicitly later. Update this file with each change. Phase order: 1 → 2 → 3 → Strategic.

## Phase 1 (P0 field value — build now)

| ID | Item | Status | Notes / evidence |
|---|---|---|---|
| U1 | Scope-aware feed tabs (My branch / District / National) | done | `listRecords({scope})` + `HomeViewContext.feedScope` + OfficerHome tabs + RecordTimeline key + mobile `scope` query param |
| U4a | Court referral expiry countdown chips | done | CourtHome `expiresAt` → days-left chip (green/amber/red) via `format.ts` helpers |
| U4b | Registrar backlog age (days waiting) | done | RegistrarHome queue shows age from `createdAt` |
| U4c | Policy live/expiry chips with days left | done | InsurerHome `isPolicyLive` + `daysUntil(endDate)` chip |
| U2 | Roadside mode (normalize + CLEAR/FLAGGED cards + next action) | done | Lookup page: `normalizePlate`, result cards with next-action guidance, rate-limit note |
| F1 | Scan-to-prefill (camera → plate/ID) | done | `ScanSheet` (camera QR/barcode, graceful fallback) on lookup (plate + ID) and filing form (`plate_number`/`national_id`); `normalizePlate` shared helper |
| F5a | Unified search action (vehicles + persons, one call) | done | New `lib/actions/search.ts` wrapping existing scoped searches; lookup page uses it |
| F5b | Duplicate merge queue UI | done | `mergePersons` + person-page merge UI already exist — verify + keep |
| U3 | Filing wizard with drafts + inline field links | done | 4-step wizard (Type → Details → Visibility & files → Review), localStorage drafts (autosave/resume/discard), error summary with jump-to-field anchors (`scrollToField` + field ids) |
| N5 | DB hardening (CHECK constraints, trigram, RLS tests) | done | `db/sql/Phase1-hardening.sql` (**APPLY PENDING**: run `psql "$DATABASE_URL" -f db/sql/Phase1-hardening.sql`); trigram indexes for F5; `users_role_scope_chk`; format-helper unit tests added, `test:visibility` 26/26 green |

## Phase 2 (justice + money — next)

| ID | Item | Status | Notes |
|---|---|---|---|
| F3 | Citation fine ledger + court date + ticket print | done | `citation_payments` ledger + `traffic_citations{court_date,court_id}`; `is_paid` derived; `lib/actions/citations.ts` (ledger/pay/schedule/courts); `CitationLedger` (printable QR ticket, payments, receipts, court form); projection rewrite preserves court/paid; `markCitationPaid` removed. **APPLY PENDING**: `psql "$DATABASE_URL" -f db/sql/Phase2-citations.sql`. Tests 30/30 green |
| F4 | E-Brief bundle + referral SLA dashboard | done | `referral_documents` tranches + `first_viewed_at`; `lib/actions/referrals.ts` (bundle/upload/remove/SLA report); `ReferralBundle` (brief + checklist + tranches) on case page for monitors + liaisons; SLA chips on referrals; outcome chips on CourtHome; referrals timeliness in analytics feed. **APPLY PENDING**: `psql "$DATABASE_URL" -f db/sql/Phase2-ebrief.sql`. Tests 33/33 green |
| F9 | Assignment + due dates + multilevel review | pending | Requires `case_assignments` |
| U5 | Consolidated case pane (tabs) | pending | Record detail refactor |
| U6 | Actionable analytics (charts, drill-down, CSV) | pending | Keep `<5` suppression |
| N2 | Files: PDF/audio/video + hash + retention | pending | Extend `AttachmentKind` |

## Phase 3 (scale — later)

| ID | Item | Status | Notes |
|---|---|---|---|
| F2 | Offline outbox queue | pending | Idempotency-Key replay already exists |
| F6 | ANPR-ready flag endpoint + VOI discipline | pending | `<300ms` reader endpoint + review dates |
| F7 | Bulk insurer ingest (CSV/API + exceptions) | pending | Keep manual entry |
| F10 | GIS capture + hotspots | pending | Nullable lat/lng, no hard gate |
| N1 | SMS gateway (OTP + notifications) | pending | OTP now console-logged |
| N4 | OpenAPI + API keys | pending | Generate from `mobile-api-types.ts` |

## Strategic (partner-gated)

| ID | Item | Status | Notes |
|---|---|---|---|
| F8 | Booking + chain-of-custody | pending | Needs policy + court agreement |
| F11 | Citizen intake + complainant SMS | pending | Needs policy + SMS gateway |
| F12 | National-ID/biometric adapter | pending | Adapter only; no AFIS build |
| F13 | CAD import + interagency share | pending | Import endpoint first |

## CMS-compat gate (before divergence)

| Item | Status | Notes |
|---|---|---|
| Obtain UNDP CMS dictionary + docket/OB numbering | pending | Do not run two number schemes in same stations |
| Shared branch/district codes + export (CSV/REST) | pending | 28 districts already match |

## Log

- 2026-09-17: Tracker created; Phase 1 started (U1 scope filter, U4 countdowns, U2 roadside normalize, F5 unified search).
- 2026-09-17: Phase 1 batch 1 implemented (U1, U2, U4a/b/c, F5a; F5b confirmed existing). Full `typecheck`/`eslint` timed out in this environment (large project, slow disk) — changes reviewed via diff; re-run `pnpm typecheck` and `pnpm test:visibility` before merging. Next: F1 camera scan, U3 wizard/drafts, N5 hardening.
- 2026-09-17: Phase 1 batch 2 implemented (F1 ScanSheet on lookup + filing, U3 wizard/drafts/error-anchors, N5 hardening SQL + unit tests). `pnpm test:visibility` 26/26 green. Full `typecheck`/`eslint` still too slow here — re-run before merging. Phase 1 code complete except re-verification; remaining: apply `Phase1-hardening.sql` to the database, then start Phase 2 (F3 fine ledger).
- 2026-09-17: Phase 2 started — F3 implemented (ledger + court scheduling + QR ticket + receipted payments). `pnpm test:visibility` 30/30 green. Apply `Phase2-citations.sql` to the database alongside `Phase1-hardening.sql`. Next: F4 e-Brief bundle + referral SLA.
- 2026-09-17: F4 implemented (e-Brief bundle + tranches + SLA: schema, actions, bundle UI, SLA chips, CourtHome outcome chips, analytics timeliness). `pnpm test:visibility` 33/33 green. Apply `Phase2-ebrief.sql` too. Next: F9 assignment + review queue.
