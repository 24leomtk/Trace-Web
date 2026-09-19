-- TRACE seed 05 — insurance policies (both insurers).
-- Run AFTER 04_traffic_cases.sql. Own transaction, self-contained.
-- Notification triggers muted (flag set below).
-- Mix: even rows expired (liveness demo), odd rows live. Refreshed by
-- Seed-refresh.sql (is_active healed from end_date).
--
-- Knob: v_policy_count = 150.

begin;

select set_config('app.seed_load', 'on', false);
select setseed(0.20260918);

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  v_policy_count integer := 150;
  v_i            integer;
  v_seq          integer := 600000;
  v_vehicle      uuid;
  v_org_ins_nico uuid;
  v_org_ins_om   uuid;
  v_insurer      text;
  v_insurer_two  text;
begin
  select id into v_org_ins_nico from public.organizations where name = 'NICO General';
  select id into v_org_ins_om   from public.organizations where name = 'Old Mutual';
  select id into v_insurer      from public.users where phone_number = '+265997000008';
  select id into v_insurer_two  from public.users where phone_number = '+265997000014';

  for v_i in 1..v_policy_count loop
    select id into v_vehicle from public.vehicles order by random() limit 1;
    insert into public.insurance_policies
      (vehicle_id, insurer_id, policy_number, coverage_type,
       start_date, end_date, is_active, entered_by)
    values
      (v_vehicle,
       case when random() < 0.7 then v_org_ins_nico else v_org_ins_om end,
       'POL-2026-' || (60000 + v_seq),
       pg_temp.pick(array['third_party','comprehensive']),
       (now() - interval '200 days')::date,
       case when v_i % 2 = 0 then (now() - interval '10 days')::date
            else (now() + interval '165 days')::date end,
       true, case when random() < 0.7 then v_insurer else v_insurer_two end);
    v_seq := v_seq + 1;
  end loop;

  -- Insurer + registrar audit footprints.
  insert into public.actions (actor_id, action_type, reason)
  values (v_insurer, 'insurer_flag_lookup', 'Generated flag lookup.'),
         (v_insurer_two, 'insurer_flag_lookup', 'Generated flag lookup (Old Mutual).'),
         ((select id from public.users where phone_number = '+265997000009'),
          'vehicle_registered', 'Generated verification.');

  raise notice 'seed/05 insurance: % policies.', (select count(*) from public.insurance_policies);
end $$;

commit;
