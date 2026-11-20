-- Migration 003: auth — Sessions table + user flags (Batch 2).
--
-- Idempotent: safe to run on every deploy (scripts/dbUpdate.sh applies every
-- file in migrations/ in name order). Fresh installs get the same objects
-- from schema.sql, so this file is a no-op there.
--
-- Auth model (docs/BATCH_PLANS.md): fan accounts self-register; artist
-- accounts register -> pending -> manually verified by an admin. Sessions
-- are DB-backed rows with a 30-day expiry (see api/db/auth.php).

USE MyScene;

CREATE TABLE IF NOT EXISTS Sessions (
    session_id CHAR(64) PRIMARY KEY,
    username VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    INDEX idx_sessions_username (username)
);

-- Users flags:
--   is_admin      — analytics dashboard + artist verification queue (Batch 3)
--   artist_status — 'none' (fan) -> 'pending' -> 'verified' (may add
--                   artists and events; see api/db/request_artist_access.php)
ALTER TABLE Users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE Users ADD COLUMN IF NOT EXISTS artist_status ENUM('none','pending','verified') NOT NULL DEFAULT 'none';

-- Users.username is unique in practice (verify_user.php looks it up with
-- LIMIT 1), but the composite PRIMARY KEY (username, user_password) does not
-- enforce it — so register_user.php's duplicate check needs this index as a
-- race-proof backstop (same pattern as uq_artists_name in schema.sql).
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON Users (username);
