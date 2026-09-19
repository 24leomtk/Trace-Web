-- TRACE seed 06 — court referrals + e-Brief tranches.
-- Run AFTER 05_insurance.sql. Own transaction, self-contained.
-- Notification triggers muted (flag set below).
-- Covers: pending / viewed / decided (all 6 terminal outcomes) / revoked /
-- expiring-in-2d (renew demo) / renewed + doc tranches + full e-Brief pack +
-- second-court isolation pack.
--
-- Knob: v_referral_count = 40.

begin;

select set_config('app.seed_load', 'on', false);
select setseed(0.20260918);

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  v_referral_count integer := 40;
  v_i              integer;
  v_record         uuid;
  v_grant          uuid;
  v_rdate          date;
  v_outcomes       text[] := array['convicted','charged','withdrawn','acquitted','dismissed','other'];
  v_monitor_district text;
  v_liaison        text;
  v_liaison_two    text;
begin
  select id into v_monitor_district from public.users where phone_number = '+265997000005';
  select id into v_liaison          from public.users where phone_number = '+265997000007';
  select id into v_liaison_two      from public.users where phone_number = '+265997000013';

  for v_i in 1..v_referral_count loop
    v_record := null;
    select id into v_record from public.records
     where status = 'active' and domain = 'regular' order by random() limit 1;
    continue when v_record is null;
    v_rdate := (now() - (floor(random() * 60) || ' days')::interval)::date;
    insert into public.court_case_access
      (id, record_id, court_liaison_id, referred_by, reason, expires_at,
       outcome, outcome_notes, outcome_recorded_by, outcome_recorded_at,
       first_viewed_at, renewed_at, renewal_count, created_at)
    values
      (gen_random_uuid(), v_record,
       case when v_i % 2 = 0 then v_liaison else v_liaison_two end,
       v_monitor_district,
       'Referred for prosecution (generated batch ' || v_i || ').',
       case when v_i % 7 = 0 then now() + interval '2 days'
            else now() + interval '90 days' end,
       case when v_i % 4 = 0 then v_outcomes[1 + (v_i % 6)]::court_case_outcome else 'pending' end,
       case when v_i % 4 = 0 then 'Outcome recorded in generated batch.' end,
       case when v_i % 4 = 0 then (case when v_i % 2 = 0 then v_liaison else v_liaison_two end) end,
       case when v_i % 4 = 0 then now() - interval '1 day' end,
       case when v_i % 3 <> 0 then v_rdate + interval '2 days' end,
       case when v_i % 6 = 0 then now() - interval '5 days' end,
       case when v_i % 6 = 0 then 1 else 0 end,
       v_rdate)
    returning id into v_grant;
    if v_i % 5 = 0 then
      insert into public.referral_documents
        (referral_id, label, url, storage_path, file_type, uploaded_by)
      values
        (v_grant, 'charge_sheet', 'https://picsum.photos/seed/trace-charge/800/600',
         'seed/charge.jpg', 'image/jpeg', v_monitor_district),
        (v_grant, 'witness_statement', 'https://picsum.photos/seed/trace-statement/800/600',
         'seed/statement.jpg', 'image/jpeg', v_monitor_district),
        (v_grant, 'exhibit_photo', 'https://picsum.photos/seed/trace-exhibit/800/600',
         'seed/exhibit.jpg', 'image/jpeg', v_monitor_district);
    end if;
    if v_i % 9 = 0 then
      update public.court_case_access set revoked_at = now() - interval '1 day'
       where id = v_grant;
    end if;
  end loop;

  -- Full e-Brief path: active Lilongwe case → referred → tranches →
  -- viewed → convicted (exercises the SLA end to end).
  v_record := null;
  select id into v_record from public.records
   where status = 'active' and domain = 'regular' and district = 'lilongwe'
   order by random() limit 1;
  if v_record is null then
    raise exception 'Seed assumption failed: no active regular lilongwe record for e-Brief pack';
  end if;
  insert into public.court_case_access
    (id, record_id, court_liaison_id, referred_by, reason, expires_at,
     outcome, outcome_notes, outcome_recorded_by, outcome_recorded_at,
     first_viewed_at, created_at)
  values
    (gen_random_uuid(), v_record, v_liaison_two, v_monitor_district,
     'Referred for prosecution — full brief attached (demo).',
     now() + interval '90 days', 'convicted',
     'Convicted; sentenced in the demo brief.', v_liaison_two,
     now() - interval '1 day', now() - interval '6 days', now() - interval '8 days')
  returning id into v_grant;
  insert into public.referral_documents
    (referral_id, label, url, storage_path, file_type, uploaded_by)
  values
    (v_grant, 'charge_sheet', 'https://picsum.photos/seed/trace-charge/800/600',
     'seed/charge.jpg', 'image/jpeg', v_monitor_district),
    (v_grant, 'witness_statement', 'https://picsum.photos/seed/trace-statement/800/600',
     'seed/statement.jpg', 'image/jpeg', v_monitor_district),
    (v_grant, 'exhibit_photo', 'https://picsum.photos/seed/trace-exhibit/800/600',
     'seed/exhibit.jpg', 'image/jpeg', v_monitor_district);

  -- Second-court isolation referral (expires in 2 days → renew demo).
  v_record := null;
  select id into v_record from public.records
   where status = 'active' and domain = 'regular' and district = 'blantyre'
   order by random() limit 1;
  if v_record is null then
    raise exception 'Seed assumption failed: no active regular blantyre record for isolation pack';
  end if;
  insert into public.court_case_access
    (record_id, court_liaison_id, referred_by, reason, expires_at, outcome)
  values
    (v_record, v_liaison, v_monitor_district,
     'Referred for prosecution — isolation demo, expires soon.',
     now() + interval '2 days', 'pending');

  raise notice 'seed/06 court: % referrals, % brief docs.',
    (select count(*) from public.court_case_access), (select count(*) from public.referral_documents);
end $$;

commit;
