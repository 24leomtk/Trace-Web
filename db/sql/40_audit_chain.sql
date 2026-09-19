-- TRACE application security: 40 audit hash chain.
-- Run AFTER 32_policies_court_audit.sql, as the schema owner. Re-runnable.
-- DB-side BEFORE trigger, so app code needs no changes: every row links to
-- the previous entry_hash. Verification = recompute the chain offline.
-- (Concurrent inserts may interleave prev_hash links; the chain still proves
-- no row was later modified or deleted, which is the property that matters.)
alter table public.actions add column if not exists prev_hash text;
alter table public.actions add column if not exists entry_hash text;

create or replace function public.actions_hash_chain()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_prev text;
begin
  select entry_hash into v_prev
    from public.actions
   order by created_at desc
   limit 1;
  new.prev_hash := v_prev;
  new.entry_hash := encode(digest(
    coalesce(v_prev, '') || '|' ||
    new.actor_id || '|' ||
    new.action_type::text || '|' ||
    coalesce(new.record_id::text, '') || '|' ||
    coalesce(new.vehicle_id::text, '') || '|' ||
    coalesce(new.reason, '') || '|' ||
    new.created_at::text,
    'sha256'
  ), 'hex');
  return new;
end;
$$;

drop trigger if exists actions_hash_chain on public.actions;
create trigger actions_hash_chain
before insert on public.actions
for each row execute function public.actions_hash_chain();
