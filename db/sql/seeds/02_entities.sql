-- TRACE seed 02 — entities: persons_of_interest + vehicles.
-- Run AFTER 01_foundation.sql. Own transaction, self-contained.
-- Notification triggers muted (flag set below). No fixed UUIDs.
--
-- Knobs: v_person_count = 300 · v_vehicle_count = 400.

begin;

select set_config('app.seed_load', 'on', false);
select setseed(0.20260918);

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  v_person_count  integer := 300;
  v_vehicle_count integer := 400;
  v_seq           integer := 900000;
  v_i             integer;
  v_full          text;
  v_nid           text;
  v_last_nid      text := null;
  v_district      text;
  v_plate         text;
  v_registrar     text;
  v_first         text[] := array['Chikondi','Dalitso','Tadala','Mphatso','Wongani','Tiwonge','Yamikani','Chisomo','Madalitso','Alinafe','Pemphero','Limbani','Tamanda','Chimwemwe','Fatsani','Kondwani','Mwayi','Takondwa','Tusekile','Dalo','Chifuniro','Mpho','Zikomo','Thoko'];
  v_last          text[] := array['Banda','Phiri','Moyo','Kachale','Tembo','Nkhoma','Soko','Chirwa','Zimba','Mpakati','Kumwenda','Nyirenda','Kamanga','Mvula','Gondwe','Msowoya','Mhango','Kaunda','Kaliati','Mbewe'];
  v_all_districts text[] := array['balaka','blantyre','chikwawa','chiradzulu','chitipa','dedza','dowa','karonga','kasungu','likoma','lilongwe','machinga','mangochi','mchinji','mulanje','mwanza','mzimba','neno','nkhata_bay','nkhotakota','nsanje','ntcheu','ntchisi','phalombe','rumphi','salima','thyolo','zomba'];
  v_bulk_districts text[] := array['balaka','blantyre','chikwawa','chiradzulu','chitipa','dedza','dowa','karonga','kasungu','lilongwe','machinga','mangochi','mchinji','mulanje','mwanza','mzimba','neno','nkhata_bay','nkhotakota','nsanje','ntcheu','ntchisi','phalombe','salima','thyolo','zomba'];
  v_prefix        jsonb  := '{"balaka":"BA","blantyre":"BT","chikwawa":"CK","chiradzulu":"CZ","chitipa":"CT","dedza":"DZ","dowa":"DW","karonga":"KR","kasungu":"KS","likoma":"LK","lilongwe":"LL","machinga":"MC","mangochi":"MG","mchinji":"MJ","mulanje":"MU","mwanza":"MW","mzimba":"MZ","neno":"NN","nkhata_bay":"NB","nkhotakota":"NK","nsanje":"NS","ntcheu":"NU","ntchisi":"NI","phalombe":"PB","rumphi":"RU","salima":"SM","thyolo":"TH","zomba":"ZA"}';
begin
  select id into v_registrar from public.users where phone_number = '+265997000009';

  -- ── Persons: every 10th row reuses the previous national_id (merge queue)
  -- + 1-in-4 null national_id (unidentified / juvenile / foreign) ──────────
  for v_i in 1..v_person_count loop
    v_full := pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last);
    if v_i % 10 = 0 and v_last_nid is not null then
      v_nid := v_last_nid;
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

  -- Staged duplicate pair for merge testing (same national ID, two rows).
  insert into public.persons_of_interest (id, full_name, national_id, sex, home_district) values
    (gen_random_uuid(), 'Joseph Banda', 'MW-P-909090', 'male', 'lilongwe'),
    (gen_random_uuid(), 'Joseph Banda', 'MW-P-909090', 'male', 'lilongwe');

  -- ── Vehicles: 1-in-4 registrar-verified (verified rows are fully
  -- detailed — that is what verification means); flags stay false here
  -- (cases in 03/04 set them; Seed-refresh.sql recomputes) ───────────────
  for v_i in 1..v_vehicle_count loop
    v_district := pg_temp.pick(v_bulk_districts);
    v_plate := (v_prefix ->> v_district) || ' ' || (1000 + v_seq);
    insert into public.vehicles
      (id, plate_number, make, model, year, color, chassis_number,
       engine_number, owner_name, owner_national_id, owner_phone,
       owner_district, is_flagged, is_verified, registered_by, verified_at)
    values
      (gen_random_uuid(), v_plate,
       pg_temp.pick(array['Toyota','Nissan','Honda','Mazda','Mitsubishi','Ford','VW']),
       pg_temp.pick(array['Corolla','Navara','Fit','Demio','Pajero','Ranger','Golf']),
       -- year/chassis/engine: always on verified rows, ~80% otherwise.
       case when v_i % 4 = 0 or random() < 0.8 then 2005 + floor(random() * 20)::int end,
       pg_temp.pick(array['Silver','White','Black','Blue','Red','Grey']),
       case when v_i % 4 = 0 or random() < 0.8
            then 'CHS-MW-' || lpad((100000 + v_seq)::text, 6, '0') end,
       case when v_i % 4 = 0 or random() < 0.8
            then 'ENG-' || lpad((200000 + v_seq)::text, 6, '0') end,
       case when v_i % 3 = 0 then pg_temp.pick(v_first) || ' ' || pg_temp.pick(v_last) end,
       case when v_i % 3 = 0 then 'MW-P-' || (300000 + v_seq) end,
       case when v_i % 3 = 0 then '+26599' || lpad((500000 + v_seq)::text, 7, '0') end,
       case when v_i % 3 = 0 then pg_temp.pick(v_all_districts)::district end,
       false,
       v_i % 4 = 0,
       case when v_i % 4 = 0 then v_registrar end,
       case when v_i % 4 = 0 then now() - ((v_seq % 90) || ' days')::interval end);
    v_seq := v_seq + 1;
  end loop;

  raise notice 'seed/02 entities: % persons, % vehicles.',
    (select count(*) from public.persons_of_interest), (select count(*) from public.vehicles);
end $$;

commit;
