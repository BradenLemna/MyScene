-- Migration 004: Users.created_at (Batch 3 admin dashboard).
--
-- Idempotent: safe to run on every deploy (scripts/dbUpdate.sh applies every
-- file in migrations/ in name order). Fresh installs get the same column
-- from schema.sql, so this file is a no-op there.
--
-- The verification queue (get_pending_artists.php) shows when each pending
-- account was created. The Users table had no timestamp column, so this
-- adds one. Existing rows are backfilled with the time this migration runs
-- (display-only field; no other logic depends on it).

USE MyScene;

ALTER TABLE Users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
