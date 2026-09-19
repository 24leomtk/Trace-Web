-- ============================================================================
-- TRACE — ACCESS REFRESH + DEMO DATA (re-runnable)
-- ----------------------------------------------------------------------------
-- Run AFTER db/sql/Functions&Policies.sql, as the schema owner:
--
--   psql "$DATABASE_URL" -f "db/sql/Seed-refresh.sql"
--
-- What it does (safe to run repeatedly):
--   0. Grants the connection role membership in `app_user` so lib/db-context's
--      `set local role app_user` works (RLS enforcement for app queries).
--   1. Renews the seeded court referral so it stays valid for the next
--      90 days ("referred today").
--   2. Recomputes every vehicle's is_flagged from active missing_vehicle /
--      vehicle_offense / vehicle_impoundment rows.
--   3. Resyncs traffic_citations.is_paid from the citation_payments ledger
--      (the flag is derived at runtime; this heals any drift).
--   4. Backfills ticket_number for rows that predate Phase 1 (stable,
--      derived from the record id — never touches minted numbers).
--   Locate state, disposition, custody rows, and void flags are point-in-time
--   facts, so they are deliberately NOT recomputed here.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Connection role joins app_user (needed by withUserCtx / RLS)
--    Options are comma-separated: WITH INHERIT TRUE, SET TRUE.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    if not pg_has_role(current_user, 'app_user', 'member')
       or not pg_has_role(current_user, 'app_user', 'usage') then
      execute format(
        'grant app_user to %I with inherit true, set true',
        current_user
      );
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Revive LAPSED pending referrals (+90 days) so demos keep working.
--    Live grants (incl. the expires-in-2-days renewal demo) are untouched;
--    revoked grants stay dead; decided outcomes are left alone.
-- ---------------------------------------------------------------------------
update public.court_case_access
set expires_at = now() + interval '90 days',
    revoked_at = null
where revoked_at is null
  and outcome = 'pending'
  and expires_at is not null
  and expires_at <= now();

-- ---------------------------------------------------------------------------
-- 2. Recompute vehicle flags from active cases
-- ---------------------------------------------------------------------------
update public.vehicles v
set is_flagged = exists (
  select 1
  from public.vehicle_cases vc
  where vc.vehicle_id = v.id
    and vc.status = 'active'
    and vc.case_type in ('missing_vehicle', 'vehicle_offense', 'vehicle_impoundment')
),
updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Resync citation paid flags from the payment ledger
-- ---------------------------------------------------------------------------
update public.traffic_citations c
set is_paid = coalesce((
  select sum(p.amount) from public.citation_payments p
  where p.record_id = c.record_id
), 0) >= c.fine_amount
where c.fine_amount is not null;

-- ---------------------------------------------------------------------------
-- 4. Backfill uniform ticket numbers (Phase 1) for pre-migration rows only
-- ---------------------------------------------------------------------------
update public.traffic_citations
set ticket_number = 'T-26-' || upper(substr(record_id::text, 1, 8))
where ticket_number is null;

commit;
