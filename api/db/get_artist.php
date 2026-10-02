<?php
/**
 * POST /db-api/get_artist.php
 *
 * Returns a single artist row by name (raw row, original contract).
 *
 * Body (JSON) or query string:
 *   artist_name (required)
 *
 * Responses:
 *   200 { ...artist row... }
 *   400 {"error": "..."}   missing artist_name
 *   404 {"error": "..."}   artist not found
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();
$artist_name = str_field($data, 'artist_name');
if ($artist_name === '') {
    $artist_name = str_field($_GET, 'artist_name');
}
if ($artist_name === '') {
    json_error('Missing required field(s): artist_name.', 400);
}

try {
    $stmt = $pdo->prepare('SELECT * FROM Artists WHERE artist_name = ? LIMIT 1');
    $stmt->execute([$artist_name]);
    $artist = $stmt->fetch();
} catch (PDOException $e) {
    fail_with_log($e, 'get_artist');
}

if ($artist === false) {
    json_error('Artist not found.', 404);
}

json_response($artist);
