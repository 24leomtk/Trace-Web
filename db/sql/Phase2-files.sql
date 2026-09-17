-- ===========================================================================
-- TRACE Phase 2 (N2) — evidence files: hash, size, retention
--
-- Extends record_attachments (and referral bundle docs) with SHA-256 hashes,
-- known sizes, and a retention horizon. Upload kinds widen from images-only
-- to images + PDFs + video + audio (Cloudinary image/video/raw endpoints).
--
-- Apply:  psql "$DATABASE_URL" -f db/sql/Phase2-files.sql
-- Safe to re-run: guarded with IF NOT EXISTS.
-- Rollback:
--   ALTER TABLE record_attachments DROP COLUMN IF EXISTS file_hash;
--   ALTER TABLE record_attachments DROP COLUMN IF EXISTS file_size_bytes;
--   ALTER TABLE record_attachments DROP COLUMN IF EXISTS retention_until;
--   ALTER TABLE referral_documents DROP COLUMN IF EXISTS file_hash;
-- ===========================================================================

ALTER TABLE record_attachments
  ADD COLUMN IF NOT EXISTS file_hash text;

ALTER TABLE record_attachments
  ADD COLUMN IF NOT EXISTS file_size_bytes integer;

ALTER TABLE record_attachments
  ADD COLUMN IF NOT EXISTS retention_until timestamptz;

ALTER TABLE referral_documents
  ADD COLUMN IF NOT EXISTS file_hash text;
