<?php
/**
 * POST /db-api/me.php
 *
 * Returns the account a session id belongs to. Expired session rows are
 * purged lazily on every lookup (see auth.php), so an expired session
 * answers 404 just like an unknown one.
 *
 * Body (JSON):
 *   session_id (required)
 *
 * Responses:
 *   200 {"username": "...", "is_admin": false, "artist_status": "none"}
 *   400 {"error": "..."}   missing session_id
 *   404 {"error": "..."}   unknown or expired session
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/auth.php';

$data = read_json_body();

require_fields($data, ['session_id']);

try {
    $row = session_user($pdo, str_field($data, 'session_id'));
} catch (PDOException $e) {
    fail_with_log($e, 'me');
}

if ($row === null) {
    json_error('Session not found or expired.', 404);
}

json_response([
    'username'      => $row['username'],
    'is_admin'      => (bool) $row['is_admin'],
    'artist_status' => $row['artist_status'],
]);
