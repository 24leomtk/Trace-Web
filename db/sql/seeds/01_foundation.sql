-- TRACE seed 01 — foundation: branches, organizations, users.
-- Run FIRST on a fresh migrated database. Own transaction, self-contained:
-- paste/run this file on its own (psql -f or SQL editor).
-- Re-runnable (truncates all data tables first).
-- Mutes notification triggers for this file (seed_load flag below).
--
-- PRODUCTION GUARD: this file wipes all data. It refuses to run unless
-- this session has opted in — run this line first, in the same session:
--   select set_config('app.allow_seed', '1', false);
-- NEVER seed a production database.
--
-- Stable natural keys (hand-test handles, no fixed UUIDs):
--   phones +265997000001…018 per role · branch names · org names.

begin;

do $$
begin
  if coalesce(current_setting('app.allow_seed', true), '') <> '1' then
    raise exception 'Refusing to seed: run SELECT set_config(''app.allow_seed'', ''1'', false) in this session first. Never seed production.';
  end if;
end $$;

select set_config('app.seed_load', 'on', false);
select setseed(0.20260918);

create extension if not exists pgcrypto;

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

-- Full wipe (fresh DB: no-op; re-run: clean slate). CASCADE pulls FK rows.
truncate public.actions,
  public.notifications,
  public.idempotency_keys,
  public.api_keys,
  public.sessions,
  public.accounts,
  public.verifications,
  public.case_reviews,
  public.case_assignments,
  public.court_case_access,
  public.referral_documents,
  public.missing_person_cases,
  public.wanted_person_cases,
  public.unclaimed_person_cases,
  public.person_case_matches,
  public.vehicle_cases,
  public.accidents,
  public.accident_vehicles,
  public.traffic_citations,
  public.citation_payments,
  public.impound_custody,
  public.record_attachments,
  public.insurance_policies,
  public.vehicle_taxes,
  public.tax_automation_rules,
  public.records,
  public.vehicles,
  public.person_physical_features,
  public.person_fingerprints,
  public.person_dna_samples,
  public.persons_of_interest,
  public.users,
  public.branches,
  public.organizations cascade;

do $$
declare
  v_seq              integer := 1;
  v_i                integer;
  v_n                integer;
  v_district         text;
  v_domain           text;
  v_branch           uuid;
  v_branch_district  text;
  v_full             text;
  v_phone            text;
  v_email            text;
  v_first            text[] := array['Chikondi','Dalitso','Tadala','Mphatso','Wongani','Tiwonge','Yamikani','Chisomo','Madalitso','Alinafe','Pemphero','Limbani','Tamanda','Chimwemwe','Fatsani','Kondwani','Mwayi','Takondwa','Tusekile','Dalo','Chifuniro','Mpho','Zikomo','Thoko'];
  v_last             text[] := array['Banda','Phiri','Moyo','Kachale','Tembo','Nkhoma','Soko','Chirwa','Zimba','Mpakati','Kumwenda','Nyirenda','Kamanga','Mvula','Gondwe','Msowoya','Mhango','Kaunda','Kaliati','Mbewe'];
  v_all_districts    text[] := array['balaka','blantyre','chikwawa','chiradzulu','chitipa','dedza','dowa','karonga','kasungu','likoma','lilongwe','machinga','mangochi','mchinji','mulanje','mwanza','mzimba','neno','nkhata_bay','nkhotakota','nsanje','ntcheu','ntchisi','phalombe','rumphi','salima','thyolo','zomba'];
  v_bulk_districts   text[] := array['balaka','chikwawa','chiradzulu','chitipa','dedza','dowa','karonga','kasungu','machinga','mangochi','mchinji','mulanje','mwanza','mzimba','neno','nkhata_bay','nkhotakota','nsanje','ntcheu','ntchisi','phalombe','salima','thyolo','zomba'];
  v_br_lw_central    uuid;
  v_br_lw_traffic    uuid;
  v_br_bt_central    uuid;
  v_br_bt_traffic    uuid;
  v_br_rumphi        uuid;
  v_br_likoma        uuid;
  v_org_court_bt     uuid;
  v_org_court_ll     uuid;
  v_org_ins_nico     uuid;
  v_org_ins_om       uuid;
  v_org_rtd          uuid;
  v_org_mra          uuid;
begin
  -- ── A. Anchor branches (6) ──────────────────────────────────────────
  insert into public.branches (id, name, domain, district, location, contact_phone) values
    (gen_random_uuid(), 'Lilongwe Central', 'regular', 'lilongwe', 'City Centre', '+265991000011'),
    (gen_random_uuid(), 'Lilongwe Traffic', 'traffic', 'lilongwe', 'Area 3 Depot', '+265991000022'),
    (gen_random_uuid(), 'Blantyre Central', 'regular', 'blantyre', 'Victoria Avenue', '+265991000033'),
    (gen_random_uuid(), 'Blantyre Traffic', 'traffic', 'blantyre', 'Ginnery Corner', '+265991000034'),
    (gen_random_uuid(), 'Rumphi Central', 'regular', 'rumphi', 'Rumphi town', '+265991000044'),
    (gen_random_uuid(), 'Likoma Central', 'regular', 'likoma', 'Likoma town', '+265991000045');
  select id into v_br_lw_central  from public.branches where name = 'Lilongwe Central';
  select id into v_br_lw_traffic  from public.branches where name = 'Lilongwe Traffic';
  select id into v_br_bt_central  from public.branches where name = 'Blantyre Central';
  select id into v_br_bt_traffic  from public.branches where name = 'Blantyre Traffic';
  select id into v_br_rumphi      from public.branches where name = 'Rumphi Central';
  select id into v_br_likoma      from public.branches where name = 'Likoma Central';

  -- ── B. Bulk branches: 2 per remaining district (24 districts → 48) ──
  for v_i in 1..array_length(v_bulk_districts, 1) loop
    v_district := v_bulk_districts[v_i];
    insert into public.branches (id, name, domain, district, location, contact_phone)
    values
      (gen_random_uuid(), initcap(v_district) || ' Central', 'regular', v_district::district,
       initcap(v_district) || ' town', '+26599' || lpad((300000 + v_seq)::text, 7, '0')),
      (gen_random_uuid(), initcap(v_district) || ' Traffic', 'traffic', v_district::district,
       initcap(v_district) || ' depot', '+26599' || lpad((301000 + v_seq)::text, 7, '0'));
    v_seq := v_seq + 1;
  end loop;

  -- ── C. Organizations (6) ────────────────────────────────────────────
  insert into public.organizations (id, name, org_type, district, contact_phone, contact_email) values
    (gen_random_uuid(), 'Blantyre Magistrate Court', 'court', 'blantyre', '+265991000101', 'registry@blantyre-court.mw'),
    (gen_random_uuid(), 'Lilongwe Magistrate Court', 'court', 'lilongwe', '+265991000104', 'registry@lilongwe-court.mw'),
    (gen_random_uuid(), 'NICO General', 'insurer', null, '+265991000102', 'motor@nico.mw'),
    (gen_random_uuid(), 'Old Mutual', 'insurer', null, '+265991000105', 'motor@oldmutual.mw'),
    (gen_random_uuid(), 'Directorate of Road Traffic', 'vehicle_registry', null, '+265991000103', 'registry@rtd.mw'),
    (gen_random_uuid(), 'Malawi Revenue Authority', 'revenue_authority', null, '+265991000106', 'motoring@mra.mw');
  select id into v_org_court_bt from public.organizations where name = 'Blantyre Magistrate Court';
  select id into v_org_court_ll from public.organizations where name = 'Lilongwe Magistrate Court';
  select id into v_org_ins_nico from public.organizations where name = 'NICO General';
  select id into v_org_ins_om   from public.organizations where name = 'Old Mutual';
  select id into v_org_rtd      from public.organizations where name = 'Directorate of Road Traffic';
  select id into v_org_mra      from public.organizations where name = 'Malawi Revenue Authority';

  -- ── D. Anchor users: one login per role, sequential stable phones ───
  insert into public.users
    (id, name, email, email_verified, phone_number, phone_number_verified,
     badge_number, role, domain, branch_id, district, organization_id, is_active)
  values
    (gen_random_uuid()::text, 'Tamanda Chirwa', 'tamanda.chirwa.admin@trace.mw', false, '+265997000001', true,
     null, 'system_admin', null, null, null, null, true),
    (gen_random_uuid()::text, 'Mphatso Zimba', 'mphatso.zimba.audit@trace.mw', false, '+265997000002', true,
     null, 'compliance_auditor', null, null, null, null, true),
    (gen_random_uuid()::text, 'Chikondi Banda', 'chikondi.banda@trace.mw', false, '+265997000003', true,
     'MPS-2021-0042', 'officer', 'regular', v_br_lw_central, null, null, true),
    (gen_random_uuid()::text, 'Dalitso Moyo', 'dalitso.moyo@trace.mw', false, '+265997000004', true,
     'MPT-2022-0117', 'officer', 'traffic', v_br_lw_traffic, null, null, true),
    (gen_random_uuid()::text, 'Grace Kachale', 'grace.kachale@trace.mw', false, '+265997000005', true,
     'MPS-2015-0009', 'district_monitor', 'regular', null, 'lilongwe', null, true),
    (gen_random_uuid()::text, 'Yohane Tembo', 'yohane.tembo@trace.mw', false, '+265997000006', true,
     'MPT-2012-0033', 'country_monitor', 'traffic', null, null, null, true),
    (gen_random_uuid()::text, 'Annie Mpakati', 'annie.mpakati@trace.mw', false, '+265997000007', true,
     null, 'court_liaison', null, null, null, v_org_court_bt, true),
    (gen_random_uuid()::text, 'Blessings Nkhoma', 'blessings.nkhoma@trace.mw', false, '+265997000008', true,
     null, 'insurance_portal_user', null, null, null, v_org_ins_nico, true),
    (gen_random_uuid()::text, 'Peter Soko', 'peter.soko@trace.mw', false, '+265997000009', true,
     null, 'vehicle_registrar', null, null, null, v_org_rtd, true),
    (gen_random_uuid()::text, 'Wanangwa Chirwa', 'wanangwa.chirwa@trace.mw', false, '+265997000010', true,
     'MPS-2023-0208', 'officer', 'regular', v_br_bt_central, null, null, true),
    (gen_random_uuid()::text, 'Chrissie Manda', 'chrissie.manda@trace.mw', false, '+265997000011', true,
     'MPT-2018-0061', 'district_monitor', 'traffic', null, 'lilongwe', null, true),
    (gen_random_uuid()::text, 'Francis Dube', 'francis.dube@trace.mw', false, '+265997000012', true,
     'MPS-2010-0004', 'country_monitor', 'regular', null, null, null, true),
    (gen_random_uuid()::text, 'Zione Maloya', 'zione.maloya@trace.mw', false, '+265997000013', true,
     null, 'court_liaison', null, null, null, v_org_court_ll, true),
    (gen_random_uuid()::text, 'Happy Mhone', 'happy.mhone@trace.mw', false, '+265997000014', true,
     null, 'insurance_portal_user', null, null, null, v_org_ins_om, true),
    (gen_random_uuid()::text, 'Chifundo Loka', 'chifundo.loka@trace.mw', false, '+265997000015', true,
     'MPS-2024-0310', 'officer', 'regular', v_br_lw_central, null, null, false),
    (gen_random_uuid()::text, 'Tawonga Ngwira', 'tawonga.ngwira@trace.mw', false, '+265997000016', true,
     'MPS-2023-0144', 'officer', 'regular', v_br_rumphi, null, null, true),
    (gen_random_uuid()::text, 'Thoko Chavula', 'thoko.chavula@trace.mw', false, '+265997000017', true,
     'MPS-2023-0152', 'officer', 'regular', v_br_likoma, null, null, true),
    -- Every branch needs ≥1 active officer or random case filing fails
    -- on reported_by NOT NULL.
    (gen_random_uuid()::text, 'Yankho Phiri', 'yankho.phiri@trace.mw', false, '+265997000018', true,
     'MPT-2023-0220', 'officer', 'traffic', v_br_bt_traffic, null, null, true),
    -- Revenue authority: 2 assessing officers + 1 compliance approver.
    (gen_random_uuid()::text, 'Chrispin Banda', 'chrispin.banda@trace.mw', false, '+265997000019', true,
     null, 'tax_officer', null, null, null, v_org_mra, true),
    (gen_random_uuid()::text, 'Esther Mvula', 'esther.mvula@trace.mw', false, '+265997000020', true,
     null, 'tax_officer', null, null, null, v_org_mra, true),
    (gen_random_uuid()::text, 'Lovemore Nyirenda', 'lovemore.nyirenda@trace.mw', false, '+265997000021', true,
     null, 'tax_compliance_officer', null, null, null, v_org_mra, true);

  -- ── E. Bulk officers: 2 per bulk branch ─────────────────────────────
  for v_branch, v_branch_district, v_domain in
    select b.id, b.district::text, b.domain::text
      from public.branches b
     where b.name not in ('Lilongwe Central','Lilongwe Traffic','Blantyre Central',
                          'Blantyre Traffic','Rumphi Central','Likoma Central')
  loop
    for v_n in 1..2 loop
      v_full := pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last);
      v_phone := '+26599' || lpad((710000 + v_seq)::text, 7, '0');
      v_email := lower(replace(v_full, ' ', '.')) || v_seq || '@trace.mw';
      insert into public.users
        (id, name, email, email_verified, phone_number, phone_number_verified,
         badge_number, role, domain, branch_id, district, organization_id, is_active)
      values
        (gen_random_uuid()::text, v_full, v_email, false, v_phone, true,
         (case when v_domain = 'regular' then 'MPS-G-' else 'MPT-G-' end) || (1000 + v_seq),
         'officer', v_domain::domain, v_branch, null, null, true);
      v_seq := v_seq + 1;
    end loop;
  end loop;

  -- ── F. Bulk monitors: 1 regular district monitor per bulk district ──
  for v_i in 1..array_length(v_bulk_districts, 1) loop
    v_district := v_bulk_districts[v_i];
    v_full := pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last);
    v_phone := '+26599' || lpad((710000 + v_seq)::text, 7, '0');
    insert into public.users
      (id, name, email, email_verified, phone_number, phone_number_verified,
       badge_number, role, domain, branch_id, district, organization_id, is_active)
    values
      (gen_random_uuid()::text, v_full,
       lower(replace(v_full, ' ', '.')) || v_seq || '@trace.mw',
       false, v_phone, true,
       'MPS-G-' || (1000 + v_seq), 'district_monitor', 'regular', null,
       v_district::district, null, true);
    v_seq := v_seq + 1;
  end loop;

  raise notice 'seed/01 foundation: % branches, 6 orgs, % users.',
    (select count(*) from public.branches), (select count(*) from public.users);
end $$;

commit;
