-- ============================================================================
-- TRACE — DEVELOPMENT RESET (destroys ALL TRACE data, fresh database)
-- ----------------------------------------------------------------------------
-- DANGER: this wipes every TRACE table. Dev databases only — NEVER run
-- against production or any database holding real cases.
--
-- Guard: refuses to run without -v TRACE_RESET_OK=1.
--
-- Full clean-slate order (as schema owner):
--
--   psql "$DATABASE_URL" -v TRACE_RESET_OK=1 -f "db/sql/Reset-dev.sql"
--   <run the Drizzle migration(s): pnpm exec drizzle-kit migrate>
--   psql "$DATABASE_URL" -f "db/sql/Functions&Policies.sql"
--   psql "$DATABASE_URL" -v TRACE_SEED_OK=1 -f "db/sql/Seed.sql"
--
-- What it destroys:
--   * every TRACE table (incl. better-auth sessions/accounts/verifications,
--     the four Phase 2/3 tables, and legacy medical tables on dirty DBs)
--   * every TRACE enum type and helper function/trigger
--   * drizzle's __drizzle_migrations journal rows, so `drizzle-kit migrate`
--     replays all migrations from scratch afterwards
-- What it keeps (deliberately):
--   * the database itself, installed extensions, and roles (incl. app_user —
--     Functions&Policies.sql recreates/re-grants idempotently)
--   * pg_cron jobs, if any (they re-attach to the recreated tables)
-- ============================================================================

begin;

\if :{?TRACE_RESET_OK}
\else
\echo 'Refusing to reset: re-run with -v TRACE_RESET_OK=1. Never reset production.'
\quit 1
\endif

-- ---------------------------------------------------------------------------
-- 0. Helper functions first (app_can_read_record depends on the records row
--    type, so functions go before tables).
--    CASCADE is safe here: the only dependents are RLS policies on tables
--    we drop in step 1 anyway — tables themselves are untouched by it.
-- ---------------------------------------------------------------------------
drop function if exists public.app_can_read_record(public.records) cascade;
drop function if exists public.actions_hash_chain() cascade;
drop function if exists public.set_user_id(text) cascade;
drop function if exists public.app_user_id() cascade;
drop function if exists public.app_my_role() cascade;
drop function if exists public.app_is_police() cascade;
drop function if exists public.app_is_monitor() cascade;
drop function if exists public.app_is_system_admin() cascade;
drop function if exists public.app_is_auditor() cascade;

-- Legacy functions from the previous (medical records) app.
drop function if exists public.redeem_access_code(text, text, text, text, text) cascade;
drop function if exists public.redeem_access_code(text) cascade;
drop function if exists public.emergency_lookup(text, text, text) cascade;
drop function if exists public.populate_record_facts() cascade;
drop function if exists public.age_band(date, date) cascade;
drop function if exists public.app_can_read_patient(text) cascade;
drop function if exists public.app_is_staff() cascade;

-- ---------------------------------------------------------------------------
-- 1. All TRACE tables (CASCADE pulls triggers, RLS policies, and indexes).
-- ---------------------------------------------------------------------------
drop table if exists
  public.api_keys,
  public.case_assignments,
  public.citation_payments,
  public.referral_documents,
  public.actions,
  public.notifications,
  public.idempotency_keys,
  public.case_reviews,
  public.court_case_access,
  public.missing_person_cases,
  public.wanted_person_cases,
  public.vehicle_cases,
  public.accidents,
  public.accident_vehicles,
  public.traffic_citations,
  public.record_attachments,
  public.insurance_policies,
  public.records,
  public.vehicles,
  public.persons_of_interest,
  public.sessions,
  public.accounts,
  public.verifications,
  public.users,
  public.branches,
  public.organizations cascade;

-- Legacy tables from the previous (medical records) app. The trigger drop is
-- guarded: DROP TRIGGER errors when the table itself is missing (IF EXISTS
-- only covers the trigger, not the table).
do $$
begin
  if to_regclass('public.medical_records') is not null then
    drop trigger if exists medical_records_populate_facts on public.medical_records;
  end if;
end $$;
drop table if exists
  public.medical_records,
  public.diagnoses,
  public.prescriptions,
  public.immunizations,
  public.immunization_schedule,
  public.diagnosis_codes,
  public.medication_codes,
  public.immunization_codes,
  public.standard_treatment_guidelines,
  public.hospitals,
  public.access_grants cascade;

-- ---------------------------------------------------------------------------
-- 2. Enum types.
-- ---------------------------------------------------------------------------
drop type if exists
  public.domain,
  public.user_role,
  public.district,
  public.sex,
  public.organization_type,
  public.access_level,
  public.record_type,
  public.case_status,
  public.danger_level,
  public.court_case_outcome,
  public.audit_action_type,
  public.route,
  public.urgency,
  public.triage_level,
  public.diagnosis_threat_level,
  public.access_action_type;

-- ---------------------------------------------------------------------------
-- 3. Drizzle migration journal, so the next `drizzle-kit migrate` replays
--    every migration from scratch instead of skipping them as "applied".
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.__drizzle_migrations') is not null then
    delete from public.__drizzle_migrations;
  end if;
end $$;

commit;

-- Vacuum the catalog bloat left by the mass drop (outside the transaction).
vacuum;
