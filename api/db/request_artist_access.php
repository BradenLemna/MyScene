<?php
/**
 * POST /db-api/request_artist_access.php
 *
 * Marks the session's account as requesting artist access
 * (artist_status='pending'). An admin verifies the request later (Batch 3
 * dashboard). No-op when the account is already pending or verified.
 *
 * Body (JSON):
 *   session_id (required)
 *
 * Responses:
 *   200 {"success": true, "artist_status": "pending"|"verified"}
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
    if ($row === null) {
        json_error('Session not found or expired.', 404);
    }

    // No-op when the request is already pending or already verified.
    if ($row['artist_status'] !== 'none') {
        json_response(['success' => true, 'artist_status' => $row['artist_status']]);
    }

    $stmt = $pdo->prepare("UPDATE Users SET artist_status = 'pending' WHERE username = ?");
    $stmt->execute([$row['username']]);

    json_response(['success' => true, 'artist_status' => 'pending']);
} catch (PDOException $e) {
    fail_with_log($e, 'request_artist_access');
}
