-- TRACE seed 11 — taxation: automation rules + tax ledger.
-- Run AFTER 10_queues.sql (or standalone on a seeded database that has the
-- MRA org + users from 01_foundation.sql). Own transaction, self-contained.
-- Re-runnable: rules upsert by (org, type, period); ledger inserts are
-- additive by design (each run is a new billing batch).
--
-- Covers every TaxHome filter chip + the compliance queue:
--   paid / overdue-unpaid / due-soon / future / waiver-approved /
--   waiver-pending (×3 for the decision queue) / waiver-rejected / exempt
--   (moratorium + duty-free CPC) / TIP-linked road access rows.
-- Two flag-demo plates get overdue unpaid carbon with NO active cases, so
-- their flag is purely tax-driven after Seed-refresh.sql runs.
--
-- Notification triggers stay MUTED here (bulk determinism, like 01–07);
-- approval_needed inbox fixtures live in seeds/08.

begin;

select set_config('app.seed_load', 'on', false);
select setseed(0.20261129);

create or replace function pg_temp.pick(anyarray) returns anyelement as $$
  select $1[floor(random() * array_length($1, 1))::int + 1];
$$ language sql;

do $$
declare
  v_tax_count integer := 120;
  v_i         integer;
  v_n         integer;
  v_seq       integer := 700000;
  v_r         float;
  v_org_mra   uuid;
  v_off1      text;
  v_off2      text;
  v_comp      text;
  v_admin     text;
  v_vehicle   uuid;
  v_cc        integer;
  v_plate     text;
  v_type      text;
  v_amt       integer;
  v_due       date;
  v_state     text;
  v_tax       uuid;
  v_types     text[] := array['license_fee','license_fee','carbon_tax','carbon_tax',
                              'import_duty','import_excise','import_vat',
                              'road_access_fee','transit_fee','toll_fee','penalty'];
begin
  select id into v_org_mra from public.organizations where name = 'Malawi Revenue Authority';
  if v_org_mra is null then
    raise exception 'Seed assumption failed: no Malawi Revenue Authority org (run 01_foundation.sql first)';
  end if;
  select id into v_off1 from public.users where phone_number = '+265997000019';
  select id into v_off2 from public.users where phone_number = '+265997000020';
  select id into v_comp from public.users where phone_number = '+265997000021';
  select id into v_admin from public.users where phone_number = '+265997000001';

  -- ── Automation rules: 2 live (license flat, carbon banded), rest off ──
  -- (admin-managed reference data; the toggle UI needs both states present)
  insert into public.tax_automation_rules
    (owner_org_id, tax_type, period, is_enabled, amount, engine_bands,
     due_day_offset, updated_by)
  values
    (v_org_mra, 'license_fee', 'annual', true, 15000, null, 30, v_admin),
    (v_org_mra, 'carbon_tax', 'annual', true, null,
     '{"2000":40000,"3000":60000,"above":90000}', 30, v_admin),
    (v_org_mra, 'road_access_fee', 'quarterly', false, 35000, null, 14, v_admin),
    (v_org_mra, 'transit_fee', 'monthly', false, 95000, null, 7, v_admin),
    (v_org_mra, 'import_duty', 'annual', false, null, null, 30, v_admin),
    (v_org_mra, 'import_excise', 'annual', false, null, null, 30, v_admin),
    (v_org_mra, 'import_vat', 'annual', false, null, null, 30, v_admin),
    (v_org_mra, 'toll_fee', 'quarterly', false, 5000, null, 14, v_admin),
    (v_org_mra, 'penalty', 'annual', false, null, null, 30, v_admin)
  on conflict (owner_org_id, tax_type, period)
  do update set is_enabled = excluded.is_enabled,
                amount = excluded.amount,
                engine_bands = excluded.engine_bands,
                due_day_offset = excluded.due_day_offset,
                updated_by = excluded.updated_by,
                updated_at = now();

  -- ── Ledger loop ─────────────────────────────────────────────────────
  for v_i in 1..v_tax_count loop
    select v.id, v.engine_cc, v.plate_number into v_vehicle, v_cc, v_plate
      from public.vehicles v order by random() limit 1;
    continue when v_vehicle is null;
    v_type := pg_temp.pick(v_types);
    v_r := random();
    v_state := case when v_r < 0.35 then 'paid'
                    when v_r < 0.55 then 'overdue'
                    when v_r < 0.70 then 'soon'
                    when v_r < 0.80 then 'future'
                    when v_r < 0.85 then 'waived'
                    when v_r < 0.90 then 'pending'
                    when v_r < 0.95 then 'rejected'
                    else 'exempt' end;

    -- Amounts: Malawi-plausible per type (carbon follows engine bands).
    v_amt := case v_type
      when 'import_duty' then 250000 + floor(random() * 1250000)::int
      when 'import_excise' then 100000 + floor(random() * 700000)::int
      when 'import_vat' then 150000 + floor(random() * 850000)::int
      when 'carbon_tax' then case when v_cc is null then 40000
                                 when v_cc <= 2000 then 40000
                                 when v_cc <= 3000 then 60000
                                 else 90000 end
      when 'road_access_fee' then 35000
      when 'transit_fee' then 45000 + floor(random() * 75000)::int
      when 'license_fee' then 15000
      when 'toll_fee' then 5000
      else 50000 + floor(random() * 150000)::int end;

    v_due := case v_state
      when 'paid' then current_date - (1 + floor(random() * 60))::int
      when 'overdue' then current_date - (5 + floor(random() * 40))::int
      when 'soon' then current_date + (5 + floor(random() * 20))::int
      when 'waived' then current_date - (10 + floor(random() * 30))::int
      when 'pending' then current_date - (3 + floor(random() * 20))::int
      when 'rejected' then current_date - (3 + floor(random() * 20))::int
      when 'exempt' then current_date - floor(random() * 90)::int
      else current_date + (60 + floor(random() * 140))::int end;

    v_tax := gen_random_uuid();
    insert into public.vehicle_taxes
      (id, vehicle_id, owner_org_id, tax_type, amount_due,
       is_paid, paid_at, receipt_no, received_by,
       due_date, reference_no, engine_cc,
       is_waived, is_exempt, waiver_status, waiver_reason,
       waiver_decided_by, waiver_decided_at, entered_by)
    values
      (v_tax, v_vehicle, v_org_mra, v_type, v_amt,
       v_state = 'paid',
       case when v_state = 'paid' then v_due + (1 + floor(random() * 10))::int end,
       case when v_state = 'paid' then 'TAX-R-' || (80000 + v_seq) end,
       case when v_state = 'paid'
            then (case when random() < 0.5 then v_off1 else v_off2 end) end,
       v_due,
       case v_type when 'road_access_fee' then 'TIP-26-' || (90000 + v_seq)
                   else 'TAX-2026-' || (60000 + v_seq) end,
       v_cc,
       v_state = 'waived',
       v_state = 'exempt',
       case v_state when 'waived' then 'approved'
                     when 'pending' then 'pending'
                     when 'rejected' then 'rejected'
                     else 'none' end,
       case when v_state in ('waived','pending','rejected')
            then pg_temp.pick(array[
              'Vehicle qualifies under institutional exemption.',
              'Duplicate assessment issued at the border post.',
              'Owner produced valid prior receipt.',
              'Assessment entered against the wrong plate.']) end,
       case when v_state in ('waived','rejected') then v_comp end,
       case when v_state in ('waived','rejected') then now() - interval '2 days' end,
       case when random() < 0.5 then v_off1 else v_off2 end);
    v_seq := v_seq + 1;
  end loop;

  -- ── Flag-demo plates: overdue unpaid carbon, NO active cases ─────────
  -- (their flag after Seed-refresh.sql is purely tax-driven)
  for v_n in 1..2 loop
    select v.id, v.engine_cc into v_vehicle, v_cc from public.vehicles v
     where not exists (
       select 1 from public.vehicle_cases vc
        where vc.vehicle_id = v.id and vc.status = 'active')
     order by random() limit 1;
    continue when v_vehicle is null;
    insert into public.vehicle_taxes
      (vehicle_id, owner_org_id, tax_type, amount_due, due_date,
       reference_no, engine_cc, entered_by)
    values
      (v_vehicle, v_org_mra, 'carbon_tax',
       case when v_cc is null then 40000 when v_cc <= 2000 then 40000
            when v_cc <= 3000 then 60000 else 90000 end,
       current_date - 20, 'TAX-2026-DEMO-' || v_n, v_cc, v_off1);
  end loop;

  -- ── Representative audit rows (one per new action type, at least) ────
  insert into public.actions (actor_id, action_type, vehicle_id, reason)
  select v_off1, 'tax_assessed', t.vehicle_id,
         'assess ' || t.tax_type || ' ' || t.amount_due || ' due ' || t.due_date || '.'
    from public.vehicle_taxes t order by random() limit 4;
  insert into public.actions (actor_id, action_type, vehicle_id, reason)
  select v_off1, 'tax_payment_recorded', t.vehicle_id,
         'pay ' || t.amount_due || ' receipt ' || t.receipt_no || ' receiver ' || 'Chrispin Banda' || '.'
    from public.vehicle_taxes t where t.is_paid order by random() limit 2;
  insert into public.actions (actor_id, action_type, vehicle_id, reason)
  select v_off1, 'tax_waiver_proposed', t.vehicle_id,
         'waive-propose ' || t.amount_due || ' because ' || left(coalesce(t.waiver_reason, ''), 80) || '.'
    from public.vehicle_taxes t where t.waiver_status = 'pending' limit 1;
  insert into public.actions (actor_id, action_type, vehicle_id, reason)
  select v_comp, 'tax_waiver_decided', t.vehicle_id,
         'waive-' || t.waiver_status || ' ' || t.amount_due || '.'
    from public.vehicle_taxes t where t.waiver_status in ('approved','rejected') limit 2;
  insert into public.actions (actor_id, action_type, reason)
  values (v_admin, 'tax_rule_updated', 'rule carbon_tax/annual enabled.');

  raise notice 'seed/11 taxation: % assessments, % rules.',
    (select count(*) from public.vehicle_taxes),
    (select count(*) from public.tax_automation_rules);
end $$;

commit;
