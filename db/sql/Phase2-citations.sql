-- ===========================================================================
-- TRACE Phase 2 (F3) — citation fine ledger + court scheduling
--
-- Extends traffic_citations with monitor-scheduled court fields and adds the
-- append-only citation_payments ledger. traffic_citations.is_paid becomes
-- derived (total payments >= fine) instead of toggled.
--
-- Apply:  psql "$DATABASE_URL" -f db/sql/Phase2-citations.sql
-- Safe to re-run: guarded with IF NOT EXISTS / name checks.
-- Rollback:
--   DROP TABLE IF EXISTS citation_payments;
--   ALTER TABLE traffic_citations DROP COLUMN IF EXISTS court_date;
--   ALTER TABLE traffic_citations DROP COLUMN IF EXISTS court_id;
--   DROP INDEX IF EXISTS traffic_citations_court_date_idx;
--   DROP INDEX IF EXISTS citation_payments_record_id_idx;
--   DROP INDEX IF EXISTS citation_payments_receipt_no_idx;
-- ===========================================================================

-- 1. Court scheduling columns on the citation projection. --------------------
ALTER TABLE traffic_citations
  ADD COLUMN IF NOT EXISTS court_date date;

ALTER TABLE traffic_citations
  ADD COLUMN IF NOT EXISTS court_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS traffic_citations_court_date_idx
  ON traffic_citations (court_date);

-- 2. Append-only payment ledger. --------------------------------------------
CREATE TABLE IF NOT EXISTS citation_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  receipt_no text NOT NULL UNIQUE,
  note text,
  received_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS citation_payments_record_id_idx
  ON citation_payments (record_id);

CREATE INDEX IF NOT EXISTS citation_payments_receipt_no_idx
  ON citation_payments (receipt_no);
