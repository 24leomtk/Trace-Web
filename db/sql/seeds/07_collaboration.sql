-- TRACE seed 07 — collaboration: reviews, tasking, attachments, sessions, keys.
-- Run AFTER 06_court.sql. Own transaction, self-contained.
-- Notification triggers muted (flag set below).
-- Covers: reviews, assignments (open / overdue / done / cancelled),
-- PDF + video attachments, anchor sessions, DEV-ONLY ANPR key.
--
-- Knobs: v_review_count = 120 · v_assign_count = 50.

begin;

select set_config('app.seed_load', 'on', false);
select setseed(0.20260918);

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  v_review_count integer := 120;
  v_assign_count integer := 50;
  v_i            integer;
  v_record       uuid;
  v_officer      text;
  v_branch_district text;
  v_note         text;
  v_r            float;
  v_monitor_district text;
  v_officer_traffic text;
  v_sysadmin     text;
  v_officer_regular text;
begin
  select id into v_monitor_district from public.users where phone_number = '+265997000005';
  select id into v_officer_traffic  from public.users where phone_number = '+265997000004';
  select id into v_sysadmin         from public.users where phone_number = '+265997000001';
  select id into v_officer_regular  from public.users where phone_number = '+265997000003';

  for v_i in 1..v_review_count loop
    v_record := null;
    select id, reported_by into v_record, v_officer from public.records
     order by random() limit 1;
    continue when v_record is null;
    v_note := pg_temp.pick(array[
      'Reviewed — statements consistent, keep active.',
      'Follow up with the reporting branch on outstanding witness accounts.',
      'Escalation justified; visibility widened.',
      'No further action needed unless new evidence surfaces.',
      'Cross-checked plate against registry; details confirmed.']);
    insert into public.case_reviews (record_id, reviewer_id, note)
    values (v_record, v_monitor_district, v_note);
  end loop;

  for v_i in 1..v_assign_count loop
    v_record := null;
    select id, district::text into v_record, v_branch_district from public.records
     where status = 'active' order by random() limit 1;
    continue when v_record is null;
    select u.id into v_officer from public.users u
      join public.branches b on b.id = u.branch_id
     where u.role = 'officer' and u.is_active and b.district::text = v_branch_district
     order by random() limit 1;
    continue when v_officer is null;
    v_r := random();
    insert into public.case_assignments
      (record_id, assignee_id, assigned_by, note, due_at, state, completed_at)
    values
      (v_record, v_officer, v_monitor_district,
       pg_temp.pick(array['Re-interview witnesses.','Verify plate with registry.',
         'Collect outstanding statements.','Confirm impound release conditions.']),
       case when v_r < 0.25 then now() - interval '3 days'
            else now() + ((1 + floor(random() * 14)) || ' days')::interval end,
       case when v_r < 0.25 then 'open'
            when v_r < 0.5 then 'done'
            when v_r < 0.6 then 'cancelled'
            else 'open' end,
       case when v_r >= 0.25 and v_r < 0.5 then now() - interval '1 day' end);
  end loop;

  -- Media: one PDF charge sheet + one video statement, each on its own case.
  insert into public.record_attachments
    (record_id, person_id, vehicle_id, url, storage_path, file_type,
     file_size_bytes, retention_until, uploaded_by)
  select id, null, null,
    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    'seed/charge-sheet.pdf', 'application/pdf', 13264, now() + interval '5 years',
    v_monitor_district
    from public.records
   where status = 'active' order by random() limit 1;
  insert into public.record_attachments
    (record_id, person_id, vehicle_id, url, storage_path, file_type,
     file_size_bytes, retention_until, uploaded_by)
  select id, null, null,
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    'seed/statement.mp4', 'video/mp4', 5600000, now() + interval '5 years',
    v_monitor_district
    from public.records
   where status = 'active' order by random() limit 1;

  -- Access-review sessions: recent anchors (rest read as dormant).
  insert into public.sessions
    (id, expires_at, token, user_id, updated_at)
  values
    (gen_random_uuid()::text, now() + interval '7 days', 'seed-sess-sysadmin', v_sysadmin, now() - interval '2 hours'),
    (gen_random_uuid()::text, now() + interval '7 days', 'seed-sess-officer', v_officer_regular, now() - interval '1 day'),
    (gen_random_uuid()::text, now() + interval '7 days', 'seed-sess-traffic', v_officer_traffic, now() - interval '3 hours'),
    (gen_random_uuid()::text, now() + interval '7 days', 'seed-sess-monitor', v_monitor_district, now() - interval '5 days');

  -- DEV-ONLY machine key for the ANPR endpoint (plaintext in NOTICE only).
  insert into public.api_keys (user_id, name, key_hash, key_prefix, scopes)
  values (v_officer_traffic, 'Seeded ANPR demo key',
    encode(digest('trace_seed_demo_anpr_001', 'sha256'), 'hex'),
    'trace_seed_', array['plate:read']);

  raise notice 'seed/07 collaboration: % reviews, % assignments, % attachments.',
    (select count(*) from public.case_reviews),
    (select count(*) from public.case_assignments),
    (select count(*) from public.record_attachments);
end $$;

commit;
