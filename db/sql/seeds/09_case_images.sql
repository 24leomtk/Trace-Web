-- TRACE seed 09 — case images for missing persons + missing vehicles.
-- Run AFTER 08_notifications_audit.sql (or standalone on a seeded database).
-- Own transaction, self-contained. Re-runnable: wipes this file's own rows
-- first (storage_path prefix is unique to seed 09), then inserts fresh —
-- deterministic on every run.
--
--   persons : 1–3 portraits from randomuser.me per missing_person record
--             (men/women from the case payload's sex, else id-hash fallback;
--             image 0–99, e.g. https://randomuser.me/api/portraits/women/44.jpg)
--   vehicles: 1–3 photos from picsum.photos per missing_vehicle record
--             (deterministic seed per plate, e.g.
--             https://picsum.photos/seed/trace-vehicle-LL4242-1/800/600)
--
-- Per-record spread (1–3) is derived from hashtext(record id), NOT random():
-- a LATERAL generate_series bound without an outer reference is evaluated
-- once per query, which would give every record the same count.
--
-- Uploader is stamped as the filing officer (reported_by); attachments inherit
-- the parent record's visibility, so no access_level handling is needed here.

begin;

select setseed(0.20260918);

delete from public.record_attachments
 where storage_path like 'seed/missing-%';

-- ── Missing persons: portraits ──────────────────────────────────────────
insert into public.record_attachments
  (record_id, person_id, vehicle_id, url, storage_path, file_type,
   file_size_bytes, retention_until, uploaded_by, created_at)
select
  r.id,
  r.person_id,
  null,
  'https://randomuser.me/api/portraits/'
    || case coalesce(nullif(r.data ->> 'sex', ''),
                     case when abs(hashtext(r.id::text)::bigint) % 2 = 0 then 'male' else 'female' end)
         when 'female' then 'women' else 'men' end
    || '/' || (abs(hashtext(r.id::text || '#' || g::text)::bigint) % 100)::text || '.jpg',
  'seed/missing-person/' || substr(r.id::text, 1, 8) || '-' || g || '.jpg',
  'image/jpeg',
  (40000 + floor(random() * 400000))::int,
  now() + interval '5 years',
  r.reported_by,
  r.created_at + (floor(random() * 72) || ' hours')::interval
from public.records r
cross join lateral generate_series(1, 1 + (abs(hashtext(r.id::text)::bigint) % 3)::int) as g
where r.record_type = 'missing_person';

-- ── Missing vehicles: photos ────────────────────────────────────────────
insert into public.record_attachments
  (record_id, person_id, vehicle_id, url, storage_path, file_type,
   file_size_bytes, retention_until, uploaded_by, created_at)
select
  r.id,
  null,
  r.vehicle_id,
  'https://picsum.photos/seed/trace-vehicle-'
    || regexp_replace(coalesce(v.plate_number, r.id::text), '[^A-Za-z0-9]', '', 'g')
    || '-' || g || '/800/600',
  'seed/missing-vehicle/'
    || regexp_replace(coalesce(v.plate_number, r.id::text), '[^A-Za-z0-9]', '', 'g')
    || '-' || g || '.jpg',
  'image/jpeg',
  (80000 + floor(random() * 600000))::int,
  now() + interval '5 years',
  r.reported_by,
  r.created_at + (floor(random() * 72) || ' hours')::interval
from public.records r
left join public.vehicles v on v.id = r.vehicle_id
cross join lateral generate_series(1, 1 + (abs(hashtext(r.id::text)::bigint) % 3)::int) as g
where r.record_type = 'missing_vehicle';

do $$
declare
  v_person_imgs integer; v_vehicle_imgs integer;
begin
  select count(*) into v_person_imgs from public.record_attachments a
    join public.records r on r.id = a.record_id
   where r.record_type = 'missing_person';
  select count(*) into v_vehicle_imgs from public.record_attachments a
    join public.records r on r.id = a.record_id
   where r.record_type = 'missing_vehicle';
  raise notice 'seed/09 case images: % person portraits, % vehicle photos.',
    v_person_imgs, v_vehicle_imgs;
end $$;

commit;
