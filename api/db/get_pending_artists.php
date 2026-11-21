<?php
/**
 * POST /db-api/get_pending_artists.php
 *
 * Lists the accounts that requested artist access and are waiting for an
 * admin decision (Batch 3 verification queue). The Node route
 * (GET /getPendingArtists) is the admin gate; this endpoint is stateless.
 *
 * Response:
 *   200 {"pending_artists": [{"username": "...", "created_at": "YYYY-MM-DD HH:MM:SS"}, ...]}
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

try {
    $stmt = $pdo->query(
        'SELECT username, created_at
         FROM Users
         WHERE artist_status = "pending"
         ORDER BY created_at ASC, username ASC'
    );
    $pending = $stmt->fetchAll();
} catch (PDOException $e) {
    fail_with_log($e, 'get_pending_artists');
}

json_response(['pending_artists' => $pending]);
