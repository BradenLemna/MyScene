<?php
/**
 * POST /db-api/set_artist_status.php
 *
 * Approves ('verified') or rejects ('none') an artist access request
 * (Batch 3). Admin-only in practice: the Node route
 * (POST /setArtistStatus) checks the session's is_admin flag; this endpoint
 * is stateless and only validates the payload.
 *
 * Body (JSON):
 *   target_username (required — an existing account)
 *   status          (required — one of: verified, none)
 *   actor_username  (optional — the admin's session-verified username the
 *                    Node API forwards; recorded in the admin activity feed)
 *
 * Responses:
 *   200 {"success": true, "username": "...", "artist_status": "..."}
 *   400 {"error": "..."}   missing/invalid fields
 *   404 {"error": "..."}   unknown user
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();

require_fields($data, ['target_username', 'status']);

$username = str_field($data, 'target_username');
$status = str_field($data, 'status');

if (!preg_match('/^[a-zA-Z0-9._]{3,20}$/', $username)) {
    json_error('Field "target_username" must be a valid username.', 400);
}
if (!in_array($status, ['verified', 'none'], true)) {
    json_error('Field "status" must be one of: verified, none.', 400);
}

try {
    // artist_verified_at tracks when the role was last granted: set on
    // approve, cleared on reject/revoke. Single statement keeps the two
    // columns consistent.
    $stmt = $pdo->prepare(
        'UPDATE Users
         SET artist_status = ?,
             artist_verified_at = IF(? = "verified", NOW(), NULL)
         WHERE username = ?'
    );
    $stmt->execute([$status, $status, $username]);
    if ($stmt->rowCount() === 0) {
        json_error('User not found.', 404);
    }
    log_activity($pdo, activity_actor($data),
        $status === 'verified' ? 'artist_approved' : 'artist_rejected',
        $username);

    json_response([
        'success'       => true,
        'username'      => $username,
        'artist_status' => $status,
    ]);
} catch (PDOException $e) {
    fail_with_log($e, 'set_artist_status');
}
