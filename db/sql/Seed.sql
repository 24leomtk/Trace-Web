
-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
insert into public.branches (id, name, domain, district, location, contact_phone) values
  ('11111111-1111-1111-1111-111111111111', 'Lilongwe Central', 'regular', 'lilongwe', 'City Centre', '+265991000011'),
  ('22222222-2222-2222-2222-222222222222', 'Lilongwe Traffic', 'traffic', 'lilongwe', 'Area 3 Depot', '+265991000022'),
  ('33333333-3333-3333-3333-333333333333', 'Blantyre Central', 'regular', 'blantyre', 'Victoria Avenue', '+265991000033');

-- ---------------------------------------------------------------------------
-- Organizations (courts, insurers, vehicle registry)
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, org_type, district, contact_phone, contact_email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Blantyre Magistrate Court', 'court', 'blantyre', '+265991000101', 'registry@blantyre-court.mw'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'NICO General', 'insurer', null, '+265991000102', 'motor@nico.mw'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Directorate of Road Traffic', 'vehicle_registry', null, '+265991000103', 'registry@rtd.mw');

-- ---------------------------------------------------------------------------
-- Users — one per role (+ an extra traffic officer). OTP sign-in on the
-- listed phone numbers; no passwords are seeded.
-- ---------------------------------------------------------------------------
insert into public.users (
  id, name, email, email_verified, phone_number, phone_number_verified,
  badge_number, role, domain, branch_id, district, organization_id, is_active
) values
  ('seed_sysadmin', 'Tamanda Chirwa',
   'tamanda.chirwa.admin@trace.mw', false, '+265990000001', true,
   null, 'system_admin', null, null, null, null, true),
  ('seed_auditor', 'Mphatso Zimba',
   'mphatso.zimba.audit@trace.mw', false, '+265990000002', true,
   null, 'compliance_auditor', null, null, null, null, true),
  ('seed_officer_regular', 'Chikondi Banda',
   'chikondi.banda@trace.mw', false, '+265990000003', true,
   'MPS-2021-0042', 'officer', 'regular', '11111111-1111-1111-1111-111111111111', null, null, true),
  ('seed_officer_traffic', 'Dalitso Moyo',
   'dalitso.moyo@trace.mw', false, '+265990000004', true,
   'MPT-2022-0117', 'officer', 'traffic', '22222222-2222-2222-2222-222222222222', null, null, true),
  ('seed_district_monitor', 'Grace Kachale',
   'grace.kachale@trace.mw', false, '+265990000005', true,
   'MPS-2015-0009', 'district_monitor', 'regular', null, 'lilongwe', null, true),
  ('seed_country_monitor', 'Yohane Tembo',
   'yohane.tembo@trace.mw', false, '+265990000006', true,
   'MPT-2012-0033', 'country_monitor', 'traffic', null, null, null, true),
  ('seed_liaison', 'Annie Mpakati',
   'annie.mpakati@trace.mw', false, '+265990000007', true,
   null, 'court_liaison', null, null, null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true),
  ('seed_insurer', 'Blessings Nkhoma',
   'blessings.nkhoma@trace.mw', false, '+265990000008', true,
   null, 'insurance_portal_user', null, null, null, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true),
  ('seed_registrar', 'Peter Soko',
   'peter.soko@trace.mw', false, '+265990000009', true,
   null, 'vehicle_registrar', null, null, null, 'cccccccc-cccc-cccc-cccc-cccccccccccc', true),
  ('seed_officer_blantyre', 'Wanangwa Chirwa',
   'wanangwa.chirwa@trace.mw', false, '+265990000010', true,
   'MPS-2023-0208', 'officer', 'regular', '33333333-3333-3333-3333-333333333333', null, null, true);

-- ---------------------------------------------------------------------------
-- Persons of interest
-- ---------------------------------------------------------------------------
insert into public.persons_of_interest
  (id, full_name, national_id, sex, home_district, distinguishing_features) values
  ('d0000000-0000-0000-0000-000000000001', 'John Phiri', 'MW-P-100234',
   'male', 'lilongwe', 'Scar above left eyebrow');

-- ---------------------------------------------------------------------------
-- Vehicles — one verified, one flagged via the sample offense below
-- ---------------------------------------------------------------------------
insert into public.vehicles
  (id, plate_number, make, model, color, owner_name, owner_national_id,
   is_flagged, is_verified, registered_by, verified_at) values
  ('e0000000-0000-0000-0000-000000000001', 'MH 1234', 'Toyota', 'Corolla', 'Silver',
   'Mary Kumwenda', 'MW-P-887120', false, true, 'seed_registrar', now() - interval '30 days'),
  ('e0000000-0000-0000-0000-000000000002', 'BW 9999', 'Nissan', 'Navara', 'White',
   null, null, true, false, null, null);

-- ---------------------------------------------------------------------------
-- Records + coded projections
-- ---------------------------------------------------------------------------

-- 1. Wanted person (country-level bulletin, regular domain)
insert into public.records
  (id, record_type, domain, reported_by, branch_id, district,
   vehicle_id, person_id, access_level, status, data, created_at) values
  ('f0000000-0000-0000-0000-000000000001', 'wanted_person', 'regular',
   'seed_district_monitor', '11111111-1111-1111-1111-111111111111', 'lilongwe',
   null, 'd0000000-0000-0000-0000-000000000001', 'country', 'active',
   jsonb_build_object(
     'person_id', 'd0000000-0000-0000-0000-000000000001',
     'full_name', 'John Phiri',
     'national_id', 'MW-P-100234',
     'offense', 'Armed robbery',
     'danger_level', 'high',
     'warrant_number', 'W-2026-0184',
     'last_known_location', 'Area 25, Lilongwe',
     'description', 'Wanted in connection with the Area 25 filling-station robbery.'
   ),
   now() - interval '6 days');

insert into public.wanted_person_cases
  (record_id, person_id, full_name, offense, danger_level, district, status) values
  ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   'John Phiri', 'Armed robbery', 'high', 'lilongwe', 'active');

-- 2. Vehicle offense (branch-level, keeps BW 9999 flagged)
insert into public.records
  (id, record_type, domain, reported_by, branch_id, district,
   vehicle_id, person_id, access_level, status, data, created_at) values
  ('f0000000-0000-0000-0000-000000000002', 'vehicle_offense', 'traffic',
   'seed_officer_traffic', '22222222-2222-2222-2222-222222222222', 'lilongwe',
   'e0000000-0000-0000-0000-000000000002', null, 'branch', 'active',
   jsonb_build_object(
     'plate_number', 'BW 9999',
     'offense_type', 'Reckless driving',
     'description', 'Overtaking on a blind rise near Area 49 junction.',
     'location', 'M1 near Area 49, Lilongwe',
     'date_occurred', (now() - interval '2 days')::date::text
   ),
   now() - interval '2 days');

insert into public.vehicle_cases
  (record_id, vehicle_id, case_type, plate_number, district, status) values
  ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002',
   'vehicle_offense', 'BW 9999', 'lilongwe', 'active');

-- 3. Road accident (district-level, two vehicles)
insert into public.records
  (id, record_type, domain, reported_by, branch_id, district,
   vehicle_id, person_id, access_level, status, data, created_at) values
  ('f0000000-0000-0000-0000-000000000003', 'road_accident', 'traffic',
   'seed_officer_traffic', '22222222-2222-2222-2222-222222222222', 'lilongwe',
   null, null, 'district', 'active',
   jsonb_build_object(
     'location', 'Kamuzu Procession Road roundabout',
     'accident_date', (now() - interval '1 day')::date::text,
     'description', 'Rear-end collision at the roundabout approach.',
     'cause', 'Speeding',
     'vehicles_involved', jsonb_build_array(
       jsonb_build_object('plate_number', 'MH 1234', 'role', 'involved'),
       jsonb_build_object('plate_number', 'BW 9999', 'role', 'at_fault')
     ),
     'fatalities', 0,
     'injuries', 2
   ),
   now() - interval '1 day');

insert into public.accidents
  (id, record_id, accident_date, location, district, fatalities, injuries, status) values
  ('0a000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003',
   (now() - interval '1 day')::date, 'Kamuzu Procession Road roundabout',
   'lilongwe', 0, 2, 'active');

insert into public.accident_vehicles (accident_id, vehicle_id, role) values
  ('0a000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'involved'),
  ('0a000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'at_fault');

-- ---------------------------------------------------------------------------
-- Insurance policy (NICO General on the verified vehicle)
-- ---------------------------------------------------------------------------
insert into public.insurance_policies
  (vehicle_id, insurer_id, policy_number, coverage_type,
   start_date, end_date, is_active, entered_by) values
  ('e0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'NICO-M-2026-00417', 'comprehensive',
   (now() - interval '60 days')::date, (now() + interval '305 days')::date,
   true, 'seed_insurer');

-- ---------------------------------------------------------------------------
-- Court referral (district monitor -> court liaison, live 90-day grant)
-- ---------------------------------------------------------------------------
insert into public.court_case_access
  (record_id, court_liaison_id, referred_by, reason, expires_at, outcome) values
  ('f0000000-0000-0000-0000-000000000002', 'seed_liaison', 'seed_district_monitor',
   'Referred for prosecution — reckless driving charge sheet RD-2026-077.',
   now() + interval '90 days', 'pending');

-- ---------------------------------------------------------------------------
-- A few audit rows so the log is non-empty
-- ---------------------------------------------------------------------------
insert into public.actions (actor_id, action_type, record_id, reason) values
  ('seed_district_monitor', 'record_created', 'f0000000-0000-0000-0000-000000000001', 'Seeded wanted bulletin.'),
  ('seed_officer_traffic', 'record_created', 'f0000000-0000-0000-0000-000000000002', 'Seeded vehicle offense.'),
  ('seed_district_monitor', 'court_case_referred', 'f0000000-0000-0000-0000-000000000002', 'Seeded court referral.'),
  ('seed_registrar', 'vehicle_registered', null, 'Seeded verification of MH 1234.');

update public.actions set vehicle_id = 'e0000000-0000-0000-0000-000000000001'
where actor_id = 'seed_registrar';

-- ============================================================================
-- GENERATED BULK DATA (all ids via gen_random_uuid — no fixed ids below)
-- ----------------------------------------------------------------------------
-- ~9 branches, ~24 officers/staff, ~40 persons, ~60 vehicles, ~120 cases
-- across all 10 record types, plus policies, referrals, reviews,
-- notifications, and audit rows. Counters (not random numbers) guarantee
-- unique plates, phones, national IDs, and emails on every run.
-- ============================================================================

create extension if not exists pgcrypto;

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  v_seq            integer := 1;
  v_first          text[] := array['Chikondi','Dalitso','Tadala','Mphatso','Wongani','Tiwonge','Yamikani','Chisomo','Madalitso','Alinafe','Pemphero','Limbani','Tamanda','Chimwemwe','Fatsani','Kondwani','Mwayi','Takondwa','Tusekile','Dalo','Chifuniro','Mpho','Zikomo','Thoko'];
  v_last           text[] := array['Banda','Phiri','Moyo','Kachale','Tembo','Nkhoma','Soko','Chirwa','Zimba','Mpakati','Kumwenda','Nyirenda','Kamanga','Mvula','Gondwe','Msowoya','Mhango','Kaunda','Kaliati','Mbewe'];
  v_districts      text[] := array['zomba','mzimba','mangochi','kasungu'];
  v_prefix         jsonb  := '{"zomba":"ZA","mzimba":"MZ","mangochi":"MG","kasungu":"KS","lilongwe":"LL","blantyre":"BT"}';
  v_district       text;
  v_domain         text;
  v_branch         uuid;
  v_branch_district text;
  v_officer        text;
  v_person         uuid;
  v_vehicle        uuid;
  v_record         uuid;
  v_accident       uuid;
  v_full           text;
  v_plate          text;
  v_nid            text;
  v_phone          text;
  v_email          text;
  v_type           text;
  v_status         text;
  v_level          text;
  v_data           jsonb;
  v_rdate          date;
  v_r              float;
  v_i              integer;
  v_note           text;
begin
  -- ── 1. Extra branches (regular + traffic per new district, + Blantyre Traffic)
  insert into public.branches (id, name, domain, district, location, contact_phone)
  select gen_random_uuid(),
         initcap(d) || ' ' || s,
         case when s = 'Central' then 'regular' else 'traffic' end,
         d::district,
         initcap(d) || ' town',
         '+26599' || lpad((300000 + (row_number() over ())::int)::text, 7, '0')
    from (select unnest(array['zomba','mzimba','mangochi','kasungu','blantyre']) as d) districts
   cross join (values ('Central'), ('Traffic')) suffixes(s)
   where not (d = 'blantyre' and s = 'Central'); -- Blantyre Central already seeded

  -- ── 2. Officers: 2 per generated branch + a district monitor per new district
  for v_branch, v_branch_district, v_domain in
    select b.id, b.district::text, b.domain::text
      from public.branches b
     where b.id not in ('11111111-1111-1111-1111-111111111111',
                        '22222222-2222-2222-2222-222222222222',
                        '33333333-3333-3333-3333-333333333333')
  loop
    for v_i in 1..2 loop
      v_full := pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last);
      v_phone := '+26599' || lpad((200000 + v_seq)::text, 7, '0');
      v_email := lower(replace(v_full, ' ', '.')) || v_seq || '@trace.mw';
      insert into public.users
        (id, name, email, email_verified, phone_number, phone_number_verified,
         badge_number, role, domain, branch_id, district, organization_id, is_active)
      values
        ('gen_user_' || v_seq, v_full, v_email, false, v_phone, true,
         case when v_seq % 5 = 0 then null
              else (case when v_domain = 'regular' then 'MPS-G-' else 'MPT-G-' end) || (1000 + v_seq) end,
         'officer', v_domain::domain, v_branch, null, null, true);
      v_seq := v_seq + 1;
    end loop;
  end loop;

  for v_i in 1..array_length(v_districts, 1) loop
    v_district := v_districts[v_i];
    v_full := pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last);
    v_phone := '+26599' || lpad((200000 + v_seq)::text, 7, '0');
    insert into public.users
      (id, name, email, email_verified, phone_number, phone_number_verified,
       badge_number, role, domain, branch_id, district, organization_id, is_active)
    values
      ('gen_user_' || v_seq, v_full,
       lower(replace(v_full, ' ', '.')) || v_seq || '@trace.mw',
       false, v_phone, true,
       'MPS-G-' || (1000 + v_seq), 'district_monitor', 'regular', null,
       v_district::district, null, true);
    v_seq := v_seq + 1;
  end loop;

  -- ── 3. Persons of interest (40)
  for v_i in 1..40 loop
    v_full := pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last);
    v_nid := case when v_i % 4 = 0 then null else 'MW-P-' || (200000 + v_seq) end;
    insert into public.persons_of_interest
      (id, full_name, national_id, sex, home_district, distinguishing_features)
    values
      (gen_random_uuid(), v_full, v_nid,
       pg_temp.pick(array['male','female','male','female'])::sex,
       pg_temp.pick(array['lilongwe','blantyre','zomba','mzimba','mangochi','kasungu'])::district,
       case when v_i % 3 = 0 then pg_temp.pick(array['Scar on left cheek','Tattoo on right forearm','Limp in left leg','Birthmark on neck']) end);
    v_seq := v_seq + 1;
  end loop;

  -- ── 4. Vehicles (60; every 4th pre-verified by the registrar)
  for v_i in 1..60 loop
    v_district := pg_temp.pick(array['lilongwe','blantyre','zomba','mzimba','mangochi','kasungu']);
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
       case when v_i % 3 = 0 then 'MW-P-' || (200000 + v_seq) end,
       false,
       v_i % 4 = 0,
       case when v_i % 4 = 0 then 'seed_registrar' end,
       case when v_i % 4 = 0 then now() - ((v_seq % 90) || ' days')::interval end);
    v_seq := v_seq + 1;
  end loop;

  -- ── 5. Cases across all 10 types (120)
  for v_i in 1..120 loop
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
     order by random() limit 1;
    select u.id into v_officer
      from public.users u
     where u.branch_id = v_branch and u.role = 'officer'
     order by random() limit 1;
    v_r := random();
    v_status := case when v_r < 0.60 then 'active' when v_r < 0.80 then 'resolved'
                     when v_r < 0.93 then 'closed' else 'archived' end;
    v_r := random();
    v_level := case when v_type = 'wanted_person' and v_r < 0.7 then 'country'
                    when v_r < 0.55 then 'branch' when v_r < 0.80 then 'district'
                    else 'country' end;
    v_rdate := (now() - (floor(random() * 180) || ' days')::interval)::date;
    v_person := null; v_vehicle := null; v_data := '{}';

    if v_type in ('missing_person','wanted_person','arrest_record') then
      select p.id into v_person from public.persons_of_interest p order by random() limit 1;
    end if;
    if v_type in ('missing_vehicle','vehicle_offense','traffic_citation','vehicle_impoundment') then
      if random() < 0.3 then -- brand-new ad-hoc plate
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
        'victims', jsonb_build_array(pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last)),
        'witnesses', jsonb_build_array());
      when 'arrest_record' then v_data := jsonb_build_object(
        'person_id', v_person, 'full_name', coalesce(v_full, 'Unknown'),
        'national_id', v_nid,
        'charges', jsonb_build_array(pg_temp.pick(array['Theft','Assault','Burglary','Fraud'])),
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
        'vehicles_involved', (select jsonb_agg(jsonb_build_object('plate_number', x.plate_number, 'role', 'involved'))
                                from (select plate_number from public.vehicles order by random() limit 1 + floor(random() * 2)::int) x),
        'fatalities', case when random() < 0.85 then 0 else 1 + floor(random() * 2)::int end,
        'injuries', floor(random() * 4)::int);
      when 'traffic_citation' then v_data := jsonb_build_object(
        'plate_number', v_plate,
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
      insert into public.traffic_citations
        (record_id, vehicle_id, violation_type, fine_amount,
         is_paid, district)
      values (v_record, v_vehicle, v_data ->> 'violation_type',
              (v_data ->> 'fine_amount')::numeric, random() < 0.4,
              v_branch_district::district);
    end if;
    v_seq := v_seq + 1;
  end loop;

  -- ── 6. Insurance policies (25 on random vehicles; half lapsed-but-active
  -- to exercise the liveness logic + expiry sweep)
  for v_i in 1..25 loop
    select id into v_vehicle from public.vehicles order by random() limit 1;
    insert into public.insurance_policies
      (vehicle_id, insurer_id, policy_number, coverage_type,
       start_date, end_date, is_active, entered_by)
    values
      (v_vehicle, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
       'NICO-M-2026-' || (50000 + v_seq),
       pg_temp.pick(array['third_party','comprehensive']),
       (now() - interval '200 days')::date,
       case when v_i % 2 = 0 then (now() - interval '10 days')::date
            else (now() + interval '165 days')::date end,
       true, 'seed_insurer');
    v_seq := v_seq + 1;
  end loop;

  -- ── 7. Court referrals (5, mixed states incl. one expired-with-outcome)
  for v_i in 1..5 loop
    v_record := null;
    select id into v_record from public.records
     where status = 'active' order by random() limit 1;
    continue when v_record is null;
    insert into public.court_case_access
      (record_id, court_liaison_id, referred_by, reason, expires_at,
       outcome, outcome_notes, outcome_recorded_by, outcome_recorded_at)
    values
      (v_record, 'seed_liaison', 'seed_district_monitor',
       'Referred for prosecution (generated batch ' || v_i || ').',
       case when v_i = 5 then now() - interval '3 days'
            else now() + interval '90 days' end,
       case v_i when 3 then 'convicted' when 4 then 'charged' when 5 then 'withdrawn' else 'pending' end,
       case when v_i in (3,4,5) then 'Outcome recorded in generated batch.' end,
       case when v_i in (3,4,5) then 'seed_liaison' end,
       case when v_i in (3,4,5) then now() - interval '1 day' end);
  end loop;

  -- ── 8. Reviews (20 notes by monitors on random cases)
  for v_i in 1..20 loop
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
    values (v_record, 'seed_district_monitor', v_note);
  end loop;

  -- ── 9. Notifications (inbox content for the demo accounts)
  insert into public.notifications (user_id, type, record_id, message)
  select 'seed_liaison', 'referral_received', record_id,
         'New referral from Grace Kachale.'
    from public.court_case_access
   where court_liaison_id = 'seed_liaison' limit 2;
  insert into public.notifications (user_id, type, record_id, message)
  values ('seed_district_monitor', 'outcome_recorded',
          'f0000000-0000-0000-0000-000000000002',
          'Outcome recorded by the court: pending.');
  insert into public.notifications (user_id, type, record_id, message)
  select reported_by, 'status_changed', id,
         'Status of your case was changed by a monitor.'
    from public.records where status <> 'active' limit 3;

  -- ── 10. Assorted audit rows
  for v_i in 1..30 loop
    v_record := null;
    select id, district::text into v_record, v_branch_district
      from public.records order by random() limit 1;
    continue when v_record is null;
    insert into public.actions (actor_id, action_type, record_id, reason)
    values ('seed_officer_regular',
      pg_temp.pick(array['record_created','record_viewed','record_updated',
        'status_changed','cross_branch_access','report_generated']),
      v_record, 'Generated audit trail row.');
  end loop;
  insert into public.actions (actor_id, action_type, reason)
  values ('seed_insurer', 'insurer_flag_lookup', 'Generated flag lookup.'),
         ('seed_registrar', 'vehicle_registered', 'Generated verification.'),
         ('seed_sysadmin', 'user_provisioned', 'Generated provisioning batch.');
end $$;

drop function if exists pg_temp.pick(anyarray);

commit;
