-- TRACE seed 04 — traffic-domain cases.
-- Run AFTER 03_regular_cases.sql. Own transaction, self-contained.
-- Notification triggers muted (flag set below).
-- Covers: missing_vehicle ×2, vehicle_offense ×3, road_accident,
-- traffic_citation ×4 (fine ledger), vehicle_impoundment + custody,
-- LL 4242 demo pack + voided ticket.
--
-- Knobs: v_case_count = 550.

begin;

select set_config('app.seed_load', 'on', false);
select setseed(0.20260918);

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  v_case_count    integer := 550;
  v_seq           integer := 400000;
  v_i             integer;
  v_first         text[] := array['Chikondi','Dalitso','Tadala','Mphatso','Wongani','Tiwonge','Yamikani','Chisomo','Madalitso','Alinafe','Pemphero','Limbani','Tamanda','Chimwemwe','Fatsani','Kondwani','Mwayi','Takondwa','Tusekile','Dalo','Chifuniro','Mpho','Zikomo','Thoko'];
  v_last          text[] := array['Banda','Phiri','Moyo','Kachale','Tembo','Nkhoma','Soko','Chirwa','Zimba','Mpakati','Kumwenda','Nyirenda','Kamanga','Mvula','Gondwe','Msowoya','Mhango','Kaunda','Kaliati','Mbewe'];
  v_bulk_districts text[] := array['balaka','blantyre','chikwawa','chiradzulu','chitipa','dedza','dowa','karonga','kasungu','lilongwe','machinga','mangochi','mchinji','mulanje','mwanza','mzimba','neno','nkhata_bay','nkhotakota','nsanje','ntcheu','ntchisi','phalombe','salima','thyolo','zomba'];
  v_prefix        jsonb  := '{"balaka":"BA","blantyre":"BT","chikwawa":"CK","chiradzulu":"CZ","chitipa":"CT","dedza":"DZ","dowa":"DW","karonga":"KR","kasungu":"KS","likoma":"LK","lilongwe":"LL","machinga":"MC","mangochi":"MG","mchinji":"MJ","mulanje":"MU","mwanza":"MW","mzimba":"MZ","neno":"NN","nkhata_bay":"NB","nkhotakota":"NK","nsanje":"NS","ntcheu":"NU","ntchisi":"NI","phalombe":"PB","rumphi":"RU","salima":"SM","thyolo":"TH","zomba":"ZA"}';
  v_branch        uuid;
  v_branch_district text;
  v_officer       text;
  v_officer_traffic text;
  v_officer_bt_traffic text;
  v_monitor_traffic text;
  v_monitor_country text;
  v_org_court_bt  uuid;
  v_org_court_ll  uuid;
  v_br_lw_traffic uuid;
  v_br_bt_traffic uuid;
  v_vehicle       uuid;
  v_record        uuid;
  v_accident      uuid;
  v_plate         text;
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
  v_n             integer;
  v_fine          integer;
  v_paid          integer;
begin
  select id into v_officer_traffic from public.users where phone_number = '+265997000004';
  select id into v_officer_bt_traffic from public.users where phone_number = '+265997000018';
  select id into v_monitor_traffic from public.users where phone_number = '+265997000011';
  select id into v_monitor_country from public.users where phone_number = '+265997000006';
  select id into v_org_court_bt from public.organizations where name = 'Blantyre Magistrate Court';
  select id into v_org_court_ll from public.organizations where name = 'Lilongwe Magistrate Court';
  select id into v_br_lw_traffic from public.branches where name = 'Lilongwe Traffic';
  select id into v_br_bt_traffic from public.branches where name = 'Blantyre Traffic';

  for v_i in 1..v_case_count loop
    v_type := pg_temp.pick(array['missing_vehicle','missing_vehicle',
      'vehicle_offense','vehicle_offense','vehicle_offense',
      'road_accident','traffic_citation','traffic_citation','traffic_citation','traffic_citation',
      'vehicle_impoundment']);
    select b.id, b.district::text into v_branch, v_branch_district
      from public.branches b
     where b.domain = 'traffic'
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
    v_level := case when v_r < 0.55 then 'branch' when v_r < 0.80 then 'district' else 'country' end;
    v_rdate := (current_date - (v_i % 84))::date;
    v_vehicle := null; v_data := '{}';

    if v_branch_district = 'blantyre' then
      v_base_lat := -15.7875; v_base_lng := 35.0058;
    else
      v_base_lat := -13.9833; v_base_lng := 33.7833;
    end if;
    if random() < 0.3 then
      v_lat := round((v_base_lat + (random() - 0.5) * 0.2)::numeric, 5);
      v_lng := round((v_base_lng + (random() - 0.5) * 0.2)::numeric, 5);
    else
      v_lat := null; v_lng := null;
    end if;

    if random() < 0.25 then
      v_plate := (v_prefix ->> v_branch_district) || ' ' || (9000 + v_seq);
      insert into public.vehicles (id, plate_number)
      values (gen_random_uuid(), v_plate) returning id into v_vehicle;
    else
      select v.id into v_vehicle from public.vehicles v order by random() limit 1;
    end if;
    select plate_number into v_plate from public.vehicles where id = v_vehicle;

    case v_type
      when 'missing_vehicle' then v_data := jsonb_build_object(
        'plate_number', v_plate,
        'last_seen_location', initcap(v_branch_district) || ' filling station',
        'last_seen_date', to_char(v_rdate, 'YYYY-MM-DD'),
        'reporter_name', pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last),
        'reporter_contact', '+26599' || lpad((400000 + v_seq)::text, 7, '0'));
      when 'vehicle_offense' then v_data := jsonb_build_object(
        'plate_number', v_plate,
        'offense_type', pg_temp.pick(array['Speeding','No driving license','Overloading','Drunk driving','No insurance']),
        'statute_code', case when random() < 0.5 then pg_temp.pick(array['s.316.074','s.316.075','s.322.065']) end,
        'is_criminal', random() < 0.1,
        'court_appearance_required', random() < 0.15,
        'description', 'Offense recorded at checkpoint.',
        'location', 'M1, ' || initcap(v_branch_district),
        'date_occurred', to_char(v_rdate, 'YYYY-MM-DD'));
      when 'road_accident' then v_data := jsonb_build_object(
        'location', 'Junction, ' || initcap(v_branch_district),
        'accident_date', to_char(v_rdate, 'YYYY-MM-DD'),
        'description', 'Collision under investigation.',
        'cause', pg_temp.pick(array['Speeding','Brake failure','Poor visibility','Drunk driving']),
        'severity', case when random() < 0.6 then pg_temp.pick(array['minor','minor','serious','fatal']) end,
        'road_condition', case when random() < 0.6 then pg_temp.pick(array['Dry','Wet','Potholes','Gravel']) end,
        'weather', case when random() < 0.6 then pg_temp.pick(array['Clear','Rain','Fog']) end,
        'vehicles_involved', (select jsonb_agg(
                                jsonb_build_object('plate_number', x.plate_number, 'role', pg_temp.pick(array['at_fault','involved']))
                                || case when random() < 0.5
                                     then jsonb_build_object('driver_name', pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last))
                                     else '{}'::jsonb end)
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

    if v_lat is not null then
      v_data := v_data || jsonb_build_object('latitude', v_lat, 'longitude', v_lng);
    end if;
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_data
      from jsonb_each(v_data) as e(k, v) where v <> 'null';

    v_record := gen_random_uuid();
    insert into public.records
      (id, record_type, domain, reported_by, branch_id, district,
       vehicle_id, person_id, access_level, status, data, created_at)
    values
      (v_record, v_type::record_type, 'traffic', v_officer, v_branch,
       v_branch_district::district, v_vehicle, null,
       v_level::access_level, v_status::case_status, v_data,
       v_rdate + (floor(random() * 12) || ' hours')::interval);

    if v_type in ('missing_vehicle','vehicle_offense','vehicle_impoundment') then
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
         is_paid, district, ticket_number, statute_code, due_date)
      values (v_record, v_vehicle, v_data ->> 'violation_type',
              v_fine, v_paid >= v_fine,
              v_branch_district::district,
              'T-26-' || lpad(v_seq::text, 6, '0'),
              case when random() < 0.5 then pg_temp.pick(array['s.318.18','s.316.074','s.322.065']) end,
              (v_rdate + 30)::date);
      if v_paid > 0 then
        insert into public.citation_payments
          (record_id, amount, receipt_no, note, payer_name, payment_method,
           channel, receiving_branch_id, received_by)
        values (v_record, v_paid, 'R-SEED-' || (70000 + v_seq),
          case when random() < 0.5 then 'Paid at counter.' end,
          pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last),
          pg_temp.pick(array['cash','cash','mobile','bank']),
          'counter', v_branch, v_officer);
      end if;
      if random() < 0.3 then
        update public.traffic_citations
           set court_date = (current_date + (1 + floor(random() * 30))::int),
               court_id = pg_temp.pick(array[v_org_court_bt, v_org_court_ll])
         where record_id = v_record;
      end if;
    end if;
    v_seq := v_seq + 1;
  end loop;

  -- ── LL 4242 demo pack: 3 citations + flag-maintaining offense ──────────
  insert into public.vehicles (id, plate_number, make, model, color, is_flagged, is_verified)
  values (gen_random_uuid(), 'LL 4242', 'Toyota', 'Hilux', 'White', true, true)
  returning id into v_vehicle;
  for v_n in 1..3 loop
    v_fine := 10000 * v_n;
    v_paid := case v_n when 1 then 0 when 2 then 5000 else v_fine end;
    v_record := gen_random_uuid();
    v_rdate := case v_n when 1 then current_date - 40
               else (now() - v_n * interval '4 days')::date end;
    insert into public.records
      (id, record_type, domain, reported_by, branch_id, district,
       vehicle_id, person_id, access_level, status, data, created_at)
    values
      (v_record, 'traffic_citation', 'traffic', v_officer_traffic, v_br_lw_traffic,
       'lilongwe', v_vehicle, null, 'branch', 'active',
       jsonb_build_object('plate_number', 'LL 4242',
         'violation_type', case v_n when 1 then 'Speeding' when 2 then 'Overloading' else 'Drunk driving' end,
         'statute_code', 's.318.18',
         'fine_amount', v_fine, 'location', 'M1, Lilongwe',
         'date_issued', to_char(v_rdate, 'YYYY-MM-DD'),
         'latitude', -13.9833, 'longitude', 33.7833),
        v_rdate);
    insert into public.traffic_citations
      (record_id, vehicle_id, violation_type, fine_amount, is_paid, district,
       ticket_number, statute_code, due_date, court_date, court_id)
    values (v_record, v_vehicle,
      case v_n when 1 then 'Speeding' when 2 then 'Overloading' else 'Drunk driving' end,
      v_fine, v_paid >= v_fine, 'lilongwe',
      'T-26-DEMO-0' || v_n, 's.318.18', (v_rdate + 30)::date,
      case when v_n = 3 then current_date + 21 end, case when v_n = 3 then v_org_court_ll end);
    if v_paid > 0 then
      insert into public.citation_payments
        (record_id, amount, receipt_no, note, payer_name, payment_method,
         channel, receiving_branch_id, received_by)
      values (v_record, v_paid, 'R-SEED-10' || v_n,
        case when v_paid >= v_fine then 'Paid in full.' else 'Part-payment at Blantyre counter.' end,
        'Demo Driver ' || v_n,
        case v_n when 2 then 'mobile' else 'cash' end,
        'counter',
        case v_n when 2 then v_br_bt_traffic else v_br_lw_traffic end,
        case v_n when 2 then v_officer_bt_traffic else v_officer_traffic end);
    end if;
  end loop;
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

  -- ── Voided ticket demo (stays queryable, takes no payments) ──────────
  v_record := gen_random_uuid();
  insert into public.records
    (id, record_type, domain, reported_by, branch_id, district,
     vehicle_id, person_id, access_level, status, data, created_at)
  values
    (v_record, 'traffic_citation', 'traffic', v_officer_traffic, v_br_lw_traffic,
     'lilongwe', v_vehicle, null, 'branch', 'active',
     jsonb_build_object('plate_number', 'LL 4242', 'violation_type', 'Speeding',
       'statute_code', 's.318.18', 'fine_amount', 10000, 'location', 'M1, Lilongwe',
       'date_issued', to_char(current_date - 2, 'YYYY-MM-DD')),
     now() - interval '2 days');
  insert into public.traffic_citations
    (record_id, vehicle_id, violation_type, fine_amount, is_paid, district,
     ticket_number, statute_code, due_date, voided_at, void_reason, void_by)
  values (v_record, v_vehicle, 'Speeding', 10000, false, 'lilongwe',
    'T-26-DEMO-09', 's.318.18', (current_date + 28)::date,
    now() - interval '1 day', 'Duplicate of T-26-DEMO-01 (demo).', v_monitor_traffic);
  insert into public.actions (actor_id, action_type, record_id, reason)
  values (v_monitor_traffic, 'citation_voided', v_record, 'Seeded void demo.');

  -- ── Custody chain: hold+notice (Lilongwe) + hold→release (Blantyre) ───
  select id, reported_by into v_record, v_officer from public.records
   where record_type = 'vehicle_impoundment' and status = 'active'
     and district = 'lilongwe' order by random() limit 1;
  if v_record is not null then
    insert into public.impound_custody
      (record_id, tow_company, lot_location, bay, hold_authority_id,
       hold_basis, hold_placed_at, owner_notified_at, owner_notified_by)
    values (v_record, 'Demo Towing', 'Lilongwe police yard', 'B-04',
      v_monitor_traffic, 'Held pending ownership verification (demo).',
      now() - interval '3 days', now() - interval '2 days', v_officer)
    on conflict (record_id) do nothing;
    insert into public.actions (actor_id, action_type, record_id, reason)
    values (v_monitor_traffic, 'hold_placed', v_record, 'Seeded hold demo.'),
           (v_officer, 'owner_notified', v_record, 'Seeded notice demo.');
  end if;
  select id into v_record from public.records
   where record_type = 'vehicle_impoundment' and status = 'active'
     and district = 'blantyre' order by random() limit 1;
  if v_record is not null then
    insert into public.impound_custody
      (record_id, tow_company, lot_location, bay, hold_authority_id,
       hold_basis, hold_placed_at, owner_notified_at, owner_notified_by,
       release_auth_id, release_at, recipient_name, recipient_id_checked,
       fees_snapshot)
    values (v_record, 'Demo Towing', 'Blantyre police yard', 'A-01',
      v_monitor_country, 'Held for unlicensed operation (demo).',
      now() - interval '6 days', now() - interval '5 days', v_officer_bt_traffic,
      v_monitor_country, now() - interval '1 day',
      'Demo Owner', 'National ID MW-010203', 15000)
    on conflict (record_id) do nothing;
    insert into public.actions (actor_id, action_type, record_id, reason)
    values (v_monitor_country, 'hold_placed', v_record, 'Seeded hold demo.'),
           (v_monitor_country, 'hold_released', v_record, 'Seeded release demo.');
  end if;

  raise notice 'seed/04 traffic: % traffic cases, % citations, % payments.',
    (select count(*) from public.records where domain = 'traffic'),
    (select count(*) from public.traffic_citations),
    (select count(*) from public.citation_payments);
end $$;

commit;
