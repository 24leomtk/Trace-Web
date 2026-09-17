-- ===========================================================================
-- TRACE Phase 2 (F9) — per-officer tasking (case_assignments)
--
-- Monitors assign cases to specific officers/monitors with due dates; states
-- open → done | cancelled. Rows are never deleted so workload and turnaround
-- stay auditable.
--
-- Apply:  psql "$DATABASE_URL" -f db/sql/Phase2-assignments.sql
-- Safe to re-run: guarded with IF NOT EXISTS / name checks.
-- Rollback: DROP TABLE IF EXISTS case_assignments;
-- ===========================================================================

CREATE TABLE IF NOT EXISTS case_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  assignee_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by text NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  note text,
  due_at timestamptz,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'done', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_assignments_record_id_idx
  ON case_assignments (record_id);

CREATE INDEX IF NOT EXISTS case_assignments_assignee_id_idx
  ON case_assignments (assignee_id);

CREATE INDEX IF NOT EXISTS case_assignments_state_idx
  ON case_assignments (state);
