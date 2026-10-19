-- Migration 002: privacy-friendly analytics counter (EXP-002).
--
-- Idempotent: safe to run on every deploy (scripts/dbUpdate.sh applies every
-- file in migrations/ in name order). Fresh installs get the same table from
-- schema.sql, so this file is a no-op there.
--
-- Privacy spec (docs/METRICS.md): no IP address, no user agent, no cookies,
-- no PII — only page/event/detail/timestamp. Volume at current traffic is
-- trivial (~30-40k rows/year), so there is no auto-pruning.

USE MyScene;

CREATE TABLE IF NOT EXISTS AnalyticsEvents (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    -- One of: index, viewArtist, addArtist, login
    -- (allowlisted in api/db/track_event.php)
    page VARCHAR(20) NOT NULL,
    -- One of: pageview, search_run, search_success, profile_view,
    --          insta_click, offline_notice_shown
    event VARCHAR(30) NOT NULL,
    -- Optional context, e.g. "results:5" or "artist:Burn Absolute"
    detail VARCHAR(60),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_analytics_event_created (event, created_at)
);
