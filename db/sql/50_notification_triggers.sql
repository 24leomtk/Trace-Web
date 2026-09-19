-- TRACE notifications: 50 trigger-driven inbox rows.
-- Run AFTER 10_helpers.sql + 32_policies_court_audit.sql, as the schema owner.
-- Re-runnable (all functions CREATE OR REPLACE, all triggers DROP IF EXISTS).
--
-- Design:
--   * Every function is SECURITY DEFINER so inserts into public.notifications
--     bypass RLS by design (app RLS in 32 still gates interactive inserts).
--   * Actor = nullif(current_setting('app.current_user_id', true), '') — set by
--     withUserCtx on every app write; NULL on direct SQL / cron (templates fall
--     back to role labels, never fail).
--   * Seed guard: when current_setting('app.seed_load', true) = 'on', every
--     trigger returns NEW immediately. seeds/01-07 load bulk data silently;
--     seeds/08 inserts deterministic inbox rows directly.
--   * Anti-recursion: pg_trigger_depth() > 1 returns early (trigger-caused
--     actions inserts must never fan out).
--   * No self-notify: recipient = actor rows are skipped.
--   * App notifyUser() call sites are kept as-is; triggers are the DB-level
--     guarantee so direct SQL / cron / future clients still notify. A 5-minute
--     dedupe window is NOT enforced here (app may double-write during
--     transition — harmless, newest row wins in the inbox sort).
--
-- Types used: referral_received | referral_updated | outcome_recorded |
-- status_changed | review_added (existing) + task_assigned | task_updated |
-- payment_received (new — see lib/actions/notifications.ts).

-- ── shared helpers ────────────────────────────────────────────────────────

create or replace function public.trace_seed_muted()
returns boolean
language sql
stable
as $$ select coalesce(current_setting('app.seed_load', true) = 'on', false) $$;

create or replace function public.trace_actor_uid()
returns text
language sql
stable
as $$ select nullif(current_setting('app.current_user_id', true), '') $$;

create or replace function public.trace_actor_name(p_uid text)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(
    (select name from public.users where id = p_uid),
    (select case (select role::text from public.users where id = p_uid)
       when 'district_monitor' then 'A district monitor'
       when 'country_monitor' then 'A country monitor'
       when 'officer' then 'An officer'
       when 'court_liaison' then 'The court'
       else 'The system' end),
    'The system')
$$;

-- Short human title for a record: full_name / plate / ticket + type.
create or replace function public.trace_record_title(p_record_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select (
    coalesce(
      nullif(r.data ->> 'full_name', ''),
      nullif(r.data ->> 'plate_number', ''),
      nullif((select ticket_number from public.traffic_citations c where c.record_id = r.id), ''),
      initcap(replace(r.record_type::text, '_', ' '))
    )
    || ' (' || replace(r.record_type::text, '_', ' ') || ')'
  )
  from public.records r where r.id = p_record_id
$$;

create or replace function public.trace_notify(
  p_user_id text, p_type text, p_record_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_user_id is null or length(p_user_id) = 0 then return; end if;
  if p_user_id = public.trace_actor_uid() then return; end if; -- no self-notify
  if public.trace_seed_muted() then return; end if;
  insert into public.notifications (user_id, type, record_id, message)
  values (p_user_id, p_type, p_record_id, left(p_message, 280));
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- T1–T4 court_case_access (referral lifecycle)
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.trace_cca_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_title text; v_referrer text; v_reason text;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  v_title := public.trace_record_title(new.record_id);
  v_referrer := public.trace_actor_name(new.referred_by);
  v_reason := coalesce(nullif(new.reason, ''), 'Referred for prosecution.');
  perform public.trace_notify(new.court_liaison_id, 'referral_received', new.record_id,
    'New referral: ' || v_title || ' from ' || v_referrer || '. Reason: '
    || left(v_reason, 100) || '. Expires ' || coalesce(to_char(new.expires_at, 'YYYY-MM-DD'), '—') || '.');
  return new;
end;
$$;

create or replace function public.trace_cca_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_title text; v_actor text; v_liaison text;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  v_title := public.trace_record_title(new.record_id);
  v_actor := public.trace_actor_name(public.trace_actor_uid());
  -- T3 revocation wins over renewal/outcome when set in the same write.
  if old.revoked_at is null and new.revoked_at is not null then
    perform public.trace_notify(new.court_liaison_id, 'referral_updated', new.record_id,
      'Access revoked: ' || v_title || ' revoked by ' || v_actor || '. Contact the referring monitor if still needed.');
    return new;
  end if;
  -- T2 renewal / extension.
  if new.revoked_at is null
     and (old.expires_at is distinct from new.expires_at
          or old.renewed_at is distinct from new.renewed_at) then
    perform public.trace_notify(new.court_liaison_id, 'referral_updated', new.record_id,
      'Access renewed: ' || v_title || ' extended to '
      || coalesce(to_char(new.expires_at, 'YYYY-MM-DD'), '—') || ' by ' || v_actor
      || ' (renewal #' || coalesce(new.renewal_count, 0)::text || ').');
  end if;
  -- T4 outcome recorded → back to the referrer.
  if old.outcome is distinct from new.outcome and new.outcome <> 'pending' then
    v_liaison := public.trace_actor_name(new.court_liaison_id);
    perform public.trace_notify(new.referred_by, 'outcome_recorded', new.record_id,
      'Court outcome: ' || v_title || ' → ' || new.outcome::text || ' by ' || v_liaison
      || '. Notes: ' || left(coalesce(nullif(new.outcome_notes, ''), '—'), 100) || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists trace_cca_insert on public.court_case_access;
create trigger trace_cca_insert
after insert on public.court_case_access
for each row execute function public.trace_cca_insert();

drop trigger if exists trace_cca_update on public.court_case_access;
create trigger trace_cca_update
after update on public.court_case_access
for each row execute function public.trace_cca_update();

-- ══════════════════════════════════════════════════════════════════════════
-- T5 referral_documents (e-Brief tranches)
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.trace_referral_doc_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_title text; v_actor text; v_liaison text; v_referrer text; v_rec uuid;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  select g.court_liaison_id, g.referred_by, g.record_id
    into v_liaison, v_referrer, v_rec
    from public.court_case_access g where g.id = new.referral_id;
  if not found then return new; end if;
  v_title := public.trace_record_title(v_rec);
  v_actor := public.trace_actor_name(public.trace_actor_uid());
  perform public.trace_notify(v_liaison, 'referral_updated', (select record_id from public.court_case_access where id = new.referral_id),
    'e-Brief update: new ' || new.label || ' added to ' || v_title || ' by ' || v_actor || '.');
  perform public.trace_notify(v_referrer, 'referral_updated', (select record_id from public.court_case_access where id = new.referral_id),
    'e-Brief update: new ' || new.label || ' added to ' || v_title || ' by ' || v_actor || '.');
  return new;
end;
$$;

drop trigger if exists trace_referral_doc_insert on public.referral_documents;
create trigger trace_referral_doc_insert
after insert on public.referral_documents
for each row execute function public.trace_referral_doc_insert();

-- ══════════════════════════════════════════════════════════════════════════
-- T6 case_reviews → filing officer
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.trace_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_title text; v_reviewer text; v_reporter text;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  select reported_by into v_reporter from public.records where id = new.record_id;
  if not found or v_reporter = new.reviewer_id then return new; end if;
  v_title := public.trace_record_title(new.record_id);
  v_reviewer := public.trace_actor_name(new.reviewer_id);
  perform public.trace_notify(v_reporter, 'review_added', new.record_id,
    'Review on your case ' || v_title || ': "' || left(new.note, 120) || '" — ' || v_reviewer || '.');
  return new;
end;
$$;

drop trigger if exists trace_review_insert on public.case_reviews;
create trigger trace_review_insert
after insert on public.case_reviews
for each row execute function public.trace_review_insert();

-- ══════════════════════════════════════════════════════════════════════════
-- T7–T8 case_assignments (tasking)
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.trace_assignment_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_title text; v_assigner text;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  v_title := public.trace_record_title(new.record_id);
  v_assigner := public.trace_actor_name(new.assigned_by);
  perform public.trace_notify(new.assignee_id, 'task_assigned', new.record_id,
    'New task: ' || v_title || ' assigned by ' || v_assigner || '. Due '
    || coalesce(to_char(new.due_at, 'YYYY-MM-DD'), 'no due date') || '. Note: '
    || left(coalesce(nullif(new.note, ''), '—'), 100) || '.');
  return new;
end;
$$;

create or replace function public.trace_assignment_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_title text; v_actor text; v_reporter text;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  if old.state is not distinct from new.state then return new; end if;
  if new.state not in ('done', 'cancelled') then return new; end if;
  v_title := public.trace_record_title(new.record_id);
  v_actor := public.trace_actor_name(public.trace_actor_uid());
  select reported_by into v_reporter from public.records where id = new.record_id;
  perform public.trace_notify(new.assigned_by, 'task_updated', new.record_id,
    'Task ' || new.state || ': ' || v_title || ' by ' || v_actor || '.');
  if v_reporter is not null and v_reporter <> new.assigned_by then
    perform public.trace_notify(v_reporter, 'task_updated', new.record_id,
      'Task ' || new.state || ': ' || v_title || ' by ' || v_actor || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists trace_assignment_insert on public.case_assignments;
create trigger trace_assignment_insert
after insert on public.case_assignments
for each row execute function public.trace_assignment_insert();

drop trigger if exists trace_assignment_update on public.case_assignments;
create trigger trace_assignment_update
after update of state on public.case_assignments
for each row when (old.* is distinct from new.*)
execute function public.trace_assignment_update();

-- ══════════════════════════════════════════════════════════════════════════
-- T9 + T12 records (status / visibility / branch / locate)
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.trace_records_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_title text; v_actor text; v_branch text; v_subject text;
  r record;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  v_title := public.trace_record_title(new.id);
  v_actor := public.trace_actor_name(public.trace_actor_uid());
  -- T9a status change → reporter + live liaisons.
  if old.status is distinct from new.status then
    perform public.trace_notify(old.reported_by, 'status_changed', new.id,
      'Status: ' || v_title || ' ' || old.status::text || ' → ' || new.status::text || ' by ' || v_actor || '.');
    for r in select court_liaison_id from public.court_case_access
             where record_id = new.id and revoked_at is null
               and (expires_at is null or expires_at > now()) loop
      perform public.trace_notify(r.court_liaison_id, 'status_changed', new.id,
        'Status: ' || v_title || ' ' || old.status::text || ' → ' || new.status::text || ' by ' || v_actor || '.');
    end loop;
  end if;
  -- T9b visibility escalation.
  if old.access_level is distinct from new.access_level then
    perform public.trace_notify(old.reported_by, 'status_changed', new.id,
      'Visibility: ' || v_title || ' ' || old.access_level::text || ' → ' || new.access_level::text || ' by ' || v_actor || '.');
  end if;
  -- T9c reassignment.
  if old.branch_id is distinct from new.branch_id then
    select name into v_branch from public.branches where id = new.branch_id;
    perform public.trace_notify(old.reported_by, 'status_changed', new.id,
      'Reassigned: ' || v_title || ' → ' || coalesce(v_branch, 'another branch') || ' by ' || v_actor || '.');
  end if;
  -- T12 locate reported / confirmed.
  if old.locate_state is distinct from new.locate_state then
    v_subject := coalesce(nullif(new.data ->> 'full_name', ''),
                          nullif(new.data ->> 'plate_number', ''), v_title);
    if new.locate_state = 'located' then
      perform public.trace_notify(old.reported_by, 'status_changed', new.id,
        'Locate reported: ' || v_subject || ' seen at '
        || coalesce(new.locate_place, 'unknown location') || ' by '
        || public.trace_actor_name(new.locate_by) || '.');
    elsif new.locate_state = 'confirmed' then
      perform public.trace_notify(old.reported_by, 'status_changed', new.id,
        'Locate confirmed by ' || v_actor || ' at ' || coalesce(new.locate_place, 'unknown location') || '.');
      if new.locate_by is not null then
        perform public.trace_notify(new.locate_by, 'status_changed', new.id,
          'Locate confirmed by ' || v_actor || ' at ' || coalesce(new.locate_place, 'unknown location') || '.');
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trace_records_update on public.records;
create trigger trace_records_update
after update on public.records
for each row when (old.* is distinct from new.*)
execute function public.trace_records_update();

-- ══════════════════════════════════════════════════════════════════════════
-- T10 citation_payments → reporter
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.trace_payment_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_title text; v_reporter text; v_no text; v_plate text; v_branch text;
  v_total numeric; v_fine numeric; v_bal numeric;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  select reported_by into v_reporter from public.records where id = new.record_id;
  select ticket_number, (select plate_number from public.vehicles v where v.id = c.vehicle_id)
    into v_no, v_plate from public.traffic_citations c where c.record_id = new.record_id;
  select name into v_branch from public.branches where id = new.receiving_branch_id;
  select coalesce(sum(amount), 0) into v_total from public.citation_payments where record_id = new.record_id;
  select fine_amount into v_fine from public.traffic_citations where record_id = new.record_id;
  v_bal := greatest(coalesce(v_fine, 0) - coalesce(v_total, 0), 0);
  v_title := coalesce(v_no, public.trace_record_title(new.record_id));
  perform public.trace_notify(v_reporter, 'payment_received', new.record_id,
    'Payment: ' || new.amount::text || ' on ticket ' || coalesce(v_no, '—')
    || ' (' || coalesce(v_plate, '—') || ') by ' || coalesce(nullif(new.payer_name, ''), 'a payer')
    || ' at ' || coalesce(v_branch, 'counter') || '. Balance ' || v_bal::text
    || '. Receipt ' || new.receipt_no || '.');
  return new;
end;
$$;

drop trigger if exists trace_payment_insert on public.citation_payments;
create trigger trace_payment_insert
after insert on public.citation_payments
for each row execute function public.trace_payment_insert();

-- ══════════════════════════════════════════════════════════════════════════
-- T11 traffic_citations (void / court scheduling)
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.trace_citation_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_reporter text; v_no text; v_court text;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  select reported_by into v_reporter from public.records where id = new.record_id;
  v_no := coalesce(new.ticket_number, 'a ticket');
  if old.voided_at is null and new.voided_at is not null then
    perform public.trace_notify(v_reporter, 'status_changed', new.record_id,
      'Ticket ' || v_no || ' voided: ' || left(coalesce(new.void_reason, '—'), 120) || '.');
  end if;
  if old.court_date is distinct from new.court_date and new.court_date is not null then
    select name into v_court from public.organizations where id = new.court_id;
    perform public.trace_notify(v_reporter, 'status_changed', new.record_id,
      'Court: ticket ' || v_no || ' → ' || coalesce(v_court, 'court')
      || ' on ' || to_char(new.court_date, 'YYYY-MM-DD') || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists trace_citation_update on public.traffic_citations;
create trigger trace_citation_update
after update on public.traffic_citations
for each row when (old.* is distinct from new.*)
execute function public.trace_citation_update();

-- ══════════════════════════════════════════════════════════════════════════
-- T13 impound_custody (hold / release / owner notice)
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.trace_custody_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_reporter text; v_plate text; v_auth text;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  select r.reported_by, v.plate_number into v_reporter, v_plate
    from public.records r left join public.vehicles v on v.id = r.vehicle_id
   where r.id = new.record_id;
  v_auth := public.trace_actor_name(new.hold_authority_id);
  perform public.trace_notify(v_reporter, 'status_changed', new.record_id,
    'Hold placed: ' || coalesce(v_plate, 'vehicle') || ' at '
    || coalesce(new.lot_location, 'yard') || '/' || coalesce(new.bay, '—')
    || ' by ' || v_auth || '. Basis: ' || left(coalesce(new.hold_basis, '—'), 100) || '.');
  if new.hold_authority_id is not null then
    perform public.trace_notify(new.hold_authority_id, 'status_changed', new.record_id,
      'Hold placed: ' || coalesce(v_plate, 'vehicle') || ' at '
      || coalesce(new.lot_location, 'yard') || '/' || coalesce(new.bay, '—') || '.');
  end if;
  return new;
end;
$$;

create or replace function public.trace_custody_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_reporter text; v_plate text; v_actor text;
begin
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return new; end if;
  select r.reported_by, v.plate_number into v_reporter, v_plate
    from public.records r left join public.vehicles v on v.id = r.vehicle_id
   where r.id = new.record_id;
  v_actor := public.trace_actor_name(public.trace_actor_uid());
  if old.release_at is null and new.release_at is not null then
    perform public.trace_notify(v_reporter, 'status_changed', new.record_id,
      'Released: ' || coalesce(v_plate, 'vehicle') || ' to '
      || coalesce(new.recipient_name, 'recipient') || ' (ID checked) by ' || v_actor || '.');
    if new.hold_authority_id is not null then
      perform public.trace_notify(new.hold_authority_id, 'status_changed', new.record_id,
        'Released: ' || coalesce(v_plate, 'vehicle') || ' to '
        || coalesce(new.recipient_name, 'recipient') || ' (ID checked).');
    end if;
  end if;
  if old.owner_notified_at is null and new.owner_notified_at is not null then
    perform public.trace_notify(v_reporter, 'status_changed', new.record_id,
      'Owner notified for ' || coalesce(v_plate, 'vehicle') || ' by ' || v_actor || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists trace_custody_insert on public.impound_custody;
create trigger trace_custody_insert
after insert on public.impound_custody
for each row execute function public.trace_custody_insert();

drop trigger if exists trace_custody_update on public.impound_custody;
create trigger trace_custody_update
after update on public.impound_custody
for each row when (old.* is distinct from new.*)
execute function public.trace_custody_update();
