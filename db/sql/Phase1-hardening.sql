-- ===========================================================================
-- TRACE Phase 1 hardening (N5) — user-scope CHECK constraints + trigram search
--
-- Why this file exists: `db/schema/auth.ts` documents that the per-role
-- nullability rules for users (officer -> branch, monitor -> district, …)
-- are enforced in application code only. This script adds them as real
-- database CHECK constraints, plus pg_trgm indexes backing the F5 unified
-- search (ILIKE %…% on names/plates/IDs).
--
-- Apply:  psql "$DATABASE_URL" -f db/sql/Phase1-hardening.sql
-- Safe to re-run: every statement is IF NOT EXISTS / guarded by name check.
-- Rollback: DROP INDEX IF EXISTS … / ALTER TABLE users DROP CONSTRAINT ….
-- ===========================================================================

-- 1. Trigram support for fuzzy search (F5). ---------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS persons_of_interest_full_name_trgm_idx
  ON persons_of_interest USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS persons_of_interest_national_id_trgm_idx
  ON persons_of_interest USING gin (national_id gin_trgm_ops);

CREATE INDEX IF NOT EXISTS vehicles_plate_number_trgm_idx
  ON vehicles USING gin (plate_number gin_trgm_ops);

-- 2. Per-role scope rules on users (N5). ------------------------------------
-- Each role may only carry the scope columns it is supposed to have:
--   officer                 -> domain + branch_id,          no district/org
--   district_monitor        -> domain + district,           no branch/org
--   country_monitor         -> domain only,                 no branch/district/org
--   system_admin,
--   compliance_auditor      -> no scope columns at all
--   court_liaison,
--   insurance_portal_user,
--   vehicle_registrar       -> organization_id only,        no domain/branch/district
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_scope_chk'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_role_scope_chk CHECK (
      (
        role::text = 'officer'
        AND domain IS NOT NULL
        AND branch_id IS NOT NULL
        AND district IS NULL
        AND organization_id IS NULL
      ) OR (
        role::text = 'district_monitor'
        AND domain IS NOT NULL
        AND district IS NOT NULL
        AND branch_id IS NULL
        AND organization_id IS NULL
      ) OR (
        role::text = 'country_monitor'
        AND domain IS NOT NULL
        AND branch_id IS NULL
        AND district IS NULL
        AND organization_id IS NULL
      ) OR (
        role::text IN ('system_admin', 'compliance_auditor')
        AND domain IS NULL
        AND branch_id IS NULL
        AND district IS NULL
        AND organization_id IS NULL
      ) OR (
        role::text IN ('court_liaison', 'insurance_portal_user', 'vehicle_registrar')
        AND organization_id IS NOT NULL
        AND domain IS NULL
        AND branch_id IS NULL
        AND district IS NULL
      )
    );
  END IF;
END
$$;
