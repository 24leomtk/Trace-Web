-- TRACE application security: 90 legacy cleanup (previous medical-records app).
-- Run any time as the schema owner. Safe to re-run: everything is IF EXISTS.
-- On a fresh database (Reset-dev.sql + migrate) this is a no-op.

drop trigger if exists medical_records_populate_facts on public.medical_records;
drop function if exists public.redeem_access_code(text, text, text, text, text);
drop function if exists public.redeem_access_code(text);
drop function if exists public.emergency_lookup(text, text, text);
drop function if exists public.populate_record_facts() cascade;
drop function if exists public.age_band(date, date);
drop function if exists public.app_can_read_patient(text);
drop function if exists public.app_is_staff();
drop policy if exists users_self on public.users;
drop policy if exists users_admin_update on public.users;
drop policy if exists users_admin_insert on public.users;
drop policy if exists users_admin_delete on public.users;
drop policy if exists users_self_update on public.users;
drop policy if exists records_patient_or_granted on public.medical_records;
drop policy if exists records_doctor_insert on public.medical_records;
drop policy if exists records_owner_update on public.medical_records;
drop policy if exists attachments_patient_or_granted on public.record_attachments;
drop policy if exists attachments_staff_insert on public.record_attachments;
drop policy if exists grants_patient_or_doctor on public.access_grants;
drop policy if exists grants_patient_insert on public.access_grants;
drop policy if exists grants_patient_update on public.access_grants;
drop policy if exists grants_doctor_claim on public.access_grants;
drop policy if exists grants_doctor_break_glass on public.access_grants;
drop policy if exists diagnoses_patient_or_granted on public.diagnoses;
drop policy if exists prescriptions_patient_or_granted on public.prescriptions;
drop policy if exists immunizations_patient_or_granted on public.immunizations;
drop policy if exists actions_subject_or_actor on public.actions;
drop policy if exists actions_actor_insert on public.actions;
