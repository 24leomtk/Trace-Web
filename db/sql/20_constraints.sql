-- TRACE application security: 20 constraints + search indexes.
-- Run AFTER 10_helpers.sql, as the schema owner. Re-runnable.
-- (App code validates first; these are the backstop.)

-- ── Schema hardening (SQL Drizzle doesn't express — safe to re-run) ───────
-- 1. Trigram indexes backing the unified person/plate search (ILIKE %…%).
create index if not exists persons_of_interest_full_name_trgm_idx
  on public.persons_of_interest using gin (full_name gin_trgm_ops);
create index if not exists persons_of_interest_national_id_trgm_idx
  on public.persons_of_interest using gin (national_id gin_trgm_ops);
create index if not exists vehicles_plate_number_trgm_idx
  on public.vehicles using gin (plate_number gin_trgm_ops);

-- Phase 6: ticket/violation search backing the unified lookup's citation
-- hits (ILIKE %…% on ticket + violation, same-domain police, any branch).
create index if not exists traffic_citations_ticket_number_trgm_idx
  on public.traffic_citations using gin (ticket_number gin_trgm_ops);
create index if not exists traffic_citations_violation_type_trgm_idx
  on public.traffic_citations using gin (violation_type gin_trgm_ops);

-- 2. Per-role scope rules on users (mirrors the scoping comment on users in
--    db/schema/auth.ts; app code enforces first, this is the backstop).
--    External org roles (court/insurer/registry/revenue) require
--    organization_id with domain/branch/district NULL.
--    If this fails, an existing row violates the rules — find it with:
--      select id, role, domain, branch_id, district, organization_id
--        from public.users where not (
--        (role::text = 'officer' and domain is not null and branch_id is not null and district is null and organization_id is null)
--        or (role::text = 'district_monitor' and domain is not null and district is not null and branch_id is null and organization_id is null)
--        or (role::text = 'country_monitor' and domain is not null and branch_id is null and district is null and organization_id is null)
--        or (role::text in ('system_admin', 'compliance_auditor') and domain is null and branch_id is null and district is null and organization_id is null)
--        or (role::text in ('court_liaison', 'insurance_portal_user', 'vehicle_registrar', 'tax_officer', 'tax_compliance_officer') and organization_id is not null and domain is null and branch_id is null and district is null));
do $$
begin
  -- Drop-then-add (not IF-NOT-EXISTS): role arms grow over time and a stale
  -- definition would otherwise survive re-runs and reject new roles.
  alter table public.users drop constraint if exists users_role_scope_chk;
  alter table public.users add constraint users_role_scope_chk check (
      (role::text = 'officer'
        and domain is not null and branch_id is not null
        and district is null and organization_id is null)
      or (role::text = 'district_monitor'
        and domain is not null and district is not null
        and branch_id is null and organization_id is null)
      or (role::text = 'country_monitor'
        and domain is not null
        and branch_id is null and district is null and organization_id is null)
      or (role::text in ('system_admin', 'compliance_auditor')
        and domain is null and branch_id is null
        and district is null and organization_id is null)
      or (role::text in ('court_liaison', 'insurance_portal_user', 'vehicle_registrar',
                            'tax_officer', 'tax_compliance_officer')
        and organization_id is not null
        and domain is null and branch_id is null and district is null)
    );
end $$;

-- 2b. Phase 6: money + lifecycle vocab backstops (app validates first).
--     Legacy rows predate these columns, so every check permits NULL.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'citation_payments_method_chk') then
    alter table public.citation_payments add constraint citation_payments_method_chk check (
      payment_method is null or payment_method in ('cash', 'mobile', 'bank')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'citation_payments_channel_chk') then
    alter table public.citation_payments add constraint citation_payments_channel_chk check (
      channel is null or channel in ('counter', 'mobile', 'clerk')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'records_locate_state_chk') then
    alter table public.records add constraint records_locate_state_chk check (
      locate_state in ('none', 'located', 'confirmed')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'records_disposition_chk') then
    alter table public.records add constraint records_disposition_chk check (
      disposition is null or disposition in ('held', 'returned', 'destroyed', 'auctioned')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'traffic_citations_void_chk') then
    alter table public.traffic_citations add constraint traffic_citations_void_chk check (
      voided_at is null or void_reason is not null
    );
  end if;
end $$;
