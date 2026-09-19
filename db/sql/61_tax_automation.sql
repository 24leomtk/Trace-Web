-- TRACE tax automation: 61 recurring-tax generator.
-- Run AFTER 10_helpers.sql, as the schema owner. Re-runnable.
--
-- trace_generate_recurring_taxes() loops enabled tax_automation_rules,
-- computes the current period bounds (UTC month / quarter / calendar year),
-- and inserts the missing current-period assessments — one row per vehicle
-- per rule. Idempotent via ON CONFLICT (vehicle_id, tax_type, period_start):
-- enabling a rule backfills the current period on the next tick, and
-- re-runs insert 0 rows.
--
-- Amounts: engine-band match on vehicles.engine_cc when the rule carries
-- engine_bands (Malawi carbon bands, e.g. {"2000":40000,"3000":60000,
-- "above":90000} — first band whose ceiling covers the engine wins),
-- else the rule's flat amount. Zero-amount results are skipped.
--
-- Attribution: assessments + the per-rule summary audit row name the rule's
-- updated_by officer (cron has no user id; the chain must name the human
-- who armed the rule — see the tax plan §2b).
--
-- Notification discipline: the function raises app.seed_load locally so the
-- trace_tax_write colleague trigger stays silent — a daily tick generating
-- hundreds of assessments must not fan out into hundreds of inbox rows.
-- SECURITY DEFINER so the pg_cron worker (and any caller) bypasses RLS
-- by design, like every other trace_* writer.

create or replace function public.trace_generate_recurring_taxes()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  r       record;
  v_start date;
  v_end   date;
  v_due   date;
  v_today date := (now() at time zone 'utc')::date;
  v_count integer := 0;
  v_n     integer;
begin
  -- Seed runs skip generation (11_taxation.sql plants explicit rows).
  if pg_trigger_depth() > 1 or public.trace_seed_muted() then return 0; end if;
  -- Mute colleague fan-out for the bulk inserts below (transaction-local).
  perform set_config('app.seed_load', 'on', true);

  for r in select * from public.tax_automation_rules where is_enabled loop
    if r.period = 'monthly' then
      v_start := date_trunc('month', v_today)::date;
      v_end := (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date;
    elsif r.period = 'quarterly' then
      v_start := date_trunc('quarter', v_today)::date;
      v_end := (date_trunc('quarter', v_today) + interval '3 months' - interval '1 day')::date;
    else -- annual
      v_start := make_date(extract(year from v_today)::int, 1, 1);
      v_end := make_date(extract(year from v_today)::int, 12, 31);
    end if;
    v_due := v_start + r.due_day_offset;

    with gen as (
      select
        v.id as vid,
        v.engine_cc as ecc,
        case
          when r.engine_bands is not null and v.engine_cc is not null then
            coalesce(
              (select b.value::numeric
                 from jsonb_each_text(r.engine_bands) as b(key, value)
                where b.key ~ '^[0-9]+$' and v.engine_cc <= b.key::int
                order by b.key::int
                limit 1),
              nullif(r.engine_bands ->> 'above', '')::numeric,
              r.amount,
              0)
          else coalesce(r.amount, 0)
        end as amt
      from public.vehicles v
    )
    insert into public.vehicle_taxes
      (vehicle_id, owner_org_id, tax_type, amount_due, due_date,
       period_start, period_end, engine_cc, entered_by)
    select g.vid, r.owner_org_id, r.tax_type, g.amt,
      v_due, v_start, v_end, g.ecc, r.updated_by
      from gen g
     where g.amt > 0
    on conflict (vehicle_id, tax_type, period_start) do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;

    if v_n > 0 and r.updated_by is not null then
      insert into public.actions (actor_id, action_type, reason)
      values (r.updated_by, 'tax_assessed',
        'auto ' || r.id::text || ': generated ' || v_n || ' ' ||
        r.tax_type || ' assessments for ' || r.period || ' period starting ' ||
        to_char(v_start, 'YYYY-MM-DD') || '.');
    end if;
  end loop;
  return v_count;
end;
$fn$;
