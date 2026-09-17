-- ===========================================================================
-- TRACE Phase 2 (F4) — e-Brief bundle + referral SLA
--
-- Adds liaison first-view tracking on court_case_access and the append-only
-- referral_documents bundle (tranches attached to a referral after it is
-- made). Together with created_at (referred) and outcome_recorded_at, this
-- drives referral timeliness (referred → viewed → outcome).
--
-- Apply:  psql "$DATABASE_URL" -f db/sql/Phase2-ebrief.sql
-- Safe to re-run: guarded with IF NOT EXISTS / name checks.
-- Rollback:
--   DROP TABLE IF EXISTS referral_documents;
--   ALTER TABLE court_case_access DROP COLUMN IF EXISTS first_viewed_at;
-- ===========================================================================

-- 1. First-view timestamp for SLA measurement. -------------------------------
ALTER TABLE court_case_access
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz;

-- 2. E-Brief document bundle. ------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES court_case_access(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  storage_path text NOT NULL,
  file_type text NOT NULL,
  uploaded_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_documents_referral_id_idx
  ON referral_documents (referral_id);
