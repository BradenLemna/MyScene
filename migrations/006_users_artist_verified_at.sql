-- Migration 006: Users.artist_verified_at (admin "Artist Profiles" section).
--
-- Idempotent: safe to run on every deploy (scripts/dbUpdate.sh applies every
-- file in migrations/ in name order). Fresh installs get the same column
-- from schema.sql, so this file is a no-op there.
--
-- When the account's artist role was last granted (set by
-- set_artist_status.php on approval; cleared to NULL on reject/revoke).
-- The admin dashboard's Artist Profiles section shows this per account.
-- Existing rows are NULL — they predate the column.

USE MyScene;

ALTER TABLE Users ADD COLUMN IF NOT EXISTS artist_verified_at TIMESTAMP NULL DEFAULT NULL;
