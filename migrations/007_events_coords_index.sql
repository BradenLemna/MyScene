-- Migration 007: coordinates index on Events (Batch 4 "Shows Near You").
--
-- Idempotent: safe to run on every deploy (scripts/dbUpdate.sh applies every
-- file in migrations/ in name order). Fresh installs get the same index
-- from schema.sql, so this file is a no-op there.
--
-- get_nearby_events.php filters on the coordinates with a bounding box
-- before the exact haversine, so this index makes the first filter cheap —
-- the same pattern as idx_artists_coords from migration 001.

USE MyScene;

CREATE INDEX IF NOT EXISTS idx_events_coords ON Events (latitude, longitude);
