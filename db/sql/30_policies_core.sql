-- TRACE application security: 30 core RLS policies (reference data).
-- Run AFTER 10_helpers.sql, as the schema owner. Re-runnable.
-- Covers: users, branches, organizations, vehicles, persons_of_interest,
-- insurance_policies, api_keys.

alter table public.users enable row level security;
alter table public.branches enable row level security;
alter table public.organizations enable row level security;
alter table public.persons_of_interest enable row level security;
alter table public.vehicles enable row level security;
alter table public.insurance_policies enable row level security;
alter table public.vehicle_taxes enable row level security;
alter table public.tax_automation_rules enable row level security;
alter table public.api_keys enable row level security;

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
                   'court_liaison', 'insurance_portal_user', 'vehicle_registrar',
                   'tax_officer', 'tax_compliance_officer')
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

-- api_keys: system admins only (verification runs as the schema owner and
-- bypasses RLS, like the sign-in flow).
drop policy if exists api_keys_admin on public.api_keys;
create policy api_keys_admin on public.api_keys for all to app_user
  using (public.app_is_system_admin())
  with check (public.app_is_system_admin());

-- vehicle_taxes: tax officers RW their own org's rows (maker-checker waivers
-- are enforced in app code — see lib/actions/tax.ts); tax compliance reads
-- own org; police read all (flag explanation needs the ledger visible).
drop policy if exists taxes_officer_write on public.vehicle_taxes;
create policy taxes_officer_write on public.vehicle_taxes for all to app_user
  using (
    public.app_my_role() = 'tax_officer'
    and owner_org_id = (
      select organization_id from public.users where id = public.app_user_id()
    )
  )
  with check (
    public.app_my_role() = 'tax_officer'
    and owner_org_id = (
      select organization_id from public.users where id = public.app_user_id()
    )
  );
drop policy if exists taxes_org_read on public.vehicle_taxes;
create policy taxes_org_read on public.vehicle_taxes for select to app_user
  using (
    owner_org_id = (
      select organization_id from public.users where id = public.app_user_id()
    )
  );
drop policy if exists taxes_police_read on public.vehicle_taxes;
create policy taxes_police_read on public.vehicle_taxes for select to app_user
  using (public.app_is_police());

-- tax_automation_rules: REFERENCE DATA, system-admin-written (like branches).
-- Tax roles read their own org's rules (TaxHome shows active rules read-only).
drop policy if exists tax_rules_read on public.tax_automation_rules;
create policy tax_rules_read on public.tax_automation_rules for select to app_user
  using (
    public.app_is_system_admin()
    or owner_org_id = (
      select organization_id from public.users where id = public.app_user_id()
    )
  );
drop policy if exists tax_rules_admin_write on public.tax_automation_rules;
create policy tax_rules_admin_write on public.tax_automation_rules for all to app_user
  using (public.app_is_system_admin())
  with check (public.app_is_system_admin());
