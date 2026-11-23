<?php
/**
 * POST /db-api/get_verified_artists.php
 *
 * Lists the accounts that currently hold the artist role
 * (artist_status='verified') — the admin dashboard's "Artist Profiles"
 * section, which also offers revoking the role (set_artist_status.php).
 * The Node route (GET /getVerifiedArtists) is the admin gate; this
 * endpoint is stateless.
 *
 * Response:
 *   200 {"verified_artists": [{
 *           "username": "...",
 *           "created_at": "YYYY-MM-DD HH:MM:SS",
 *           "artist_verified_at": "YYYY-MM-DD HH:MM:SS" | null
 *       }, ...]}
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

try {
    $stmt = $pdo->query(
        'SELECT username, created_at, artist_verified_at
         FROM Users
         WHERE artist_status = "verified"
         ORDER BY artist_verified_at DESC, username ASC'
    );
    $verified = $stmt->fetchAll();
} catch (PDOException $e) {
    fail_with_log($e, 'get_verified_artists');
}

json_response(['verified_artists' => $verified]);
