-- TRACE application security: 60 scheduled jobs (pg_cron).
-- Run AFTER 32 + 40, as the schema owner. Re-runnable; guarded so the file
-- still runs without pg_cron.
-- 1. Expire lapsed court grants into an audit row (reads stay blocked by the
--    expires_at check itself; this just records the lapse visibly).
-- 2. Flip lapsed insurance policies to is_active = false + audit it, so the
--    portal's "live" state never depends on every reader checking dates.
-- T14 notification templates live in 50_notification_triggers.sql; these jobs
-- only write actions rows (inbox rows for lapses are seeded in seeds/08).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'trace-expire-court-grants',
      '*/15 * * * *',
      $$insert into public.actions (actor_id, action_type, record_id, reason)
        select g.referred_by, 'court_access_expired', g.record_id,
               'Court grant lapsed automatically.'
        from public.court_case_access g
        where g.revoked_at is null
          and g.expires_at is not null
          and g.expires_at <= now()
          and not exists (
            select 1 from public.actions a
            where a.record_id = g.record_id
              and a.action_type = 'court_access_expired'
              and a.created_at > g.expires_at
          )$$
    );
    perform cron.schedule(
      'trace-expire-policies',
      '0 1 * * *',
      $$with lapsed as (
          update public.insurance_policies
             set is_active = false, updated_at = now()
           where is_active
             and end_date < current_date
          returning vehicle_id, policy_number
        )
        insert into public.actions (actor_id, action_type, vehicle_id, reason)
        select p.entered_by, 'policy_updated', l.vehicle_id,
               'Policy ' || l.policy_number || ' lapsed automatically.'
        from lapsed l
        join public.insurance_policies p
          on p.vehicle_id = l.vehicle_id and p.policy_number = l.policy_number$$
    );
  else
    raise warning 'pg_cron not installed — expiry sweeps not scheduled.';
  end if;
exception when undefined_function or insufficient_privilege then
  raise warning 'Could not schedule pg_cron jobs (missing extension or rights).';
end $$;
