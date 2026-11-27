-- Migration 008: UserFavorites (server-side favorites, Batch 5).
--
-- Idempotent: safe to run on every deploy (scripts/dbUpdate.sh applies every
-- file in migrations/ in name order). Fresh installs get the same table
-- from schema.sql, so this file is a no-op there.
--
-- One row per (user, artist) favorite. artist_name (not artist_id) is the
-- key: the Users table keys on username, the Artists table has no FK to
-- users, and the favorites page joins on the artist name for display.
-- The composite PK makes duplicate favorites impossible even under races.

USE MyScene;

CREATE TABLE IF NOT EXISTS UserFavorites (
    username VARCHAR(20) NOT NULL,
    artist_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (username, artist_name)
);
