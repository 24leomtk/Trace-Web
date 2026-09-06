-- ============================================================================
-- Chipatala Registry — ACCESS REFRESH + STAFF DEMO DATA (re-runnable)
-- ----------------------------------------------------------------------------
-- Run AFTER db/sql/Functions&Policies.sql, as the schema owner:
--
--   psql "$DATABASE_URL" -f "db/sql/Seed-refresh.sql"
--
-- What it does (all relative to now(), safe to run repeatedly):
--   0a. Grants the connection role membership in `app_user` so lib/db-context's
--       `set local role app_user` works (RLS enforcement for app queries).
--   0b. Makes access_grants.doctor_id nullable — codes are issued unclaimed
--       and claimed by whichever clinician redeems them.
--   1.  Extends EVERY redeemed, non-revoked access window so it is valid for
--       the next 24 hours ("allow viewing today").
--   2.  Ensures both seeded doctors hold fresh, active windows over three
--       patients each (deterministic CR-MW-DEMO-xxxx codes + audit trail),
--       so Patient search shows connected patients immediately.
--   3.  Gives the four staff users small personal clinical histories (tagged
--       seed_tag='staff-demo'), so Doctors/Admins see records on their OWN
--       timeline too. The derived-facts trigger populates diagnoses /
--       prescriptions / immunizations from these inserts automatically.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0a. Connection role joins app_user (needed by withUserCtx / RLS)
--     `with set true` matters on PG16+ — see Functions&Policies.sql.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    if not pg_has_role(current_user, 'app_user', 'member')
       or not pg_has_role(current_user, 'app_user', 'usage') then
      execute format(
        'grant app_user to %I with set true inherit true',
        current_user
      );
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0b. access_grants.doctor_id becomes nullable (unclaimed codes)
-- ---------------------------------------------------------------------------
alter table public.access_grants alter column doctor_id drop not null;

-- ---------------------------------------------------------------------------
-- 1. Keep existing redeemed windows alive through today (+24h)
-- ---------------------------------------------------------------------------
update public.access_grants
set expires_at = now() + interval '24 hours'
where is_used
  and not is_revoked;

-- ---------------------------------------------------------------------------
-- 2. Deterministic demo windows for the two doctors
--    (clean out the previous batch first, audit rows included)
-- ---------------------------------------------------------------------------
delete from public.actions
where access_grant_id in (
  select id from public.access_grants where code like 'CR-MW-DEMO-%'
);
delete from public.access_grants where code like 'CR-MW-DEMO-%';

insert into public.access_grants
  (profile_id, doctor_id, issued_by, code, duration_seconds,
   is_used, used_at, expires_at, is_revoked, created_at)
values
  -- Dr Chikumbutso Phiri (Lilongwe / KCH)
  ('seed_user_005', 'seed_user_003', 'seed_user_005', 'CR-MW-DEMO-0001', 28800,
   true, now() - interval '5 minutes', now() + interval '24 hours', false, now() - interval '10 minutes'),
  ('seed_user_007', 'seed_user_003', 'seed_user_007', 'CR-MW-DEMO-0002', 28800,
   true, now() - interval '7 minutes', now() + interval '24 hours', false, now() - interval '12 minutes'),
  ('seed_user_009', 'seed_user_003', 'seed_user_009', 'CR-MW-DEMO-0003', 28800,
   true, now() - interval '9 minutes', now() + interval '24 hours', false, now() - interval '14 minutes'),
  -- Dr Thandiwe Mvula (Blantyre / QECH)
  ('seed_user_006', 'seed_user_004', 'seed_user_006', 'CR-MW-DEMO-0004', 28800,
   true, now() - interval '6 minutes', now() + interval '24 hours', false, now() - interval '11 minutes'),
  ('seed_user_008', 'seed_user_004', 'seed_user_008', 'CR-MW-DEMO-0005', 28800,
   true, now() - interval '8 minutes', now() + interval '24 hours', false, now() - interval '13 minutes'),
  ('seed_user_010', 'seed_user_004', 'seed_user_010', 'CR-MW-DEMO-0006', 28800,
   true, now() - interval '10 minutes', now() + interval '24 hours', false, now() - interval '15 minutes');

-- Audit trail for those windows
insert into public.actions
  (profile_id, actor_id, action_type, access_grant_id, reason, created_at)
select g.profile_id, g.profile_id, 'code_issued', g.id,
       'Access code generated (480 min window once redeemed).', g.created_at
from public.access_grants g
where g.code like 'CR-MW-DEMO-%';

insert into public.actions
  (profile_id, actor_id, action_type, access_grant_id, reason,
   doctor_name, medical_license_no, hospital_name, district, created_at)
select g.profile_id, g.doctor_id, 'code_redeemed', g.id,
       'Access code redeemed at point of care.',
   u.name, u.medical_license_no,
   h.name, u.district::text,
   g.used_at
from public.access_grants g
join public.users u on u.id = g.doctor_id
left join public.hospitals h on h.id = u.hospital_id
where g.code like 'CR-MW-DEMO-%';

-- ---------------------------------------------------------------------------
-- 3. Personal clinical histories for staff users (so their own timelines
--    aren't empty). Tagged rows are wiped before re-inserting.
-- ---------------------------------------------------------------------------
delete from public.medical_records
where data ->> 'seed_tag' = 'staff-demo';

-- ── Dr Chikumbutso Phiri (seed_user_003, KCH) ──────────────────────────────
insert into public.medical_records
  (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
values
  ('seed_user_003',
   '00000000-0000-0000-0000-000000000001', 'seed_user_004',
   'outpatient_visit', current_date - 21,
   jsonb_build_object(
     'diagnosis_id', gen_random_uuid(),
     'icd10_code', 'I10',
     'visit_type', 'OUTPATIENT',
     'chief_complaint', 'Routine blood pressure review',
     'history_of_present_illness', 'Stable on current dose. No headaches or visual changes.',
     'physical_exam', jsonb_build_object('bp','128/82 mmHg','pulse','72 bpm','temperature','36.5 °C'),
     'assessment', 'Essential (primary) hypertension, controlled.',
     'plan', 'Continue amlodipine 5 mg OD, reduce salt, review in 3 months.',
     'seed_tag', 'staff-demo'),
   now() - interval '21 days', now() - interval '21 days'),

  ('seed_user_003',
   '00000000-0000-0000-0000-000000000001', 'seed_user_004',
   'lab_test_result', current_date - 21,
   jsonb_build_object(
     'test_name', 'Full blood count',
     'specimen', 'EDTA whole blood',
     'results', jsonb_build_array(
       jsonb_build_object('parameter','Haemoglobin','value',14.2,'unit','g/dL','reference_range','12.0-16.0'),
       jsonb_build_object('parameter','WBC','value',6.1,'unit','×10⁹/L','reference_range','4.0-11.0')),
     'performed_at', to_char(current_date - 21, 'YYYY-MM-DD'),
     'seed_tag', 'staff-demo'),
   now() - interval '21 days' + interval '2 hours', now() - interval '21 days' + interval '2 hours'),

  ('seed_user_003',
   '00000000-0000-0000-0000-000000000001', 'seed_user_004',
   'medication_prescription', current_date - 21,
   jsonb_build_object(
     'prescription_id', gen_random_uuid(),
     'medication_code', 'AMLODIPINE_5',
     'medication', 'Amlodipine 5mg tablet',
     'dose', '1 tablet', 'route', 'ORAL',
     'frequency', 'once daily in the morning', 'duration', '3 months',
     'indication', 'Hypertension',
     'quantity', '90',
     'seed_tag', 'staff-demo'),
   now() - interval '21 days' + interval '3 hours', now() - interval '21 days' + interval '3 hours');

-- ── Dr Thandiwe Mvula (seed_user_004, QECH) ────────────────────────────────
insert into public.medical_records
  (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
values
  ('seed_user_004',
   '00000000-0000-0000-0000-000000000002', 'seed_user_003',
   'outpatient_visit', current_date - 45,
   jsonb_build_object(
     'diagnosis_id', gen_random_uuid(),
     'icd10_code', 'J45',
     'visit_type', 'OUTPATIENT',
     'chief_complaint', 'Recurrent wheezing at night',
     'history_of_present_illness', 'Twice-weekly night-time symptoms; no emergency visits.',
     'physical_exam', jsonb_build_object('bp','118/76 mmHg','pulse','84 bpm','temperature','36.7 °C'),
     'assessment', 'Asthma — mild persistent.',
     'plan', 'Salbutamol inhaler PRN, avoid dust exposure, peak-flow diary.',
     'seed_tag', 'staff-demo'),
   now() - interval '45 days', now() - interval '45 days'),

  ('seed_user_004',
   '00000000-0000-0000-0000-000000000002', 'seed_user_003',
   'immunization_record', current_date - 400,
   jsonb_build_object(
     'immunization_id', gen_random_uuid(),
     'vaccine_code', 'TT',
     'vaccine', 'Tetanus toxoid',
     'dose_number', 1,
     'manufacturer', 'Serum Institute of India',
     'administered_at', to_char(current_date - 400, 'YYYY-MM-DD'),
     'seed_tag', 'staff-demo'),
   now() - interval '400 days', now() - interval '400 days');

-- ── Patrick Kamanga (seed_user_002, District Health Office — Blantyre) ─────
insert into public.medical_records
  (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
values
  ('seed_user_002',
   '00000000-0000-0000-0000-000000000002', 'seed_user_004',
   'outpatient_visit', current_date - 60,
   jsonb_build_object(
     'diagnosis_id', gen_random_uuid(),
     'icd10_code', 'E11.9',
     'visit_type', 'OUTPATIENT',
     'chief_complaint', 'Routine diabetes review; increased thirst',
     'history_of_present_illness', 'Fasting sugars 7-9 mmol/L at home. Adherent to metformin.',
     'physical_exam', jsonb_build_object('bp','134/86 mmHg','pulse','80 bpm','temperature','36.4 °C'),
     'assessment', 'Type 2 diabetes mellitus, suboptimally controlled.',
     'plan', 'Up-titrate metformin, HbA1c in 3 months, diet review.',
     'seed_tag', 'staff-demo'),
   now() - interval '60 days', now() - interval '60 days'),

  ('seed_user_002',
   '00000000-0000-0000-0000-000000000002', 'seed_user_004',
   'screening_test', current_date - 60,
   jsonb_build_object(
     'screening_type', 'Random blood sugar',
     'result', '9.4 mmol/L — above threshold',
     'recommended_follow_up', 'Fasting lipids and HbA1c',
     'seed_tag', 'staff-demo'),
   now() - interval '60 days' + interval '1 hour', now() - interval '60 days' + interval '1 hour');

-- ── Grace Nyirenda (seed_user_001, Ministry of Health) ─────────────────────
insert into public.medical_records
  (profile_id, hospital_id, created_by, record_type, record_date, data, created_at, updated_at)
values
  ('seed_user_001',
   '00000000-0000-0000-0000-000000000001', 'seed_user_003',
   'outpatient_visit', current_date - 30,
   jsonb_build_object(
     'diagnosis_id', gen_random_uuid(),
     'icd10_code', 'K29.7',
     'visit_type', 'OUTPATIENT',
     'chief_complaint', 'Upper abdominal pain after meals',
     'history_of_present_illness', 'Two-month history of post-prandial epigastric pain, relieved by antacids.',
     'physical_exam', jsonb_build_object('bp','122/78 mmHg','pulse','68 bpm','temperature','36.6 °C'),
     'assessment', 'Gastritis, unspecified.',
     'plan', 'Antacid suspension, reduce caffeine, review in 2 weeks.',
     'seed_tag', 'staff-demo'),
   now() - interval '30 days', now() - interval '30 days'),

  ('seed_user_001',
   '00000000-0000-0000-0000-000000000001', 'seed_user_003',
   'medication_prescription', current_date - 30,
   jsonb_build_object(
     'prescription_id', gen_random_uuid(),
     'medication_code', 'ANTACID_SUSP',
     'medication', 'Magnesium/aluminium antacid suspension',
     'dose', '10 mL', 'route', 'ORAL',
     'frequency', 'three times daily after meals', 'duration', '2 weeks',
     'indication', 'Gastritis',
     'quantity', '42',
     'seed_tag', 'staff-demo'),
   now() - interval '30 days' + interval '2 hours', now() - interval '30 days' + interval '2 hours');

commit;

-- ============================================================================
-- SANITY CHECKS
-- ----------------------------------------------------------------------------
-- select doctor_id, count(*) from public.access_grants
--   where is_used and not is_revoked and expires_at > now() group by 1;
-- select profile_id, count(*) from public.medical_records
--   where profile_id in ('seed_user_001','seed_user_002','seed_user_003','seed_user_004')
--   group by 1;
-- select pg_has_role(current_user, 'app_user', 'member');  -- must be t
-- ============================================================================
