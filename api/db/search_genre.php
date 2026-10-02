<?php
/**
 * POST /db-api/search_genre.php
 *
 * Returns all artists matching an exact genre.
 *
 * Body (JSON):
 *   music_genre (required)
 *
 * Responses:
 *   200 {"artists": [ ...artist rows... ]}   (empty array when no match)
 *   400 {"error": "..."}                     missing music_genre
 *   500 {"error": "..."}                     internal error
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();
$genre = str_field($data, 'music_genre');
if ($genre === '') {
    $genre = str_field($_GET, 'music_genre');
}
if ($genre === '') {
    json_error('Missing required field(s): music_genre.', 400);
}

try {
    $stmt = $pdo->prepare('SELECT * FROM Artists WHERE music_genre = ? ORDER BY artist_name');
    $stmt->execute([$genre]);
    $artists = $stmt->fetchAll();
} catch (PDOException $e) {
    fail_with_log($e, 'search_genre');
}

json_response(['artists' => $artists]);
