-- =====================================================================
-- Malo a Renti — 0001 foundation
-- Extensions, schemas, sequences and generic helper functions.
--
-- Schemas
--   public     : app tables exposed through the Supabase API (all have RLS)
--   private    : restricted tables + security-definer helpers (NOT exposed via API)
--   reporting  : org-scoped analytics/tax views (expose in API settings if needed)
-- =====================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;  -- exclusion constraints (visit double-booking)
create extension if not exists pg_trgm    with schema extensions;  -- fuzzy search on listings/areas

create schema if not exists private;
create schema if not exists reporting;

-- API roles may *reference* objects in these schemas (needed for RLS helper calls),
-- but private tables are never granted to them.
grant usage on schema private   to anon, authenticated, service_role;
grant usage on schema reporting to authenticated, service_role;

-- Nothing in public is readable by anonymous visitors unless explicitly granted
-- later (only the published_* views are).
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------
-- Human-readable document number sequences
-- ---------------------------------------------------------------------
create sequence if not exists private.agreement_seq;
create sequence if not exists private.invoice_seq;
create sequence if not exists private.payment_seq;
create sequence if not exists private.policy_seq;
create sequence if not exists private.claim_seq;
create sequence if not exists private.assessment_seq;

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- "System" callers: the service role (edge functions) and direct DB sessions
-- (migrations / SQL editor). End users always carry a JWT role of anon/authenticated.
create or replace function private.is_trusted_caller()
returns boolean language sql stable as $$
  select auth.role() is null or auth.role() = 'service_role'
$$;

-- '+265 99 123 4567' / '265991234567' -> '+265991234567'
create or replace function private.normalize_phone(p text)
returns text language sql immutable as $$
  select case when p is null or btrim(p) = '' then null
              else '+' || regexp_replace(p, '\D', '', 'g') end
$$;

-- Assigns a human-readable number on insert.
-- Usage: trigger ... execute function private.assign_doc_number('invoice_number','INV','private.invoice_seq')
create or replace function private.assign_doc_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  col    text := tg_argv[0];
  prefix text := tg_argv[1];
  seq    text := tg_argv[2];
begin
  if coalesce(to_jsonb(new) ->> col, '') = '' then
    new := jsonb_populate_record(
      new,
      jsonb_build_object(col, prefix || '-' || to_char(now(), 'YYYY') || '-' ||
                              lpad(nextval(seq::regclass)::text, 7, '0')));
  end if;
  return new;
end $$;

-- Makes columns read-only for end users (system/service role and, optionally,
-- authorised staff may still change them).
-- Usage: trigger ... execute function private.lock_columns('<org_type>:<permission>' or '', 'col1', 'col2', ...)
create or replace function private.lock_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  bypass text := tg_argv[0];
  old_j  jsonb := to_jsonb(old);
  new_j  jsonb := to_jsonb(new);
  col    text;
  i      int;
begin
  if private.is_trusted_caller() then
    return new;
  end if;
  if bypass <> '' and private.has_org_type_permission(
       split_part(bypass, ':', 1)::public.org_type, split_part(bypass, ':', 2)) then
    return new;
  end if;
  for i in 1 .. coalesce(array_length(tg_argv, 1), 0) - 1 loop
    col := tg_argv[i];
    if (new_j -> col) is distinct from (old_j -> col) then
      raise exception 'Column "%" of "%" is managed by the system and cannot be changed directly', col, tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

-- Append-only audit trail (see 0010 for which tables are attached)
create table private.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text        not null,
  record_id   text,
  action      text        not null,
  actor_id    uuid,
  actor_role  text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_table_record_idx on private.audit_log (table_name, record_id, created_at desc);
create index audit_log_actor_idx        on private.audit_log (actor_id, created_at desc);

create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.audit_log (table_name, record_id, action, actor_id, actor_role, old_data, new_data)
  values (
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    tg_op,
    auth.uid(),
    auth.role(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;
EOF
cat > 0002_identity_profiles.sql <<'EOF'
-- =====================================================================
-- Malo a Renti — 0002 identity, profiles, consents
--
-- Auth is phone-only (Supabase Phone provider, OTP on every sign-in).
-- Identity comes from the mobile-operator SIM-registration lookup performed by
-- an edge function AFTER the phone has been OTP-verified (never before, so a
-- stranger cannot probe a number to see someone's identity).
-- =====================================================================

create type public.global_role     as enum ('individual', 'organization_member');
create type public.identity_status as enum ('pending', 'verified', 'mismatch', 'manual_review', 'rejected');
create type public.consent_type    as enum ('terms', 'privacy', 'identity_lookup', 'tax_data_sharing', 'insurance_data_sharing', 'marketing');

-- ---------------------------------------------------------------------
-- profiles: the app-facing mirror of auth.users
-- ---------------------------------------------------------------------
create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  global_role            public.global_role     not null default 'individual',
  phone                  text unique,                       -- E.164, mirrored from auth.users by trigger
  full_name              text,                              -- copied from the verified identity record
  display_name           text,                              -- what other users see (defaults to first name)
  avatar_path            text,                              -- path in the public-media bucket
  preferred_language     text not null default 'en' check (preferred_language in ('en', 'ny')),
  identity_status        public.identity_status not null default 'pending',
  identity_verified_at   timestamptz,
  notification_prefs     jsonb not null default '{"push": true, "sms": true, "whatsapp": false, "email": false}',
  onboarding_completed_at timestamptz,
  is_suspended           boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table  public.profiles is 'One row per person. Created automatically when the auth user is created.';
comment on column public.profiles.global_role is 'individual (default) or organization_member (auto-maintained from organization_members).';

create trigger profiles_lock_columns
  before update on public.profiles
  for each row execute function private.lock_columns(
    'platform:users.suspend', 'id', 'global_role', 'phone', 'full_name', 'identity_status', 'identity_verified_at', 'is_suspended');

-- ---------------------------------------------------------------------
-- Restricted identity data (never exposed through the API)
-- ---------------------------------------------------------------------
create table private.identity_records (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users (id) on delete cascade,
  national_id_number text not null unique,                   -- one account per person
  full_name         text not null,
  date_of_birth     date,
  gender            text,
  registered_msisdn text not null,                           -- number the SIM registration belongs to
  provider          text not null check (provider in ('airtel', 'tnm', 'other')),
  provider_reference text,
  status            public.identity_status not null default 'verified',
  raw_response      jsonb,                                   -- keep minimal / redacted
  verified_at       timestamptz,
  reviewed_by       uuid references auth.users (id),         -- staff who resolved a manual review
  review_notes      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Every lookup is logged (data-protection accountability); no raw ID stored here.
create table private.identity_lookups (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users (id) on delete set null,
  msisdn           text not null,
  provider         text,
  purpose          text not null check (purpose in ('signup', 'phone_change', 'refresh')),
  outcome          text not null check (outcome in ('match', 'mismatch', 'not_found', 'error', 'pending')),
  national_id_hash text,                                     -- sha256 of the ID, for audit correlation only
  error_code       text,
  consent_id       uuid,
  requested_at     timestamptz not null default now()
);
create index identity_lookups_user_idx on private.identity_lookups (user_id, requested_at desc);

-- A phone number change is only allowed after an edge function has confirmed the
-- new number is registered to the SAME national ID as the current one.
create table private.phone_change_approvals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  new_msisdn   text not null,
  lookup_id    uuid references private.identity_lookups (id),
  approved_at  timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '15 minutes',
  consumed_at  timestamptz
);
create index phone_change_approvals_lookup_idx on private.phone_change_approvals (user_id, new_msisdn) where consumed_at is null;

-- ---------------------------------------------------------------------
-- Triggers wiring auth.users <-> profiles <-> identity
-- ---------------------------------------------------------------------
create or replace function private.sync_profile_from_auth()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, phone)
    values (new.id, private.normalize_phone(new.phone))
    on conflict (id) do nothing;
  else
    update public.profiles
       set phone = private.normalize_phone(new.phone)
     where id = new.id;
    -- the SIM registration now refers to the new number (same person, verified before approval)
    update private.identity_records
       set registered_msisdn = private.normalize_phone(new.phone), updated_at = now()
     where user_id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.sync_profile_from_auth();

create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row when (old.phone is distinct from new.phone)
  execute function private.sync_profile_from_auth();

-- Hard stop at the database: a verified user cannot switch to a number that has
-- not been approved by the identity check (defence in depth; the Send-SMS auth hook
-- should also refuse to send the OTP for unapproved numbers).
create or replace function private.guard_phone_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if old.phone is null or old.phone is not distinct from new.phone then
    return new;
  end if;
  select id into v_id
    from private.phone_change_approvals
   where user_id = new.id
     and new_msisdn = private.normalize_phone(new.phone)
     and consumed_at is null
     and expires_at > now()
   order by approved_at desc
   limit 1;
  if v_id is null then
    raise exception 'Phone number change not approved: the new number must be registered to the same national ID'
      using errcode = '42501';
  end if;
  update private.phone_change_approvals set consumed_at = now() where id = v_id;
  return new;
end $$;

create trigger guard_phone_change
  before update of phone on auth.users
  for each row when (old.phone is distinct from new.phone)
  execute function private.guard_phone_change();

create or replace function private.sync_profile_from_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set full_name            = new.full_name,
         identity_status      = new.status,
         identity_verified_at = case when new.status = 'verified' then coalesce(new.verified_at, now()) end,
         display_name         = coalesce(display_name, split_part(new.full_name, ' ', 1))
   where id = new.user_id;
  return new;
end $$;

create trigger identity_records_sync_profile
  after insert or update on private.identity_records
  for each row execute function private.sync_profile_from_identity();

-- ---------------------------------------------------------------------
-- Consents (what the user agreed to, which text/version, what was disclosed)
-- ---------------------------------------------------------------------
create table public.consents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  consent_type     public.consent_type not null,
  document_version text not null,
  granted          boolean not null default true,
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  ip_address       inet,
  user_agent       text,
  disclosed_data   jsonb,     -- e.g. ["full_name","national_id_number","date_of_birth"] shown before consent
  created_at       timestamptz not null default now()
);
create unique index consents_one_active_per_type on public.consents (user_id, consent_type)
  where granted and revoked_at is null;
create index consents_user_idx on public.consents (user_id, consent_type);

create trigger consents_lock_columns
  before update on public.consents
  for each row execute function private.lock_columns(
    '', 'user_id', 'consent_type', 'document_version', 'granted', 'granted_at', 'ip_address', 'user_agent', 'disclosed_data');

-- ---------------------------------------------------------------------
-- Devices for push notifications
-- ---------------------------------------------------------------------
create table public.push_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  platform      text not null check (platform in ('android', 'ios', 'web')),
  token         text not null unique,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index push_devices_user_idx on public.push_devices (user_id);

-- =====================================================================
-- Malo a Renti — 0003 organizations, staff roles and permissions
--
-- Two sets of roles:
--   1) GLOBAL role on the profile: individual | organization_member
--        (individual is the default; organization_member is set automatically
--         while the person has at least one active organization membership)
--   2) ORGANIZATION role, chosen from a catalog that depends on the org type.
--        A role is a named bundle of permissions; RLS checks permissions, not role names.
--
-- Organizations are created by platform staff (Malo a Renti itself is an
-- organization of type 'platform'); staff are invited by phone number.
-- =====================================================================

create type public.org_type          as enum ('platform', 'revenue_authority', 'insurance_provider', 'payment_provider');
create type public.org_status        as enum ('active', 'suspended');
create type public.member_status     as enum ('active', 'suspended', 'removed');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'expired', 'revoked');

create table public.organizations (
  id                   uuid primary key default gen_random_uuid(),
  org_type             public.org_type   not null,
  name                 text not null,
  legal_name           text,
  registration_number  text,
  description          text,
  logo_path            text,
  website              text,
  contact_email        text,
  contact_phone        text,
  status               public.org_status not null default 'active',
  settings             jsonb not null default '{}',     -- non-secret configuration only
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, org_type)                                 -- lets child tables enforce "org must be of type X"
);
create unique index organizations_single_platform on public.organizations (org_type) where org_type = 'platform';
create index organizations_type_idx on public.organizations (org_type);

-- ---------------------------------------------------------------------
-- Role catalog per organization type
-- ---------------------------------------------------------------------
create table public.org_role_catalog (
  org_type     public.org_type not null,
  role_key     text not null,
  label        text not null,
  description  text,
  permissions  text[] not null default '{}',
  primary key (org_type, role_key)
);
comment on table public.org_role_catalog is 'Roles available per organization type; permissions are checked by RLS via private.org_has_permission().';

insert into public.org_role_catalog (org_type, role_key, label, description, permissions) values
-- Malo a Renti staff -------------------------------------------------
('platform', 'platform_admin',    'Platform administrator', 'Full control of the platform, organizations and configuration.',
  '{org.manage_members,org.update_settings,orgs.create,orgs.manage,users.view,users.suspend,identity.review,properties.verify,listings.moderate,templates.manage,fees.manage,tax_rules.manage,disputes.manage,finance.view,analytics.view,support.respond,audit.view,exports.run}'),
('platform', 'platform_verifier',  'Verification officer',   'Reviews identities, ownership documents and listings.',
  '{identity.review,properties.verify,listings.moderate,users.view}'),
('platform', 'platform_support',   'Support agent',          'Helps users and mediates disputes.',
  '{users.view,support.respond,disputes.manage}'),
('platform', 'platform_legal',     'Legal reviewer',         'Owns agreement/notice templates and audit access.',
  '{templates.manage,disputes.manage,audit.view}'),
('platform', 'platform_finance',   'Finance officer',        'Fees, reconciliation and financial exports.',
  '{finance.view,fees.manage,analytics.view,exports.run}'),
('platform', 'platform_analyst',   'Analyst',                'Read-only analytics.',
  '{analytics.view}'),
-- Revenue authority (e.g. MRA) ---------------------------------------
('revenue_authority', 'ra_admin',              'Administrator',        'Manages the organization''s staff and tax configuration.',
  '{org.manage_members,org.update_settings,tax.view_landlords,tax.view_income,tax.view_invoices,tax.view_payments,tax.issue_invoices,tax.manage_periods,tax.send_notices,analytics.view,exports.run,support.respond,audit.view}'),
('revenue_authority', 'ra_compliance_officer', 'Compliance officer',   'Reviews landlords, issues tax invoices and notices.',
  '{tax.view_landlords,tax.view_income,tax.view_invoices,tax.view_payments,tax.issue_invoices,tax.send_notices,support.respond}'),
('revenue_authority', 'ra_revenue_analyst',    'Revenue analyst',      'Analytics and aggregated income reports.',
  '{analytics.view,tax.view_income,exports.run}'),
('revenue_authority', 'ra_support_agent',      'Taxpayer support',     'Assists landlords with registration and questions.',
  '{tax.view_landlords,support.respond}'),
('revenue_authority', 'ra_auditor',            'Auditor',              'Read-only access to tax records and audit trail.',
  '{tax.view_landlords,tax.view_income,tax.view_invoices,tax.view_payments,audit.view}'),
-- Insurance providers -------------------------------------------------
('insurance_provider', 'ins_admin',          'Administrator',   'Manages staff, products, policies and claims.',
  '{org.manage_members,org.update_settings,products.manage,quotes.manage,policies.view,policies.manage,claims.view,claims.manage,premiums.view,commissions.view,analytics.view,support.respond,exports.run}'),
('insurance_provider', 'ins_underwriter',    'Underwriter',     'Defines products/rates and issues policies.',
  '{products.manage,quotes.manage,policies.view,policies.manage}'),
('insurance_provider', 'ins_claims_officer', 'Claims officer',  'Assesses and decides claims.',
  '{policies.view,claims.view,claims.manage,support.respond}'),
('insurance_provider', 'ins_support_agent',  'Customer support','Answers policyholder questions.',
  '{policies.view,claims.view,support.respond}'),
('insurance_provider', 'ins_finance',        'Finance',         'Premium and commission reconciliation.',
  '{premiums.view,commissions.view,policies.view,exports.run}'),
('insurance_provider', 'ins_analyst',        'Analyst',         'Read-only portfolio analytics.',
  '{analytics.view}'),
-- Payment providers (mobile money, banks) ------------------------------
('payment_provider', 'pay_admin',                'Administrator',       'Manages staff, channels and integrations.',
  '{org.manage_members,org.update_settings,channels.manage,transactions.view,settlements.view,disputes.manage,integrations.manage,analytics.view,support.respond,exports.run}'),
('payment_provider', 'pay_integration_engineer', 'Integration engineer','Maintains API/webhook integrations.',
  '{integrations.manage,channels.manage,transactions.view}'),
('payment_provider', 'pay_operations',           'Operations',          'Monitors transactions and handles disputes.',
  '{transactions.view,settlements.view,disputes.manage,support.respond}'),
('payment_provider', 'pay_finance',              'Finance',             'Settlement and reconciliation.',
  '{settlements.view,transactions.view,exports.run}'),
('payment_provider', 'pay_support',              'Customer support',    'Answers payment questions.',
  '{transactions.view,support.respond}'),
('payment_provider', 'pay_analyst',              'Analyst',             'Read-only analytics.',
  '{analytics.view}');

-- ---------------------------------------------------------------------
-- Membership (a person can belong to several organizations)
-- ---------------------------------------------------------------------
create table public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  org_type         public.org_type not null,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  role_key         text not null,
  job_title        text,
  status           public.member_status not null default 'active',
  invited_by       uuid references public.profiles (id) on delete set null,
  joined_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_id),
  foreign key (organization_id, org_type) references public.organizations (id, org_type) on delete cascade,
  foreign key (org_type, role_key)        references public.org_role_catalog (org_type, role_key)   -- role must exist for this org type
);
create index organization_members_user_idx on public.organization_members (user_id) where status = 'active';

-- Staff are invited by phone number; the invitee accepts after signing in.
create table public.organization_invitations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  org_type         public.org_type not null,
  phone            text not null,                      -- E.164
  role_key         text not null,
  status           public.invitation_status not null default 'pending',
  invited_by       uuid references public.profiles (id) on delete set null,
  expires_at       timestamptz not null default now() + interval '7 days',
  accepted_by      uuid references public.profiles (id) on delete set null,
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, org_type) references public.organizations (id, org_type) on delete cascade,
  foreign key (org_type, role_key)        references public.org_role_catalog (org_type, role_key)
);
create unique index organization_invitations_pending on public.organization_invitations (organization_id, phone) where status = 'pending';
create index organization_invitations_phone_idx on public.organization_invitations (phone) where status = 'pending';

create or replace function private.normalize_invitation_phone()
returns trigger language plpgsql as $$
begin
  new.phone := private.normalize_phone(new.phone);
  return new;
end $$;
create trigger organization_invitations_normalize_phone
  before insert or update of phone on public.organization_invitations
  for each row execute function private.normalize_invitation_phone();

-- Keep profiles.global_role in sync with membership
create or replace function private.sync_global_role()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles p
     set global_role = case when exists (
           select 1 from public.organization_members m
            where m.user_id = v_user and m.status = 'active')
         then 'organization_member'::public.global_role
         else 'individual'::public.global_role end
   where p.id = v_user;
  return null;
end $$;

create trigger organization_members_sync_role
  after insert or update or delete on public.organization_members
  for each row execute function private.sync_global_role();

-- ---------------------------------------------------------------------
-- Permission helpers (security definer => no RLS recursion; used by policies)
-- ---------------------------------------------------------------------
create or replace function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active')
$$;

create or replace function private.org_has_permission(p_org uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.organization_members m
      join public.organizations o    on o.id = m.organization_id and o.status = 'active'
      join public.org_role_catalog r on r.org_type = m.org_type and r.role_key = m.role_key
     where m.organization_id = p_org
       and m.user_id = auth.uid()
       and m.status = 'active'
       and p_permission = any (r.permissions))
$$;

-- "Do I hold this permission in ANY organization of this type?"
create or replace function private.has_org_type_permission(p_type public.org_type, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.organization_members m
      join public.organizations o    on o.id = m.organization_id and o.status = 'active'
      join public.org_role_catalog r on r.org_type = m.org_type and r.role_key = m.role_key
     where m.org_type = p_type
       and m.user_id = auth.uid()
       and m.status = 'active'
       and p_permission = any (r.permissions))
$$;

-- Organization ids of a type where I hold a permission (for reporting views)
create or replace function private.my_org_ids(p_type public.org_type, p_permission text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.organization_id
    from public.organization_members m
    join public.organizations o    on o.id = m.organization_id and o.status = 'active'
    join public.org_role_catalog r on r.org_type = m.org_type and r.role_key = m.role_key
   where m.org_type = p_type
     and m.user_id = auth.uid()
     and m.status = 'active'
     and p_permission = any (r.permissions)
$$;

create or replace function private.is_platform_staff(p_permission text)
returns boolean language sql stable as $$
  select private.has_org_type_permission('platform', p_permission)
$$;

-- ---------------------------------------------------------------------
-- Accept an invitation (invitee's phone must match the invitation)
-- ---------------------------------------------------------------------
create or replace function public.accept_org_invitation(p_invitation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_inv   public.organization_invitations;
  v_phone text;
begin
  select phone into v_phone from public.profiles where id = auth.uid();
  select * into v_inv from public.organization_invitations where id = p_invitation_id for update;

  if v_inv.id is null or v_inv.status <> 'pending' or v_inv.expires_at < now()
     or v_inv.phone is distinct from v_phone then
    raise exception 'Invitation is not valid for this account' using errcode = '42501';
  end if;

  insert into public.organization_members (organization_id, org_type, user_id, role_key, invited_by)
  values (v_inv.organization_id, v_inv.org_type, auth.uid(), v_inv.role_key, v_inv.invited_by)
  on conflict (organization_id, user_id)
    do update set role_key = excluded.role_key, status = 'active';

  update public.organization_invitations
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v_inv.id;

  return v_inv.organization_id;
end $$;
revoke all on function public.accept_org_invitation(uuid) from public, anon;
grant execute on function public.accept_org_invitation(uuid) to authenticated;
-- =====================================================================
-- Malo a Renti — 0004 files, properties, units, listings, visits, enquiries
--
-- Model:  property (physical premises + ownership)
--           └─ unit (the rentable piece: a house, a flat, a room, a plot ...)
--                └─ listing (an advertisement for a unit, with rent, dates, conditions)
-- Homes and land share the same tables; land-specific facts live on
-- property.land_tenure / unit.size_* / unit.land_details.
-- =====================================================================

create type public.property_category   as enum ('residential', 'commercial', 'land');
create type public.land_tenure         as enum ('customary', 'freehold', 'leasehold', 'public_lease', 'unknown');
create type public.property_role       as enum ('owner', 'co_owner', 'manager', 'caretaker');
create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type public.unit_type           as enum ('house', 'flat', 'room', 'shop', 'office', 'warehouse', 'farm_land', 'plot', 'parking', 'storage', 'other');
create type public.furnishing          as enum ('unfurnished', 'semi_furnished', 'furnished');
create type public.rent_period         as enum ('daily', 'weekly', 'monthly', 'quarterly', 'biannual', 'annual');
create type public.listing_status      as enum ('draft', 'pending_review', 'published', 'under_offer', 'let', 'paused', 'expired', 'archived');
create type public.media_kind          as enum ('photo', 'video', 'tour_3d', 'floor_plan', 'blueprint', 'document');
create type public.media_visibility    as enum ('public', 'authenticated', 'participants');
create type public.condition_party     as enum ('tenant', 'landlord', 'both');
create type public.obligation_kind     as enum ('utility_payment', 'maintenance_response', 'upkeep', 'repair', 'payment', 'insurance', 'custom');
create type public.visit_status        as enum ('requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show');
create type public.enquiry_stage       as enum ('enquiry', 'viewing', 'applied', 'shortlisted', 'accepted', 'declined', 'withdrawn');
create type public.invitation_role_status as enum ('pending', 'accepted', 'declined', 'expired', 'revoked');

-- ---------------------------------------------------------------------
-- Files registry (metadata for objects in Supabase Storage)
--   public-media  bucket: photos, videos, 3D tours, avatars (public URLs, cheap CDN)
--   private-files bucket: blueprints, ownership documents, agreements, proofs, evidence
-- Upload path convention: <uploader_uid>/<domain>/<uuid>.<ext>
-- ---------------------------------------------------------------------
create table public.files (
  id             uuid primary key default gen_random_uuid(),
  bucket         text not null check (bucket in ('public-media', 'private-files')),
  path           text not null,
  uploaded_by    uuid not null references public.profiles (id) on delete restrict,
  original_name  text,
  mime_type      text,
  size_bytes     bigint check (size_bytes is null or size_bytes >= 0),
  sha256         text,
  width          integer,
  height         integer,
  scan_status    text not null default 'pending' check (scan_status in ('pending', 'clean', 'infected', 'skipped')),
  created_at     timestamptz not null default now(),
  unique (bucket, path),
  check (path like uploaded_by::text || '/%')
);
create index files_uploader_idx on public.files (uploaded_by);

-- ---------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------
create table public.properties (
  id                   uuid primary key default gen_random_uuid(),
  created_by           uuid not null references public.profiles (id) on delete restrict,
  name                 text not null,
  category             public.property_category not null,
  description          text,
  address_line         text,
  neighbourhood        text,                  -- e.g. 'Area 10', 'Nyambadwe'
  city                 text,
  district             text not null,
  region               text check (region in ('Northern', 'Central', 'Southern')),
  country              text not null default 'MW',
  plot_number          text,
  latitude             double precision check (latitude  between -90  and 90),
  longitude            double precision check (longitude between -180 and 180),
  land_tenure          public.land_tenure,
  total_size           numeric(12, 2) check (total_size is null or total_size > 0),
  size_unit            text check (size_unit in ('sqm', 'acre', 'hectare')),
  verification_status  public.verification_status not null default 'unverified',
  verified_by          uuid references public.profiles (id) on delete set null,
  verified_at          timestamptz,
  verification_notes   text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index properties_area_idx on public.properties (district, city, neighbourhood);
create index properties_geo_idx  on public.properties (latitude, longitude);
create index properties_name_trgm on public.properties using gin (name extensions.gin_trgm_ops);

create trigger properties_lock_columns
  before update on public.properties
  for each row execute function private.lock_columns(
    'platform:properties.verify', 'created_by', 'verification_status', 'verified_by', 'verified_at', 'verification_notes');

-- Who is connected to a property (owners, co-owners, managers, caretakers)
create table public.property_members (
  property_id        uuid not null references public.properties (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  role               public.property_role not null,
  ownership_percent  numeric(5, 2) check (ownership_percent is null or ownership_percent between 0 and 100),
  invited_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  ended_at           timestamptz,
  primary key (property_id, user_id)
);
create index property_members_user_idx on public.property_members (user_id) where ended_at is null;

-- The creator becomes the owner automatically
create or replace function private.add_creator_as_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.property_members (property_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end $$;
create trigger properties_add_owner
  after insert on public.properties
  for each row execute function private.add_creator_as_owner();

-- Ownership / authority evidence (private bucket)
create table public.property_documents (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  file_id      uuid not null references public.files (id) on delete restrict,
  doc_type     text not null check (doc_type in ('title_deed', 'lease', 'letter_of_authority', 'utility_bill', 'survey_plan', 'other')),
  notes        text,
  uploaded_by  uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  unique (property_id, file_id)
);

-- Invite a caretaker/manager/co-owner by phone number
create table public.property_invitations (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  phone        text not null,
  role         public.property_role not null,
  status       public.invitation_status not null default 'pending',
  invited_by   uuid not null references public.profiles (id) on delete cascade,
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_by  uuid references public.profiles (id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index property_invitations_pending on public.property_invitations (property_id, phone) where status = 'pending';
create trigger property_invitations_normalize_phone
  before insert or update of phone on public.property_invitations
  for each row execute function private.normalize_invitation_phone();

create or replace function public.accept_property_invitation(p_invitation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_inv   public.property_invitations;
  v_phone text;
begin
  select phone into v_phone from public.profiles where id = auth.uid();
  select * into v_inv from public.property_invitations where id = p_invitation_id for update;
  if v_inv.id is null or v_inv.status <> 'pending' or v_inv.expires_at < now()
     or v_inv.phone is distinct from v_phone then
    raise exception 'Invitation is not valid for this account' using errcode = '42501';
  end if;
  insert into public.property_members (property_id, user_id, role, invited_by)
  values (v_inv.property_id, auth.uid(), v_inv.role, v_inv.invited_by)
  on conflict (property_id, user_id) do update set role = excluded.role, ended_at = null;
  update public.property_invitations
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v_inv.id;
  return v_inv.property_id;
end $$;
revoke all on function public.accept_property_invitation(uuid) from public, anon;
grant execute on function public.accept_property_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Units (rentable pieces). A single house is a property with one unit.
-- ---------------------------------------------------------------------
create table public.units (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references public.properties (id) on delete cascade,
  name                text not null default 'Main',
  unit_type           public.unit_type not null,
  bedrooms            smallint check (bedrooms  is null or bedrooms  >= 0),
  bathrooms           smallint check (bathrooms is null or bathrooms >= 0),
  floor_area_sqm      numeric(10, 2) check (floor_area_sqm is null or floor_area_sqm > 0),
  size_value          numeric(12, 2) check (size_value is null or size_value > 0),   -- land / plots
  size_unit           text check (size_unit in ('sqm', 'acre', 'hectare')),
  furnishing          public.furnishing,
  amenities           text[] not null default '{}',            -- 'parking','borehole','generator','fence',...
  utilities_included  text[] not null default '{}',            -- 'water','electricity','internet','security','refuse'
  land_details        jsonb not null default '{}',             -- permitted_use, road_access, water_source, power ...
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, property_id),
  unique (property_id, name)
);

-- ---------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------
create table public.listings (
  id                uuid primary key default gen_random_uuid(),
  unit_id           uuid not null,
  property_id       uuid not null,
  created_by        uuid not null references public.profiles (id) on delete restrict,
  title             text not null,
  description       text,
  status            public.listing_status not null default 'draft',
  rent_amount       numeric(14, 2) not null check (rent_amount >= 0),
  currency          char(3) not null default 'MWK',
  rent_period       public.rent_period not null default 'monthly',
  deposit_amount    numeric(14, 2) not null default 0 check (deposit_amount >= 0),
  min_lease_months  smallint check (min_lease_months is null or min_lease_months > 0),
  max_lease_months  smallint check (max_lease_months is null or max_lease_months > 0),
  available_from    date,
  available_until   date,
  published_at      timestamptz,
  expires_at        timestamptz,
  reviewed_by       uuid references public.profiles (id) on delete set null,
  reviewed_at       timestamptz,
  moderation_notes  text,
  view_count        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (unit_id, property_id) references public.units (id, property_id) on delete cascade,
  check (available_until is null or available_from is null or available_until >= available_from),
  check (max_lease_months is null or min_lease_months is null or max_lease_months >= min_lease_months)
);
create index listings_status_idx   on public.listings (status, published_at desc);
create index listings_property_idx on public.listings (property_id);
create index listings_rent_idx     on public.listings (rent_amount) where status = 'published';
-- one live advertisement per unit at a time
create unique index listings_one_live_per_unit on public.listings (unit_id)
  where status in ('pending_review', 'published', 'under_offer');

-- Non-staff cannot self-approve: publishing requires a verified property, otherwise it goes to review.
create or replace function private.guard_listing_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_verified boolean;
begin
  if private.is_trusted_caller() or private.is_platform_staff('listings.moderate') then
    if new.status = 'published' and old.status is distinct from 'published' then
      new.published_at := coalesce(new.published_at, now());
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'published' then
      select verification_status = 'verified' into v_verified from public.properties where id = new.property_id;
      if not coalesce(v_verified, false) then
        new.status := 'pending_review';
      else
        new.published_at := coalesce(new.published_at, now());
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger listings_guard_status
  before insert or update of status on public.listings
  for each row execute function private.guard_listing_status();
create trigger listings_lock_columns
  before update on public.listings
  for each row execute function private.lock_columns(
    'platform:listings.moderate', 'created_by', 'property_id', 'reviewed_by', 'reviewed_at', 'moderation_notes', 'view_count');

-- Conditions attached to a listing. They become clauses / tracked obligations
-- when an agreement is drafted (e.g. landlord pays water, 48h repair response).
create table public.listing_conditions (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references public.listings (id) on delete cascade,
  applies_to       public.condition_party not null default 'tenant',
  category         text not null default 'other'
                   check (category in ('occupancy', 'pets', 'usage', 'upkeep', 'payment', 'utilities', 'maintenance', 'security', 'other')),
  title            text not null,
  description      text,
  obligation_kind  public.obligation_kind,               -- set if this should become a tracked obligation
  params           jsonb not null default '{}',          -- e.g. {"utility":"water"} or {"response_hours":48}
  is_mandatory     boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);
create index listing_conditions_listing_idx on public.listing_conditions (listing_id, sort_order);

-- Photos, videos, 3D tours, floor plans and blueprints
create table public.listing_media (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings (id) on delete cascade,
  file_id       uuid references public.files (id) on delete restrict,
  external_url  text,                                    -- e.g. hosted 3D tour link
  kind          public.media_kind not null,
  visibility    public.media_visibility not null default 'public',
  caption       text,
  sort_order    integer not null default 0,
  is_cover      boolean not null default false,
  created_at    timestamptz not null default now(),
  check (file_id is not null or external_url is not null),
  -- blueprints and documents are never public by default
  check (kind not in ('blueprint', 'document') or visibility <> 'public')
);
create unique index listing_media_one_cover on public.listing_media (listing_id) where is_cover;
create index listing_media_listing_idx on public.listing_media (listing_id, sort_order);

-- ---------------------------------------------------------------------
-- Visiting availability and scheduled visits
-- ---------------------------------------------------------------------
create table public.visit_availability_rules (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings (id) on delete cascade,
  host_id        uuid not null references public.profiles (id) on delete cascade,   -- who shows the property
  weekday        smallint check (weekday between 0 and 6),          -- 0 = Sunday (recurring rule)
  specific_date  date,                                              -- or a one-off date
  start_time     time not null,
  end_time       time not null,
  slot_minutes   smallint not null default 30 check (slot_minutes between 10 and 240),
  max_visitors   smallint not null default 1 check (max_visitors > 0),
  valid_from     date,
  valid_until    date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  check ((weekday is null) <> (specific_date is null)),
  check (end_time > start_time)
);
create index visit_rules_listing_idx on public.visit_availability_rules (listing_id) where is_active;

create table public.enquiries (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references public.listings (id) on delete cascade,
  seeker_id         uuid not null references public.profiles (id) on delete cascade,
  stage             public.enquiry_stage not null default 'enquiry',
  message           text,
  occupants         smallint check (occupants is null or occupants > 0),
  desired_move_in   date,
  application_note  text,
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (listing_id, seeker_id)
);
create index enquiries_seeker_idx on public.enquiries (seeker_id);
create trigger enquiries_lock_columns
  before update on public.enquiries
  for each row execute function private.lock_columns('', 'listing_id', 'seeker_id');

create table public.visits (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references public.listings (id) on delete cascade,
  enquiry_id       uuid references public.enquiries (id) on delete set null,
  visitor_id       uuid not null references public.profiles (id) on delete cascade,
  host_id          uuid not null references public.profiles (id) on delete restrict,
  scheduled_start  timestamptz not null,
  scheduled_end    timestamptz not null,
  status           public.visit_status not null default 'requested',
  visitors_count   smallint not null default 1 check (visitors_count > 0),
  visitor_note     text,
  host_note        text,
  decline_reason   text,
  cancelled_by     uuid references public.profiles (id) on delete set null,
  cancelled_at     timestamptz,
  confirmed_at     timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  -- a host cannot confirm two overlapping visits
  exclude using gist (host_id with =, tstzrange(scheduled_start, scheduled_end) with &&) where (status = 'confirmed')
);
create index visits_listing_idx on public.visits (listing_id, scheduled_start);
create index visits_visitor_idx on public.visits (visitor_id, scheduled_start);
create index visits_host_idx    on public.visits (host_id, scheduled_start);
create trigger visits_lock_columns
  before update on public.visits
  for each row execute function private.lock_columns('', 'listing_id', 'visitor_id', 'host_id');

-- Saved items for seekers
create table public.saved_listings (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  listing_id  uuid not null references public.listings (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create table public.saved_searches (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  name              text not null,
  filters           jsonb not null default '{}',
  notify            boolean not null default true,
  last_notified_at  timestamptz,
  created_at        timestamptz not null default now()
);
create index saved_searches_user_idx on public.saved_searches (user_id);

-- ---------------------------------------------------------------------
-- Bookable slots for a listing (recurring weekday rules + one-off dates,
-- minus capacity already taken by requested/confirmed visits). Times are
-- interpreted in Malawi local time (Africa/Blantyre).
-- ---------------------------------------------------------------------
create or replace function public.available_visit_slots(p_listing_id uuid, p_from date, p_to date)
returns table (host_id uuid, slot_start timestamptz, slot_end timestamptz)
language sql stable security definer set search_path = '' as $$
  with listing_ok as (
    select 1 from public.listings l
     where l.id = p_listing_id and l.status in ('published', 'under_offer')
  ),
  days as (
    select d::date as day
      from generate_series(p_from, least(p_to, p_from + 30), interval '1 day') d
  ),
  applicable as (
    select r.host_id, r.start_time, r.end_time, r.slot_minutes, r.max_visitors, d.day
      from public.visit_availability_rules r
      join days d on (r.specific_date = d.day
                      or (r.specific_date is null and r.weekday = extract(dow from d.day)::int))
     where r.listing_id = p_listing_id
       and r.is_active
       and (r.valid_from  is null or d.day >= r.valid_from)
       and (r.valid_until is null or d.day <= r.valid_until)
       and exists (select 1 from listing_ok)
  ),
  slots as (
    select a.host_id, a.max_visitors, a.slot_minutes,
           (s.local_start at time zone 'Africa/Blantyre') as slot_start
      from applicable a
      cross join lateral generate_series(
             a.day + a.start_time,
             a.day + a.end_time - make_interval(mins => a.slot_minutes),
             make_interval(mins => a.slot_minutes)) as s(local_start)
  )
  select s.host_id, s.slot_start, s.slot_start + make_interval(mins => s.slot_minutes)
    from slots s
   where s.slot_start > now()
     and (select coalesce(sum(v.visitors_count), 0)
            from public.visits v
           where v.listing_id = p_listing_id
             and v.host_id = s.host_id
             and v.status in ('requested', 'confirmed')
             and v.scheduled_start = s.slot_start) < s.max_visitors
   order by s.slot_start
$$;
revoke all on function public.available_visit_slots(uuid, date, date) from public, anon;
grant execute on function public.available_visit_slots(uuid, date, date) to authenticated;
-- =====================================================================
-- Malo a Renti — 0005 agreements, tenancies, condition reports,
--                obligations and maintenance
--
-- agreement  = the negotiated, signed contract (versioned, tamper-evident hash)
-- tenancy    = the operational record: who lives where, on what terms, since when
--              (can also exist WITHOUT an agreement, to onboard existing tenants)
-- obligation = a promise that can be tracked with evidence (e.g. "landlord pays water")
-- =====================================================================

create type public.agreement_status         as enum ('draft', 'sent', 'negotiating', 'signed', 'active', 'terminated', 'expired', 'cancelled');
create type public.party_role               as enum ('landlord', 'tenant', 'co_tenant', 'guarantor', 'agent');
create type public.tenancy_status           as enum ('pending', 'active', 'notice_given', 'ended', 'cancelled');
create type public.tenancy_member_role      as enum ('primary_tenant', 'co_tenant', 'guarantor', 'occupant');
create type public.report_kind              as enum ('move_in', 'move_out', 'inspection');
create type public.report_status            as enum ('draft', 'shared', 'signed');
create type public.item_condition           as enum ('excellent', 'good', 'fair', 'poor', 'damaged', 'missing');
create type public.obligation_party         as enum ('landlord', 'tenant');
create type public.obligation_status        as enum ('active', 'paused', 'completed', 'waived');
create type public.obligation_event_status  as enum ('pending', 'evidenced', 'confirmed', 'disputed', 'missed', 'waived');
create type public.maintenance_status       as enum ('open', 'acknowledged', 'scheduled', 'in_progress', 'resolved', 'confirmed', 'rejected');
create type public.maintenance_priority     as enum ('low', 'normal', 'high', 'urgent');

-- ---------------------------------------------------------------------
-- Templates (reviewed by counsel) and reusable clauses
-- ---------------------------------------------------------------------
create table public.agreement_templates (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('residential', 'room', 'commercial', 'land', 'renewal', 'addendum')),
  title              text not null,
  description        text,
  body               text not null,                   -- markdown with {{placeholders}}
  default_terms      jsonb not null default '{}',
  language           text not null default 'en' check (language in ('en', 'ny')),
  version            integer not null default 1,
  is_active          boolean not null default true,
  legal_reviewed_by  text,
  legal_reviewed_at  timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (kind, language, version)
);

create table public.clause_library (
  id               uuid primary key default gen_random_uuid(),
  category         text not null,
  title            text not null,
  body             text not null,
  params_schema    jsonb not null default '{}',
  obligation_kind  public.obligation_kind,
  obligation_owner public.obligation_party,
  language         text not null default 'en' check (language in ('en', 'ny')),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Agreements
-- ---------------------------------------------------------------------
create table public.agreements (
  id                      uuid primary key default gen_random_uuid(),
  agreement_number        text unique,
  unit_id                 uuid not null references public.units (id) on delete restrict,
  listing_id              uuid references public.listings (id) on delete set null,
  enquiry_id              uuid references public.enquiries (id) on delete set null,
  template_id             uuid references public.agreement_templates (id) on delete set null,
  template_version        integer,
  supersedes_agreement_id uuid references public.agreements (id) on delete set null,   -- renewals
  status                  public.agreement_status not null default 'draft',
  title                   text not null,
  start_date              date,
  end_date                date,
  rent_amount             numeric(14, 2) check (rent_amount is null or rent_amount >= 0),
  currency                char(3) not null default 'MWK',
  rent_period             public.rent_period not null default 'monthly',
  rent_due_day            smallint check (rent_due_day between 1 and 31),
  deposit_amount          numeric(14, 2) not null default 0 check (deposit_amount >= 0),
  late_fee_amount         numeric(14, 2) check (late_fee_amount is null or late_fee_amount >= 0),
  late_fee_percent        numeric(5, 2)  check (late_fee_percent is null or late_fee_percent between 0 and 100),
  grace_days              smallint not null default 0 check (grace_days >= 0),
  notice_period_days      smallint not null default 30 check (notice_period_days >= 0),
  created_by              uuid not null references public.profiles (id) on delete restrict,
  sent_at                 timestamptz,
  signed_at               timestamptz,               -- when the LAST party signed
  activated_at            timestamptz,
  terminated_at           timestamptz,
  termination_reason      text,
  document_file_id        uuid references public.files (id) on delete set null,   -- certified PDF
  document_sha256         text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index agreements_unit_idx on public.agreements (unit_id);
create index agreements_creator_idx on public.agreements (created_by);
create trigger agreements_number
  before insert on public.agreements
  for each row execute function private.assign_doc_number('agreement_number', 'AGR', 'private.agreement_seq');

create table public.agreement_parties (
  agreement_id      uuid not null references public.agreements (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete restrict,
  party_role        public.party_role not null,
  invited_at        timestamptz not null default now(),
  signed_at         timestamptz,
  signature_method  text check (signature_method in ('otp', 'typed', 'drawn')),
  signature_ip      inet,
  signature_device  jsonb,
  signature_hash    text,                             -- hash of the exact content that was signed
  declined_at       timestamptz,
  decline_reason    text,
  primary key (agreement_id, user_id, party_role)
);
create index agreement_parties_user_idx on public.agreement_parties (user_id);
create trigger agreement_parties_lock_columns
  before update on public.agreement_parties
  for each row execute function private.lock_columns(
    '', 'agreement_id', 'user_id', 'party_role', 'signed_at', 'signature_method', 'signature_ip', 'signature_device', 'signature_hash');

create table public.agreement_clauses (
  id                   uuid primary key default gen_random_uuid(),
  agreement_id         uuid not null references public.agreements (id) on delete cascade,
  clause_id            uuid references public.clause_library (id) on delete set null,
  listing_condition_id uuid references public.listing_conditions (id) on delete set null,
  position             integer not null,
  title                text not null,
  body                 text not null,
  is_custom            boolean not null default false,
  obligation_kind      public.obligation_kind,
  obligation_owner     public.obligation_party,
  params               jsonb not null default '{}',
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (agreement_id, position) deferrable initially deferred
);

-- Immutable snapshots taken when the agreement is sent, changed in negotiation and signed
create table public.agreement_versions (
  id              uuid primary key default gen_random_uuid(),
  agreement_id    uuid not null references public.agreements (id) on delete cascade,
  version_no      integer not null,
  snapshot        jsonb not null,
  content_sha256  text not null,
  note            text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (agreement_id, version_no)
);

-- Content freezes once anyone has signed or the agreement leaves the negotiation states.
create or replace function private.agreement_is_frozen(p_agreement uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.agreements a
                  where a.id = p_agreement and a.status not in ('draft', 'sent', 'negotiating'))
      or exists (select 1 from public.agreement_parties p
                  where p.agreement_id = p_agreement and p.signed_at is not null)
$$;

create or replace function private.guard_agreement_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c text;
  term_cols text[] := array['unit_id','listing_id','template_id','template_version','start_date','end_date',
    'rent_amount','currency','rent_period','rent_due_day','deposit_amount','late_fee_amount',
    'late_fee_percent','grace_days','notice_period_days','created_by','agreement_number'];
begin
  if private.is_trusted_caller() then return new; end if;
  if new.status is distinct from old.status and new.status not in ('draft', 'sent', 'negotiating', 'cancelled') then
    raise exception 'Status "%" is set by the system (signing/activation/termination flows)', new.status using errcode = '42501';
  end if;
  if private.agreement_is_frozen(old.id) then
    foreach c in array term_cols loop
      if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
        raise exception 'Agreement terms are frozen after signing (column %)', c using errcode = '42501';
      end if;
    end loop;
    if new.status is distinct from old.status and new.status <> 'cancelled' then
      raise exception 'Agreement can no longer change status' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and old.status in ('signed', 'active') then
      raise exception 'Signed agreements are ended through a termination notice, not cancelled' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger agreements_guard_update
  before update on public.agreements
  for each row execute function private.guard_agreement_update();

create or replace function private.guard_clause_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.is_trusted_caller() then return coalesce(new, old); end if;
  if private.agreement_is_frozen(coalesce(new.agreement_id, old.agreement_id)) then
    raise exception 'Agreement clauses are frozen after signing' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger agreement_clauses_guard
  before insert or update or delete on public.agreement_clauses
  for each row execute function private.guard_clause_change();

-- Take a snapshot (version) of the current agreement content
create or replace function public.snapshot_agreement(p_agreement_id uuid, p_note text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_ag   public.agreements;
  v_snap jsonb;
  v_ver  integer;
begin
  if not (private.is_trusted_caller() or private.can_view_agreement(p_agreement_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_ag from public.agreements where id = p_agreement_id;
  if v_ag.id is null then raise exception 'Agreement not found'; end if;

  v_snap := jsonb_build_object(
    'agreement', to_jsonb(v_ag) - 'document_file_id' - 'document_sha256',
    'clauses', (select coalesce(jsonb_agg(to_jsonb(c) order by c.position), '[]'::jsonb)
                  from public.agreement_clauses c where c.agreement_id = p_agreement_id),
    'parties', (select coalesce(jsonb_agg(jsonb_build_object(
                          'user_id', ap.user_id, 'party_role', ap.party_role, 'full_name', pr.full_name)
                          order by ap.party_role, ap.user_id), '[]'::jsonb)
                  from public.agreement_parties ap join public.profiles pr on pr.id = ap.user_id
                 where ap.agreement_id = p_agreement_id));

  select coalesce(max(version_no), 0) + 1 into v_ver from public.agreement_versions where agreement_id = p_agreement_id;
  insert into public.agreement_versions (agreement_id, version_no, snapshot, content_sha256, note, created_by)
  values (p_agreement_id, v_ver, v_snap, encode(sha256(convert_to(v_snap::text, 'utf8')), 'hex'), p_note, auth.uid());
  return v_ver;
end $$;
revoke all on function public.snapshot_agreement(uuid, text) from public, anon;
grant execute on function public.snapshot_agreement(uuid, text) to authenticated;

-- A party signs. Records method/IP/device and the hash of what was signed; when
-- every party has signed the agreement becomes 'signed'.
create or replace function public.sign_agreement(p_agreement_id uuid, p_method text default 'otp', p_device jsonb default '{}')
returns public.agreement_status language plpgsql security definer set search_path = '' as $$
declare
  v_ag      public.agreements;
  v_hdr     json;
  v_ip      inet;
  v_hash    text;
  v_pending integer;
  v_status  public.agreement_status;
begin
  select * into v_ag from public.agreements where id = p_agreement_id for update;
  if v_ag.id is null then raise exception 'Agreement not found'; end if;
  if v_ag.status not in ('sent', 'negotiating') then
    raise exception 'Agreement is not open for signing (status: %)', v_ag.status;
  end if;
  if not exists (select 1 from public.agreement_parties
                  where agreement_id = p_agreement_id and user_id = auth.uid()
                    and signed_at is null and declined_at is null) then
    raise exception 'You are not an unsigned party to this agreement' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and identity_status = 'verified' and not is_suspended) then
    raise exception 'Identity must be verified before signing' using errcode = '42501';
  end if;

  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::json;
    v_ip  := nullif(btrim(split_part(coalesce(v_hdr ->> 'x-forwarded-for', ''), ',', 1)), '')::inet;
  exception when others then
    v_ip := null;
  end;

  perform set_config('malo.system_op', 'on', true);

  perform public.snapshot_agreement(p_agreement_id, 'signed by ' || auth.uid()::text);
  select content_sha256 into v_hash from public.agreement_versions
   where agreement_id = p_agreement_id order by version_no desc limit 1;

  update public.agreement_parties
     set signed_at = now(), signature_method = p_method, signature_ip = v_ip,
         signature_device = p_device, signature_hash = v_hash
   where agreement_id = p_agreement_id and user_id = auth.uid() and signed_at is null;

  select count(*) into v_pending from public.agreement_parties
   where agreement_id = p_agreement_id and signed_at is null and declined_at is null;

  v_status := v_ag.status;
  if v_pending = 0
     and exists (select 1 from public.agreement_parties where agreement_id = p_agreement_id and party_role = 'landlord')
     and exists (select 1 from public.agreement_parties where agreement_id = p_agreement_id and party_role in ('tenant', 'co_tenant')) then
    update public.agreements set status = 'signed', signed_at = now() where id = p_agreement_id
    returning status into v_status;
  end if;

  perform set_config('malo.system_op', '', true);
  return v_status;
end $$;
revoke all on function public.sign_agreement(uuid, text, jsonb) from public, anon;
grant execute on function public.sign_agreement(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Tenancies
-- ---------------------------------------------------------------------
create table public.tenancies (
  id                  uuid primary key default gen_random_uuid(),
  unit_id             uuid not null,
  property_id         uuid not null,
  agreement_id        uuid unique references public.agreements (id) on delete set null,
  listing_id          uuid references public.listings (id) on delete set null,
  landlord_id         uuid not null references public.profiles (id) on delete restrict,   -- billing landlord (payee)
  status              public.tenancy_status not null default 'pending',
  start_date          date not null,
  end_date            date,
  move_in_date        date,
  move_out_date       date,
  rent_amount         numeric(14, 2) not null check (rent_amount >= 0),
  currency            char(3) not null default 'MWK',
  rent_period         public.rent_period not null default 'monthly',
  rent_due_day        smallint check (rent_due_day between 1 and 31),
  deposit_amount      numeric(14, 2) not null default 0 check (deposit_amount >= 0),
  deposit_status      text not null default 'none' check (deposit_status in ('none', 'pending', 'held', 'partially_refunded', 'refunded', 'forfeited')),
  notice_period_days  smallint not null default 30,
  last_invoiced_through date,                      -- rent invoicing cursor (used by the scheduler)
  ended_reason        text,
  created_by          uuid not null references public.profiles (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (unit_id, property_id) references public.units (id, property_id) on delete restrict,
  check (end_date is null or end_date >= start_date)
);
create unique index tenancies_one_open_per_unit on public.tenancies (unit_id)
  where status in ('pending', 'active', 'notice_given');
create index tenancies_landlord_idx on public.tenancies (landlord_id);
create index tenancies_property_idx on public.tenancies (property_id);
create trigger tenancies_lock_columns
  before update on public.tenancies
  for each row execute function private.lock_columns('', 'unit_id', 'property_id', 'agreement_id', 'created_by');

create table public.tenancy_members (
  tenancy_id  uuid not null references public.tenancies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete restrict,
  role        public.tenancy_member_role not null,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  primary key (tenancy_id, user_id)
);
create index tenancy_members_user_idx on public.tenancy_members (user_id);

-- Onboard existing tenants (who may not have an account yet) by phone number
create table public.tenancy_invitations (
  id          uuid primary key default gen_random_uuid(),
  tenancy_id  uuid not null references public.tenancies (id) on delete cascade,
  phone       text not null,
  role        public.tenancy_member_role not null default 'primary_tenant',
  status      public.invitation_status not null default 'pending',
  invited_by  uuid not null references public.profiles (id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '30 days',
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index tenancy_invitations_pending on public.tenancy_invitations (tenancy_id, phone) where status = 'pending';
create trigger tenancy_invitations_normalize_phone
  before insert or update of phone on public.tenancy_invitations
  for each row execute function private.normalize_invitation_phone();

create or replace function public.accept_tenancy_invitation(p_invitation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_inv   public.tenancy_invitations;
  v_phone text;
begin
  select phone into v_phone from public.profiles where id = auth.uid();
  select * into v_inv from public.tenancy_invitations where id = p_invitation_id for update;
  if v_inv.id is null or v_inv.status <> 'pending' or v_inv.expires_at < now()
     or v_inv.phone is distinct from v_phone then
    raise exception 'Invitation is not valid for this account' using errcode = '42501';
  end if;
  insert into public.tenancy_members (tenancy_id, user_id, role)
  values (v_inv.tenancy_id, auth.uid(), v_inv.role)
  on conflict (tenancy_id, user_id) do update set role = excluded.role, left_at = null;
  update public.tenancy_invitations
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v_inv.id;
  return v_inv.tenancy_id;
end $$;
revoke all on function public.accept_tenancy_invitation(uuid) from public, anon;
grant execute on function public.accept_tenancy_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Obligations (tracked promises) and their evidence
-- ---------------------------------------------------------------------
create table public.obligations (
  id                    uuid primary key default gen_random_uuid(),
  tenancy_id            uuid not null references public.tenancies (id) on delete cascade,
  agreement_id          uuid references public.agreements (id) on delete set null,
  agreement_clause_id   uuid references public.agreement_clauses (id) on delete set null,
  listing_condition_id  uuid references public.listing_conditions (id) on delete set null,
  kind                  public.obligation_kind not null,
  owner_party           public.obligation_party not null,
  responsible_user_id   uuid references public.profiles (id) on delete set null,
  title                 text not null,
  description           text,
  params                jsonb not null default '{}',
  recurrence            text not null default 'once' check (recurrence in ('once', 'weekly', 'monthly', 'quarterly', 'annual')),
  first_due_on          date,
  ends_on               date,
  status                public.obligation_status not null default 'active',
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index obligations_tenancy_idx on public.obligations (tenancy_id, status);

create table public.obligation_events (
  id             uuid primary key default gen_random_uuid(),
  obligation_id  uuid not null references public.obligations (id) on delete cascade,
  due_on         date not null,
  status         public.obligation_event_status not null default 'pending',
  submitted_by   uuid references public.profiles (id) on delete set null,
  submitted_at   timestamptz,
  note           text,
  confirmed_by   uuid references public.profiles (id) on delete set null,
  confirmed_at   timestamptz,
  dispute_note   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (obligation_id, due_on),
  check (confirmed_by is null or confirmed_by is distinct from submitted_by)   -- the other party confirms
);
create table public.obligation_event_files (
  event_id  uuid not null references public.obligation_events (id) on delete cascade,
  file_id   uuid not null references public.files (id) on delete restrict,
  primary key (event_id, file_id)
);

-- ---------------------------------------------------------------------
-- Condition reports (move-in / move-out / inspections)
-- ---------------------------------------------------------------------
create table public.condition_reports (
  id            uuid primary key default gen_random_uuid(),
  tenancy_id    uuid not null references public.tenancies (id) on delete cascade,
  kind          public.report_kind not null,
  status        public.report_status not null default 'draft',
  notes         text,
  created_by    uuid not null references public.profiles (id) on delete restrict,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index condition_reports_tenancy_idx on public.condition_reports (tenancy_id, kind);

create table public.condition_report_items (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.condition_reports (id) on delete cascade,
  area        text not null,                  -- 'Kitchen', 'Bedroom 1', 'Fence'
  item        text not null,                  -- 'Sink', 'Window', 'Gate'
  condition   public.item_condition not null,
  notes       text,
  sort_order  integer not null default 0
);
create index condition_report_items_report_idx on public.condition_report_items (report_id, sort_order);

create table public.condition_item_media (
  item_id  uuid not null references public.condition_report_items (id) on delete cascade,
  file_id  uuid not null references public.files (id) on delete restrict,
  primary key (item_id, file_id)
);

create table public.condition_report_signatures (
  report_id  uuid not null references public.condition_reports (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete restrict,
  signed_at  timestamptz not null default now(),
  comment    text,
  primary key (report_id, user_id)
);

-- A signed report cannot be altered
create or replace function private.guard_report_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_report uuid; v_status public.report_status;
begin
  if private.is_trusted_caller() then return coalesce(new, old); end if;
  v_report := case tg_table_name
                when 'condition_reports' then coalesce(old.id, new.id)
                else coalesce(to_jsonb(new) ->> 'report_id', to_jsonb(old) ->> 'report_id')::uuid end;
  select status into v_status from public.condition_reports where id = v_report;
  if v_status = 'signed' and not (tg_table_name = 'condition_reports' and tg_op = 'UPDATE' and old.status <> 'signed') then
    raise exception 'A signed condition report cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger condition_reports_guard
  before update or delete on public.condition_reports
  for each row execute function private.guard_report_change();
create trigger condition_report_items_guard
  before insert or update or delete on public.condition_report_items
  for each row execute function private.guard_report_change();

-- ---------------------------------------------------------------------
-- Maintenance requests
-- ---------------------------------------------------------------------
create table public.maintenance_requests (
  id               uuid primary key default gen_random_uuid(),
  tenancy_id       uuid not null references public.tenancies (id) on delete cascade,
  unit_id          uuid not null references public.units (id) on delete restrict,
  raised_by        uuid not null references public.profiles (id) on delete restrict,
  category         text not null default 'other'
                   check (category in ('plumbing', 'electrical', 'roof', 'security', 'appliance', 'pest', 'structural', 'other')),
  priority         public.maintenance_priority not null default 'normal',
  title            text not null,
  description      text,
  status           public.maintenance_status not null default 'open',
  acknowledged_by  uuid references public.profiles (id) on delete set null,
  acknowledged_at  timestamptz,
  scheduled_for    timestamptz,
  resolved_at      timestamptz,
  confirmed_at     timestamptz,
  rejection_reason text,
  obligation_id    uuid references public.obligations (id) on delete set null,   -- ties to an agreed response time
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index maintenance_requests_tenancy_idx on public.maintenance_requests (tenancy_id, status);

create table public.maintenance_request_files (
  request_id  uuid not null references public.maintenance_requests (id) on delete cascade,
  file_id     uuid not null references public.files (id) on delete restrict,
  phase       text not null default 'report' check (phase in ('report', 'completion')),
  primary key (request_id, file_id)
);

create table public.maintenance_updates (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.maintenance_requests (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete restrict,
  status      public.maintenance_status,
  note        text,
  created_at  timestamptz not null default now()
);
create index maintenance_updates_request_idx on public.maintenance_updates (request_id, created_at);

-- ---------------------------------------------------------------------
-- Turn a fully signed agreement into a live tenancy (landlord side only).
-- Copies the terms, adds tenant members and creates obligations from clauses.
-- ---------------------------------------------------------------------
create or replace function public.create_tenancy_from_agreement(p_agreement_id uuid, p_move_in_date date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_ag       public.agreements;
  v_prop     uuid;
  v_landlord uuid;
  v_tid      uuid;
begin
  select * into v_ag from public.agreements where id = p_agreement_id for update;
  if v_ag.id is null then raise exception 'Agreement not found'; end if;
  select property_id into v_prop from public.units where id = v_ag.unit_id;
  if not private.can_manage_property(v_prop) then
    raise exception 'Only the landlord side can start a tenancy' using errcode = '42501';
  end if;
  if v_ag.status <> 'signed' then
    raise exception 'Agreement must be fully signed first (status: %)', v_ag.status;
  end if;
  if exists (select 1 from public.tenancies where agreement_id = p_agreement_id) then
    raise exception 'A tenancy already exists for this agreement';
  end if;
  if v_ag.start_date is null or v_ag.rent_amount is null then
    raise exception 'Agreement needs a start date and rent amount';
  end if;

  select user_id into v_landlord from public.agreement_parties
   where agreement_id = p_agreement_id and party_role = 'landlord'
   order by invited_at limit 1;

  perform set_config('malo.system_op', 'on', true);

  insert into public.tenancies (unit_id, property_id, agreement_id, listing_id, landlord_id, status,
      start_date, end_date, move_in_date, rent_amount, currency, rent_period, rent_due_day,
      deposit_amount, deposit_status, notice_period_days, created_by)
  values (v_ag.unit_id, v_prop, v_ag.id, v_ag.listing_id, v_landlord,
      case when v_ag.start_date <= current_date then 'active' else 'pending' end::public.tenancy_status,
      v_ag.start_date, v_ag.end_date, p_move_in_date, v_ag.rent_amount, v_ag.currency, v_ag.rent_period, v_ag.rent_due_day,
      v_ag.deposit_amount, case when v_ag.deposit_amount > 0 then 'pending' else 'none' end,
      v_ag.notice_period_days, auth.uid())
  returning id into v_tid;

  insert into public.tenancy_members (tenancy_id, user_id, role)
  select v_tid, ap.user_id,
         case ap.party_role when 'tenant' then 'primary_tenant' when 'co_tenant' then 'co_tenant' else 'guarantor' end::public.tenancy_member_role
    from public.agreement_parties ap
   where ap.agreement_id = p_agreement_id and ap.party_role in ('tenant', 'co_tenant', 'guarantor');

  insert into public.obligations (tenancy_id, agreement_id, agreement_clause_id, listing_condition_id,
      kind, owner_party, title, description, params, recurrence, first_due_on, created_by)
  select v_tid, v_ag.id, c.id, c.listing_condition_id, c.obligation_kind, c.obligation_owner, c.title, c.body, c.params,
         case when c.params ->> 'recurrence' in ('once', 'weekly', 'monthly', 'quarterly', 'annual')
              then c.params ->> 'recurrence' else 'once' end,
         v_ag.start_date, auth.uid()
    from public.agreement_clauses c
   where c.agreement_id = p_agreement_id and c.obligation_kind is not null and c.obligation_owner is not null;

  update public.agreements set status = 'active', activated_at = now() where id = p_agreement_id;

  perform set_config('malo.system_op', '', true);
  return v_tid;
end $$;