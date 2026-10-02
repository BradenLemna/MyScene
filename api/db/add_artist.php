<?php
/**
 * POST /db-api/add_artist.php
 *
 * Adds a new artist to the database.
 *
 * Body (JSON):
 *   artist_name     (required, max 50 chars)
 *   location_city   (required, max 40 chars)
 *   location_region (required, max 40 chars)
 *   music_genre     (required, max 20 chars)
 *   insta_handle    (optional, max 50 chars)
 *   image_src       (optional, max 60 chars)
 *   longitude       (optional, float)
 *   latitude        (optional, float)
 *
 * Responses:
 *   200 {"success": true, "id": 12, "message": "..."}
 *   400 {"error": "..."}            missing/oversized fields
 *   409 {"error": "..."}            artist name already exists
 *   500 {"error": "..."}            internal error (details logged server-side)
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();

require_fields($data, ['artist_name', 'location_city', 'location_region', 'music_genre']);
enforce_max_lengths($data, [
    'artist_name'     => 50,
    'location_city'   => 40,
    'location_region' => 40,
    'music_genre'     => 20,
    'insta_handle'    => 50,
    'image_src'       => 60,
]);

$artist = [
    'artist_name'     => str_field($data, 'artist_name'),
    'location_city'   => str_field($data, 'location_city'),
    'location_region' => str_field($data, 'location_region'),
    'music_genre'     => str_field($data, 'music_genre'),
    'insta_handle'    => str_field($data, 'insta_handle'),
    'image_src'       => str_field($data, 'image_src'),
    'longitude'       => float_field($data, 'longitude'),
    'latitude'        => float_field($data, 'latitude'),
];

try {
    // Fast path: most duplicates are caught here. The UNIQUE constraint on
    // Artists.artist_name (see schema.sql) is the race-proof backstop — two
    // concurrent requests can both pass this check, and the loser's INSERT
    // then fails with a duplicate-key error handled below.
    $check = $pdo->prepare('SELECT id FROM Artists WHERE artist_name = ? LIMIT 1');
    $check->execute([$artist['artist_name']]);
    if ($check->fetch() !== false) {
        json_error('An artist with that name already exists.', 409);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO Artists
            (artist_name, location_city, location_region, music_genre,
             insta_handle, image_src, longitude, latitude)
         VALUES
            (:artist_name, :location_city, :location_region, :music_genre,
             :insta_handle, :image_src, :longitude, :latitude)'
    );
    $stmt->execute([
        ':artist_name'     => $artist['artist_name'],
        ':location_city'   => $artist['location_city'],
        ':location_region' => $artist['location_region'],
        ':music_genre'     => $artist['music_genre'],
        ':insta_handle'    => $artist['insta_handle'] !== '' ? $artist['insta_handle'] : null,
        ':image_src'       => $artist['image_src'] !== '' ? $artist['image_src'] : null,
        ':longitude'       => $artist['longitude'],
        ':latitude'        => $artist['latitude'],
    ]);

    json_response([
        'success' => true,
        'id'      => (int) $pdo->lastInsertId(),
        'message' => 'Artist was successfully added to the database.',
    ]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        // Lost a race on the UNIQUE(artist_name) constraint.
        json_error('An artist with that name already exists.', 409);
    }
    fail_with_log($e, 'add_artist');
}
