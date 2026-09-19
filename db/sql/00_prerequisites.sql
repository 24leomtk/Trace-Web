-- TRACE application security: 00 prerequisites.
-- Run FIRST, after the Drizzle schema migration, as the schema owner.
-- Re-runnable. Creates extensions + app_user role + grants.
-- The application connection must use app_user (or a role granted app_user)
-- for PostgreSQL RLS to be effective.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user noinherit login;
  end if;
end $$;

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;

-- Let the administrative connection role become app_user inside transactions
-- (`set local role app_user` in lib/db-context.ts). Idempotent.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    if not pg_has_role(current_user, 'app_user', 'member')
       or not pg_has_role(current_user, 'app_user', 'usage') then
      begin
        execute format(
          'grant app_user to %I with inherit true, set true',
          current_user
        );
      exception when insufficient_privilege then
        raise warning 'Could not grant app_user to % — run as a role with CREATEROLE/ADMIN OPTION.', current_user;
      end;
    end if;
  end if;
end $$;
