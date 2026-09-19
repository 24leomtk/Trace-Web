-- TRACE application security: 32 court + audit RLS policies.
-- Run AFTER 10_helpers.sql, as the schema owner. Re-runnable.
-- Covers: court_case_access, referral_documents, actions, notifications,
-- idempotency_keys.
--
-- NOTE on notifications: app inserts go through notifications_write
-- (police / court_liaison / system_admin). DB trigger inserts from
-- 50_notification_triggers.sql run as the table owner via SECURITY DEFINER
-- functions and bypass RLS by design — no policy change needed for them.

alter table public.court_case_access enable row level security;
alter table public.referral_documents enable row level security;
alter table public.actions enable row level security;
alter table public.notifications enable row level security;
alter table public.idempotency_keys enable row level security;

-- court referrals: liaison + referrer + monitors can see; monitors create and
-- renew/revoke; liaisons record outcomes (app enforces the field split).
drop policy if exists court_access_read on public.court_case_access;
create policy court_access_read on public.court_case_access for select to app_user
  using (
    court_liaison_id = public.app_user_id()
    or referred_by = public.app_user_id()
    or public.app_is_monitor()
    or public.app_is_system_admin()
  );
drop policy if exists court_access_refer on public.court_case_access;
create policy court_access_refer on public.court_case_access for insert to app_user
  with check (referred_by = public.app_user_id() and public.app_is_monitor());
drop policy if exists court_access_update on public.court_case_access;
create policy court_access_update on public.court_case_access for update to app_user
  using (
    court_liaison_id = public.app_user_id()
    or referred_by = public.app_user_id()
    or public.app_is_monitor()
  );

-- referral_documents (e-Brief tranches): monitors + the grant's liaison can
-- read; only monitors attach or remove (app enforces which).
drop policy if exists referral_docs_read on public.referral_documents;
create policy referral_docs_read on public.referral_documents for select to app_user
  using (
    public.app_is_monitor()
    or exists (
      select 1 from public.court_case_access g
      where g.id = referral_id
        and (g.court_liaison_id = public.app_user_id() or g.referred_by = public.app_user_id())
    )
  );
drop policy if exists referral_docs_insert on public.referral_documents;
create policy referral_docs_insert on public.referral_documents for insert to app_user
  with check (public.app_is_monitor());
drop policy if exists referral_docs_delete on public.referral_documents;
create policy referral_docs_delete on public.referral_documents for delete to app_user
  using (public.app_is_monitor());

-- actions (append-only audit log): own entries + monitors/admin/auditor.
-- District scoping for district monitors is applied in app code.
drop policy if exists actions_read on public.actions;
create policy actions_read on public.actions for select to app_user
  using (
    actor_id = public.app_user_id()
    or public.app_is_monitor()
    or public.app_is_system_admin()
    or public.app_is_auditor()
  );
drop policy if exists actions_insert on public.actions;
create policy actions_insert on public.actions for insert to app_user
  with check (actor_id = public.app_user_id());

-- notifications: each user reads their own; inserts come from police /
-- liaison / system actors notifying someone in scope (app picks recipients).
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to app_user
  using (
    user_id = public.app_user_id()
    or public.app_is_system_admin()
    or public.app_is_auditor()
  );
drop policy if exists notifications_write on public.notifications;
create policy notifications_write on public.notifications for insert to app_user
  with check (
    public.app_is_police()
    or public.app_my_role() = 'court_liaison'
    or public.app_is_system_admin()
  );
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications for update to app_user
  using (user_id = public.app_user_id())
  with check (user_id = public.app_user_id());

-- idempotency_keys: mobile retry cache, one row per (key, user).
drop policy if exists idempotency_own on public.idempotency_keys;
create policy idempotency_own on public.idempotency_keys for all to app_user
  using (user_id = public.app_user_id())
  with check (user_id = public.app_user_id());
