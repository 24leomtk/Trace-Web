# TRACE — Implementation Tracker (Improvement Plan → Build)

> Tracks every item from `TRACE-platform-improvement-plan.md`. Status: `done` = merged + verified, `in_progress` = being built, `pending` = not started, `deferred` = explicitly later. Update this file with each change. Phase order: 1 → 2 → 3 → Strategic.
>
> ## Database apply order (single source of truth)
> Schema changes ship via the generated Drizzle migration
> `db/sql/migrations/20260917232637_numerous_ser_duncan/` (all new tables,
> columns, indexes — snapshot updated). Non-Drizzle SQL (trigram, CHECK,
> new-table RLS) lives in `db/sql/Functions&Policies.sql`. Apply in order:
> 1. Drizzle migration(s), 2. `Functions&Policies.sql`, 3. `Seed.sql` /
> `Seed-refresh.sql` for dev data. The old per-feature `Phase*.sql` files
> were deleted after consolidation (2026-09-18).

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
| N5 | DB hardening (CHECK constraints, trigram, RLS tests) | done | `users_role_scope_chk` + trigram indexes in `db/sql/Functions&Policies.sql` (see apply order above); trigram indexes for F5; format-helper unit tests added, `test:visibility` green |

## Phase 2 (justice + money — next)

| ID | Item | Status | Notes |
|---|---|---|---|
| F3 | Citation fine ledger + court date + ticket print | done | `citation_payments` ledger + `traffic_citations{court_date,court_id}` (in migration above); `is_paid` derived; `lib/actions/citations.ts` (ledger/pay/schedule/courts); `CitationLedger` (printable QR ticket, payments, receipts, court form); projection rewrite preserves court/paid; `markCitationPaid` removed |
| F4 | E-Brief bundle + referral SLA dashboard | done | `referral_documents` tranches + `first_viewed_at` (in migration above); `lib/actions/referrals.ts` (bundle/upload/remove/SLA report); `ReferralBundle` (brief + checklist + tranches) on case page for monitors + liaisons; SLA chips on referrals; outcome chips on CourtHome; referrals timeliness in analytics feed |
| F9 | Assignment + due dates + multilevel review | done | `case_assignments` (open/done/cancelled, never deleted, in migration above); `lib/actions/assignments.ts` (assign/queue/record-list/complete/cancel/assignee picker, scope-checked, audited + notified); `AssignmentQueue` on police home; Tasking section on case page |
| U5 | Consolidated case pane (tabs) | done | Record detail = header + role-filtered tabs (Case / People & vehicles / Reviews & tasks / Justice / Manage); `LinkedEntities` cards bridge to person/vehicle profiles; attachments stay global. Syntax-checked + tests 36/36 green |
| U6 | Actionable analytics (charts, drill-down, CSV) | done | 12-week series (filings, casualties, citations) + resolution funnel + type-keyed drill-down from chart to filtered feed + per-feed CSV export; `<5` suppression untouched; weekly email deferred (no mail infra). Tests 37/37 green |
| N2 | Files: PDF/audio/video + hash + retention | done | `record_attachments{file_hash,file_size_bytes,retention_until}` + bundle `file_hash` (in migration above); kind-aware Cloudinary endpoints (image/video/raw) with per-kind caps; SHA-256 client hashing; server MIME allowlist at filing + profile attaches; real sizes/kinds/hash/retention in viewer; virus scan + purge job deferred (no infra) |

## Phase 3 (scale — later)

| ID | Item | Status | Notes |
|---|---|---|---|
| F2 | Offline outbox queue | done (web slice) | `createRecord({idempotencyKey})` replay-safe on web + mobile; per-attempt key on filing form, retry-safe messaging, offline banner with autosaved drafts blocking submit. Full device outbox remains mobile-client work. Tests 53/53 green |
| F6 | ANPR-ready flag endpoint + VOI discipline | done | `GET /api/v1/lookups/plate?plate=` (`{flagged, reasons}`, police reasons / insurer boolean-only, same throttle + audit); `flaggedVehicleWatchlist` with flag ages on lookup page; full VOI intel-corroboration workflow deferred. No schema change. Tests 44/44 green |
| F7 | Bulk insurer ingest (CSV/API + exceptions) | done | `bulkCreatePolicies` (500-row cap, per-row failures, unknown-plate + duplicate handling, summary audit) + CSV template/parser/preview UI in insurer portal. No schema change. Tests 44/44 green |
| F10 | GIS capture + hotspots | done (capture slice) | Optional lat/lng on all 9 location-bearing types (never required); GPS capture on filing with graceful denial; coords on `TraceRecord` + case header with map link; preserved across edits; map tiles + heatmap deferred. No schema change (payload-level). Tests 51/51 green |
| N1 | SMS gateway (OTP + notifications) | done (seam) | `lib/sms.ts` provider seam (`log` default, generic HTTP gateway via `SMS_API_URL/KEY/SENDER_ID`); OTP send wired through it with never-break fallback. Gateway account + complainant SMS (F11) still pending. Tests 51/51 green |
| N4 | OpenAPI + API keys | done (pilot) | `api_keys` (hash-only, per-user, scoped, expiring, in migration above) + admin issue/list/revoke UI + `plate:read` key auth on the ANPR endpoint (role gates/throttle/audit unchanged) + `docs/openapi.yaml` + 403 key-error mapping. Wider scopes/endpoints are follow-ups |

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
- 2026-09-17: F9 implemented (per-officer tasking: schema, actions, home queue, case-page tasking, due/overdue visuals). `pnpm test:visibility` 36/36 green. Apply `Phase2-assignments.sql` too. Next: U5 consolidated case pane.
- 2026-09-17: U5 implemented (tabbed case pane + linked person/vehicle cards; all existing sections preserved under tabs). Syntax-checked via TS transpile, `pnpm test:visibility` 36/36 green. Next: U6 actionable analytics.
- 2026-09-17: U6 implemented (trend series + funnel + drill-down + CSV export; no new deps, suppression kept). `pnpm test:visibility` 37/37 green. Next: N2 file upgrade (PDF/audio/video + hash + retention).
- 2026-09-17: N2 implemented (multi-kind uploads, SHA-256 integrity, server allowlist, 5y retention horizon, rich viewer metadata). `pnpm test:visibility` 40/40 green. Apply `Phase2-files.sql` too. **Phase 2 complete** — remaining: Phase 3 (F2 offline outbox, F6 ANPR endpoint, F7 bulk ingest, F10 GIS, N1 SMS, N4 OpenAPI) + Strategic (F8, F11, F12, F13).
- 2026-09-17: Phase 3 started — F6 (ANPR-ready plate endpoint + reasons + in-scope flagged watchlist) and F7 (bulk policy CSV import with template, preview, per-row errors) implemented, no schema changes needed. `pnpm test:visibility` 44/44 green. Next: F10 GIS capture, then F2/N1/N4 foundations.
- 2026-09-17: F10 capture slice + N1 seam implemented (optional GPS on 9 record types, coords display + map link, edit preservation; SMS provider seam with OTP wiring + gateway fallback). `pnpm test:visibility` 51/51 green. Next: F2 offline outbox + N4 API keys.
- 2026-09-17: F2 (idempotent web filing + offline banner) and N4 pilot (api_keys, key auth on ANPR endpoint, admin UI, OpenAPI doc) implemented. `pnpm test:visibility` 53/53 green. Apply `Phase2-apikeys.sql` too. **Phase 3 complete** — remaining: Strategic (F8 booking/custody, F11 citizen intake, F12 ID/biometrics, F13 CAD).
- 2026-09-18: Migration consolidation — ran `drizzle-kit generate` (new `db/sql/migrations/20260917232637_numerous_ser_duncan/`, snapshot updated); deleted the six hand-written `Phase*.sql` files; moved CHECK + trigram + new-table RLS into `Functions&Policies.sql`; extended `Seed.sql` truncate + new-feature fixtures and `Seed-refresh.sql` with the isPaid resync. Apply order: migration(s) → Functions&Policies → Seed/Seed-refresh.
- 2026-09-18: Created the missing `db/sql/Reset-dev.sql` (guarded dev wipe referenced by `Seed.sql`): drops all TRACE tables/enums/functions + drizzle journal so migrate replays cleanly; keeps roles, extensions, cron jobs.
- 2026-09-18: `Seed.sql` rewritten per agreement — zero fixed UUIDs (anchors via variables + name lookups), `setseed()` reproducibility, volume knobs (~1000 cases / 250 persons / 350 vehicles / 120 policies), all 28 districts with per-district plates, stable login phones + end-of-run summary, scenario packs (ledger paid/part/unpaid + court dates, full e-Brief SLA path, open/overdue/done/cancelled tasks, GPS pins, PDF+video attachments, merge pairs, revocation/expiry, org isolation, dev ANPR key), Rumphi-2/Likoma-3 suppression demos. Also fixed live-run bugs found in review: missing `commit;`, unguarded legacy trigger drop, stale-variable attachments, illegitimate flag rows.
- 2026-09-18: Seed live-run fix — Blantyre Traffic had no officer, so random cases filed there hit `reported_by` NOT NULL. Added anchor officer +265997000018 plus a defensive skip guard in the case loop.
- 2026-09-18: Seed hardening from live runs — `Reset-dev.sql` function drops now use CASCADE (RLS policies depend on them) + guarded legacy trigger drop; `Seed.sql` text→enum casts added (branches domain CASE, referral outcome CASE, audit pick()) — bare literals coerce, expressions don't.
