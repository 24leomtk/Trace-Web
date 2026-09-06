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
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Connection role joins app_user (needed by withUserCtx / RLS)
--    `with set true` matters on PG16+ — see Functions&Policies.sql.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    if not pg_has_role(current_user, 'app_user', 'member')
       or not pg_has_role(current_user, 'app_user', 'usage') then
      execute format(
        'grant app_user to %I with set true inherit true',
        current_user
      );
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Keep the seeded court referral live (+90 days)
-- ---------------------------------------------------------------------------
update public.court_case_access
set expires_at = now() + interval '90 days',
    revoked_at = null
where referred_by = 'seed_district_monitor'
  and court_liaison_id = 'seed_liaison';

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

commit;
