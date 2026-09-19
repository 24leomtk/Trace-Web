-- ============================================================================
-- TRACE — SEED RUNNER (fresh database)
-- ----------------------------------------------------------------------------
-- Run AFTER the Drizzle migration + db/sql/00..60, as the schema owner:
--
--   psql "$DATABASE_URL" -v TRACE_SEED_OK=1 -f "db/sql/seeds/00_runner.sql"
--
-- The TRACE_SEED_OK flag is a production guard: without it the script
-- refuses to run. NEVER seed a production database.
--
-- What it does (in order — each file is its own transaction so a failure
-- points at one domain):
--   01_foundation      branches (54) + orgs (5) + users (anchors + bulk)
--   02_entities        persons (300+2) + vehicles (400)
--   03_regular_cases   regular domain (450 + micro-districts + locate chain)
--   04_traffic_cases   traffic domain (550 + LL 4242 pack + void + custody)
--   05_insurance       policies (150, both insurers)
--   06_court           referrals (40 + e-Brief + isolation) + tranches
--   07_collaboration   reviews (120) + assignments (50) + media + sessions + key
--   08_notifications_audit  inbox (all 8 types) + audit (every enum value)
--
-- Files 01–07 run with notification triggers muted (session flag set in 01);
-- 08 unmutes first, then inserts deterministic inbox rows directly.
-- Shared helpers (pg_temp.pick, setseed) are defined in 01 and dropped below.
--
-- Demo logins (phones — OTP sign-in, no passwords):
--   sysadmin +265997000001 · auditor +265997000002
--   regular officer +265997000003 · traffic officer +265997000004
--   district monitor +265997000005 · country monitor (traffic) +265997000006
--   court liaison +265997000007 · insurer +265997000008 · registrar +265997000009
--   Blantyre traffic officer +265997000018 · Lilongwe traffic monitor +265997000011
-- Demo key (plate:read, traffic officer): trace_seed_demo_anpr_001
-- Demo plates: LL 4242 (T-26-DEMO-01 overdue / -02 cross-branch part-paid /
-- -03 paid+scheduled, T-26-DEMO-09 voided).
-- ============================================================================

\if :{?TRACE_SEED_OK}
\else
\echo 'Refusing to seed: re-run with -v TRACE_SEED_OK=1. Never seed production.'
\quit 1
\endif

\ir 01_foundation.sql
\ir 02_entities.sql
\ir 03_regular_cases.sql
\ir 04_traffic_cases.sql
\ir 05_insurance.sql
\ir 06_court.sql
\ir 07_collaboration.sql
\ir 08_notifications_audit.sql

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
  raise notice 'Expiring referrals (renew demo): %.', v_expiring_refs;
  raise notice 'DEV-ONLY ANPR key: trace_seed_demo_anpr_001 (plate:read). Never use outside dev.';
end $$;
