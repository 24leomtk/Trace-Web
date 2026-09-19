-- TRACE application security: 10 RLS helpers + visibility predicate.
-- Run AFTER 00_prerequisites.sql, as the schema owner. Re-runnable.
--
-- Visibility model (mirrors lib/actions/records.ts canViewRecord — the app is
-- the primary gatekeeper, RLS is defense in depth):
--   officer          -> own branch (all levels) + district-level in own
--                       district + country-level domain-wide, own domain only
--   district_monitor -> everything in own district, own domain
--   country_monitor  -> country-level only, own domain (aggregates otherwise)
--   court_liaison    -> only records with a live court_case_access grant
--   everyone else    -> no case rows (admin/auditor/insurer/registrar)

create or replace function public.set_user_id(uid text)returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if uid is null or length(uid) = 0 then
    raise exception 'A non-empty application user id is required';
  end if;
  perform set_config('app.current_user_id', uid, true);
end;
$$;

revoke all on function public.set_user_id(text) from public;
grant execute on function public.set_user_id(text) to app_user;

create or replace function public.app_user_id()
returns text
language sql
stable
as $$ select nullif(current_setting('app.current_user_id', true), '') $$;

-- ── Role helpers ──────────────────────────────────────────────────────────

create or replace function public.app_my_role()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$ select role::text from public.users where id = public.app_user_id() $$;

create or replace function public.app_is_police()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.users
    where id = public.app_user_id()
      and role in ('officer', 'district_monitor', 'country_monitor')
  )
$$;

create or replace function public.app_is_monitor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.users
    where id = public.app_user_id()
      and role in ('district_monitor', 'country_monitor')
  )
$$;

create or replace function public.app_is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.users
    where id = public.app_user_id() and role = 'system_admin'
  )
$$;

create or replace function public.app_is_auditor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.users
    where id = public.app_user_id() and role = 'compliance_auditor'
  )
$$;

-- ── Core visibility predicate ─────────────────────────────────────────────

create or replace function public.app_can_read_record(r public.records)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.users actor
    left join public.branches b on b.id = actor.branch_id
    where actor.id = public.app_user_id()
      and (
        -- officer: own branch, district-level in own district, country domain-wide
        (actor.role = 'officer'
          and r.domain = coalesce(actor.domain, b.domain)
          and (
            r.branch_id = actor.branch_id
            or (r.access_level = 'district' and r.district = coalesce(b.district, actor.district))
            or r.access_level = 'country'
          ))
        -- district monitor: everything in own district + domain
        or (actor.role = 'district_monitor'
          and r.domain = actor.domain
          and r.district = actor.district)
        -- country monitor: escalated-to-country only
        or (actor.role = 'country_monitor'
          and r.domain = actor.domain
          and r.access_level = 'country')
        -- court liaison: live per-case grant only
        or (actor.role = 'court_liaison'
          and exists (
            select 1 from public.court_case_access g
            where g.record_id = r.id
              and g.court_liaison_id = actor.id
              and g.revoked_at is null
              and (g.expires_at is null or g.expires_at > now())
          ))
      )
  )
$$;

-- ── Flag recompute (narrow writer) ────────────────────────────────────────
-- Recomputes vehicles.is_flagged for one plate: active missing/offense/
-- impound case OR unsettled, non-waived, non-exempt tax past due — the same
-- predicate refreshVehicleFlag() uses in app code and Seed-refresh.sql §2.
--
-- Why a function: vehicles_update RLS only allows police/registrar writes,
-- so tax officers (and the pg_cron generator) cannot touch the flag
-- directly. This SECURITY DEFINER function updates ONLY is_flagged +
-- updated_at and bypasses RLS by design. App code calls it inside the same
-- transaction as the tax mutation.
create or replace function public.trace_refresh_vehicle_flag(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.vehicles v
     set is_flagged = (
           exists (
             select 1 from public.vehicle_cases vc
              where vc.vehicle_id = v.id
                and vc.status = 'active'
                and vc.case_type in ('missing_vehicle','vehicle_offense','vehicle_impoundment')
           )
           or exists (
             select 1 from public.vehicle_taxes t
              where t.vehicle_id = v.id
                and not t.is_paid
                and not t.is_waived
                and not t.is_exempt
                and t.due_date < current_date
           )
         ),
         updated_at = now()
   where v.id = p_vehicle_id;
end;
$$;
