-- TRACE seed 03 — regular-domain cases.
-- Run AFTER 02_entities.sql. Own transaction, self-contained.
-- Notification triggers muted (flag set below).
-- Covers: missing_person ×2, wanted_person, unclaimed_person,
-- stolen_property ×2, crime_incident ×3, arrest_record + coded projections,
-- GPS pins, arrest custody depth, locate/disposition states, micro-districts.
--
-- Knobs: v_case_count = 450 · v_gps_ratio = 0.30.

begin;

select set_config('app.seed_load', 'on', false);
select setseed(0.20260918);

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  v_case_count    integer := 450;
  v_seq           integer := 200000;
  v_i             integer;
  v_first         text[] := array['Chikondi','Dalitso','Tadala','Mphatso','Wongani','Tiwonge','Yamikani','Chisomo','Madalitso','Alinafe','Pemphero','Limbani','Tamanda','Chimwemwe','Fatsani','Kondwani','Mwayi','Takondwa','Tusekile','Dalo','Chifuniro','Mpho','Zikomo','Thoko'];
  v_last          text[] := array['Banda','Phiri','Moyo','Kachale','Tembo','Nkhoma','Soko','Chirwa','Zimba','Mpakati','Kumwenda','Nyirenda','Kamanga','Mvula','Gondwe','Msowoya','Mhango','Kaunda','Kaliati','Mbewe'];
  v_branch        uuid;
  v_branch_district text;
  v_officer       text;
  v_officer_bt_traffic text;
  v_officer_regular text;
  v_person        uuid;
  v_record        uuid;
  v_full          text;
  v_nid           text;
  v_type          text;
  v_status        text;
  v_level         text;
  v_lat           float;
  v_lng           float;
  v_base_lat      float;
  v_base_lng      float;
  v_data          jsonb;
  v_rdate         date;
  v_r             float;
  v_br_rumphi     uuid;
  v_br_likoma     uuid;
  v_n             integer;
  v_monitor       text;
  v_cmonitor      text;
  v_reviewer      text;
  v_missing       uuid;
  v_unclaimed     uuid;
  v_missing2      uuid;
  v_unclaimed2    uuid;
  v_district2     text;
  v_match         uuid;
begin
  select id into v_br_rumphi from public.branches where name = 'Rumphi Central';
  select id into v_br_likoma from public.branches where name = 'Likoma Central';
  select id into v_officer_bt_traffic from public.users where phone_number = '+265997000018';
  select id into v_officer_regular from public.users where phone_number = '+265997000003';

  for v_i in 1..v_case_count loop
    v_type := pg_temp.pick(array['missing_person','missing_person',
      'wanted_person','unclaimed_person','stolen_property','stolen_property',
      'crime_incident','crime_incident','crime_incident','arrest_record']);
    select b.id, b.district::text into v_branch, v_branch_district
      from public.branches b
     where b.domain = 'regular'
       and b.district::text <> all (array['rumphi','likoma'])
     order by random() limit 1;
    select u.id into v_officer
      from public.users u
     where u.branch_id = v_branch and u.role = 'officer' and u.is_active
     order by random() limit 1;
    continue when v_officer is null;
    v_r := random();
    v_status := case when v_r < 0.55 then 'active' when v_r < 0.78 then 'resolved'
                     when v_r < 0.92 then 'closed' else 'archived' end;
    v_r := random();
    v_level := case when v_type = 'wanted_person' and v_r < 0.7 then 'country'
                    when v_r < 0.55 then 'branch' when v_r < 0.80 then 'district'
                    else 'country' end;
    v_rdate := (current_date - (v_i % 84))::date;
    v_person := null; v_data := '{}';

    if v_branch_district = 'blantyre' then
      v_base_lat := -15.7875; v_base_lng := 35.0058;
    else
      v_base_lat := -13.9833; v_base_lng := 33.7833;
    end if;
    if random() < 0.30 and v_type <> 'wanted_person' then
      v_lat := round((v_base_lat + (random() - 0.5) * 0.2)::numeric, 5);
      v_lng := round((v_base_lng + (random() - 0.5) * 0.2)::numeric, 5);
    else
      v_lat := null; v_lng := null;
    end if;

    if v_type in ('missing_person','wanted_person','unclaimed_person','arrest_record') then
      select p.id into v_person from public.persons_of_interest p order by random() limit 1;
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
      -- N2 unclaimed: identified deceased, no next of kin yet. Custody stays
      -- with the filing branch's mortuary in the seed.
      when 'unclaimed_person' then v_data := jsonb_build_object(
        'person_id', v_person, 'deceased_name', coalesce(v_full, 'Unknown'),
        'national_id', v_nid,
        'sex', pg_temp.pick(array['male','female']),
        'date_of_death', to_char(v_rdate, 'YYYY-MM-DD'),
        'place_of_death', pg_temp.pick(array['District hospital','Central mortuary','Health centre']) || ', ' || initcap(v_branch_district),
        'identification_method', pg_temp.pick(array['Visual identification by relative','Fingerprints','National ID documents','Dental records']),
        'reason_unclaimed', 'Next of kin not yet traced.',
        'custodial_branch_id', v_branch,
        'description', 'Remains held pending next-of-kin tracing.');
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
        'arresting_officer', 'Cst. ' || pg_temp.pick(v_last),
        'booking_no', case when random() < 0.4 then 'BK-26-' || (50000 + v_seq) end,
        'custody_status', case when random() < 0.4
          then pg_temp.pick(array['in_custody','released_on_bail','handed_to_court']) end,
        'prosecutor_decision', case when random() < 0.3
          then pg_temp.pick(array['pending','accepted','declined']) end);
    end case;

    if v_lat is not null then
      v_data := v_data || jsonb_build_object('latitude', v_lat, 'longitude', v_lng);
    end if;

    -- Strip top-level nulls (app Zod optional() rejects stored nulls).
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_data
      from jsonb_each(v_data) as e(k, v) where v <> 'null';

    v_record := gen_random_uuid();
    insert into public.records
      (id, record_type, domain, reported_by, branch_id, district,
       vehicle_id, person_id, access_level, status, data, created_at)
    values
      (v_record, v_type::record_type, 'regular', v_officer, v_branch,
       v_branch_district::district, null, v_person,
       v_level::access_level, v_status::case_status, v_data,
       v_rdate + (floor(random() * 12) || ' hours')::interval);

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
    elsif v_type = 'unclaimed_person' then
      insert into public.unclaimed_person_cases
        (record_id, person_id, deceased_name, date_of_death, place_of_death,
         identification_method, reason_unclaimed, custodial_branch_id,
         district, status)
      values (v_record, v_person, coalesce(v_full, 'Unknown'),
              (v_data ->> 'date_of_death')::date, v_data ->> 'place_of_death',
              v_data ->> 'identification_method', v_data ->> 'reason_unclaimed',
              v_branch, v_branch_district::district, v_status::case_status);
    end if;
    v_seq := v_seq + 1;
  end loop;

  -- ── Micro-districts (<5 → suppression demos) ──────────────────────────
  select id into v_officer from public.users where phone_number = '+265997000016';
  insert into public.records
    (id, record_type, domain, reported_by, branch_id, district,
     vehicle_id, person_id, access_level, status, data, created_at)
  values
    (gen_random_uuid(), 'crime_incident', 'regular', v_officer, v_br_rumphi,
     'rumphi', null, null, 'branch', 'active',
     jsonb_build_object('incident_type', 'Burglary', 'description', 'Shop break-in overnight.',
       'location', 'Rumphi market', 'date_occurred', (now() - interval '3 days')::date::text,
       'victims', jsonb_build_array('Shop owner'), 'witnesses', jsonb_build_array()),
     now() - interval '3 days'),
    (gen_random_uuid(), 'stolen_property', 'regular', v_officer, v_br_rumphi,
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

  -- ── Locate chain: 1 wanted located (Blantyre cross-branch report) + 1
  -- confirmed + 1 stolen-property recovery with disposition ──────────────
  select id into v_record from public.records
   where record_type = 'wanted_person' and status = 'active'
     and district = 'lilongwe' order by random() limit 1;
  if v_record is not null then
    update public.records
       set locate_state = 'located', locate_by = v_officer_bt_traffic,
           locate_at = now() - interval '2 days',
           locate_place = 'Blantyre market', locate_note = 'Spotted at the market; verify before acting (demo).'
     where id = v_record;
    insert into public.actions (actor_id, action_type, record_id, reason)
    values (v_officer_bt_traffic, 'locate_reported', v_record, 'Seeded locate demo.');
  end if;
  select id, reported_by into v_record, v_officer from public.records
   where record_type = 'wanted_person' and status = 'active'
     and district = 'lilongwe' and locate_state = 'none'
     order by random() limit 1;
  if v_record is not null then
    update public.records
       set locate_state = 'confirmed', locate_by = v_officer_bt_traffic,
           locate_at = now() - interval '3 days',
           locate_place = 'Lilongwe bus depot', locate_note = 'Arrested at depot (demo).'
     where id = v_record;
    insert into public.actions (actor_id, action_type, record_id, reason)
    values (v_officer_bt_traffic, 'locate_reported', v_record, 'Seeded locate demo.'),
           (v_officer, 'locate_confirmed', v_record, 'Seeded confirm demo.');
  end if;
  select id into v_record from public.records
   where record_type = 'stolen_property' and status = 'active'
     order by random() limit 1;
  if v_record is not null then
    update public.records
       set locate_state = 'confirmed', locate_by = v_officer_regular,
           locate_at = now() - interval '4 days',
           locate_place = 'Lilongwe Central exhibit room',
           locate_note = 'Recovered during patrol (demo).',
           disposition = 'held'
     where id = v_record;
  end if;

  raise notice 'seed/03 regular: % regular cases (% unclaimed, % possible matches, % confirmed matches).',
    (select count(*) from public.records where domain = 'regular'),
    (select count(*) from public.unclaimed_person_cases),
    (select count(*) from public.person_case_matches where match_type = 'possible'),
    (select count(*) from public.person_case_matches where match_type = 'confirmed');

  -- ── N4 match workflow: 1 possible + 1 confirmed (missing ↔ unclaimed) ──
  -- Possible pair prefers Lilongwe (anchor district); the confirmed pair
  -- takes any district with both sides present (Lilongwe first) so the demo
  -- survives sparse samples — reviewed by that district's monitor.
  select id into v_officer from public.users where phone_number = '+265997000003';
  select id into v_monitor from public.users where phone_number = '+265997000005';
  select id into v_cmonitor from public.users where phone_number = '+265997000012';
  select id into v_missing from public.records
   where record_type = 'missing_person' and status = 'active' and district = 'lilongwe'
   order by random() limit 1;
  select id into v_unclaimed from public.records
   where record_type = 'unclaimed_person' and status = 'active' and district = 'lilongwe'
     and id <> coalesce(v_missing, '00000000-0000-0000-0000-000000000000')
   order by random() limit 1;
  if v_missing is not null and v_unclaimed is not null and v_officer is not null then
    v_match := gen_random_uuid();
    insert into public.person_case_matches
      (id, record_id_a, record_id_b, match_type, score, reason, proposed_by)
    values (v_match, v_missing, v_unclaimed, 'possible', 62.5,
            'Same district, similar name and age window — verify before confirming (demo).',
            v_officer);
    insert into public.actions (actor_id, action_type, record_id, reason)
    values (v_officer, 'match_proposed', v_missing, 'Seeded match demo.');
    -- A second pair, already confirmed by the district monitor.
    select m.id, u.id, m.district::text into v_missing2, v_unclaimed2, v_district2
      from public.records m
      join public.records u
        on u.district = m.district
       and u.record_type = 'unclaimed_person' and u.status = 'active'
       and u.id <> v_missing and u.id <> v_unclaimed
     where m.record_type = 'missing_person' and m.status = 'active'
       and m.id <> v_missing and m.id <> v_unclaimed
     order by (m.district = 'lilongwe') desc, random() limit 1;
    if v_missing2 is not null then
      if v_district2 = 'lilongwe' then
        v_reviewer := v_monitor;
      else
        select id into v_reviewer from public.users
         where role = 'district_monitor' and domain = 'regular'
           and district = v_district2::district and is_active
         order by random() limit 1;
        if v_reviewer is null then v_reviewer := v_cmonitor; end if;
      end if;
    end if;
    if v_missing2 is not null and v_unclaimed2 is not null and v_reviewer is not null then
      v_match := gen_random_uuid();
      insert into public.person_case_matches
        (id, record_id_a, record_id_b, match_type, score, reason,
         proposed_by, reviewed_by, reviewed_at)
      values (v_match, v_missing2, v_unclaimed2, 'confirmed', 88.0,
              'Same person profile + family identification (demo).',
              v_officer, v_reviewer, now() - interval '1 day');
      insert into public.actions (actor_id, action_type, record_id, reason)
      values (v_officer, 'match_proposed', v_missing2, 'Seeded match demo.'),
             (v_reviewer, 'match_confirmed', v_missing2, 'Seeded match demo.');
    end if;
  end if;
end $$;

commit;
