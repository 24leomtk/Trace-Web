-- TRACE application security: 31 case RLS policies.
-- Run AFTER 10_helpers.sql + 30_policies_core.sql, as the schema owner.
-- Re-runnable. Covers: records, record_attachments, coded projections,
-- case_reviews, citation_payments, case_assignments, impound_custody.

alter table public.records enable row level security;
alter table public.record_attachments enable row level security;
alter table public.missing_person_cases enable row level security;
alter table public.wanted_person_cases enable row level security;
alter table public.vehicle_cases enable row level security;
alter table public.accidents enable row level security;
alter table public.accident_vehicles enable row level security;
alter table public.traffic_citations enable row level security;
alter table public.citation_payments enable row level security;
alter table public.impound_custody enable row level security;
alter table public.case_reviews enable row level security;
alter table public.case_assignments enable row level security;

-- records: the visibility tiers in app_can_read_record. INSERT is
-- reporter-only; UPDATE is filer-or-monitor (officers can only touch what
-- they filed — enforced here, not just in app code).
drop policy if exists records_read on public.records;
create policy records_read on public.records for select to app_user
  using (public.app_can_read_record(records));
drop policy if exists records_police_insert on public.records;
create policy records_police_insert on public.records for insert to app_user
  with check (reported_by = public.app_user_id() and public.app_is_police());
drop policy if exists records_filer_update on public.records;
create policy records_filer_update on public.records for update to app_user
  using (
    public.app_can_read_record(records)
    and reported_by = public.app_user_id()
  )
  with check (
    public.app_can_read_record(records)
    and reported_by = public.app_user_id()
  );
drop policy if exists records_monitor_update on public.records;
create policy records_monitor_update on public.records for update to app_user
  using (
    public.app_can_read_record(records)
    and public.app_is_monitor()
    and reported_by <> public.app_user_id()
  )
  with check (
    public.app_can_read_record(records)
    and public.app_is_monitor()
  );

-- attachments inherit the parent record's visibility; uploaders see own rows.
drop policy if exists attachments_read on public.record_attachments;
create policy attachments_read on public.record_attachments for select to app_user
  using (
    uploaded_by = public.app_user_id()
    or exists (
      select 1 from public.records r
      where r.id = record_id and public.app_can_read_record(r)
    )
  );
drop policy if exists attachments_insert on public.record_attachments;
create policy attachments_insert on public.record_attachments for insert to app_user
  with check (uploaded_by = public.app_user_id());

-- coded projections: readable wherever the parent case is readable; written
-- by the app alongside the parent record (police context).
drop policy if exists coded_read on public.missing_person_cases;
create policy coded_read on public.missing_person_cases for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists coded_write on public.missing_person_cases;
create policy coded_write on public.missing_person_cases for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

drop policy if exists wanted_read on public.wanted_person_cases;
create policy wanted_read on public.wanted_person_cases for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists wanted_write on public.wanted_person_cases;
create policy wanted_write on public.wanted_person_cases for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

drop policy if exists vehicle_cases_read on public.vehicle_cases;
create policy vehicle_cases_read on public.vehicle_cases for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists vehicle_cases_write on public.vehicle_cases;
create policy vehicle_cases_write on public.vehicle_cases for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

drop policy if exists accidents_read on public.accidents;
create policy accidents_read on public.accidents for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists accidents_write on public.accidents;
create policy accidents_write on public.accidents for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

drop policy if exists accident_vehicles_read on public.accident_vehicles;
create policy accident_vehicles_read on public.accident_vehicles for select to app_user
  using (
    exists (
      select 1 from public.accidents a
      join public.records r on r.id = a.record_id
      where a.id = accident_id and public.app_can_read_record(r)
    )
  );
drop policy if exists accident_vehicles_write on public.accident_vehicles;
create policy accident_vehicles_write on public.accident_vehicles for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

drop policy if exists citations_read on public.traffic_citations;
create policy citations_read on public.traffic_citations for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists citations_write on public.traffic_citations;
create policy citations_write on public.traffic_citations for all to app_user
  using (public.app_is_police()) with check (public.app_is_police());

-- case_reviews: readable wherever the parent case is readable; written by
-- the reviewer (monitors + filing officers — app checks which).
drop policy if exists reviews_read on public.case_reviews;
create policy reviews_read on public.case_reviews for select to app_user
  using (
    exists (
      select 1 from public.records r
      where r.id = record_id and public.app_can_read_record(r)
    )
  );
drop policy if exists reviews_write on public.case_reviews;
create policy reviews_write on public.case_reviews for insert to app_user
  with check (
    reviewer_id = public.app_user_id()
    and public.app_is_police()
    and exists (
      select 1 from public.records r
      where r.id = record_id and public.app_can_read_record(r)
    )
  );

-- citation_payments (fine ledger, append-only): readable wherever the parent
-- citation is readable; written by police in scope (app checks reporter vs
-- monitor). is_paid is recomputed from this table.
drop policy if exists citation_payments_read on public.citation_payments;
create policy citation_payments_read on public.citation_payments for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists citation_payments_write on public.citation_payments;
create policy citation_payments_write on public.citation_payments for insert to app_user
  with check (public.app_is_police());

-- case_assignments (tasking): assignee + assigner + anyone who can read the
-- case; monitors create; assignee or monitor completes/cancels (app checks).
drop policy if exists assignments_read on public.case_assignments;
create policy assignments_read on public.case_assignments for select to app_user
  using (
    assignee_id = public.app_user_id()
    or assigned_by = public.app_user_id()
    or exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r))
  );
drop policy if exists assignments_insert on public.case_assignments;
create policy assignments_insert on public.case_assignments for insert to app_user
  with check (assigned_by = public.app_user_id() and public.app_is_monitor());
drop policy if exists assignments_update on public.case_assignments;
create policy assignments_update on public.case_assignments for update to app_user
  using (assignee_id = public.app_user_id() or public.app_is_monitor())
  with check (assignee_id = public.app_user_id() or public.app_is_monitor());

-- impound_custody (Phase 4): readable wherever the parent impoundment is
-- readable; hold/release/notice written by police (app checks filer vs hold
-- authority vs monitor — the lot executes but never authorizes).
drop policy if exists impound_custody_read on public.impound_custody;
create policy impound_custody_read on public.impound_custody for select to app_user
  using (exists (select 1 from public.records r where r.id = record_id and public.app_can_read_record(r)));
drop policy if exists impound_custody_write on public.impound_custody;
create policy impound_custody_write on public.impound_custody for insert to app_user
  with check (public.app_is_police());
drop policy if exists impound_custody_update on public.impound_custody;
create policy impound_custody_update on public.impound_custody for update to app_user
  using (public.app_is_police())
  with check (public.app_is_police());
