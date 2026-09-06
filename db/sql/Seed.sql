-- ============================================================================
-- TRACE — DEVELOPMENT SEED DATA (fresh database)
-- ----------------------------------------------------------------------------
-- Run AFTER the Drizzle migration + db/sql/Functions&Policies.sql:
--
--   psql "$DATABASE_URL" -f "db/sql/Seed.sql"
--
-- What it creates:
--   * 3 branches (Lilongwe Central + Lilongwe Traffic + Blantyre Central)
--   * 3 organizations (Blantyre Magistrate Court, NICO General, Road Traffic
--     Directorate)
--   * 9 users covering all 8 roles (sign in with phone + OTP, e.g. the
--     system admin on +265990000001)
--   * 1 person of interest + 2 vehicles (one flagged, one verified)
--   * 3 sample records with coded projections (wanted, offense, accident)
--   * 1 insurance policy + 1 live court referral
-- ============================================================================

begin;

truncate public.actions,
  public.court_case_access,
  public.missing_person_cases,
  public.wanted_person_cases,
  public.vehicle_cases,
  public.accidents,
  public.accident_vehicles,
  public.traffic_citations,
  public.record_attachments,
  public.insurance_policies,
  public.records,
  public.vehicles,
  public.persons_of_interest,
  public.users,
  public.branches,
  public.organizations cascade;

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
   null, 'vehicle_registrar', null, null, null, 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);

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

commit;
