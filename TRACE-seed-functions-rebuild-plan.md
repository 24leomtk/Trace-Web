# TRACE — Seed Redesign + Functions/Policies Split + Notification Triggers
## Phased Build Plan (fresh database)

> Assumption (per owner): you run `Reset-dev.sql`, then `drizzle-kit migrate`,
> so the database has **schema only** — tables + enums + indexes from Drizzle,
> **no data, no functions, no policies, no triggers, no `app_user`**.
> Every file below is idempotent (`IF NOT EXISTS` / `DROP ... IF EXISTS` /
> `CREATE OR REPLACE`) and runs in numeric order as the schema owner.

---

## Phase 0 — Baseline & conventions

### 0.1 Run order (authoritative)

```text
psql "$DATABASE_URL" -f "db/sql/00_prerequisites.sql"
psql "$DATABASE_URL" -f "db/sql/10_helpers.sql"
psql "$DATABASE_URL" -f "db/sql/20_constraints.sql"
psql "$DATABASE_URL" -f "db/sql/30_policies_core.sql"
psql "$DATABASE_URL" -f "db/sql/31_policies_cases.sql"
psql "$DATABASE_URL" -f "db/sql/32_policies_court_audit.sql"
psql "$DATABASE_URL" -f "db/sql/33_append_only.sql"
psql "$DATABASE_URL" -f "db/sql/40_audit_chain.sql"
psql "$DATABASE_URL" -f "db/sql/50_notification_triggers.sql"
psql "$DATABASE_URL" -f "db/sql/60_scheduled_jobs.sql"
psql "$DATABASE_URL" -v TRACE_SEED_OK=1 -f "db/sql/seeds/00_runner.sql"
psql "$DATABASE_URL" -f "db/sql/Seed-refresh.sql"   # optional heal/verify
```

`Functions&Policies.sql` is **frozen** once the split lands — do not edit it,
only delete it at the end. `Seed.sql` stays until all seed files pass, then it
is deleted.

### 0.2 Global conventions for every new file

* Header comment: purpose, run-after, re-runnable guarantee.
* `create extension if not exists pgcrypto, pg_trgm;` only in `00`.
* No fixed UUIDs anywhere. All ids via `gen_random_uuid()` + `RETURNING` /
  lookup by stable natural key (phone, branch name, plate, ticket, receipt,
  policy number).
* Deterministic RNG: `select setseed(0.20260918);` once in `seeds/01`, helper
  `pg_temp.pick(anyarray)` defined once, dropped in `00_runner.sql` at the end.
* Volume knobs (`v_case_count`, etc.) live at the top of their own seed file.
* Seed guard: only `seeds/00_runner.sql` checks `-v TRACE_SEED_OK=1`. Individual
  seed files have no guard so the runner controls it.
* Trigger guard: bulk seed sets `SET LOCAL app.seed_load = 'on'`; all
  notification triggers early-return when set, so `seeds/08` inserts stay
  deterministic and authoritative.
* Every trigger function is `SECURITY DEFINER SET search_path = public,
  pg_catalog` owned by the schema owner, so inserts into `notifications`
  bypass RLS by design. Documented in `32` + `50` headers.

---

## Phase 1 — Split `Functions&Policies.sql` (no behaviour change)

Goal: same enforcement, smaller reviewable files. Copy verbatim from the
current file; only move code.

| New file | Contents (source lines approx.) |
|---|---|
| `db/sql/00_prerequisites.sql` | extensions; `app_user` role create; `GRANT USAGE` + table/sequence grants + `ALTER DEFAULT PRIVILEGES`; grant `app_user` to `current_user` membership block |
| `db/sql/10_helpers.sql` | `set_user_id`, `app_user_id`, `app_my_role`, `app_is_police`, `app_is_monitor`, `app_is_system_admin`, `app_is_auditor`, `app_can_read_record` |
| `db/sql/20_constraints.sql` | trigram indexes (persons, vehicles, citations); `users_role_scope_chk`; money/lifecycle checks (`citation_payments_method/channel`, `records_locate_state`, `records_disposition`, `traffic_citations_void`) |
| `db/sql/30_policies_core.sql` | `ENABLE RLS` + policies for `users`, `branches`, `organizations`, `vehicles`, `persons_of_interest`, `insurance_policies`, `api_keys` |
| `db/sql/31_policies_cases.sql` | `records`, `record_attachments`, coded projections (`missing_person_cases`, `wanted_person_cases`, `vehicle_cases`, `accidents`, `accident_vehicles`, `traffic_citations`, `citation_payments`, `impound_custody`), `case_reviews`, `case_assignments` |
| `db/sql/32_policies_court_audit.sql` | `court_case_access`, `referral_documents`, `actions`, `notifications` (read/write/mark-read), `idempotency_keys` |
| `db/sql/33_append_only.sql` | all `REVOKE update/delete` lines (actions, records delete, payments, referral docs update, assignments delete, custody delete, coded deletes) |
| `db/sql/40_audit_chain.sql` | `actions.prev_hash/entry_hash` columns + `actions_hash_chain()` + trigger |
| `db/sql/60_scheduled_jobs.sql` | `pg_cron` expire-grants + expire-policies blocks only |
| `db/sql/90_legacy_cleanup.sql` | medical-app drops (functions, policies, tables/types) — runs clean on a fresh DB, kept for dirty-DB safety |

Acceptance: `diff` of `pg_policies` / `pg_trigger` / `pg_constraint` before
(old file) vs after (split files) is empty.

---

## Phase 2 — Notification triggers (new behaviour)

New file: `db/sql/50_notification_triggers.sql`. Runs after `10` (helpers) and
`32` (notifications table + RLS). All functions `SECURITY DEFINER`.

### 2.1 Helper (one function, used by every template)

`public.trace_notify(p_user_id text, p_type text, p_record_id uuid, p_message
text)` — inserts one row, skips null/empty user, skips when
`current_setting('app.seed_load', true) = 'on'`, truncates message to 280
chars, catches no exceptions (caller handles). Also
`public.trace_actor_name(p_uid text)` returns display name or `'A monitor'` /
`'An officer'` fallback (never null).

Title resolution inside each trigger: `record_type` + `data->>` fields
(`full_name` / `plate_number` / `ticket` via `traffic_citations.ticket_number`)
— no app imports.

### 2.2 Trigger matrix (14 triggers, 8 types)

| ID | Table / event | Recipient(s) | `type` | Template (exact) |
|---|---|---|---|---|
| T1 | `court_case_access` AFTER INSERT | `NEW.court_liaison_id` | `referral_received` | `New referral: {title} ({record_type}) from {referrer}. Reason: {reason}. Expires {YYYY-MM-DD}.` |
| T2 | `court_case_access` AFTER UPDATE of `expires_at/renewed_at` | liaison | `referral_updated` | `Access renewed: {title} extended to {date} by {actor} (renewal #{n}).` |
| T3 | `court_case_access` AFTER UPDATE of `revoked_at` (null→set) | liaison | `referral_updated` | `Access revoked: {title} revoked by {actor}. Contact the referring monitor if still needed.` |
| T4 | `court_case_access` AFTER UPDATE of `outcome` (pending→X) | `OLD.referred_by` | `outcome_recorded` | `Court outcome: {title} → {outcome} by {liaison}. Notes: {notes}.` |
| T5 | `referral_documents` AFTER INSERT | liaison + `referred_by` (two rows, skip self) | `referral_updated` | `e-Brief update: new {label} added to {title} by {actor}.` |
| T6 | `case_reviews` AFTER INSERT | `records.reported_by` (skip if = reviewer) | `review_added` | `Review on your case {title}: “{first 120 chars}” — {reviewer}.` |
| T7 | `case_assignments` AFTER INSERT | `NEW.assignee_id` | `task_assigned` (NEW) | `New task: {title} assigned by {assigner}. Due {date\|no due date}. Note: {note}.` |
| T8 | `case_assignments` AFTER UPDATE `state` open→done/cancelled | `assigned_by` + reporter (skip actor) | `task_updated` (NEW) | `Task {done\|cancelled}: {title} by {actor}.` |
| T9a/b/c | `records` AFTER UPDATE of `status` / `access_level` / `branch_id` | reporter (skip actor) + each live liaison (`revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`) | `status_changed` | `Status: {title} {old} → {new} by {actor}.` / `Visibility: {title} {old} → {new} by {actor}.` / `Reassigned: {title} → {branch} by {actor}.` |
| T10 | `citation_payments` AFTER INSERT | reporter + ticket issuer (`records.reported_by`) | `payment_received` (NEW) | `Payment: {amount} on ticket {no} ({plate}) by {payer} at {branch}. Balance {bal}. Receipt {no}.` |
| T11a/b | `traffic_citations` AFTER UPDATE `voided_at` null→set / `court_date` null→set | reporter | `status_changed` | `Ticket {no} voided: {reason}.` / `Court: ticket {no} → {court} on {date}.` |
| T12a/b | `records` AFTER UPDATE `locate_state` none→located / →confirmed | reporter + `locate_by` (skip actor) | `status_changed` | `Locate reported: {subject} seen at {place} by {reporter}.` / `Locate confirmed by {actor} at {place}.` |
| T13a/b/c | `impound_custody` AFTER INSERT / UPDATE `release_at` null→set / `owner_notified_at` null→set | reporter + `hold_authority_id` (skip actor) | `status_changed` | `Hold placed: {plate} at {lot}/{bay} by {authority}. Basis: {basis}.` / `Released: {plate} to {recipient} (ID checked).` / `Owner notified for {plate} by {actor}.` |
| T14 | cron sweep (extends `60`) | liaison / reporter | `referral_updated` / `status_changed` | `Access lapsed: {title} expired {date}. Ask a monitor to renew.` |

Rules: `WHEN (OLD.* IS DISTINCT FROM NEW.*)` on every UPDATE trigger;
actor≠recipient skip; `pg_trigger_depth() < 1` guard so trigger-caused
`actions` inserts never recurse; seed-load early return.

### 2.3 Required app changes (small, same phase)

* `lib/actions/notifications.ts` `NotificationType` +=
  `task_assigned | task_updated | payment_received`.
* `components/notifications/notification-header.tsx` filter list += same three.
* `db/schema/notifications.ts` comment update (new types documented).
* `32` header documents that trigger inserts bypass RLS as owner.

Acceptance: insert/update each source row by hand → correct inbox row(s)
appear with exact template; self-actions produce no row; `SET LOCAL
app.seed_load='on'` suppresses all.

---

## Phase 3 — Seed split (per-domain files)

New dir `db/sql/seeds/` + runner `00_runner.sql`:

```text
db/sql/seeds/
  00_runner.sql           # guard TRACE_SEED_OK, SET seed_load on, \include 01..08, seed_load off, NOTICE summary
  01_foundation.sql       # branches, orgs, users
  02_entities.sql         # persons_of_interest, vehicles
  03_regular_cases.sql    # missing_person, wanted_person, stolen_property, crime_incident, arrest_record + projections
  04_traffic_cases.sql    # missing_vehicle, vehicle_offense, road_accident, traffic_citation, vehicle_impoundment + citations/payments/custody/accident junctions
  05_insurance.sql        # insurance_policies
  06_court.sql            # court_case_access + referral_documents
  07_collaboration.sql    # case_reviews, case_assignments, sessions, api_keys
  08_notifications_audit.sql # notifications (all 8 types, read+unread) + actions (every audit_action_type at least once)
```

Shared setup lives in `01_foundation.sql`: `setseed(0.20260918)`,
`pg_temp.pick()`, name/plate/district arrays, `v_seq`. Later files reuse
session temp objects — no per-file redefinition. Teardown
(`DROP FUNCTION pg_temp.pick`) lives in `00_runner.sql`.

### 3.1 `01_foundation` — branches, orgs, users

* 6 anchor branches (Lilongwe/Blantyre Central+Traffic, Rumphi, Likoma) + 2
  per remaining 24 districts = 54 branches, each with district prefix plates.
* 5 orgs: Blantyre + Lilongwe courts, NICO + Old Mutual insurers, RTD registry.
* ~19 anchor users on stable phones `+265997000001…018` (sysadmin, auditor,
  regular/traffic officers, district + country monitors both domains, 2
  liaisons, 2 insurers, registrar, Rumphi/Likoma officers, Blantyre traffic
  officer) + 2 active officers per bulk branch + 1 regular district monitor
  per bulk district. Include 1 inactive officer (deactivation demo).
* Knobs: none (fixed anchors + `v_branch_officers = 2`).

### 3.2 `02_entities` — persons + vehicles

* `v_person_count = 300`: every 10th row reuses previous `national_id`
  (merge-queue depth); 1-in-4 null `national_id`; sex/home_district spread.
* Staged pair `Joseph Banda / MW-P-909090` × 2 (merge demo).
* `v_vehicle_count = 400`: district prefix plates, 1-in-4 `is_verified=true`
  by registrar with `verified_at`; `is_flagged=false` here (recomputed from
  cases in `Seed-refresh.sql`); 25% ad-hoc plates created later in `03/04`.
* Knobs: `v_person_count`, `v_vehicle_count`.

### 3.3 `03_regular_cases` — regular domain

* `v_regular_count = 450`, weighted
  (`missing_person×2, wanted_person, stolen_property×2, crime_incident×3,
  arrest_record`), filings spread `(v_i % 84)` days for 12-week trends, GPS
  pins on ~30% of location types, `access_level` branch/district/country
  (wanted 70% country).
* Coded projections written inline (`missing_person_cases`,
  `wanted_person_cases`).
* Arrest depth: `booking_no`/`custody_status`/`prosecutor_decision` on ~40%.
* Locate chain: 1 wanted `located` (Blantyre cross-branch report) + 1
  `confirmed` + 1 stolen_property `confirmed` with `disposition='held'`.
* Micro-districts: Rumphi 2 + Likoma 3 `crime_incident`/`stolen_property`.
* Knobs: `v_regular_count`, `v_gps_ratio`.

### 3.4 `04_traffic_cases` — traffic domain

* `v_traffic_count = 550`, weighted
  (`missing_vehicle×2, vehicle_offense×3, road_accident, traffic_citation×4,
  vehicle_impoundment`), `vehicle_cases` projection + `is_flagged=true` for
  active flag types.
* `LL 4242` pack: 3 citations (`T-26-DEMO-01` overdue-unpaid,
  `-02` cross-branch part-paid at Blantyre, `-03` paid + court scheduled) + 1
  flag-maintaining `vehicle_offense` + 1 voided `T-26-DEMO-09` with
  `citation_voided` action.
* Random citations: fine ledger (`is_paid` from payments), 30% court-scheduled,
  receipt nos `R-SEED-xxxxx`, methods cash/mobile/bank, channels
  counter/mobile/clerk.
* Accidents: severity/road/weather ~60%, fatalities/injuries,
  `accident_vehicles` junction 1–3 plates.
* Custody: 1 hold+notice (Lilongwe) + 1 hold→release dual-signed (Blantyre).
* Knobs: `v_traffic_count`, `v_court_schedule_ratio`.

### 3.5 `05_insurance` — policies

* `v_policy_count = 150`, 70% NICO / 30% Old Mutual, even rows expired
  (`end_date -10d`), odd rows live (`+165d`), `is_active` healed by refresh.
* Coverages `third_party/comprehensive`, `entered_by` split across both
  insurer logins.
* Plus `insurer_flag_lookup` + `vehicle_registered` audit rows.

### 3.6 `06_court` — referrals + e-Brief

* `v_referral_count = 40`: mix pending / viewed (`first_viewed_at`) / decided
  (all of convicted/charged/withdrawn/acquitted/dismissed/other with notes) /
  revoked (`revoked_at`) / expiring-in-2d (renew demo) / renewed
  (`renewal_count>0`).
* Every 5th referral gets 3 doc tranches
  (`charge_sheet, witness_statement, exhibit_photo`).
* Full e-Brief pack: 1 active Lilongwe case → referred → tranches → viewed →
  convicted. Isolation pack: 1 Blantyre case → second court, expires in 2 days.

### 3.7 `07_collaboration` — reviews, tasking, sessions, keys

* `v_review_count = 120` reviews by monitors with 5-message rotation.
* `v_assign_count = 50`: 25% overdue-open, 25% done, 10% cancelled, rest open
  with future `due_at`.
* 4 anchor sessions (sysadmin/officer/traffic/monitor, varied `updated_at`) +
  DEV-ONLY ANPR key `trace_seed_demo_anpr_001` (sha256 hash, prefix
  `trace_seed_`, scope `plate:read`).
* 1 PDF + 1 video `record_attachments` on random active cases.

### 3.8 `08_notifications_audit` — inbox + audit trail

* With `app.seed_load` still on during `01–07`, triggers are silent; this file
  turns it off first, then inserts deterministic rows for **all 8 types**:
  `referral_received ×5`, `referral_updated` (renew + revoke) `×4`,
  `outcome_recorded ×4`, `status_changed` (status/escalation/locate/hold) `×10`,
  `review_added ×6`, `task_assigned ×6` (open), `task_updated` (done/cancelled)
  `×4`, `payment_received ×6` — half `is_read=true`, half unread.
* `v_audit_count = 250` actions covering **every** `audit_action_type` enum
  value at least twice + `status_rejected` guard-friction row +
  `user_provisioned` sysadmin row.
* Re-enable nothing; runner prints summary after.

### 3.9 `00_runner.sql` shape

```sql
begin;
\if :{?TRACE_SEED_OK} \else \echo '...' \quit 1 \endif
SET LOCAL app.seed_load = 'on';  -- per-file transactions inherit
\include seeds/01_foundation.sql
... 02..07 ...
SET LOCAL app.seed_load = 'off';
\include seeds/08_notifications_audit.sql
-- NOTICE summary: cases, districts, flagged, open tasks, expiring referrals,
-- logins, demo plates/tickets, ANPR key warning
commit;
DROP FUNCTION IF EXISTS pg_temp.pick(anyarray);
```

Each `0N` file is its own `BEGIN; ... COMMIT;` so a failure points at one
domain. Truncate list (all tables, CASCADE) lives at the top of `01` only.

---

## Phase 4 — Refresh + reset alignment

* `Seed-refresh.sql`: unchanged behaviour (revive lapsed pending referrals,
  recompute flags, resync `is_paid`, backfill tickets). Add comment pointing at
  new trigger file so future columns update both.
* `Reset-dev.sql`: append `DROP FUNCTION` lines for every new
  `trace_notify_*` trigger function + `trace_notify` helper (else re-migrate
  leaves orphans). No other change.
* Delete `Functions&Policies.sql` + `Seed.sql` only after green run.

---

## Phase 5 — Verification (fresh DB)

```text
psql "$DATABASE_URL" -v TRACE_RESET_OK=1 -f "db/sql/Reset-dev.sql"
pnpm exec drizzle-kit migrate
psql "$DATABASE_URL" -f "db/sql/00_prerequisites.sql"
... (all 10 function files in order)
psql "$DATABASE_URL" -v TRACE_SEED_OK=1 -f "db/sql/seeds/00_runner.sql"
psql "$DATABASE_URL" -f "db/sql/Seed-refresh.sql"
```

Checks:

1. `SELECT type, count(*) FROM notifications GROUP BY 1` — all 8 types present.
2. `SELECT action_type, count(*) FROM actions GROUP BY 1` — every enum value ≥1.
3. Manual trigger test per §2.2 (one INSERT/UPDATE per trigger, inbox row
   matches template, no self-notify).
4. Demo script from NOTICE: 9 logins, `LL 4242`, `T-26-DEMO-01/02/09`,
   locate/custody/renew flows, ANPR key.
5. `pg_policies` / `pg_trigger` diff vs old files is empty (Phase 1) plus 14
   new notification triggers (Phase 2).

---

## Build order for the agent (do in this sequence)

1. `00, 10, 20, 30, 31, 32, 33, 40, 60, 90` (verbatim split, no logic change).
2. `50_notification_triggers.sql` + app type widening (`notifications.ts`,
   header filter, schema comment).
3. `seeds/01` → `02` → `03` → `04` → `05` → `06` → `07` → `08` → `00_runner`.
4. `Reset-dev.sql` trigger-drop lines.
5. Fresh-DB verification per Phase 5; delete old files last.
