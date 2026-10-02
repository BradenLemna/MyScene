-- Schema for MyScene MySQL database
CREATE DATABASE IF NOT EXISTS MyScene;
USE MyScene;

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
    CONSTRAINT uq_artists_name UNIQUE (artist_name)
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

INSERT INTO Artists VALUES (NULL, "The Belladonnas", "Fayetteville", "AR", NULL, NULL, "Rock", "@thebelladonnasband", "belladonnas.jpg", TRUE);
INSERT INTO Artists VALUES (NULL, "Mount Comfort", "Fayetteville", "AR", NULL, NULL, "Indie", "@mt.comfort", "belladonnas.jpg", TRUE);
INSERT INTO Artists VALUES (NULL, "Echo Eden and the Dreamers", "Fayetteville", "AR", NULL, NULL, "Punk", "@echoedenandthedreamers", "Echo Eden and the Dreamers.png", TRUE);
INSERT INTO Artists VALUES (NULL, "Keathley", "Oklahoma City", "OK", NULL, NULL, "Indie", "@keathley_burningbras", "Echo Eden and the Dreamers.png", TRUE);
INSERT INTO Artists VALUES (NULL, "Resting", "Springdale", "AR", NULL, NULL, "Alternative Rock", "@resting.zzz", "Echo Eden and the Dreamers.png", TRUE);
INSERT INTO Artists VALUES (NULL, "Ozark Riviera", "Fayetteville", "AR", NULL, NULL, "Indie", "@ozark.riviera", NULL, TRUE);
INSERT INTO Artists VALUES (NULL, "Burn Absolute", "Tampa", "FL", NULL, NULL, "Metal", "@burnabsolute", "burnabsolute.png", TRUE);
INSERT INTO Artists VALUES (NULL, "Dawn of Ascension", "El Dorado", "AR", NULL, NULL, "Metal", "@dawnofascensionband", "dawnofascensionband.png", TRUE);
INSERT INTO Artists VALUES (NULL, "Ted Hammig and the Campaign", "Fayetteville", "AR", NULL, NULL, "Rock", "@tedhammigandthecampaign", NULL, TRUE);
