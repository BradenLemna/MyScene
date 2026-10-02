-- Migration 001: concert events + coordinates for seeded artists.
--
-- Idempotent: safe to run on every deploy (scripts/dbUpdate.sh applies every
-- file in migrations/ in name order). Fresh installs get the same objects from
-- schema.sql, so this file is a no-op there.

USE MyScene;

CREATE TABLE IF NOT EXISTS Events (
    id INT PRIMARY KEY AUTO_INCREMENT,
    artist_id INT NOT NULL,
    venue_name VARCHAR(80) NOT NULL,
    location_city VARCHAR(40) NOT NULL,
    location_region VARCHAR(40) NOT NULL,
    event_date DATE NOT NULL,
    event_time TIME,
    ticket_url VARCHAR(255),
    longitude FLOAT,
    latitude FLOAT,

    CONSTRAINT fk_events_artist FOREIGN KEY (artist_id)
        REFERENCES Artists (id) ON DELETE CASCADE,
    -- One listing per artist / venue / date; add_event.php answers 409.
    CONSTRAINT uq_events_listing UNIQUE (artist_id, venue_name, event_date)
);

-- get_artist_events.php and get_nearby_artists.php filter on these.
-- (CREATE INDEX IF NOT EXISTS is MariaDB 10.1.4+, which dbUpdate.sh installs.)
CREATE INDEX IF NOT EXISTS idx_events_date ON Events (event_date);
CREATE INDEX IF NOT EXISTS idx_artists_coords ON Artists (latitude, longitude);

-- Backfill coordinates for the seed artists' cities so they show up on the
-- map. Only touches rows that have no coordinates yet.
UPDATE Artists SET latitude = 36.0626, longitude = -94.1574
    WHERE latitude IS NULL AND location_city = 'Fayetteville'  AND location_region = 'AR';
UPDATE Artists SET latitude = 36.1867, longitude = -94.1288
    WHERE latitude IS NULL AND location_city = 'Springdale'    AND location_region = 'AR';
UPDATE Artists SET latitude = 33.2076, longitude = -92.6663
    WHERE latitude IS NULL AND location_city = 'El Dorado'     AND location_region = 'AR';
UPDATE Artists SET latitude = 35.4676, longitude = -97.5164
    WHERE latitude IS NULL AND location_city = 'Oklahoma City' AND location_region = 'OK';
UPDATE Artists SET latitude = 27.9506, longitude = -82.4572
    WHERE latitude IS NULL AND location_city = 'Tampa'         AND location_region = 'FL';
