-- ============================================================================
-- TRACE — SEED RUNNER (fresh database): run-order checklist + final summary
-- ----------------------------------------------------------------------------
-- Pure SQL — no psql backslash commands, safe to paste into any client
-- (psql, Neon SQL editor). Run AFTER the Drizzle migration + db/sql/00..60,
-- as the schema owner.
--
-- HOW TO SEED (each file is its own transaction and self-contained — run
-- them one by one, in this order; a failure points at one domain):
--
--   psql "$DATABASE_URL" -f "db/sql/seeds/01_foundation.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/02_entities.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/03_regular_cases.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/04_traffic_cases.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/05_insurance.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/06_court.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/07_collaboration.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/08_notifications_audit.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/09_case_images.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/10_queues.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/11_taxation.sql"
--   psql "$DATABASE_URL" -f "db/sql/seeds/00_runner.sql"   (this file: summary)
--
-- In the Neon SQL editor: paste-run 01, then 02 … 11, then this file.
-- FIRST run this opt-in once per session (01 refuses to wipe without it):
--   select set_config('app.allow_seed', '1', false);
-- NEVER seed a production database.
--
-- What each file does:
--   01_foundation      branches (54) + orgs (5) + users (anchors + bulk)
--   02_entities        persons (300+2) + vehicles (400)
--   03_regular_cases   regular domain (450 + micro-districts + locate chain)
--   04_traffic_cases   traffic domain (550 + LL 4242 pack + void + custody)
--   05_insurance       policies (150, both insurers)
--   06_court           referrals (40 + e-Brief + isolation) + tranches
--   07_collaboration   reviews (120) + assignments (50) + media + sessions + key
--   08_notifications_audit  inbox (all 9 types) + audit (every enum value)
--   09_case_images        portraits (missing persons) + photos (missing vehicles)
--   10_queues             tasks per anchor/branch + locate rows per monitor scope
--   11_taxation           automation rules + tax ledger (paid/overdue/waivers)
--
-- Files 01–07 mute notification triggers via their own app.seed_load flag;
-- 08 unmutes first, then inserts deterministic inbox rows directly.
--
-- Demo logins (phones — OTP sign-in, no passwords):
--   sysadmin +265997000001 · auditor +265997000002
--   regular officer +265997000003 · traffic officer +265997000004
--   district monitor +265997000005 · country monitor (traffic) +265997000006
--   court liaison +265997000007 · insurer +265997000008 · registrar +265997000009
--   tax officer +265997000019 · tax compliance +265997000021
--   Blantyre traffic officer +265997000018 · Lilongwe traffic monitor +265997000011
-- Demo key (plate:read, traffic officer): trace_seed_demo_anpr_001
-- Demo plates: LL 4242 (T-26-DEMO-01 overdue / -02 cross-branch part-paid /
-- -03 paid+scheduled, T-26-DEMO-09 voided).
-- ============================================================================

-- Session teardown (harmless if absent — pg_temp dies with the session anyway).
drop function if exists pg_temp.pick(anyarray);
select set_config('app.seed_load', 'off', false);

-- ══════════════════════════════════════════════════════════════════════════
-- DEMO SUMMARY (stable handles — no fixed UUIDs needed to test by hand)
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_cases integer; v_flagged integer; v_districts integer;
  v_plate text; v_open_tasks integer; v_expiring_refs integer;
  v_notif_types integer;
begin
  select count(*) into v_cases from public.records;
  select count(*) into v_flagged from public.vehicles where is_flagged;
  select count(distinct district) into v_districts from public.records;
  select plate_number into v_plate from public.vehicles
   where is_flagged and plate_number <> 'LL 4242' order by random() limit 1;
  select count(*) into v_open_tasks from public.case_assignments where state = 'open';
  select count(*) into v_expiring_refs from public.court_case_access
   where revoked_at is null and outcome = 'pending' and expires_at <= now() + interval '7 days';
  select count(distinct type) into v_notif_types from public.notifications;
  raise notice 'TRACE seed complete: % cases across % districts, % flagged plates, % open tasks, % notification types.',
    v_cases, v_districts, v_flagged, v_open_tasks, v_notif_types;
  raise notice 'Logins (OTP, no passwords): sysadmin +265997000001 · auditor +265997000002 · officer +265997000003 · traffic +265997000004 · monitor +265997000005 · liaison +265997000007 · insurer +265997000008 · registrar +265997000009.';
  raise notice 'Demo plates: LL 4242 (3 citations: unpaid/part/paid+scheduled) · % (flagged).', coalesce(v_plate, 'none');
  raise notice 'Receipt demo: T-26-DEMO-01 overdue-unpaid · T-26-DEMO-02 part-paid at Blantyre counter · T-26-DEMO-09 voided.';
  raise notice 'Locate demo: one wanted located (Blantyre report), one confirmed; custody demo: one hold+notice, one released.';
  raise notice 'NamUs demo: described persons + physical marks (02); unclaimed persons (03); FP-26-DEMO-01 + DNA sample (02); one possible + one confirmed missing↔unclaimed match (03).';
  raise notice 'Expiring referrals (renew demo): %.', v_expiring_refs;
  raise notice 'DEV-ONLY ANPR key: trace_seed_demo_anpr_001 (plate:read). Never use outside dev.';
end $$;
