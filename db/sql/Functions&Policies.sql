-- TRACE application security: RLS helpers + policies.
-- Run after the Drizzle schema migration. The application connection must use
-- app_user (or a role granted app_user) for PostgreSQL RLS to be effective.
--
-- Visibility model (mirrors lib/actions/records.ts canViewRecord — the app is
-- the primary gatekeeper, RLS is defense in depth):
--   officer          -> own branch (all levels) + district-level in own
--                       district + country-level domain-wide, own domain only
--   district_monitor -> everything in own district, own domain
--   country_monitor  -> country-level only, own domain (aggregates otherwise)
--   court_liaison    -> only records with a live court_case_access grant
--   everyone else    -> no case rows (admin/auditor/insurer/registrar)

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user noinherit login;
  end if;
end $$;

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;

-- Let the administrative connection role become app_user inside transactions
-- (`set local role app_user` in lib/db-context.ts). Idempotent.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    if not pg_has_role(current_user, 'app_user', 'member')
       or not pg_has_role(current_user, 'app_user', 'usage') then
      begin
        execute format(
          'grant app_user to %I with set true inherit true',
          current_user
        );
      exception when insufficient_privilege then
        raise warning 'Could not grant app_user to % — run as a role with CREATEROLE/ADMIN OPTION.', current_user;
      end;
    end if;
  end if;
end $$;

create or replace function public.set_user_id(uid text)
returns void
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

-- ── RLS policies (DROP … makes this file safe to re-run) ──────────────────

alter table public.users enable row level security;
alter table public.branches enable row level security;
alter table public.organizations enable row level security;
alter table public.records enable row level security;
alter table public.record_attachments enable row level security;
alter table public.persons_of_interest enable row level security;
alter table public.vehicles enable row level security;
alter table public.insurance_policies enable row level security;
alter table public.court_case_access enable row level security;
alter table public.missing_person_cases enable row level security;
alter table public.wanted_person_cases enable row level security;
alter table public.vehicle_cases enable row level security;
alter table public.accidents enable row level security;
alter table public.accident_vehicles enable row level security;
alter table public.traffic_citations enable row level security;
alter table public.actions enable row level security;
alter table public.case_reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.idempotency_keys enable row level security;

-- users: own row always; system admin + auditor see all; police see the
-- staff directory (names on records/referrals); external roles (court /
-- insurer / registry) see only themselves — no directory harvesting.
drop policy if exists users_self on public.users;
create policy users_self on public.users for select to app_user
  using (
    id = public.app_user_id()
    or public.app_is_system_admin()
    or public.app_is_auditor()
    or (
      public.app_is_police()
      and role in ('officer', 'district_monitor', 'country_monitor',
                   'court_liaison', 'insurance_portal_user', 'vehicle_registrar')
    )
  );
drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users for all to app_user
  using (public.app_is_system_admin())
  with check (public.app_is_system_admin());

-- branches / organizations: readable reference data; admin-written.
drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches for select to app_user
  using (public.app_user_id() is not null);
drop policy if exists branches_admin_write on public.branches;
create policy branches_admin_write on public.branches for all to app_user
  using (public.app_is_system_admin())
  with check (public.app_is_system_admin());

drop policy if exists organizations_read on public.organizations;
create policy organizations_read on public.organizations for select to app_user
  using (public.app_user_id() is not null);
drop policy if exists organizations_admin_write on public.organizations;
create policy organizations_admin_write on public.organizations for all to app_user
  using (public.app_is_system_admin())
  with check (public.app_is_system_admin());

-- records: the visibility tiers above. INSERT is reporter-only; UPDATE is
-- filer-or-monitor (officers can only touch what they filed — enforced here,
-- not just in app code).
drop policy if exists records_read on public.records;
create policy records_read on public.records for select to app_user
  using (public.app_can_read_record(records));
drop policy if exists records_police_insert on public.records;
create policy records_police_insert on public.records for insert to app_user
  with check (reported_by = public.app_user_id() and public.app_is_police());
drop policy if exists records_filer_update on public.records;
create policy records_filer_update on public.records for update to app_user
  using (
    public.app_can_read_record(records)
    and reported_by = public.app_user_id()
  )
  with check (
    public.app_can_read_record(records)
    and reported_by = public.app_user_id()
  );
drop policy if exists records_monitor_update on public.records;
create policy records_monitor_update on public.records for update to app_user
  using (
    public.app_can_read_record(records)
    and public.app_is_monitor()
    and reported_by <> public.app_user_id()
  )
  with check (
    public.app_can_read_record(records)
    and public.app_is_monitor()
  );

-- attachments inherit the parent record's visibility; uploaders see own rows.
drop policy if exists attachments_read on public.record_attachments;
create policy attachments_read on public.record_attachments for select to app_user
  using (
    uploaded_by = public.app_user_id()
    or exists (
      select 1 from public.records r
      where r.id = record_id and public.app_can_read_record(r)
    )
  );
drop policy if exists attachments_insert on public.record_attachments;
create policy attachments_insert on public.record_attachments for insert to app_user
  with check (uploaded_by = public.app_user_id());

-- persons of interest: police-only.
drop policy if exists persons_police on public.persons_of_interest;
create policy persons_police on public.persons_of_interest for all to app_user
  using (public.app_is_police())
  with check (public.app_is_police());

-- vehicles: plate registry is reference data (flag boolean only); case detail
-- stays behind records RLS and app-level checks. Officers create ad-hoc rows,
-- registrars enrich them.
drop policy if exists vehicles_read on public.vehicles;
create policy vehicles_read on public.vehicles for select to app_user
  using (public.app_user_id() is not null);
drop policy if exists vehicles_write on public.vehicles;
create policy vehicles_write on public.vehicles for insert to app_user
  with check (public.app_is_police() or public.app_my_role() = 'vehicle_registrar');
drop policy if exists vehicles_update on public.vehicles;
create policy vehicles_update on public.vehicles for update to app_user
  using (public.app_is_police() or public.app_my_role() = 'vehicle_registrar')
  with check (public.app_is_police() or public.app_my_role() = 'vehicle_registrar');

-- insurance policies: each insurer sees/edits its own org's rows only.
drop policy if exists policies_own_org on public.insurance_policies;
create policy policies_own_org on public.insurance_policies for all to app_user
  using (
    insurer_id = (
      select organization_id from public.users where id = public.app_user_id()
    )
  )
  with check (
    insurer_id = (
      select organization_id from public.users where id = public.app_user_id()
    )
  );

-- court referrals: liaison + referrer + monitors can see; monitors create and
-- renew/revoke; liaisons record outcomes (app enforces the field split).
drop policy if exists court_access_read on public.court_case_access;
create policy court_access_read on public.court_case_access for select to app_user
  using (
    court_liaison_id = public.app_user_id()
    or referred_by = public.app_user_id()
    or public.app_is_monitor()
    or public.app_is_system_admin()
  );
drop policy if exists court_access_refer on public.court_case_access;
create policy court_access_refer on public.court_case_access for insert to app_user
  with check (referred_by = public.app_user_id() and public.app_is_monitor());
drop policy if exists court_access_update on public.court_case_access;
create policy court_access_update on public.court_case_access for update to app_user
  using (
    court_liaison_id = public.app_user_id()
    or referred_by = public.app_user_id()
    or public.app_is_monitor()
  );

-- coded projections: readable wherever the parent case is readable; written
-- by the app alongside the parent record (police context).
drop policy if exists coded_read on public.missing_person_cases;
create policy coded_read on public.missing_person_cases for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists coded_write on public.missing_person_cases;
create policy coded_write on public.missing_person_cases for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

drop policy if exists wanted_read on public.wanted_person_cases;
create policy wanted_read on public.wanted_person_cases for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists wanted_write on public.wanted_person_cases;
create policy wanted_write on public.wanted_person_cases for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

drop policy if exists vehicle_cases_read on public.vehicle_cases;
create policy vehicle_cases_read on public.vehicle_cases for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists vehicle_cases_write on public.vehicle_cases;
create policy vehicle_cases_write on public.vehicle_cases for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

drop policy if exists accidents_read on public.accidents;
create policy accidents_read on public.accidents for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists accidents_write on public.accidents;
create policy accidents_write on public.accidents for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

drop policy if exists accident_vehicles_read on public.accident_vehicles;
create policy accident_vehicles_read on public.accident_vehicles for select to app_user
  using (
    exists (
      select 1 from public.accidents a
      join public.records r on r.id = a.record_id
      where a.id = accident_id and public.app_can_read_record(r)
    )
  );
drop policy if exists accident_vehicles_write on public.accident_vehicles;
create policy accident_vehicles_write on public.accident_vehicles for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

drop policy if exists citations_read on public.traffic_citations;
create policy citations_read on public.traffic_citations for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists citations_write on public.traffic_citations;
create policy citations_write on public.traffic_citations for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

-- case_reviews: readable wherever the parent case is readable; written by
-- the reviewer (monitors + filing officers — app checks which).
drop policy if exists reviews_read on public.case_reviews;
create policy reviews_read on public.case_reviews for select to app_user
  using (
    exists (
      select 1 from public.records r
      where r.id = record_id and public.app_can_read_record(r)
    )
  );
drop policy if exists reviews_write on public.case_reviews;
create policy reviews_write on public.case_reviews for insert to app_user
  with check (
    reviewer_id = public.app_user_id()
    and public.app_is_police()
    and exists (
      select 1 from public.records r
      where r.id = record_id and public.app_can_read_record(r)
    )
  );

-- notifications: each user reads their own; inserts come from police /
-- liaison / system actors notifying someone in scope (app picks recipients).
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to app_user
  using (
    user_id = public.app_user_id()
    or public.app_is_system_admin()
    or public.app_is_auditor()
  );
drop policy if exists notifications_write on public.notifications;
create policy notifications_write on public.notifications for insert to app_user
  with check (
    public.app_is_police()
    or public.app_my_role() = 'court_liaison'
    or public.app_is_system_admin()
  );
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications for update to app_user
  using (user_id = public.app_user_id())
  with check (user_id = public.app_user_id());

-- idempotency_keys: mobile retry cache, one row per (key, user).
drop policy if exists idempotency_own on public.idempotency_keys;
create policy idempotency_own on public.idempotency_keys for all to app_user
  using (user_id = public.app_user_id())
  with check (user_id = public.app_user_id());

-- actions (append-only audit log): own entries + monitors/admin/auditor.
-- District scoping for district monitors is applied in app code.
drop policy if exists actions_read on public.actions;
create policy actions_read on public.actions for select to app_user
  using (
    actor_id = public.app_user_id()
    or public.app_is_monitor()
    or public.app_is_system_admin()
    or public.app_is_auditor()
  );
drop policy if exists actions_insert on public.actions;
create policy actions_insert on public.actions for insert to app_user
  with check (actor_id = public.app_user_id());

-- Append-only enforcement (also for records: cases are never hard-deleted).
revoke update, delete on public.actions from app_user;
revoke delete on public.records from app_user;
revoke delete on public.missing_person_cases,
  public.wanted_person_cases,
  public.vehicle_cases,
  public.accidents,
  public.accident_vehicles,
  public.traffic_citations from app_user;

-- ── Audit hash chain (tamper evidence for the compliance role) ────────────
-- DB-side BEFORE trigger, so app code needs no changes: every row links to
-- the previous entry_hash. Verification = recompute the chain offline.
-- (Concurrent inserts may interleave prev_hash links; the chain still proves
-- no row was later modified or deleted, which is the property that matters.)
alter table public.actions add column if not exists prev_hash text;
alter table public.actions add column if not exists entry_hash text;

create or replace function public.actions_hash_chain()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_prev text;
begin
  select entry_hash into v_prev
    from public.actions
   order by created_at desc
   limit 1;
  new.prev_hash := v_prev;
  new.entry_hash := encode(digest(
    coalesce(v_prev, '') || '|' ||
    new.actor_id || '|' ||
    new.action_type::text || '|' ||
    coalesce(new.record_id::text, '') || '|' ||
    coalesce(new.vehicle_id::text, '') || '|' ||
    coalesce(new.reason, '') || '|' ||
    new.created_at::text,
    'sha256'
  ), 'hex');
  return new;
end;
$$;

drop trigger if exists actions_hash_chain on public.actions;
create trigger actions_hash_chain
before insert on public.actions
for each row execute function public.actions_hash_chain();

-- ── Scheduled jobs (pg_cron; guarded so the file still runs without it) ──
-- 1. Expire lapsed court grants into an audit row (reads stay blocked by the
--    expires_at check itself; this just records the lapse visibly).
-- 2. Flip lapsed insurance policies to is_active = false + audit it, so the
--    portal's "live" state never depends on every reader checking dates.
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
