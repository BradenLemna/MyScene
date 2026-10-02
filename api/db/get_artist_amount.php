<?php
/**
 * POST /db-api/get_artist_amount.php
 *
 * Returns the total number of artists in the database.
 *
 * Response:
 *   200 {"artistAmount": 42}
 *   500 {"error": "..."}
 */

require __DIR__ . '/bootstrap.php';

try {
    $count = (int) $pdo->query('SELECT COUNT(*) FROM Artists')->fetchColumn();
} catch (PDOException $e) {
    fail_with_log($e, 'get_artist_amount');
}

json_response(['artistAmount' => $count]);
