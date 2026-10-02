-- Schema for MyScene MySQL database
CREATE DATABASE IF NOT EXISTS MyScene;
USE MyScene;

DROP TABLE IF EXISTS Events;
DROP TABLE IF EXISTS Artists;
DROP TABLE IF EXISTS Users;

CREATE TABLE Artists (
    id INT PRIMARY KEY AUTO_INCREMENT,
    artist_name VARCHAR(50) NOT NULL,
    location_city VARCHAR(40) NOT NULL,
    location_region VARCHAR(40) NOT NULL,
    longitude FLOAT,
    latitude FLOAT,
    music_genre VARCHAR(20) NOT NULL,
    insta_handle VARCHAR(50),
    image_src VARCHAR(60),
    is_featured BOOLEAN DEFAULT FALSE,

    -- add_artist.php checks for existing names and answers 409; this unique
    -- key makes that check race-proof against concurrent inserts.
    CONSTRAINT uq_artists_name UNIQUE (artist_name),
    INDEX idx_artists_coords (latitude, longitude)
);

CREATE TABLE Events (
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
    CONSTRAINT uq_events_listing UNIQUE (artist_id, venue_name, event_date),
    INDEX idx_events_date (event_date)
);

CREATE TABLE Users (
    username VARCHAR(20) NOT NULL,
    -- 255 chars: bcrypt hashes are 60 characters. verify_user.php upgrades
    -- legacy plaintext rows to bcrypt on first login, which fails/truncates
    -- in a VARCHAR(20) column.
    user_password VARCHAR(255) NOT NULL,

    PRIMARY KEY (username, user_password)
);

-- Example Input
INSERT INTO Users VALUES ("mrpepsi", "12345");
INSERT INTO Users VALUES ("whisperingcoder", "23456");
INSERT INTO Users VALUES ("lemdog", "34567");
INSERT INTO Users VALUES ("kcudzich", "45678");
INSERT INTO Users VALUES ("kitkat", "56789");
INSERT INTO Users VALUES ("katsu18", "67890");

INSERT INTO Artists VALUES (NULL, "The Belladonnas", "Fayetteville", "AR", -94.1574, 36.0626, "Rock", "@thebelladonnasband", "belladonnas.jpg", TRUE);
INSERT INTO Artists VALUES (NULL, "Mount Comfort", "Fayetteville", "AR", -94.1574, 36.0626, "Indie", "@mt.comfort", "belladonnas.jpg", TRUE);
INSERT INTO Artists VALUES (NULL, "Echo Eden and the Dreamers", "Fayetteville", "AR", -94.1574, 36.0626, "Punk", "@echoedenandthedreamers", "Echo Eden and the Dreamers.png", TRUE);
INSERT INTO Artists VALUES (NULL, "Keathley", "Oklahoma City", "OK", -97.5164, 35.4676, "Indie", "@keathley_burningbras", "Echo Eden and the Dreamers.png", TRUE);
INSERT INTO Artists VALUES (NULL, "Resting", "Springdale", "AR", -94.1288, 36.1867, "Alternative Rock", "@resting.zzz", "Echo Eden and the Dreamers.png", TRUE);
INSERT INTO Artists VALUES (NULL, "Ozark Riviera", "Fayetteville", "AR", -94.1574, 36.0626, "Indie", "@ozark.riviera", NULL, TRUE);
INSERT INTO Artists VALUES (NULL, "Burn Absolute", "Tampa", "FL", -82.4572, 27.9506, "Metal", "@burnabsolute", "burnabsolute.png", TRUE);
INSERT INTO Artists VALUES (NULL, "Dawn of Ascension", "El Dorado", "AR", -92.6663, 33.2076, "Metal", "@dawnofascensionband", "dawnofascensionband.png", TRUE);
INSERT INTO Artists VALUES (NULL, "Ted Hammig and the Campaign", "Fayetteville", "AR", -94.1574, 36.0626, "Rock", "@tedhammigandthecampaign", NULL, TRUE);
