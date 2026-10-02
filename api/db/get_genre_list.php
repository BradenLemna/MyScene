<?php
/**
 * POST /db-api/get_genre_list.php
 *
 * Returns the distinct list of genres present in the database (used by the
 * frontend's genre filter).
 *
 * Response:
 *   200 {"genres": ["Alternative Rock", "Indie", "Metal", ...]}
 *   500 {"error": "..."}            internal error (details logged server-side)
 */

require __DIR__ . '/bootstrap.php';

try {
    $genres = $pdo
        ->query('SELECT DISTINCT music_genre FROM Artists ORDER BY music_genre')
        ->fetchAll(PDO::FETCH_COLUMN);
} catch (PDOException $e) {
    fail_with_log($e, 'get_genre_list');
}

json_response(['genres' => array_values($genres)]);
