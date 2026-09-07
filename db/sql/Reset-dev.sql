-- ============================================================================
-- TRACE — DEV DATABASE RESET (drops everything, start from zero)
-- ----------------------------------------------------------------------------
-- Wipes ALL tables, enums, and functions from BOTH the previous
-- (medical-records) app and TRACE, so the Drizzle migration applies onto a
-- clean database. DEV ONLY — never point this at a real database.
--
--   psql "$DATABASE_URL" -v TRACE_RESET_OK=1 -f "db/sql/Reset-dev.sql"
--
-- Then, in order:
--   1. Drizzle migration (creates the TRACE schema)
--   2. psql "$DATABASE_URL" -f "db/sql/Functions&Policies.sql"
--   3. psql "$DATABASE_URL" -v TRACE_SEED_OK=1 -f "db/sql/Seed.sql"
-- ============================================================================

\if :{?TRACE_RESET_OK}
\else
\echo 'Refusing to reset: re-run with -v TRACE_RESET_OK=1. Never run on production.'
\quit 1
\endif

drop table if exists
  -- TRACE tables
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
  public.users,
  public.sessions,
  public.accounts,
  public.verifications,
  public.branches,
  public.organizations,
  -- previous-app tables (drizzle never drops these on its own)
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

drop type if exists
  -- TRACE enums
  user_role,
  domain,
  district,
  sex,
  organization_type,
  access_level,
  record_type,
  case_status,
  danger_level,
  court_case_outcome,
  audit_action_type,
  -- previous-app enums
  route,
  urgency,
  triage_level,
  diagnosis_threat_level,
  access_action_type cascade;

drop function if exists public.set_user_id(text);
drop function if exists public.app_user_id();
drop function if exists public.app_my_role();
drop function if exists public.app_is_police();
drop function if exists public.app_is_monitor();
drop function if exists public.app_is_system_admin();
drop function if exists public.app_is_auditor();
drop function if exists public.app_can_read_record(public.records);
drop function if exists public.actions_hash_chain() cascade;
drop function if exists public.redeem_access_code(text, text, text, text, text);
drop function if exists public.redeem_access_code(text);
drop function if exists public.emergency_lookup(text, text, text);
drop function if exists public.populate_record_facts() cascade;
drop function if exists public.age_band(date, date);
drop function if exists public.app_can_read_patient(text);
drop function if exists public.app_is_staff();
