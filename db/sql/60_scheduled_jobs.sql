-- TRACE application security: 60 scheduled jobs (pg_cron).
-- Run AFTER 32 + 40 (+ 61 for the tax generator), as the schema owner.
-- Re-runnable.
-- 1. Expire lapsed court grants into an audit row (reads stay blocked by the
--    expires_at check itself; this just records the lapse visibly).
-- 2. Flip lapsed insurance policies to is_active = false + audit it, so the
--    portal's "live" state never depends on every reader checking dates.
-- 3. Generate recurring vehicle taxes (daily; see 61_tax_automation.sql).
-- T14 notification templates live in 50_notification_triggers.sql; these jobs
-- only write actions rows (inbox rows for lapses are seeded in seeds/08).
--
-- This file installs pg_cron itself (needs a superuser connection on
-- self-hosted Postgres).
--
-- NEON: pg_cron is supported (v1.6) but CREATE EXTENSION fails until you
-- enable it on the compute endpoint via the Neon API (one-time setup):
--   1. Point pg_cron at your database (replace IDs/names; needs a Neon
--      API key from console.neon.tech → Account → API keys):
--        curl -s -X PATCH \
--          "https://console.neon.tech/api/v2/projects/$PROJECT_ID/endpoints/$ENDPOINT_ID" \
--          -H "Authorization: Bearer $NEON_API_KEY" \
--          -H "Content-Type: application/json" \
--          -d '{"endpoint":{"settings":{"pg_settings":{"cron.database_name":"<your-db-name>"}}}}'
--   2. Restart the compute (drops connections):
--        curl -s -X POST \
--          "https://console.neon.tech/api/v2/projects/$PROJECT_ID/endpoints/$ENDPOINT_ID/restart" \
--          -H "Authorization: Bearer $NEON_API_KEY"
--   3. Re-run this file (its CREATE EXTENSION will now succeed).
-- Neon caveats: one pg_cron database per project; schedules run in UTC;
-- jobs fire ONLY while the compute is active — disable scale-to-zero on
-- this branch or the sweeps silently skip idle windows.

-- ── pg_cron install (self-hosted only; guarded) ────────────────────────────
do $$
begin
  begin
    execute 'create extension if not exists pg_cron';
  exception
    when insufficient_privilege then
      raise warning 'pg_cron install needs a superuser — connect as one and re-run this file to schedule the expiry sweeps.';
    when others then
      raise warning 'pg_cron install failed (%) — on Neon, enable it first via the API (cron.database_name + compute restart; see header), then re-run this file.', sqlerrm;
  end;
end $$;

-- ── Schedules ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'trace-expire-court-grants',
      '*/15 * * * *',
      $job$insert into public.actions (actor_id, action_type, record_id, reason)
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
          )$job$
    );
    perform cron.schedule(
      'trace-expire-policies',
      '0 1 * * *',
      $job$with lapsed as (
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
          on p.vehicle_id = l.vehicle_id and p.policy_number = l.policy_number$job$
    );
    perform cron.schedule(
      'trace-generate-taxes',
      '0 2 * * *',
      $job$select public.trace_generate_recurring_taxes()$job$
    );
  else
    raise warning 'pg_cron not installed — sweeps not scheduled (court grants, policies, recurring taxes).';
  end if;
exception when undefined_function or insufficient_privilege then
  raise warning 'Could not schedule pg_cron jobs (missing extension or rights).';
end $$;
