-- Migration 005: ActivityLog (admin "Recent Changes" feed).
--
-- Idempotent: safe to run on every deploy (scripts/dbUpdate.sh applies every
-- file in migrations/ in name order). Fresh installs get the same table from
-- schema.sql, so this file is a no-op there.
--
-- Append-only audit trail of site changes: who did what and when. Written
-- by add_artist.php, add_event.php, set_artist_status.php,
-- register_user.php and request_artist_access.php; read by
-- get_recent_activity.php (admin dashboard "Recent Changes" section).
--
-- actor_username is the session-verified username the Node API forwards;
-- 'unknown' when a caller hit the db-api directly without one.

USE MyScene;

CREATE TABLE IF NOT EXISTS ActivityLog (
    id INT PRIMARY KEY AUTO_INCREMENT,
    actor_username VARCHAR(20) NOT NULL,
    -- artist_added | event_added | artist_approved | artist_rejected |
    -- artist_requested | account_created
    action VARCHAR(30) NOT NULL,
    -- Artist name, "Artist — Venue", or username, depending on the action.
    target VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activity_created (created_at)
);
