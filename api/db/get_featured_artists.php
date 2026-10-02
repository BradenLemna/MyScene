<?php
/**
 * POST /db-api/get_featured_artists.php
 *
 * Returns all artists flagged as featured.
 *
 * Response:
 *   200 {"featured_artists": [ ...artist rows... ]}
 *   500 {"error": "..."}
 */

require __DIR__ . '/bootstrap.php';

try {
    $artists = $pdo
        ->query('SELECT * FROM Artists WHERE is_featured = 1 ORDER BY artist_name')
        ->fetchAll();
} catch (PDOException $e) {
    fail_with_log($e, 'get_featured_artists');
}

json_response(['featured_artists' => $artists]);
