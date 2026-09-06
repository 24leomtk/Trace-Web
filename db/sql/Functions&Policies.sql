-- Chipatala Registry application security and derived-data functions.
-- Run after the Drizzle schema migration. The application connection must use
-- app_user (or a role granted app_user) for PostgreSQL RLS to be effective.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user noinherit login;
  end if;
end $$;

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;

-- Let the administrative connection role become app_user inside transactions
-- (`set local role app_user` in lib/db-context.ts). Idempotent.
-- NOTE: `with set true` is required on PostgreSQL 16+ — memberships granted
-- by a CREATEROLE user default to SET false, which blocks SET ROLE.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    if not pg_has_role(current_user, 'app_user', 'member')
       or not pg_has_role(current_user, 'app_user', 'usage') then
      begin
        execute format(
          'grant app_user to %I with set true inherit true',
          current_user
        );
      exception when insufficient_privilege then
        raise warning 'Could not grant app_user to % — run as a role with CREATEROLE/ADMIN OPTION.', current_user;
      end;
    end if;
  end if;
end $$;

create or replace function public.set_user_id(uid text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if uid is null or length(uid) = 0 then
    raise exception 'A non-empty application user id is required';
  end if;
  perform set_config('app.current_user_id', uid, true);
end;
$$;

revoke all on function public.set_user_id(text) from public;
grant execute on function public.set_user_id(text) to app_user;

create or replace function public.app_user_id()
returns text
language sql
stable
as $$ select nullif(current_setting('app.current_user_id', true), '') $$;

create or replace function public.app_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.users
    where id = public.app_user_id()
      and role in ('doctor', 'district_admin', 'country_admin')
  )
$$;

-- Administrators manage users, hospitals, codebooks and guidelines.
-- They are intentionally NOT staff: app_is_staff() and
-- app_can_read_patient() exclude them, so they can never open medical
-- records, analytics aggregates excluded.
create or replace function public.app_is_administrator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.users
    where id = public.app_user_id()
      and role = 'administrator'
  )
$$;

create or replace function public.app_can_read_patient(patient_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select patient_id = public.app_user_id()
      or exists (
        select 1
        from public.users actor
        where actor.id = public.app_user_id()
          and (
            actor.role = 'country_admin'
            or (actor.role = 'district_admin' and actor.district = (select district from public.users where id = patient_id))
            or (actor.role = 'doctor' and exists (
              select 1 from public.access_grants g
              where g.profile_id = patient_id
                and g.doctor_id = actor.id
                and not g.is_revoked
                and g.is_used
                and g.expires_at > now()
            ))
          )
      )
$$;

-- redeem_access_code(p_code, p_doctor_name, p_license_no, p_hospital_name, p_district)
--
-- Atomically claims an unclaimed access code, sets the expiry window, writes a
-- full audit row, and returns the redeemed grant row.
--
-- Error codes (raised as SQLSTATE P0001 with a machine-readable prefix):
--   CODE_INVALID  — code not found, already used, revoked, or expired
--   PATIENT_NOT_FOUND — profile_id references a deleted/missing user row
--
-- Must be executed while app.current_user_id is set (i.e. inside withUserCtx).
drop function if exists public.redeem_access_code(text);
drop function if exists public.redeem_access_code(text, text, text, text, text);

create or replace function public.redeem_access_code(
  p_code          text,
  p_doctor_name   text    default null,
  p_license_no    text    default null,
  p_hospital_name text    default null,
  p_district      text    default null
)
returns public.access_grants
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  g      public.access_grants;
  v_actor text := public.app_user_id();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  -- Lock the unclaimed row. FOR UPDATE ensures concurrent redemptions can't
  -- double-spend the same code.
  select * into g
    from public.access_grants
   where code       = p_code
     and doctor_id  is null
     and not is_used
     and not is_revoked
     and created_at > now() - interval '24 hours'
   for update;

  if not found then
    raise exception 'CODE_INVALID'
      using errcode = 'P0001',
            detail  = 'The code was not found, is already used, has been revoked, or has expired.';
  end if;

  -- Claim the code and open the access window atomically.
  update public.access_grants
     set is_used   = true,
         used_at   = now(),
         doctor_id = v_actor,
         expires_at = now() + make_interval(secs => g.duration_seconds)
   where id = g.id
   returning * into g;

  -- Verify the patient still exists (edge case: account deleted after code issued).
  if not exists (select 1 from public.users where id = g.profile_id) then
    raise exception 'PATIENT_NOT_FOUND'
      using errcode = 'P0002',
            detail  = 'The patient account for that code no longer exists.';
  end if;

  -- Write a full, denormalized audit row.
  insert into public.actions (
    profile_id, actor_id, action_type, access_grant_id,
    reason, doctor_name, medical_license_no, hospital_name, district
  ) values (
    g.profile_id, v_actor, 'code_redeemed', g.id,
    'Access code redeemed at point of care.',
    p_doctor_name, p_license_no, p_hospital_name, p_district
  );

  return g;
end;
$$;

revoke all on function public.redeem_access_code(text, text, text, text, text) from public;
grant execute on function public.redeem_access_code(text, text, text, text, text) to app_user;

create or replace function public.emergency_lookup(
  p_national_id text default null,
  p_phone_number text default null,
  p_reason text default null
)
returns table (
  user_id text,
  name text,
  date_of_birth date,
  sex sex,
  district district,
  emergency_info jsonb
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor text := public.app_user_id();
  v_found record;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not public.app_is_staff() then
    raise exception 'Only staff may perform emergency lookups';
  end if;

  if (p_national_id is null or length(trim(p_national_id)) = 0)
     and (p_phone_number is null or length(trim(p_phone_number)) = 0) then
    raise exception 'A national ID or phone number is required';
  end if;

  select u.id, u.name, u.date_of_birth, u.sex, u.district, u.emergency_info
    into v_found
    from public.users u
    where (p_national_id is not null and u.national_id = p_national_id)
       or (p_phone_number is not null and u.phone_number = p_phone_number)
    limit 1;

  -- Log the attempt regardless of whether a match was found.
  insert into public.actions (
    profile_id, actor_id, action_type, reason, created_at
  ) values (
    coalesce(v_found.id, v_actor), -- fall back so profile_id is never null
    v_actor,
    'emergency_access',
    coalesce(p_reason, 'Emergency lookup') ||
      case when v_found.id is null then ' (no match found)' else '' end,
    now()
  );

  if v_found.id is null then
    return;
  end if;

  return query select v_found.id, v_found.name, v_found.date_of_birth,
                      v_found.sex, v_found.district, v_found.emergency_info;
end;
$$;

revoke all on function public.emergency_lookup(text, text, text) from public;
grant execute on function public.emergency_lookup(text, text, text) to app_user;

-- RLS policies. DROP makes this file safe to re-run during deployment.
alter table public.users enable row level security;
alter table public.medical_records enable row level security;
alter table public.record_attachments enable row level security;
alter table public.access_grants enable row level security;
alter table public.diagnoses enable row level security;
alter table public.prescriptions enable row level security;
alter table public.immunizations enable row level security;
alter table public.actions enable row level security;

-- Do not FORCE RLS for the schema owner: the SECURITY DEFINER trigger below
-- must be able to write the derived tables. The application must connect as
-- app_user (not the migration/schema owner) to be subject to these policies.

drop policy if exists users_self on public.users;
create policy users_self on public.users for select to app_user
  using (
    id = public.app_user_id()
    or public.app_can_read_patient(id)
    or public.app_is_administrator()
    -- Staff profiles act as directory information: every signed-in user may
    -- see who authored a record / who redeemed a code. Patient rows remain
    -- fully gated by app_can_read_patient (administrators bypass via
    -- app_is_administrator above, never via record access).
    or role in ('doctor', 'district_admin', 'country_admin', 'administrator')
  );
drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users for update to app_user
  using (public.app_is_administrator())
  with check (public.app_is_administrator());
drop policy if exists users_admin_insert on public.users;
create policy users_admin_insert on public.users for insert to app_user
  with check (public.app_is_administrator());
drop policy if exists users_admin_delete on public.users;
create policy users_admin_delete on public.users for delete to app_user
  using (public.app_is_administrator());
drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users for update to app_user
  using (id = public.app_user_id()) with check (id = public.app_user_id());

drop policy if exists records_patient_or_granted on public.medical_records;
create policy records_patient_or_granted on public.medical_records for select to app_user
  using (public.app_can_read_patient(profile_id));
drop policy if exists records_doctor_insert on public.medical_records;
create policy records_doctor_insert on public.medical_records for insert to app_user
  with check (
    (created_by = public.app_user_id() and public.app_is_staff())
    or profile_id = public.app_user_id()  -- patient self-reported entries
  );
drop policy if exists records_owner_update on public.medical_records;
create policy records_owner_update on public.medical_records for update to app_user
  using (created_by = public.app_user_id() or profile_id = public.app_user_id())
  with check (created_by = public.app_user_id() or profile_id = public.app_user_id());

drop policy if exists attachments_patient_or_granted on public.record_attachments;
create policy attachments_patient_or_granted on public.record_attachments for select to app_user
  using (exists (select 1 from public.medical_records r where r.id = record_id and public.app_can_read_patient(r.profile_id)));
drop policy if exists attachments_staff_insert on public.record_attachments;
create policy attachments_staff_insert on public.record_attachments for insert to app_user
  with check (uploaded_by = public.app_user_id());

drop policy if exists grants_patient_or_doctor on public.access_grants;
create policy grants_patient_or_doctor on public.access_grants for select to app_user
  using (
    profile_id = public.app_user_id()
    or doctor_id = public.app_user_id()
    -- Unclaimed codes are visible to the clinicians meant to redeem them.
    -- UPDATE scans need this SELECT-side visibility to find the row at all.
    or (
      doctor_id is null
      and not is_used
      and not is_revoked
      and public.app_is_staff()
    )
  );
drop policy if exists grants_patient_insert on public.access_grants;
create policy grants_patient_insert on public.access_grants for insert to app_user
  with check (profile_id = public.app_user_id() and issued_by = public.app_user_id());
drop policy if exists grants_patient_update on public.access_grants;
create policy grants_patient_update on public.access_grants for update to app_user
  using (profile_id = public.app_user_id()) with check (profile_id = public.app_user_id());
-- Clinicians claim unclaimed codes by setting doctor_id to themselves.
drop policy if exists grants_doctor_claim on public.access_grants;
create policy grants_doctor_claim on public.access_grants for update to app_user
  using (doctor_id is null and not is_used and not is_revoked)
  with check (doctor_id = public.app_user_id());
-- Break-glass: a clinician opens a window directly, issued by themselves.
drop policy if exists grants_doctor_break_glass on public.access_grants;
create policy grants_doctor_break_glass on public.access_grants for insert to app_user
  with check (issued_by = public.app_user_id() and doctor_id = public.app_user_id());

drop policy if exists diagnoses_patient_or_granted on public.diagnoses;
create policy diagnoses_patient_or_granted on public.diagnoses for select to app_user
  using (public.app_can_read_patient(profile_id));
drop policy if exists prescriptions_patient_or_granted on public.prescriptions;
create policy prescriptions_patient_or_granted on public.prescriptions for select to app_user
  using (public.app_can_read_patient(profile_id));
drop policy if exists immunizations_patient_or_granted on public.immunizations;
create policy immunizations_patient_or_granted on public.immunizations for select to app_user
  using (public.app_can_read_patient(profile_id));

drop policy if exists actions_subject_or_actor on public.actions;
create policy actions_subject_or_actor on public.actions for select to app_user
  using (profile_id = public.app_user_id() or actor_id = public.app_user_id() or public.app_is_staff());
drop policy if exists actions_actor_insert on public.actions;
create policy actions_actor_insert on public.actions for insert to app_user
  with check (actor_id = public.app_user_id());

-- Derived clinical facts ----------------------------------------------------
create or replace function public.age_band(dob date, as_of date)
returns text language sql immutable as $$
  select case
    when dob is null then null
    when extract(year from age(as_of, dob)) < 5 then '0-4'
    when extract(year from age(as_of, dob)) < 15 then '5-14'
    when extract(year from age(as_of, dob)) < 25 then '15-24'
    when extract(year from age(as_of, dob)) < 45 then '25-44'
    when extract(year from age(as_of, dob)) < 65 then '45-64'
    else '65+'
  end
$$;

create or replace function public.populate_record_facts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  patient public.users%rowtype;
  diagnosis_uuid uuid;
  prescription_uuid uuid;
  immunization_uuid uuid;
  icd text;
  medication text;
  vaccine text;
begin
  select * into patient from public.users where id = new.profile_id;
  icd := nullif(new.data->>'icd10_code', '');
  medication := coalesce(nullif(new.data->>'medication_code', ''), nullif(new.data->>'medication', ''));
  vaccine := coalesce(nullif(new.data->>'vaccine_code', ''), nullif(new.data->>'vaccine', ''));

  if icd is not null and new.record_type in ('outpatient_visit','pathology_report','psychiatric_evaluation','discharge_summary') then
    diagnosis_uuid := coalesce(nullif(new.data->>'diagnosis_id', '')::uuid, gen_random_uuid());
    insert into public.diagnoses (id, record_id, profile_id, icd10_code, hospital_id, district, age_band, sex, notes, severity, diagnosed_at)
    values (diagnosis_uuid, new.id, new.profile_id, icd, new.hospital_id, patient.district,
      public.age_band(patient.date_of_birth, new.record_date), patient.sex,
      coalesce(new.data->>'assessment', new.data->>'diagnosis', new.data->>'final_diagnosis'), new.data->>'grade', new.record_date)
    on conflict (id) do update set notes = excluded.notes, severity = excluded.severity;
  end if;

  if medication is not null and new.record_type = 'medication_prescription' then
    prescription_uuid := coalesce(nullif(new.data->>'prescription_id', '')::uuid, gen_random_uuid());
    insert into public.prescriptions (id, record_id, profile_id, diagnosis_id, medication_code, dose, route, frequency, duration, indication, quantity, hospital_id, district, age_band, prescribed_at)
    values (prescription_uuid, new.id, new.profile_id, nullif(new.data->>'diagnosis_id', '')::uuid, medication,
      new.data->>'dose', (new.data->>'route')::route, new.data->>'frequency', new.data->>'duration', new.data->>'indication',
      nullif(new.data->>'quantity', '')::numeric, new.hospital_id, patient.district,
      public.age_band(patient.date_of_birth, new.record_date), new.record_date)
    on conflict (id) do update set dose = excluded.dose, frequency = excluded.frequency, duration = excluded.duration;
  end if;

  if vaccine is not null and new.record_type = 'immunization_record' then
    immunization_uuid := coalesce(nullif(new.data->>'immunization_id', '')::uuid, gen_random_uuid());
    insert into public.immunizations (id, record_id, profile_id, vaccine_code, dose_number, manufacturer, hospital_id, district, administered_at)
    values (immunization_uuid, new.id, new.profile_id, vaccine, (new.data->>'dose_number')::integer,
      new.data->>'manufacturer', new.hospital_id, patient.district, (new.data->>'administered_at')::date)
    on conflict (id) do update set manufacturer = excluded.manufacturer, administered_at = excluded.administered_at;
  end if;
  return new;
end;
$$;

drop trigger if exists medical_records_populate_facts on public.medical_records;
create trigger medical_records_populate_facts
after insert or update of record_type, data, profile_id, hospital_id, record_date on public.medical_records
for each row execute function public.populate_record_facts();

revoke update, delete on public.actions from app_user;
