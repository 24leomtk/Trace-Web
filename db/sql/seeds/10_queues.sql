-- TRACE seed 10 — queues: tasks + locate confirmations for every home queue.
-- Run AFTER 09_case_images.sql (or standalone on a seeded database).
-- Own transaction, self-contained. Re-runnable: tops up anchors/branches
-- that are short and converts only still-unlocated rows.
--
-- Covers every home-page queue with real rows:
--   AssignmentQueue (assignee = me, open) — every anchor police user gets
--     3 open (overdue / due-soon ≤3d / no-due-date spread for the due chips)
--     + 1 done + 1 cancelled; every branch gets ≥1 tasked officer.
--   LocateQueue (monitors, locate_state = 'located') — rows in
--     lilongwe-regular, lilongwe-traffic, blantyre + country-level, with
--     staggered waiting times (2d–12d).
-- CourtHome (live referrals), InsurerHome (policies) and RegistrarHome
-- (unverified plates) already have data — verified live, untouched here.
--
-- Triggers are deliberately UNMUTED: these are genuine taskings, so
-- assignees/monitors receive real task_assigned + status notifications.

begin;

select setseed(0.20260910);

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  v_phones   text[] := array['+265997000003','+265997000004','+265997000010',
                             '+265997000018','+265997000016','+265997000017',
                             '+265997000005','+265997000011',
                             '+265997000012','+265997000006'];
  v_domains  text[] := array['regular','traffic','regular',
                             'traffic','regular','regular',
                             'regular','traffic',
                             'regular','traffic'];
  -- null district = any district in domain (country monitors).
  v_districts text[] := array['lilongwe','lilongwe','blantyre',
                              'blantyre','rumphi','likoma',
                              'lilongwe','lilongwe', null, null];
  v_assigners text[] := array['+265997000012','+265997000006','+265997000012',
                              '+265997000006','+265997000012','+265997000012',
                              '+265997000012','+265997000006',
                              '+265997000006','+265997000012'];
  v_notes    text[] := array['Re-interview witnesses.','Verify plate with registry.',
                             'Collect outstanding statements.','Confirm impound release conditions.',
                             'Follow up with complainant.','Check CCTV around the scene.'];
  v_idx      integer;
  v_aid      text;
  v_bid      text;
  v_have     integer;
  v_need     integer;
  v_k        integer := 0;
  r_branch   record;
begin
  -- ── A. Anchor top-up: 3 open + 1 done + 1 cancelled each ──────────────
  for v_idx in 1..array_length(v_phones, 1) loop
    select id into v_aid from public.users where phone_number = v_phones[v_idx];
    select id into v_bid from public.users where phone_number = v_assigners[v_idx];
    continue when v_aid is null or v_bid is null;

    select count(*) into v_have from public.case_assignments
     where assignee_id = v_aid and state = 'open';
    v_need := greatest(3 - v_have, 0);
    if v_need > 0 then
      insert into public.case_assignments
        (record_id, assignee_id, assigned_by, note, due_at, state)
      select r.id, v_aid, v_bid,
        pg_temp.pick(v_notes),
        case (row_number() over ()) % 4
          when 1 then now() - interval '3 days'   -- overdue (red)
          when 2 then now() + interval '2 days'   -- due soon (amber)
          when 3 then null                        -- no due date
          else now() + interval '10 days' end,    -- later (slate)
        'open'
      from (
        select rec.id from public.records rec
         where rec.status = 'active'
           and rec.domain::text = v_domains[v_idx]
           and (v_districts[v_idx] is null or rec.district::text = v_districts[v_idx])
           and not exists (
             select 1 from public.case_assignments a
              where a.record_id = rec.id and a.assignee_id = v_aid and a.state = 'open')
         order by case when rec.access_level = 'country' then 0 else 1 end, random()
         limit v_need
      ) r;
    end if;

    if not exists (select 1 from public.case_assignments
                    where assignee_id = v_aid and state = 'done') then
      insert into public.case_assignments
        (record_id, assignee_id, assigned_by, note, due_at, state, completed_at)
      select rec.id, v_aid, v_bid, pg_temp.pick(v_notes),
        now() - interval '5 days', 'done', now() - interval '1 day'
        from public.records rec
       where rec.domain::text = v_domains[v_idx]
         and (v_districts[v_idx] is null or rec.district::text = v_districts[v_idx])
       order by random() limit 1;
    end if;

    if not exists (select 1 from public.case_assignments
                    where assignee_id = v_aid and state = 'cancelled') then
      insert into public.case_assignments
        (record_id, assignee_id, assigned_by, note, due_at, state)
      select rec.id, v_aid, v_bid, 'Superseded by re-filing (demo).',
        now() + interval '7 days', 'cancelled'
        from public.records rec
       where rec.domain::text = v_domains[v_idx]
         and (v_districts[v_idx] is null or rec.district::text = v_districts[v_idx])
         and not exists (
           select 1 from public.case_assignments a
            where a.record_id = rec.id and a.assignee_id = v_aid)
       order by random() limit 1;
    end if;
  end loop;

  -- ── B. Branch coverage: every branch gets ≥1 tasked officer ───────────
  for r_branch in
    select b.id as bid, b.domain::text as dom from public.branches b
  loop
    select u.id into v_aid from public.users u
     where u.branch_id = r_branch.bid and u.role = 'officer' and u.is_active
       and not exists (
         select 1 from public.case_assignments a
          where a.assignee_id = u.id and a.state = 'open')
     order by random() limit 1;
    continue when v_aid is null; -- branch already covered
    select id into v_bid from public.users
     where role = 'country_monitor' and domain::text = r_branch.dom limit 1;
    v_k := v_k + 1;
    insert into public.case_assignments
      (record_id, assignee_id, assigned_by, note, due_at, state)
    select rec.id, v_aid, v_bid, pg_temp.pick(v_notes),
      case v_k % 4
        when 1 then now() - interval '3 days'
        when 2 then now() + interval '2 days'
        when 3 then null
        else now() + interval '10 days' end,
      'open'
      from public.records rec
     where rec.status = 'active' and rec.branch_id = r_branch.bid
        and not exists (
          select 1 from public.case_assignments a
           where a.record_id = rec.id and a.assignee_id = v_aid and a.state = 'open')
     order by random() limit 1;
  end loop;
end $$;

-- ── C. LocateQueue: staggered unconfirmed locates per monitor scope ──────
-- C1. Lilongwe regular wanted (Grace) — cross-branch report from Blantyre.
with picked as (
  update public.records set
    locate_state = 'located',
    locate_by = (select id from public.users where phone_number = '+265997000010'),
    locate_at = now() - interval '12 days',
    locate_place = 'Lilongwe bus depot',
    locate_note = 'Spotted at the depot; verify before acting (demo).'
   where id = (
     select id from public.records
      where record_type = 'wanted_person' and status = 'active'
        and domain = 'regular' and district = 'lilongwe' and locate_state = 'none'
      order by random() limit 1)
  returning id, locate_by)
insert into public.actions (actor_id, action_type, record_id, reason)
select locate_by, 'locate_reported', id, 'Seeded locate queue.' from picked;

-- C2. Lilongwe regular missing person (Grace).
with picked as (
  update public.records set
    locate_state = 'located',
    locate_by = (select u.id from public.users u
                  where u.role = 'officer' and u.is_active
                    and u.branch_id not in (select id from public.branches where district = 'lilongwe')
                  order by random() limit 1),
    locate_at = now() - interval '5 days',
    locate_place = 'Area 25 market',
    locate_note = 'Seen at the market with an unknown adult (demo).'
   where id = (
     select id from public.records
      where record_type = 'missing_person' and status = 'active'
        and domain = 'regular' and district = 'lilongwe' and locate_state = 'none'
      order by random() limit 1)
  returning id, locate_by)
insert into public.actions (actor_id, action_type, record_id, reason)
select locate_by, 'locate_reported', id, 'Seeded locate queue.' from picked;

-- C3/C4. Lilongwe traffic missing vehicles ×2 (Chrissie).
with picked as (
  update public.records set
    locate_state = 'located',
    locate_by = (select id from public.users where phone_number = '+265997000018'),
    locate_at = now() - interval '8 days',
    locate_place = 'M1 toll gate',
    locate_note = 'ANPR hit at the toll gate (demo).'
   where id = (
     select id from public.records
      where record_type = 'missing_vehicle' and status = 'active'
        and domain = 'traffic' and district = 'lilongwe' and locate_state = 'none'
      order by random() limit 1)
  returning id, locate_by)
insert into public.actions (actor_id, action_type, record_id, reason)
select locate_by, 'locate_reported', id, 'Seeded locate queue.' from picked;

with picked as (
  update public.records set
    locate_state = 'located',
    locate_by = (select u.id from public.users u
                  where u.role = 'officer' and u.is_active
                    and u.branch_id not in (select id from public.branches where district = 'lilongwe')
                  order by random() limit 1),
    locate_at = now() - interval '2 days',
    locate_place = 'Lilongwe bus depot',
    locate_note = 'Parked at the depot rank (demo).'
   where id = (
     select id from public.records
      where record_type = 'missing_vehicle' and status = 'active'
        and domain = 'traffic' and district = 'lilongwe' and locate_state = 'none'
      order by random() limit 1)
  returning id, locate_by)
insert into public.actions (actor_id, action_type, record_id, reason)
select locate_by, 'locate_reported', id, 'Seeded locate queue.' from picked;

-- C5. Blantyre regular (bulk monitor coverage).
with picked as (
  update public.records set
    locate_state = 'located',
    locate_by = (select u.id from public.users u
                  where u.role = 'officer' and u.is_active
                    and u.branch_id not in (select id from public.branches where district = 'blantyre')
                  order by random() limit 1),
    locate_at = now() - interval '6 days',
    locate_place = 'Blantyre market',
    locate_note = 'Spotted at the market (demo).'
   where id = (
     select id from public.records
      where record_type in ('wanted_person','stolen_property') and status = 'active'
        and domain = 'regular' and district = 'blantyre' and locate_state = 'none'
      order by random() limit 1)
  returning id, locate_by)
insert into public.actions (actor_id, action_type, record_id, reason)
select locate_by, 'locate_reported', id, 'Seeded locate queue.' from picked;

-- C6. Blantyre traffic missing vehicle.
with picked as (
  update public.records set
    locate_state = 'located',
    locate_by = (select u.id from public.users u
                  where u.role = 'officer' and u.is_active
                    and u.branch_id not in (select id from public.branches where district = 'blantyre')
                  order by random() limit 1),
    locate_at = now() - interval '4 days',
    locate_place = 'Ginnery Corner',
    locate_note = 'Flagged at the checkpoint (demo).'
   where id = (
     select id from public.records
      where record_type = 'missing_vehicle' and status = 'active'
        and domain = 'traffic' and district = 'blantyre' and locate_state = 'none'
      order by random() limit 1)
  returning id, locate_by)
insert into public.actions (actor_id, action_type, record_id, reason)
select locate_by, 'locate_reported', id, 'Seeded locate queue.' from picked;

-- C7. Country-level regular wanted (Francis).
with picked as (
  update public.records set
    locate_state = 'located',
    access_level = 'country',
    locate_by = (select u.id from public.users u
                  where u.role = 'officer' and u.is_active
                  order by random() limit 1),
    locate_at = now() - interval '10 days',
    locate_place = 'Mzuzu bus depot',
    locate_note = 'Long-range sighting, needs confirmation (demo).'
   where id = (
     select id from public.records
      where record_type = 'wanted_person' and status = 'active'
        and domain = 'regular' and locate_state = 'none'
      order by random() limit 1)
  returning id, locate_by)
insert into public.actions (actor_id, action_type, record_id, reason)
select locate_by, 'locate_reported', id, 'Seeded locate queue.' from picked;

-- C8. Country-level traffic missing vehicle (Yohane).
with picked as (
  update public.records set
    locate_state = 'located',
    access_level = 'country',
    locate_by = (select u.id from public.users u
                  where u.role = 'officer' and u.is_active
                  order by random() limit 1),
    locate_at = now() - interval '3 days',
    locate_place = 'M1, Dedza',
    locate_note = 'Patrol sighting (demo).'
   where id = (
     select id from public.records
      where record_type = 'missing_vehicle' and status = 'active'
        and domain = 'traffic' and locate_state = 'none'
      order by random() limit 1)
  returning id, locate_by)
insert into public.actions (actor_id, action_type, record_id, reason)
select locate_by, 'locate_reported', id, 'Seeded locate queue.' from picked;

do $$
begin
  raise notice 'seed/10 queues: % open tasks, % located rows.',
    (select count(*) from public.case_assignments where state = 'open'),
    (select count(*) from public.records where locate_state = 'located');
end $$;

commit;
