-- ============================================================================
-- TRACE — DEVELOPMENT SEED DATA (fresh database)
-- ----------------------------------------------------------------------------
-- Run AFTER the Drizzle migration + db/sql/Functions&Policies.sql:
--
--   psql "$DATABASE_URL" -v TRACE_SEED_OK=1 -f "db/sql/Seed.sql"
--
-- On a dirty database, start clean:
--
--   psql "$DATABASE_URL" -v TRACE_RESET_OK=1 -f "db/sql/Reset-dev.sql"
--   <run the Drizzle migration>
--   psql "$DATABASE_URL" -f "db/sql/Functions&Policies.sql"
--   psql "$DATABASE_URL" -v TRACE_SEED_OK=1 -f "db/sql/Seed.sql"
--
-- The TRACE_SEED_OK flag is a production guard: without it the script
-- refuses to run. NEVER seed a production database.
--
-- Design:
--   * NO fixed UUIDs — every id comes from gen_random_uuid(). Relationships
--     are wired with plpgsql variables inside the run.
--   * Deterministic randomness: setseed() makes random() reproducible, so
--     every run yields the same dataset (debuggable, diffable).
--   * Stable natural keys (the hand-test handles): sequential login phones
--     per role, per-district plate prefixes, sequential policy/receipt
--     numbers. A RAISE NOTICE summary at the end prints the demo script.
--   * Volume knobs (v_case_count etc.) tune size without touching logic.
--   * All 28 districts get branches + officers; Rumphi (2 cases) and Likoma
--     (3 cases) stay micro for the <5 suppression demos.
--   * One scenario pack per feature: fine ledger (paid/part/unpaid +
--     court dates), e-Brief (tranches + viewed + outcome), tasking
--     (open/overdue/done/cancelled), GPS pins, PDF + video attachments,
--     merge candidates, revocation/expiry fixtures, org isolation.
--   * The seeded machine key below is DEV-ONLY (plaintext shown in the
--     summary). Never seed production; rotate before any shared staging.
--
-- Demo logins (phones — OTP sign-in, no passwords):
--   sysadmin +265997000001 · auditor +265997000002
--   regular officer +265997000003 · traffic officer +265997000004
--   district monitor +265997000005 · country monitor (traffic) +265997000006
--   court liaison +265997000007 · insurer +265997000008 · registrar +265997000009
--   Blantyre traffic officer +265997000018
-- Demo key (plate:read, traffic officer): trace_seed_demo_anpr_001
-- Demo plates: LL 4242 (3 citations, mixed payment), flagged plates TBA in
-- the end-of-run summary.
-- ============================================================================

begin;

\if :{?TRACE_SEED_OK}
\else
\echo 'Refusing to seed: re-run with -v TRACE_SEED_OK=1. Never seed production.'
\quit 1
\endif

-- Legacy cleanup: drop every table / enum left by the previous (medical
-- records) app so a dirty database can't contaminate the TRACE seed.
-- Only objects ABSENT from the new schema are dropped here; shared enums
-- and drizzle-managed tables stay for the migration, which alters them.
-- (The trigger drop is guarded: DROP TRIGGER errors when the table itself
-- is missing, e.g. right after Reset-dev.sql already cleaned it.)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.medical_records') is not null then
    drop trigger if exists medical_records_populate_facts on public.medical_records;
  end if;
end $$;
drop table if exists
  public.medical_records,
  public.diagnoses,
  public.prescriptions,
  public.immunizations,
  public.immunization_schedule,
  public.diagnosis_codes,
  public.medication_codes,
  public.immunization_codes,
  public.standard_treatment_guidelines,
  public.hospitals,
  public.access_grants;
drop type if exists
  route,
  urgency,
  triage_level,
  diagnosis_threat_level,
  access_action_type;

truncate public.actions,
  public.notifications,
  public.idempotency_keys,
  public.api_keys,
  public.case_reviews,
  public.case_assignments,
  public.court_case_access,
  public.referral_documents,
  public.missing_person_cases,
  public.wanted_person_cases,
  public.vehicle_cases,
  public.accidents,
  public.accident_vehicles,
  public.traffic_citations,
  public.citation_payments,
  public.record_attachments,
  public.insurance_policies,
  public.records,
  public.vehicles,
  public.persons_of_interest,
  public.users,
  public.branches,
  public.organizations cascade;

create extension if not exists pgcrypto;

-- Deterministic RNG: same dataset on every run (change the seed to reshuffle).
select setseed(0.20260918);

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  -- ── volume knobs ──────────────────────────────────────────────────────
  v_case_count       integer := 1000;
  v_person_count     integer := 250;
  v_vehicle_count    integer := 350;
  v_policy_count     integer := 120;
  v_referral_count   integer := 25;
  v_review_count     integer := 80;
  v_assign_count     integer := 30;
  v_audit_count      integer := 150;

  v_seq              integer := 1;
  v_first            text[] := array['Chikondi','Dalitso','Tadala','Mphatso','Wongani','Tiwonge','Yamikani','Chisomo','Madalitso','Alinafe','Pemphero','Limbani','Tamanda','Chimwemwe','Fatsani','Kondwani','Mwayi','Takondwa','Tusekile','Dalo','Chifuniro','Mpho','Zikomo','Thoko'];
  v_last             text[] := array['Banda','Phiri','Moyo','Kachale','Tembo','Nkhoma','Soko','Chirwa','Zimba','Mpakati','Kumwenda','Nyirenda','Kamanga','Mvula','Gondwe','Msowoya','Mhango','Kaunda','Kaliati','Mbewe'];
  v_all_districts    text[] := array['balaka','blantyre','chikwawa','chiradzulu','chitipa','dedza','dowa','karonga','kasungu','likoma','lilongwe','machinga','mangochi','mchinji','mulanje','mwanza','mzimba','neno','nkhata_bay','nkhotakota','nsanje','ntcheu','ntchisi','phalombe','rumphi','salima','thyolo','zomba'];
  v_bulk_districts   text[] := array['balaka','blantyre','chikwawa','chiradzulu','chitipa','dedza','dowa','karonga','kasungu','lilongwe','machinga','mangochi','mchinji','mulanje','mwanza','mzimba','neno','nkhata_bay','nkhotakota','nsanje','ntcheu','ntchisi','phalombe','salima','thyolo','zomba'];
  v_prefix           jsonb  := '{"balaka":"BA","blantyre":"BT","chikwawa":"CK","chiradzulu":"CZ","chitipa":"CT","dedza":"DZ","dowa":"DW","karonga":"KR","kasungu":"KS","likoma":"LK","lilongwe":"LL","machinga":"MC","mangochi":"MG","mchinji":"MJ","mulanje":"MU","mwanza":"MW","mzimba":"MZ","neno":"NN","nkhata_bay":"NB","nkhotakota":"NK","nsanje":"NS","ntcheu":"NU","ntchisi":"NI","phalombe":"PB","rumphi":"RU","salima":"SM","thyolo":"TH","zomba":"ZA"}';

  -- ── anchor ids (random, captured via RETURNING — no fixed UUIDs) ──────
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
  v_sysadmin         text;
  v_auditor          text;
  v_officer_regular  text;
  v_officer_traffic  text;
  v_monitor_district text;
  v_monitor_country  text;
  v_liaison          text;
  v_liaison_two      text;
  v_insurer          text;
  v_insurer_two      text;
  v_registrar        text;
  v_officer_rumphi   text;

  v_district       text;
  v_domain         text;
  v_branch         uuid;
  v_branch_district text;
  v_officer        text;
  v_person         uuid;
  v_vehicle        uuid;
  v_record         uuid;
  v_grant          uuid;
  v_accident       uuid;
  v_full           text;
  v_plate          text;
  v_nid            text;
  v_last_nid       text;
  v_phone          text;
  v_email          text;
  v_type           text;
  v_status         text;
  v_level          text;
  v_lat            float;
  v_lng            float;
  v_base_lat       float;
  v_base_lng       float;
  v_data           jsonb;
  v_rdate          date;
  v_r              float;
  v_i              integer;
  v_n              integer;
  v_note           text;
  v_fine           integer;
  v_paid           integer;
begin
  -- ════════════════════════════════════════════════════════════════════════
  -- A. ANCHORS — branches, orgs, and one login per role (sequential phones)
  -- ════════════════════════════════════════════════════════════════════════
  insert into public.branches (id, name, domain, district, location, contact_phone) values
    (gen_random_uuid(), 'Lilongwe Central', 'regular', 'lilongwe', 'City Centre', '+265991000011'),
    (gen_random_uuid(), 'Lilongwe Traffic', 'traffic', 'lilongwe', 'Area 3 Depot', '+265991000022'),
    (gen_random_uuid(), 'Blantyre Central', 'regular', 'blantyre', 'Victoria Avenue', '+265991000033'),
    (gen_random_uuid(), 'Blantyre Traffic', 'traffic', 'blantyre', 'Ginnery Corner', '+265991000034'),
    (gen_random_uuid(), 'Rumphi Central', 'regular', 'rumphi', 'Rumphi town', '+265991000044'),
    (gen_random_uuid(), 'Likoma Central', 'regular', 'likoma', 'Likoma town', '+265991000045');
  -- Multi-row INSERT … RETURNING INTO only captures one row, so fetch each
  -- anchor id by its stable name instead (no fixed UUIDs anywhere).
  select id into v_br_lw_central  from public.branches where name = 'Lilongwe Central';
  select id into v_br_lw_traffic  from public.branches where name = 'Lilongwe Traffic';
  select id into v_br_bt_central  from public.branches where name = 'Blantyre Central';
  select id into v_br_bt_traffic  from public.branches where name = 'Blantyre Traffic';
  select id into v_br_rumphi      from public.branches where name = 'Rumphi Central';
  select id into v_br_likoma      from public.branches where name = 'Likoma Central';

  insert into public.organizations (id, name, org_type, district, contact_phone, contact_email) values
    (gen_random_uuid(), 'Blantyre Magistrate Court', 'court', 'blantyre', '+265991000101', 'registry@blantyre-court.mw'),
    (gen_random_uuid(), 'Lilongwe Magistrate Court', 'court', 'lilongwe', '+265991000104', 'registry@lilongwe-court.mw'),
    (gen_random_uuid(), 'NICO General', 'insurer', null, '+265991000102', 'motor@nico.mw'),
    (gen_random_uuid(), 'Old Mutual', 'insurer', null, '+265991000105', 'motor@oldmutual.mw'),
    (gen_random_uuid(), 'Directorate of Road Traffic', 'vehicle_registry', null, '+265991000103', 'registry@rtd.mw');
  select id into v_org_court_bt from public.organizations where name = 'Blantyre Magistrate Court';
  select id into v_org_court_ll from public.organizations where name = 'Lilongwe Magistrate Court';
  select id into v_org_ins_nico from public.organizations where name = 'NICO General';
  select id into v_org_ins_om   from public.organizations where name = 'Old Mutual';
  select id into v_org_rtd      from public.organizations where name = 'Directorate of Road Traffic';

  -- One login per role (+ isolation secondaries + micro-district officers).
  -- Phones are the stable handles: +265997000001 … +265997000018.
  insert into public.users
    (id, name, email, email_verified, phone_number, phone_number_verified,
     badge_number, role, domain, branch_id, district, organization_id, is_active)
  values
    (gen_random_uuid(), 'Tamanda Chirwa', 'tamanda.chirwa.admin@trace.mw', false, '+265997000001', true,
     null, 'system_admin', null, null, null, null, true),
    (gen_random_uuid(), 'Mphatso Zimba', 'mphatso.zimba.audit@trace.mw', false, '+265997000002', true,
     null, 'compliance_auditor', null, null, null, null, true),
    (gen_random_uuid(), 'Chikondi Banda', 'chikondi.banda@trace.mw', false, '+265997000003', true,
     'MPS-2021-0042', 'officer', 'regular', v_br_lw_central, null, null, true),
    (gen_random_uuid(), 'Dalitso Moyo', 'dalitso.moyo@trace.mw', false, '+265997000004', true,
     'MPT-2022-0117', 'officer', 'traffic', v_br_lw_traffic, null, null, true),
    (gen_random_uuid(), 'Grace Kachale', 'grace.kachale@trace.mw', false, '+265997000005', true,
     'MPS-2015-0009', 'district_monitor', 'regular', null, 'lilongwe', null, true),
    (gen_random_uuid(), 'Yohane Tembo', 'yohane.tembo@trace.mw', false, '+265997000006', true,
     'MPT-2012-0033', 'country_monitor', 'traffic', null, null, null, true),
    (gen_random_uuid(), 'Annie Mpakati', 'annie.mpakati@trace.mw', false, '+265997000007', true,
     null, 'court_liaison', null, null, null, v_org_court_bt, true),
    (gen_random_uuid(), 'Blessings Nkhoma', 'blessings.nkhoma@trace.mw', false, '+265997000008', true,
     null, 'insurance_portal_user', null, null, null, v_org_ins_nico, true),
    (gen_random_uuid(), 'Peter Soko', 'peter.soko@trace.mw', false, '+265997000009', true,
     null, 'vehicle_registrar', null, null, null, v_org_rtd, true),
    (gen_random_uuid(), 'Wanangwa Chirwa', 'wanangwa.chirwa@trace.mw', false, '+265997000010', true,
     'MPS-2023-0208', 'officer', 'regular', v_br_bt_central, null, null, true),
    (gen_random_uuid(), 'Chrissie Manda', 'chrissie.manda@trace.mw', false, '+265997000011', true,
     'MPT-2018-0061', 'district_monitor', 'traffic', null, 'lilongwe', null, true),
    (gen_random_uuid(), 'Francis Dube', 'francis.dube@trace.mw', false, '+265997000012', true,
     'MPS-2010-0004', 'country_monitor', 'regular', null, null, null, true),
    (gen_random_uuid(), 'Zione Maloya', 'zione.maloya@trace.mw', false, '+265997000013', true,
     null, 'court_liaison', null, null, null, v_org_court_ll, true),
    (gen_random_uuid(), 'Happy Mhone', 'happy.mhone@trace.mw', false, '+265997000014', true,
     null, 'insurance_portal_user', null, null, null, v_org_ins_om, true),
    (gen_random_uuid(), 'Chifundo Loka', 'chifundo.loka@trace.mw', false, '+265997000015', true,
     'MPS-2024-0310', 'officer', 'regular', v_br_lw_central, null, null, false),
    (gen_random_uuid(), 'Tawonga Ngwira', 'tawonga.ngwira@trace.mw', false, '+265997000016', true,
     'MPS-2023-0144', 'officer', 'regular', v_br_rumphi, null, null, true),
    (gen_random_uuid(), 'Thoko Chavula', 'thoko.chavula@trace.mw', false, '+265997000017', true,
     'MPS-2023-0152', 'officer', 'regular', v_br_likoma, null, null, true),
    -- Every branch needs at least one active officer: without this row,
    -- random cases filed under Blantyre Traffic find no reporter and the
    -- insert fails on reported_by NOT NULL.
    (gen_random_uuid(), 'Yankho Phiri', 'yankho.phiri@trace.mw', false, '+265997000018', true,
     'MPT-2023-0220', 'officer', 'traffic', v_br_bt_traffic, null, null, true);
  select id into v_sysadmin         from public.users where phone_number = '+265997000001';
  select id into v_auditor          from public.users where phone_number = '+265997000002';
  select id into v_officer_regular  from public.users where phone_number = '+265997000003';
  select id into v_officer_traffic  from public.users where phone_number = '+265997000004';
  select id into v_monitor_district from public.users where phone_number = '+265997000005';
  select id into v_monitor_country  from public.users where phone_number = '+265997000006';
  select id into v_liaison          from public.users where phone_number = '+265997000007';
  select id into v_insurer          from public.users where phone_number = '+265997000008';
  select id into v_registrar        from public.users where phone_number = '+265997000009';
  select id into v_liaison_two      from public.users where phone_number = '+265997000013';
  select id into v_insurer_two      from public.users where phone_number = '+265997000014';
  select id into v_officer_rumphi   from public.users where phone_number = '+265997000016';

  -- ════════════════════════════════════════════════════════════════════════
  -- B. BULK SCAFFOLD — all 28 districts: branches, officers, monitors
  -- (Rumphi/Likoma keep only their anchor branch for the suppression demos)
  -- ════════════════════════════════════════════════════════════════════════
  for v_i in 1..array_length(v_all_districts, 1) loop
    v_district := v_all_districts[v_i];
    if v_district in ('lilongwe','blantyre','rumphi','likoma') then continue; end if;
    insert into public.branches (id, name, domain, district, location, contact_phone)
    values
      (gen_random_uuid(), initcap(v_district) || ' Central', 'regular', v_district::district,
       initcap(v_district) || ' town', '+26599' || lpad((300000 + v_seq)::text, 7, '0')),
      (gen_random_uuid(), initcap(v_district) || ' Traffic', 'traffic', v_district::district,
       initcap(v_district) || ' depot', '+26599' || lpad((301000 + v_seq)::text, 7, '0'));
    v_seq := v_seq + 1;
  end loop;

  -- 2 officers per bulk branch.
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
        ('gen_user_' || v_seq, v_full, v_email, false, v_phone, true,
         (case when v_domain = 'regular' then 'MPS-G-' else 'MPT-G-' end) || (1000 + v_seq),
         'officer', v_domain::domain, v_branch, null, null, true);
      v_seq := v_seq + 1;
    end loop;
  end loop;

  -- 1 regular district monitor per bulk district.
  for v_i in 1..array_length(v_bulk_districts, 1) loop
    v_district := v_bulk_districts[v_i];
    if v_district in ('lilongwe','blantyre') then continue; end if;
    v_full := pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last);
    v_phone := '+26599' || lpad((710000 + v_seq)::text, 7, '0');
    insert into public.users
      (id, name, email, email_verified, phone_number, phone_number_verified,
       badge_number, role, domain, branch_id, district, organization_id, is_active)
    values
      ('gen_monitor_' || v_seq, v_full,
       lower(replace(v_full, ' ', '.')) || v_seq || '@trace.mw',
       false, v_phone, true,
       'MPS-G-' || (1000 + v_seq), 'district_monitor', 'regular', null,
       v_district::district, null, true);
    v_seq := v_seq + 1;
  end loop;

  -- ════════════════════════════════════════════════════════════════════════
  -- C. PERSONS (duplicates every 10th → merge-queue depth) + VEHICLES
  -- ════════════════════════════════════════════════════════════════════════
  v_last_nid := null;
  for v_i in 1..v_person_count loop
    v_full := pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last);
    if v_i % 10 = 0 and v_last_nid is not null then
      v_nid := v_last_nid; -- staged duplicate pair
    else
      v_nid := case when v_i % 4 = 0 then null else 'MW-P-' || (300000 + v_seq) end;
      if v_nid is not null then v_last_nid := v_nid; end if;
    end if;
    insert into public.persons_of_interest
      (id, full_name, national_id, sex, home_district, distinguishing_features)
    values
      (gen_random_uuid(), v_full, v_nid,
       pg_temp.pick(array['male','female','male','female'])::sex,
       pg_temp.pick(v_all_districts)::district,
       case when v_i % 3 = 0 then pg_temp.pick(array['Scar on left cheek','Tattoo on right forearm','Limp in left leg','Birthmark on neck']) end);
    v_seq := v_seq + 1;
  end loop;

  for v_i in 1..v_vehicle_count loop
    v_district := pg_temp.pick(v_bulk_districts);
    v_plate := (v_prefix ->> v_district) || ' ' || (1000 + v_seq);
    insert into public.vehicles
      (id, plate_number, make, model, color, owner_name, owner_national_id,
       is_flagged, is_verified, registered_by, verified_at)
    values
      (gen_random_uuid(), v_plate,
       pg_temp.pick(array['Toyota','Nissan','Honda','Mazda','Mitsubishi','Ford','VW']),
       pg_temp.pick(array['Corolla','Navara','Fit','Demio','Pajero','Ranger','Golf']),
       pg_temp.pick(array['Silver','White','Black','Blue','Red','Grey']),
       case when v_i % 3 = 0 then pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last) end,
       case when v_i % 3 = 0 then 'MW-P-' || (300000 + v_seq) end,
       false,
       v_i % 4 = 0,
       case when v_i % 4 = 0 then v_registrar end,
       case when v_i % 4 = 0 then now() - ((v_seq % 90) || ' days')::interval end);
    v_seq := v_seq + 1;
  end loop;

  -- ════════════════════════════════════════════════════════════════════════
  -- D. CASES — weighted types, (v_i % 84) spreads filings over 12 weeks so
  --    trend charts are never empty; ~30% of location records get GPS pins.
  -- ════════════════════════════════════════════════════════════════════════
  for v_i in 1..v_case_count loop
    v_type := pg_temp.pick(array['missing_person','missing_person',
      'wanted_person','stolen_property','stolen_property',
      'crime_incident','crime_incident','crime_incident',
      'arrest_record','missing_vehicle','missing_vehicle',
      'vehicle_offense','vehicle_offense','vehicle_offense',
      'road_accident','traffic_citation','traffic_citation','traffic_citation','traffic_citation',
      'vehicle_impoundment']);
    v_domain := case when v_type in ('missing_vehicle','vehicle_offense','road_accident','traffic_citation','vehicle_impoundment')
                     then 'traffic' else 'regular' end;
    select b.id, b.district::text into v_branch, v_branch_district
      from public.branches b
     where b.domain::text = v_domain
       and b.district::text <> all (array['rumphi','likoma'])
     order by random() limit 1;
    select u.id into v_officer
      from public.users u
     where u.branch_id = v_branch and u.role = 'officer' and u.is_active
     order by random() limit 1;
    -- Defensive: a branch with no active officer must skip, never file
    -- with a null reporter (reported_by is NOT NULL).
    continue when v_officer is null;
    v_r := random();
    v_status := case when v_r < 0.55 then 'active' when v_r < 0.78 then 'resolved'
                     when v_r < 0.92 then 'closed' else 'archived' end;
    v_r := random();
    v_level := case when v_type = 'wanted_person' and v_r < 0.7 then 'country'
                    when v_r < 0.55 then 'branch' when v_r < 0.80 then 'district'
                    else 'country' end;
    v_rdate := (current_date - (v_i % 84))::date;
    v_person := null; v_vehicle := null; v_data := '{}';

    -- GPS pin base: Lilongwe / Blantyre with jitter.
    if v_branch_district = 'blantyre' then
      v_base_lat := -15.7875; v_base_lng := 35.0058;
    else
      v_base_lat := -13.9833; v_base_lng := 33.7833;
    end if;
    if random() < 0.3 and v_type <> 'wanted_person' then
      v_lat := round((v_base_lat + (random() - 0.5) * 0.2)::numeric, 5);
      v_lng := round((v_base_lng + (random() - 0.5) * 0.2)::numeric, 5);
    else
      v_lat := null; v_lng := null;
    end if;

    if v_type in ('missing_person','wanted_person','arrest_record') then
      select p.id into v_person from public.persons_of_interest p order by random() limit 1;
    end if;
    if v_type in ('missing_vehicle','vehicle_offense','traffic_citation','vehicle_impoundment') then
      if random() < 0.25 then -- brand-new ad-hoc plate
        v_plate := (v_prefix ->> v_branch_district) || ' ' || (9000 + v_seq);
        insert into public.vehicles (id, plate_number)
        values (gen_random_uuid(), v_plate) returning id into v_vehicle;
      else
        select v.id into v_vehicle from public.vehicles v order by random() limit 1;
      end if;
      select plate_number into v_plate from public.vehicles where id = v_vehicle;
    end if;

    select full_name, national_id into v_full, v_nid
      from public.persons_of_interest where id = v_person;
    if not found then
      v_full := pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last);
      v_nid := null;
    end if;

    case v_type
      when 'missing_person' then v_data := jsonb_build_object(
        'person_id', v_person, 'full_name', coalesce(v_full, 'Unknown'),
        'national_id', v_nid, 'age', 10 + floor(random() * 50),
        'sex', pg_temp.pick(array['male','female']),
        'last_seen_location', pg_temp.pick(array['Market','Bus depot','School grounds','Trading centre','Riverbank']) || ', ' || initcap(v_branch_district),
        'last_seen_date', to_char(v_rdate, 'YYYY-MM-DD'),
        'reporter_name', pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last),
        'reporter_relationship', pg_temp.pick(array['Parent','Sibling','Spouse','Guardian','Friend']),
        'reporter_contact', '+26599' || lpad((400000 + v_seq)::text, 7, '0'));
      when 'wanted_person' then v_data := jsonb_build_object(
        'person_id', v_person, 'full_name', coalesce(v_full, 'Unknown'),
        'national_id', v_nid,
        'offense', pg_temp.pick(array['Armed robbery','Burglary','Fraud','Assault','Cattle theft','Drug trafficking']),
        'danger_level', pg_temp.pick(array['low','medium','high','extreme']),
        'last_known_location', initcap(v_branch_district) || ' township',
        'description', 'Wanted for questioning.');
      when 'stolen_property' then v_data := jsonb_build_object(
        'item_description', pg_temp.pick(array['Laptop','Smartphone','Bicycle','Generator','TV set','Motorbike']),
        'category', pg_temp.pick(array['Electronics','Vehicle','Household','Machinery']),
        'location_stolen', initcap(v_branch_district) || ' market',
        'date_stolen', to_char(v_rdate, 'YYYY-MM-DD'),
        'owner_name', pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last),
        'owner_contact', '+26599' || lpad((400000 + v_seq)::text, 7, '0'));
      when 'crime_incident' then v_data := jsonb_build_object(
        'incident_type', pg_temp.pick(array['Burglary','Assault','Fraud','Vandalism','Robbery']),
        'description', 'Incident under investigation.',
        'location', initcap(v_branch_district) || ', Area ' || (1 + floor(random() * 50))::int,
        'date_occurred', to_char(v_rdate, 'YYYY-MM-DD'),
        'victims', (select jsonb_agg(pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last))
                      from generate_series(1, 1 + floor(random() * 3)::int)),
        'witnesses', case when random() < 0.5 then jsonb_build_array(pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last)) else jsonb_build_array() end);
      when 'arrest_record' then v_data := jsonb_build_object(
        'person_id', v_person, 'full_name', coalesce(v_full, 'Unknown'),
        'national_id', v_nid,
        'charges', (select jsonb_agg(pg_temp.pick(array['Theft','Assault','Burglary','Fraud']))
                      from generate_series(1, 1 + floor(random() * 2)::int)),
        'arrest_location', initcap(v_branch_district) || ' roadblock',
        'arrest_date', to_char(v_rdate, 'YYYY-MM-DD'),
        'arresting_officer', 'Cst. ' || pg_temp.pick(v_last));
      when 'missing_vehicle' then v_data := jsonb_build_object(
        'plate_number', v_plate,
        'last_seen_location', initcap(v_branch_district) || ' filling station',
        'last_seen_date', to_char(v_rdate, 'YYYY-MM-DD'),
        'reporter_name', pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last),
        'reporter_contact', '+26599' || lpad((400000 + v_seq)::text, 7, '0'));
      when 'vehicle_offense' then v_data := jsonb_build_object(
        'plate_number', v_plate,
        'offense_type', pg_temp.pick(array['Speeding','No driving license','Overloading','Drunk driving','No insurance']),
        'description', 'Offense recorded at checkpoint.',
        'location', 'M1, ' || initcap(v_branch_district),
        'date_occurred', to_char(v_rdate, 'YYYY-MM-DD'));
      when 'road_accident' then v_data := jsonb_build_object(
        'location', 'Junction, ' || initcap(v_branch_district),
        'accident_date', to_char(v_rdate, 'YYYY-MM-DD'),
        'description', 'Collision under investigation.',
        'cause', pg_temp.pick(array['Speeding','Brake failure','Poor visibility','Drunk driving']),
        'vehicles_involved', (select jsonb_agg(jsonb_build_object('plate_number', x.plate_number, 'role', pg_temp.pick(array['at_fault','involved'])))
                                from (select plate_number from public.vehicles order by random() limit 1 + floor(random() * 3)::int) x),
        'fatalities', case when random() < 0.85 then 0 else 1 + floor(random() * 2)::int end,
        'injuries', floor(random() * 5)::int);
      when 'traffic_citation' then v_data := jsonb_build_object(
        'plate_number', v_plate,
        'driver_name', case when random() < 0.7 then pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last) end,
        'violation_type', pg_temp.pick(array['Speeding','Illegal parking','No seatbelt','Using phone while driving']),
        'fine_amount', (5000 + floor(random() * 10) * 5000)::int,
        'location', initcap(v_branch_district) || ' checkpoint',
        'date_issued', to_char(v_rdate, 'YYYY-MM-DD'));
      when 'vehicle_impoundment' then v_data := jsonb_build_object(
        'plate_number', v_plate,
        'reason', pg_temp.pick(array['No registration','Court order','Abandoned vehicle']),
        'impound_location', initcap(v_branch_district) || ' police yard',
        'impounded_date', to_char(v_rdate, 'YYYY-MM-DD'));
    end case;

    -- GPS pin (all location-bearing types except wanted_person).
    if v_lat is not null then
      v_data := v_data || jsonb_build_object('latitude', v_lat, 'longitude', v_lng);
    end if;

    v_record := gen_random_uuid();
    insert into public.records
      (id, record_type, domain, reported_by, branch_id, district,
       vehicle_id, person_id, access_level, status, data, created_at)
    values
      (v_record, v_type::record_type, v_domain::domain, v_officer, v_branch,
       v_branch_district::district, v_vehicle, v_person,
       v_level::access_level, v_status::case_status, v_data,
       v_rdate + (floor(random() * 12) || ' hours')::interval);

    -- coded projections mirror the app's writeCodedProjections()
    if v_type = 'missing_person' then
      insert into public.missing_person_cases
        (record_id, person_id, full_name, district, status)
      values (v_record, v_person, coalesce(v_full, 'Unknown'),
              v_branch_district::district, v_status::case_status);
    elsif v_type = 'wanted_person' then
      insert into public.wanted_person_cases
        (record_id, person_id, full_name, offense, danger_level, district, status)
      values (v_record, v_person, coalesce(v_full, 'Unknown'),
              v_data ->> 'offense', (v_data ->> 'danger_level')::danger_level,
              v_branch_district::district, v_status::case_status);
    elsif v_type in ('missing_vehicle','vehicle_offense','vehicle_impoundment') then
      insert into public.vehicle_cases
        (record_id, vehicle_id, case_type, plate_number, district, status)
      values (v_record, v_vehicle, v_type, v_plate,
              v_branch_district::district, v_status::case_status);
      if v_status = 'active' then
        update public.vehicles set is_flagged = true where id = v_vehicle;
      end if;
    elsif v_type = 'road_accident' then
      v_accident := gen_random_uuid();
      insert into public.accidents
        (id, record_id, accident_date, location, district,
         fatalities, injuries, status)
      values (v_accident, v_record, v_rdate,
              v_data ->> 'location', v_branch_district::district,
              (v_data ->> 'fatalities')::int, (v_data ->> 'injuries')::int,
              v_status::case_status);
      insert into public.accident_vehicles (accident_id, vehicle_id, role)
      select v_accident, v.id, 'involved' from public.vehicles v
       where v.plate_number in (select jsonb_array_elements(v_data -> 'vehicles_involved') ->> 'plate_number');
    elsif v_type = 'traffic_citation' then
      v_fine := (v_data ->> 'fine_amount')::int;
      v_paid := case when random() < 0.35 then v_fine
                     when random() < 0.6 then (v_fine * (0.2 + random() * 0.6))::int
                     else 0 end;
      insert into public.traffic_citations
        (record_id, vehicle_id, violation_type, fine_amount,
         is_paid, district)
      values (v_record, v_vehicle, v_data ->> 'violation_type',
              v_fine, v_paid >= v_fine,
              v_branch_district::district);
      if v_paid > 0 then
        insert into public.citation_payments
          (record_id, amount, receipt_no, received_by)
        values (v_record, v_paid, 'R-SEED-' || (70000 + v_seq), v_officer);
      end if;
      if random() < 0.3 then -- scheduled court appearance (F3 demo depth)
        update public.traffic_citations
           set court_date = (current_date + (1 + floor(random() * 30))::int),
               court_id = pg_temp.pick(array[v_org_court_bt, v_org_court_ll])
         where record_id = v_record;
      end if;
    end if;
    v_seq := v_seq + 1;
  end loop;

  -- ════════════════════════════════════════════════════════════════════════
  -- E. POLICIES (two insurers; expired + active mix exercises liveness)
  -- ════════════════════════════════════════════════════════════════════════
  for v_i in 1..v_policy_count loop
    select id into v_vehicle from public.vehicles order by random() limit 1;
    insert into public.insurance_policies
      (vehicle_id, insurer_id, policy_number, coverage_type,
       start_date, end_date, is_active, entered_by)
    values
      (v_vehicle,
       case when random() < 0.7 then v_org_ins_nico else v_org_ins_om end,
       'POL-2026-' || (60000 + v_seq),
       pg_temp.pick(array['third_party','comprehensive']),
       (now() - interval '200 days')::date,
       case when v_i % 2 = 0 then (now() - interval '10 days')::date
            else (now() + interval '165 days')::date end,
       true, case when random() < 0.7 then v_insurer else v_insurer_two end);
    v_seq := v_seq + 1;
  end loop;

  -- ════════════════════════════════════════════════════════════════════════
  -- F. REFERRALS (pending / viewed / decided / revoked / expiring) + tranches
  -- ════════════════════════════════════════════════════════════════════════
  for v_i in 1..v_referral_count loop
    v_record := null;
    select id into v_record from public.records
     where status = 'active' and domain = 'regular' order by random() limit 1;
    continue when v_record is null;
    v_rdate := (now() - (floor(random() * 60) || ' days')::interval)::date;
    insert into public.court_case_access
      (id, record_id, court_liaison_id, referred_by, reason, expires_at,
       outcome, outcome_notes, outcome_recorded_by, outcome_recorded_at,
       first_viewed_at, created_at)
    values
      (gen_random_uuid(), v_record, v_liaison_two, v_monitor_district,
       'Referred for prosecution (generated batch ' || v_i || ').',
       case when v_i % 7 = 0 then now() + interval '2 days'
            else now() + interval '90 days' end,
       case when v_i % 4 = 0 then pg_temp.pick(array['convicted','charged','withdrawn','acquitted']) else 'pending' end::court_case_outcome,
       case when v_i % 4 = 0 then 'Outcome recorded in generated batch.' end,
       case when v_i % 4 = 0 then v_liaison_two end,
       case when v_i % 4 = 0 then now() - interval '1 day' end,
       case when v_i % 3 <> 0 then v_rdate + interval '2 days' end,
       v_rdate)
    returning id into v_grant;
    if v_i % 5 = 0 then -- tranche of brief documents (F4 demo depth)
      insert into public.referral_documents
        (referral_id, label, url, storage_path, file_type, uploaded_by)
      values
        (v_grant, 'charge_sheet', 'https://picsum.photos/seed/trace-charge/800/600',
         'seed/charge.jpg', 'image/jpeg', v_monitor_district),
        (v_grant, 'witness_statement', 'https://picsum.photos/seed/trace-statement/800/600',
         'seed/statement.jpg', 'image/jpeg', v_monitor_district),
        (v_grant, 'exhibit_photo', 'https://picsum.photos/seed/trace-exhibit/800/600',
         'seed/exhibit.jpg', 'image/jpeg', v_monitor_district);
    end if;
    if v_i % 9 = 0 then -- revoked stays dead
      update public.court_case_access set revoked_at = now() - interval '1 day'
       where id = v_grant;
    end if;
  end loop;

  -- ════════════════════════════════════════════════════════════════════════
  -- G. REVIEWS + TASKING (open / overdue / done / cancelled)
  -- ════════════════════════════════════════════════════════════════════════
  for v_i in 1..v_review_count loop
    v_record := null;
    select id, reported_by into v_record, v_officer from public.records
     order by random() limit 1;
    continue when v_record is null;
    v_note := pg_temp.pick(array[
      'Reviewed — statements consistent, keep active.',
      'Follow up with the reporting branch on outstanding witness accounts.',
      'Escalation justified; visibility widened.',
      'No further action needed unless new evidence surfaces.',
      'Cross-checked plate against registry; details confirmed.']);
    insert into public.case_reviews (record_id, reviewer_id, note)
    values (v_record, v_monitor_district, v_note);
  end loop;

  for v_i in 1..v_assign_count loop
    v_record := null;
    select id, district::text into v_record, v_branch_district from public.records
     where status = 'active' order by random() limit 1;
    continue when v_record is null;
    select u.id into v_officer from public.users u
      join public.branches b on b.id = u.branch_id
     where u.role = 'officer' and u.is_active and b.district::text = v_branch_district
     order by random() limit 1;
    continue when v_officer is null;
    v_r := random();
    insert into public.case_assignments
      (record_id, assignee_id, assigned_by, note, due_at, state, completed_at)
    values
      (v_record, v_officer, v_monitor_district,
       pg_temp.pick(array['Re-interview witnesses.','Verify plate with registry.',
         'Collect outstanding statements.','Confirm impound release conditions.']),
       case when v_r < 0.25 then now() - interval '3 days'  -- overdue
            else now() + ((1 + floor(random() * 14)) || ' days')::interval end,
       case when v_r < 0.25 then 'open'
            when v_r < 0.5 then 'done'
            when v_r < 0.6 then 'cancelled'
            else 'open' end,
       case when v_r >= 0.25 and v_r < 0.5 then now() - interval '1 day' end);
  end loop;

  -- ════════════════════════════════════════════════════════════════════════
  -- H. SCENARIO PACKS (stable natural keys — the demo script)
  -- ════════════════════════════════════════════════════════════════════════

  -- H1. LL 4242: three citations (unpaid / part-paid / paid+scheduled) plus
  -- one real offense — citations alone never flag a vehicle in app logic,
  -- so the offense row is what legitimately keeps LL 4242 flagged.
  insert into public.vehicles (id, plate_number, make, model, color, is_flagged, is_verified)
  values (gen_random_uuid(), 'LL 4242', 'Toyota', 'Hilux', 'White', true, true)
  returning id into v_vehicle;
  for v_n in 1..3 loop
    v_fine := 10000 * v_n;
    v_paid := case v_n when 1 then 0 when 2 then 5000 else v_fine end;
    v_record := gen_random_uuid();
    insert into public.records
      (id, record_type, domain, reported_by, branch_id, district,
       vehicle_id, person_id, access_level, status, data, created_at)
    values
      (v_record, 'traffic_citation', 'traffic', v_officer_traffic, v_br_lw_traffic,
       'lilongwe', v_vehicle, null, 'branch', 'active',
       jsonb_build_object('plate_number', 'LL 4242',
         'violation_type', case v_n when 1 then 'Speeding' when 2 then 'Overloading' else 'Drunk driving' end,
         'fine_amount', v_fine, 'location', 'M1, Lilongwe',
         'date_issued', (now() - v_n * interval '4 days')::date::text,
         'latitude', -13.9833, 'longitude', 33.7833),
        now() - v_n * interval '4 days');
    insert into public.traffic_citations
      (record_id, vehicle_id, violation_type, fine_amount, is_paid, district,
       court_date, court_id)
    values (v_record, v_vehicle,
      case v_n when 1 then 'Speeding' when 2 then 'Overloading' else 'Drunk driving' end,
      v_fine, v_paid >= v_fine, 'lilongwe',
      case when v_n = 3 then current_date + 21 end, case when v_n = 3 then v_org_court_ll end);
    if v_paid > 0 then
      insert into public.citation_payments
        (record_id, amount, receipt_no, note, received_by)
      values (v_record, v_paid, 'R-SEED-10' || v_n,
        case when v_paid >= v_fine then 'Paid in full.' else 'Part-payment.' end,
        v_officer_traffic);
    end if;
  end loop;
  -- The flag-maintaining offense (see note above).
  v_record := gen_random_uuid();
  insert into public.records
    (id, record_type, domain, reported_by, branch_id, district,
     vehicle_id, person_id, access_level, status, data, created_at)
  values
    (v_record, 'vehicle_offense', 'traffic', v_officer_traffic, v_br_lw_traffic,
     'lilongwe', v_vehicle, null, 'branch', 'active',
     jsonb_build_object('plate_number', 'LL 4242', 'offense_type', 'Overloading',
       'description', 'First stop: overloaded pickup.', 'location', 'M1, Lilongwe',
       'date_occurred', (now() - interval '5 days')::date::text),
     now() - interval '5 days');
  insert into public.vehicle_cases
    (record_id, vehicle_id, case_type, plate_number, district, status)
  values (v_record, v_vehicle, 'vehicle_offense', 'LL 4242', 'lilongwe', 'active');

  -- H2. Full e-Brief path: active Lilongwe case → referred → tranches →
  -- viewed → convicted (exercises the SLA end to end).
  v_record := null;
  select id into v_record from public.records
   where status = 'active' and domain = 'regular' and district = 'lilongwe'
   order by random() limit 1;
  if v_record is null then
    raise exception 'Seed assumption failed: no active regular lilongwe record for H2';
  end if;
  insert into public.court_case_access
    (id, record_id, court_liaison_id, referred_by, reason, expires_at,
     outcome, outcome_notes, outcome_recorded_by, outcome_recorded_at,
     first_viewed_at, created_at)
  values
    (gen_random_uuid(), v_record, v_liaison_two, v_monitor_district,
     'Referred for prosecution — full brief attached (demo).',
     now() + interval '90 days', 'convicted',
     'Convicted; sentenced in the demo brief.', v_liaison_two,
     now() - interval '1 day', now() - interval '6 days', now() - interval '8 days')
  returning id into v_grant;
  insert into public.referral_documents
    (referral_id, label, url, storage_path, file_type, uploaded_by)
  values
    (v_grant, 'charge_sheet', 'https://picsum.photos/seed/trace-charge/800/600',
     'seed/charge.jpg', 'image/jpeg', v_monitor_district),
    (v_grant, 'witness_statement', 'https://picsum.photos/seed/trace-statement/800/600',
     'seed/statement.jpg', 'image/jpeg', v_monitor_district),
    (v_grant, 'exhibit_photo', 'https://picsum.photos/seed/trace-exhibit/800/600',
     'seed/exhibit.jpg', 'image/jpeg', v_monitor_district);

  -- H3. N2 media: one PDF charge sheet + one video statement, each on its
  -- own random case (the record id comes from the FROM clause, not a stale
  -- variable).
  insert into public.record_attachments
    (record_id, person_id, vehicle_id, url, storage_path, file_type,
     file_size_bytes, retention_until, uploaded_by)
  select id, null, null,
    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    'seed/charge-sheet.pdf', 'application/pdf', 13264, now() + interval '5 years',
    v_monitor_district
    from public.records
   where status = 'active' order by random() limit 1;
  insert into public.record_attachments
    (record_id, person_id, vehicle_id, url, storage_path, file_type,
     file_size_bytes, retention_until, uploaded_by)
  select id, null, null,
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    'seed/statement.mp4', 'video/mp4', 5600000, now() + interval '5 years',
    v_monitor_district
    from public.records
   where status = 'active' order by random() limit 1;

  -- H4. Micro-districts: Rumphi 2 cases + Likoma 3 cases (< 5 → suppressed).
  insert into public.records
    (id, record_type, domain, reported_by, branch_id, district,
     vehicle_id, person_id, access_level, status, data, created_at)
  values
    (gen_random_uuid(), 'crime_incident', 'regular', v_officer_rumphi, v_br_rumphi,
     'rumphi', null, null, 'branch', 'active',
     jsonb_build_object('incident_type', 'Burglary', 'description', 'Shop break-in overnight.',
       'location', 'Rumphi market', 'date_occurred', (now() - interval '3 days')::date::text,
       'victims', jsonb_build_array('Shop owner'), 'witnesses', jsonb_build_array()),
     now() - interval '3 days'),
    (gen_random_uuid(), 'stolen_property', 'regular', v_officer_rumphi, v_br_rumphi,
     'rumphi', null, null, 'branch', 'active',
     jsonb_build_object('item_description', 'Honda motorbike', 'category', 'Vehicle',
       'location_stolen', 'Rumphi bus depot', 'date_stolen', (now() - interval '2 days')::date::text,
       'owner_name', 'Test Owner', 'owner_contact', '+265995551111'),
     now() - interval '2 days');
  for v_n in 1..3 loop
    insert into public.records
      (id, record_type, domain, reported_by, branch_id, district,
       vehicle_id, person_id, access_level, status, data, created_at)
    values
      (gen_random_uuid(), 'crime_incident', 'regular',
       (select id from public.users where phone_number = '+265997000017'),
       v_br_likoma, 'likoma', null, null, 'branch', 'active',
       jsonb_build_object('incident_type', 'Theft', 'description', 'Fishing gear stolen.',
         'location', 'Likoma harbour', 'date_occurred', (now() - v_n * interval '2 days')::date::text,
         'victims', jsonb_build_array('Boat owner'), 'witnesses', jsonb_build_array()),
       now() - v_n * interval '2 days');
  end loop;

  -- H5. Second-court isolation referral (expires in 2 days → renew demo).
  v_record := null;
  select id into v_record from public.records
   where status = 'active' and domain = 'regular' and district = 'blantyre'
   order by random() limit 1;
  if v_record is null then
    raise exception 'Seed assumption failed: no active regular blantyre record for H5';
  end if;
  insert into public.court_case_access
    (record_id, court_liaison_id, referred_by, reason, expires_at, outcome)
  values
    (v_record, v_liaison, v_monitor_district,
     'Referred for prosecution — isolation demo, expires soon.',
     now() + interval '2 days', 'pending');

  -- H6. Staged duplicate pair for merge testing (same national ID, two rows).
  insert into public.persons_of_interest (id, full_name, national_id, sex, home_district) values
    (gen_random_uuid(), 'Joseph Banda', 'MW-P-909090', 'male', 'lilongwe'),
    (gen_random_uuid(), 'Joseph Banda', 'MW-P-909090', 'male', 'lilongwe');

  -- H7. DEV-ONLY machine key for the ANPR endpoint (plaintext in header only).
  insert into public.api_keys (user_id, name, key_hash, key_prefix, scopes)
  values (v_officer_traffic, 'Seeded ANPR demo key',
    encode(digest('trace_seed_demo_anpr_001', 'sha256'), 'hex'),
    'trace_seed_', array['plate:read']);

  -- ════════════════════════════════════════════════════════════════════════
  -- I. NOTIFICATIONS + AUDIT TRAIL
  -- ════════════════════════════════════════════════════════════════════════
  insert into public.notifications (user_id, type, record_id, message)
  select court_liaison_id, 'referral_received', record_id,
         'New referral from the district monitor.'
    from public.court_case_access limit 5;
  insert into public.notifications (user_id, type, record_id, message)
  select assignee_id, 'review_added', record_id, 'New task assigned to you.'
    from public.case_assignments where state = 'open' limit 10;
  insert into public.notifications (user_id, type, record_id, message)
  select reported_by, 'status_changed', id,
         'Status of your case was changed by a monitor.'
    from public.records where status <> 'active' limit 10;

  for v_i in 1..v_audit_count loop
    v_record := null;
    select id into v_record from public.records order by random() limit 1;
    continue when v_record is null;
    insert into public.actions (actor_id, action_type, record_id, reason)
    values (v_officer_regular,
      pg_temp.pick(array['record_created','record_viewed','record_updated',
        'status_changed','cross_branch_access','report_generated'])::audit_action_type,
      v_record, 'Generated audit trail row.');
  end loop;
  insert into public.actions (actor_id, action_type, reason)
  values (v_insurer, 'insurer_flag_lookup', 'Generated flag lookup.'),
         (v_registrar, 'vehicle_registered', 'Generated verification.'),
         (v_sysadmin, 'user_provisioned', 'Generated provisioning batch.');
end $$;

commit;

drop function if exists pg_temp.pick(anyarray);

-- ══════════════════════════════════════════════════════════════════════════
-- DEMO SUMMARY (stable handles — no fixed UUIDs needed to test by hand)
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_cases integer; v_flagged integer; v_districts integer;
  v_plate text; v_open_tasks integer; v_overdue_refs integer;
begin
  select count(*) into v_cases from public.records;
  select count(*) into v_flagged from public.vehicles where is_flagged;
  select count(distinct district) into v_districts from public.records;
  select plate_number into v_plate from public.vehicles
   where is_flagged and plate_number <> 'LL 4242' order by random() limit 1;
  select count(*) into v_open_tasks from public.case_assignments where state = 'open';
  select count(*) into v_overdue_refs from public.court_case_access
   where revoked_at is null and outcome = 'pending' and expires_at <= now() + interval '7 days';
  raise notice 'TRACE seed complete: % cases across % districts, % flagged plates, % open tasks.',
    v_cases, v_districts, v_flagged, v_open_tasks;
  raise notice 'Logins (OTP, no passwords): sysadmin +265997000001 · auditor +265997000002 · officer +265997000003 · traffic +265997000004 · monitor +265997000005 · liaison +265997000007 · insurer +265997000008 · registrar +265997000009.';
  raise notice 'Demo plates: LL 4242 (3 citations: unpaid/part/paid+scheduled) · % (flagged).', coalesce(v_plate, 'none');
  raise notice 'Expiring referrals (renew demo): %.', v_overdue_refs;
  raise notice 'DEV-ONLY ANPR key: trace_seed_demo_anpr_001 (plate:read). Never use outside dev.';
end $$;
