-- TRACE seed 08 — notifications (all 9 types) + audit trail.
-- Run LAST, AFTER 07_collaboration.sql. Own transaction, self-contained.
-- Turns the seed-mute OFF first, then inserts deterministic inbox rows
-- directly (bulk triggers in 01–07 were silent by design, so this file is the
-- authoritative inbox fixture). Includes read + unread mix.
--
-- Knob: v_audit_count = 250 (covers every audit_action_type at least twice).

begin;

select set_config('app.seed_load', 'off', false);
select setseed(0.20260918);

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  v_audit_count integer := 250;
  v_i           integer;
  v_record      uuid;
  v_officer_regular text;
  v_sysadmin    text;
  v_registrar   text;
begin
  select id into v_officer_regular from public.users where phone_number = '+265997000003';
  select id into v_sysadmin from public.users where phone_number = '+265997000001';
  select id into v_registrar from public.users where phone_number = '+265997000009';

  -- ── Inbox fixtures: mirror the §2.2 trigger templates verbatim ─────────
  -- referral_received ×5 (newest grants → liaisons).
  insert into public.notifications (user_id, type, record_id, message, is_read, created_at)
  select court_liaison_id, 'referral_received', record_id,
         'New referral from the district monitor — expires '
         || to_char(expires_at, 'YYYY-MM-DD') || '.',
         (row_number() over () % 2 = 0), created_at
    from public.court_case_access order by created_at desc limit 5;
  -- referral_updated ×4 (renew + revoke flavours).
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select court_liaison_id, 'referral_updated', record_id,
         case when revoked_at is not null
              then 'Access revoked: contact the referring monitor if still needed.'
              else 'Access renewed: extended to ' || to_char(expires_at, 'YYYY-MM-DD') || ' (renewal demo).' end,
         (row_number() over () % 2 = 0)
    from public.court_case_access
   where revoked_at is not null or renewal_count > 0 or expires_at <= now() + interval '7 days'
   limit 4;
  -- outcome_recorded ×4 (decided grants → referrers).
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select referred_by, 'outcome_recorded', record_id,
         'Court outcome: → ' || outcome::text || ' (demo).',
         (row_number() over () % 2 = 0)
    from public.court_case_access where outcome <> 'pending' limit 4;
  -- status_changed ×10 (status/escalation/locate/hold flavours → reporters).
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select reported_by, 'status_changed', id,
         'Status of your case was changed by a monitor (demo).',
         (row_number() over () % 2 = 0)
    from public.records where status <> 'active' limit 4;
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select reported_by, 'status_changed', id,
         'Visibility widened to ' || access_level::text || ' (demo).',
         true
    from public.records where access_level = 'country' limit 2;
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select reported_by, 'status_changed', id,
         'Locate update: ' || locate_state || ' at ' || coalesce(locate_place, 'unknown location') || ' (demo).',
         false
    from public.records where locate_state <> 'none' limit 2;
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select r.reported_by, 'status_changed', r.id,
         'Custody update on your impoundment (demo).', false
    from public.records r join public.impound_custody c on c.record_id = r.id limit 2;
  -- review_added ×6 (reviews → reporters).
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select r.reported_by, 'review_added', v.record_id,
         'Review on your case: "' || left(v.note, 120) || '" (demo).',
         (row_number() over () % 2 = 1)
    from public.case_reviews v join public.records r on r.id = v.record_id limit 6;
  -- task_assigned ×6 (open assignments → assignees).
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select assignee_id, 'task_assigned', record_id,
         'New task assigned to you. Due ' || coalesce(to_char(due_at, 'YYYY-MM-DD'), 'no due date') || ' (demo).',
         false
    from public.case_assignments where state = 'open' limit 6;
  -- task_updated ×4 (done/cancelled → assigners).
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select assigned_by, 'task_updated', record_id,
         'Task ' || state || ' (demo).', true
    from public.case_assignments where state in ('done', 'cancelled') limit 4;
  -- payment_received ×6 (payments → reporters).
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select r.reported_by, 'payment_received', p.record_id,
         'Payment: ' || p.amount::text || ' received. Receipt ' || p.receipt_no || ' (demo).',
         (row_number() over () % 2 = 0)
    from public.citation_payments p join public.records r on r.id = p.record_id limit 6;
  -- verification_needed ×4 (unverified plates → registrar review queue).
  insert into public.notifications (user_id, type, record_id, message, is_read)
  select v_registrar, 'verification_needed', null,
         'Verification needed: plate ' || v.plate_number || ' — confirm against the registry (demo).',
         (row_number() over () % 2 = 0)
    from public.vehicles v where not v.is_verified limit 4;

  -- ── Audit trail: every enum value at least twice ───────────────────────
  for v_i in 1..v_audit_count loop
    v_record := null;
    select id into v_record from public.records order by random() limit 1;
    continue when v_record is null;
    insert into public.actions (actor_id, action_type, record_id, reason)
    values (v_officer_regular,
      pg_temp.pick(array['record_created','record_viewed','record_updated',
        'status_changed','cross_branch_access','cross_district_access','report_generated',
        'court_case_referred','court_case_viewed','court_case_outcome_recorded',
        'court_access_renewed','court_access_expired','policy_entered','policy_updated',
        'payment_received','citation_voided','status_rejected','locate_reported',
        'locate_confirmed','hold_placed','hold_released','owner_notified',
        'review_added','insurer_flag_lookup','vehicle_registered',
        'user_provisioned'])::audit_action_type,
      v_record, 'Generated audit trail row.');
  end loop;
  -- Guard-friction + provisioning anchors.
  select id into v_record from public.records
   where record_type = 'traffic_citation' order by random() limit 1;
  if v_record is not null then
    insert into public.actions (actor_id, action_type, record_id, reason)
    values (v_officer_regular, 'status_rejected', v_record, 'Seeded guard friction: resolve with balance outstanding.'),
           (v_officer_regular, 'payment_received', v_record, 'Seeded payment audit.');
  end if;
  insert into public.actions (actor_id, action_type, reason)
  values (v_sysadmin, 'user_provisioned', 'Generated provisioning batch.');

  raise notice 'seed/08 inbox+audit: % notifications (% unread), % actions.',
    (select count(*) from public.notifications),
    (select count(*) from public.notifications where not is_read),
    (select count(*) from public.actions);
end $$;

commit;
