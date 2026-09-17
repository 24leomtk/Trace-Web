# TRACE — Improvement Plan from Competitive Comparison

> Derived from `TRACE-platform-how-it-works.md` (TRACE today, verified in code) + `TRACE-platform-comparison-findings.md` (peers, researched 2026-09-17). Each item names the peer benchmark, the TRACE gap, and a buildable change with acceptance criteria. Priority: **P0 = must** (field value / parity risk), **P1 = should** (differentiation), **P2 = later** (scale/integration).

## 0. Strategic constraint first: Malawi Police + UNDP Crime Management System

The UNDP/Malawi Police CMS (July 2026, report-to-disposal tracking + trends + justice coordination) overlaps TRACE's regular domain almost 1:1. Before building:

1. Get its data dictionary, docket/OB numbering, station rollout list, and justice-handoff format.
2. Decide: **(a)** TRACE = traffic + registry + insurer + court-portal complement that interoperates, or **(b)** TRACE = alternative full-stack pilot. Do not run two divergent case-number schemes in the same stations.
3. Minimum interop regardless of (a)/(b): shared `branch/district` codes (28 districts already match), QR/docket-number parity, and an export (CSV + REST) for CMS.

All items below assume TRACE continues as an independent pilot but stays CMS-compatible.

## 1. Functionality improvements

### F1. Scan-to-prefill for plates, licences, VINs (P0)
- **Today:** every plate/ID is typed by hand (`validations/record.ts`); no scan path despite QR deps installed.
- **Benchmark:** TraCS (~200 keystrokes saved/citation, ~750/crash), Indiana eCWS (DL + registration scan), Motorola ANPR-integrated stop.
- **Change:** add `plate_scan` / `licence_scan` buttons on vehicle_offense, traffic_citation, road_accident, missing_vehicle forms + `/lookup`: camera → OCR/QR → uppercase-normalised prefill + instant `checkPlateFlag`/`checkWantedByNationalId`. Log scan-assisted filing in `actions.reason`.
- **Accept:** field test shows median filing time down; scan failures fall back to typing with no data loss.
- **Touches:** `app/(app)/records/new`, `app/(app)/lookup`, `lib/actions/access.ts`, new `lib/actions/scan.ts` (validation/normalisation only). Effort: M. Impact: very high.

### F2. True offline capture queue (P0)
- **Today:** only `Idempotency-Key` replay on `POST /records`; no queued drafts, no coverage-independent mode.
- **Benchmark:** NC eCitation (works with/without coverage), TraCS mobile + office repository.
- **Change:** device outbox: draft (type + payload + photos pending upload) → auto-retry with same idempotency key → `idempotentReplay` handling already exists; conflict rule = server wins, client keeps copy. Show outbox badge in nav.
- **Accept:** airplane-mode filing syncs without duplicates; attachments upload after record creation and link correctly.
- **Touches:** mobile client + `app/api/v1/records/route.ts`, `lib/actions/uploads.ts`. Effort: M. Impact: very high for rural stations.

### F3. Citation lifecycle: court date + fine ledger + receipt (P0)
- **Today:** citation = record + `traffic_citations{violation, fine, is_paid}` + `markCitationPaid` boolean.
- **Benchmark:** NC eCitation (court-date scheduling + clerk view + ACIS/DMV), Florida UTC + TCATS (accounting/transmission), Indiana Odyssey (court → BMV).
- **Change:** extend `traffic_citations` with `court_date, court_id (org), amount_due, amount_paid, receipt_no`; add `citation_payments` table; printable Uniform Traffic Ticket (QR + docket no); clerk/court view of due/paid; forward paid/convicted citation to registry + court outcome.
- **Accept:** monitor can schedule court date at filing; cashier-equivalent can record partial payment and print receipt; `is_paid` derived from ledger, not toggled.
- **Touches:** `db/schema/coded.ts`, `validations/record.ts`, `lib/actions/records.ts`, court + insurer homes. Effort: M–L. Impact: high (revenue + accountability).

### F4. E-Brief referral bundle + referral SLA (P0)
- **Today:** referral = grant + reason + 90d expiry + outcome enum; no structured brief.
- **Benchmark:** Australia CDPP Referrals Gateway (e-Briefs: new briefs, tranches, arrest/breach matters); UK CPS timeliness dashboards.
- **Change:** referral bundle = selected record + attachments + linked person/vehicle summaries + charges + statement checklist (`referral_documents[]`); allow tranche uploads after referral; SLA timers (referred → viewed → outcome) with overdue badges + monitor report.
- **Accept:** liaison sees complete brief in one pane; monitors see `avg days to first view` and `overdue referrals` in analytics.
- **Touches:** `db/schema/court.ts` (+ `referral_documents`), `lib/actions/access.ts`, `CourtHome`, analytics. Effort: M. Impact: high.

### F5. Unified + fuzzy search and entity resolution queue (P0)
- **Today:** feed filters by type/status only; plate/ID lookups are exact-match; unlinked filings need bounded 50-row fallback scan.
- **Benchmark:** Mark43 (multi-input fuzzy search, master-entity sync), Motorola unified search + consolidated view.
- **Change:** one search bar (name ~, national ID =, plate =) across records/persons/vehicles with trigram/pg_trgm indexes; "possible duplicates" queue for registrars/monitors to merge persons/vehicles (never delete — re-point `person_id/vehicle_id`, audit `record_updated`).
- **Accept:** typo'd name still surfaces candidate; merge preserves case links and audit trail.
- **Touches:** new `lib/actions/search.ts`, Postgres `pg_trgm` migration, lookup + vehicle/person pages. Effort: M. Impact: very high.

### F6. ANPR-ready flag service + disciplined VOI list (P1)
- **Today:** `is_flagged` boolean maintained from active missing/offense/impound; manual `checkPlateFlag`.
- **Benchmark:** UK Tutelage/Tutelage Plus (ANPR × MID × DVSA/DVLA), NASPLE (90-day access, 1-yr retention, corroborated VOI, regular review).
- **Change:** low-latency `GET /api/v1/lookups/plate?plate=` returning `{flagged, reason_classes[]}` for camera/reader integration; VOI review screen (why flagged, intel ref, review-by date, auto-unflag when cases close); retention policy surfaced in UI.
- **Accept:** fixed/mobile reader can check a plate in <300ms; every flag has an owner + review date.
- **Touches:** `lib/actions/access.ts`, `vehicles` + `vehicle_cases`, new reader API route. Effort: M. Impact: high (traffic safety).

### F7. Bulk insurer ingest + reconciliation (P1)
- **Today:** insurers type policies one-by-one; vehicle must pre-exist; list capped at 100.
- **Benchmark:** Nebraska DMV insurance reporting (VIN-matched files + return-report exceptions).
- **Change:** CSV/API upload → VIN/plate match → create/update + exception queue (unknown vehicle, duplicate policy no, date overlap); keep manual entry for corrections; raise list to paginated + coverage-status filter using `isPolicyLive()`.
- **Accept:** 1,000-row file ingests with per-row error report; no cross-insurer visibility (existing RLS test extended).
- **Touches:** `lib/actions/insurance.ts`, `validations/admin.ts`, insurer home. Effort: M. Impact: high.

### F8. Booking + property/evidence chain-of-custody (P1)
- **Today:** `arrest_record` is a form; attachments are images with no custody states.
- **Benchmark:** Mark43 Booking (intake-to-release) + evidence (barcode, audits, dispositions); Motorola DEMS.
- **Change:** `bookings` (arrestee, holding area, intake/release events) linked to `arrest_record`; `evidence_items` (barcode, seized-by, location, disposition: held/returned/destroyed, seal/purge) with full `actions` history; hash (SHA-256) on upload stored alongside Cloudinary URL.
- **Accept:** any exhibit shows unbroken custody list; expired holds surface for disposition.
- **Touches:** new schema + actions + record detail tabs. Effort: L. Impact: high for court admissibility.

### F9. Per-officer assignment + due dates + multilevel review (P1)
- **Today:** ownership = `reported_by` + branch; monitors edit/reassign branch; reviews are free notes.
- **Benchmark:** Mark43 (flexible tasking, preset task lists, full history), ARMS (multilevel approvals).
- **Change:** `case_assignments{record_id, assignee_id, due_at, state}` + review states (submitted → returned → approved); dashboard "my queue / overdue"; all transitions audited + notified.
- **Accept:** district monitor can assign + set due date; officer sees queue; late items escalate visually.
- **Touches:** new schema, `lib/actions/reviews.ts`, officer/monitor homes. Effort: M. Impact: high.

### F10. GIS capture + hotspot analytics (P1)
- **Today:** location is free text; analytics are static cards.
- **Benchmark:** Tyler/Hexagon (crime/GIS, shapefiles, street aliases), Mark43 (maps), CentralSquare CrimeView.
- **Change:** capture `lat/lng + place label` (map picker + GPS button; offline = label now, coords later); district + hotspot tiles in analytics with existing `<5` suppression; street-alias table for Lilongwe/Blantyre.
- **Accept:** accident/offense heatmap renders from real coords; no coords = still files (no hard gate).
- **Touches:** `records.data` extension (backward-compatible), analytics feed, mobile GPS. Effort: M–L. Impact: high for deployment planning.

### F11. Citizen intake + complainant updates (P1/P2)
- **Today:** staff-only; no public reporting, no tracking number, no complainant SMS.
- **Benchmark:** Kenya Fichua kwa DCI + SMS reporting; SAPS CAS SMS (case no, IO changes).
- **Change:** public form (missing person/property, accident tip) → triage queue → convert to record; SMS receipt + status updates (filed → assigned → resolved); anonymous-tip flag with restricted visibility.
- **Accept:** citizen can track by receipt code + phone; tips never expose full case file.
- **Touches:** new public routes + triage role/queue, SMS gateway (see N1). Effort: L. Impact: very high for trust; needs policy sign-off.

### F12. National-ID / biometric verification (P2)
- **Today:** manual `national_id` match; fallback scan of 50 wanteds.
- **Benchmark:** Kenya MBIS (finger + palm + face, 10M records, 24h clearance via eCitizen).
- **Change:** pluggable ID-verify adapter (manual → registry API → biometric later); verification badge on person profile; clearance-certificate workflow as a new record-adjacent service.
- **Accept:** verified-ID persons show source + timestamp; unverified remain usable (no exclusion).
- **Touches:** persons schema + actions + registrar/monitor UI. Effort: L + external dependency. Impact: high integrity.

### F13. Open API + CAD/interagency hooks (P2)
- **Today:** `/api/v1` serves one mobile client; no public OpenAPI, no CAD, no PNC/NCIC-style query.
- **Benchmark:** Niche↔Hexagon CAD, CentralSquare CAD-to-CAD, Mark43 Open API.
- **Change:** versioned OpenAPI spec from `docs/mobile-api-types.ts`; API keys per organisation with scope + rate limits (reuse lookup throttle); CAD-event import endpoint (station → record draft); interagency share = explicit `access_level:country` + audit (already the model).
- **Accept:** third-party reader/clerk system can integrate without private server-action knowledge.
- **Touches:** docs + auth + new routes. Effort: M–L. Impact: medium now, critical at scale.

## 2. UI/UX improvements (all P0/P1 — cheap, visible)

### U1. Scope-aware home (P0)
Problem: one timeline mixes my-branch + district + national. Fix: tabs/filters — **My branch | District | National | Referred (liaisons)** — reusing `accessLevel` already returned on `TraceRecord`. Benchmark: Motorola consolidated view with filters; Estonia "only my proceedings". Accept: officer can isolate own branch in one tap.

### U2. One-tap roadside mode (P0)
Problem: `/lookup` is forms. Fix: big **Scan plate / Check ID** buttons, camera-first, result card = green CLEAR vs red FLAGGED/WANTED + next action ("detain-safe guidance", "call district monitor") + auto-audit note. Benchmark: Motorola one-tap stop workflow; Zebra handheld flow. Accept: check-to-result in ≤3 taps, throttle message humanised.

### U3. Filing wizard with drafts + inline validation (P0)
Problem: long forms, post-submit Zod rejection. Fix: stepped wizard (type → people/vehicle → details → attachments → review), autosaved draft, Mark43-style inline errors with direct links to fields, plate/ID duplicate warning pre-submit ("2 active cases on MH 1234 — continue?"). Accept: abandon-and-resume works; validation errors point at fields.

### U4. Expiry-countdown queues (P0)
Problem: `expires_at`, `renewal_count`, citation due dates exist but are invisible. Fix: court referrals show **days-left chips** (green/amber/red), bulk renew/revoke; citations show due + overdue; registrars show unverified backlog age. Benchmark: CDPP tranche tracking; CPS SLA. Accept: no referral lapses unnoticed in demo.

### U5. Consolidated case pane (P1)
Problem: person/vehicle/record/attachments/reviews live on separate screens. Fix: record detail = header (title/summary/badges/status/access) + tabs (Details | People & vehicles | Evidence | Reviews | Referrals | History). Benchmark: Motorola consolidated record; Mark43 dynamic case file. Accept: everything a prosecutor needs is one scroll away.

### U6. Analytics that act (P1)
Problem: static feed cards. Fix: charts (volumes over time, resolution funnel, fatalities/injuries trend, paid-vs-issued), district drill-down (keep `<5` suppression), export CSV, "schedule weekly email" for monitors. Benchmark: CentralSquare dashboards + 270 canned reports; Mark43 custom graphs/maps. Accept: monitor answers "where is load rising?" without SQL.

### U7. Trust + language + accessibility (P1)
- Complainant/officer SMS + receipt codes (SAPS pattern) once gateway exists.
- Chichewa labels for field flows (scan, flag result, filing steps); keep English for legal fields.
- Contrast + touch-target pass on floating nav; expiry/flag colours never colour-only (add icon + text).

## 3. Non-functional / platform enablers

| ID | Enabler | Why | Notes |
|---|---|---|---|
| N1 | SMS gateway (OTP + notifications) | OTP currently console-logged; no complainant SMS | Required before U7/F11; pick Malawi aggregator; keep OTP 6-digit/5-min contract |
| N2 | File upgrade: PDF/audio/video + hash + retention | Images-only blocks e-Briefs, statements, bodycam | Keep Cloudinary; add `file_hash`, `retention_until`, virus scan; update `AttachmentKind` beyond image |
| N3 | GIS infra (coords columns, aliases, tiles) | Prerequisite for F10 | Nullable `lat/lng`; no hard gate on capture |
| N4 | OpenAPI + keys + rate-limit reuse | Prerequisite for F13/ANPR readers | Generate from `mobile-api-types.ts`; per-org keys |
| N5 | DB hardening | Scope nullability is app-only (`db/schema/auth.ts` note); add CHECK constraints + `pg_trgm`; RLS tests per role | Include denied-read + cross-org tests |
| N6 | Observability | Lookup throttle + audit exist but no dashboards | Audit-lag, throttle-hit, filing-time, sync-success metrics |

## 4. Phased roadmap (suggested)

- **Phase 1 (30 days, P0 field value):** F1 scan-prefill, F5 search + duplicates queue, U1 scope tabs, U2 roadside mode, U3 wizard + drafts, U4 countdowns, N5 hardening. Demo: "file faster, find faster, never lose a referral."
- **Phase 2 (60 days, justice + money):** F3 fine ledger + ticket print, F4 e-Brief + SLA, F9 assignment/review, U5 consolidated pane, U6 actionable analytics, N2 file upgrade.
- **Phase 3 (90 days+, scale):** F2 offline outbox, F6 ANPR endpoint, F7 bulk ingest, F10 GIS, N1 SMS, N4 OpenAPI.
- **Strategic (needs partners):** F8 custody/booking, F11 citizen intake, F12 ID/biometrics, F13 CAD — each gated on policy + sister-system (CMS, courts, DMV-equivalent) agreement.

## 5. What NOT to build (yet)

- Own CAD/dispatch (use import endpoint + partner CAD).
- Own biometric AFIS (adapter only; Kenya MBIS shows the cost).
- Public crime map with identities (keep suppression + no PII).
- Parallel docket-number regime competing with UNDP CMS (parity first).

## 6. Traceability (peer → TRACE item)

Mark43 → F5, F8, F9, U3, U5, U6 · Motorola → F1, F5, F6, U1, U2, U5 · CentralSquare → U6, F13 · Niche/Hexagon/Tyler → F10, F13 · TraCS/eCWS/NC/Florida → F1, F2, F3 · UK Tutelage/ANPR → F6, F7 · CDPP/CPS/eJustice/Estonia/Kenya e-filing → F4 · Nebraska/VRM → F7 · Kenya MBIS/eCitizen → F12 · Fichua/SAPS → F11, U7.

*Measure success by: median filing time, lookup taps-to-result, referral lapse rate, days referral→outcome, citation collection rate, duplicate-person rate, and audit completeness — baselined before Phase 1.*
