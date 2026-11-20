<?php
/**
 * POST /db-api/register_user.php
 *
 * Creates a new fan account (open self-registration — username + password,
 * bcrypt, no email verification). Artist access is requested later via
 * request_artist_access.php and verified by an admin.
 *
 * Body (JSON):
 *   username (required — 3-20 chars, [a-zA-Z0-9._])
 *   password (required — min 8 chars)
 *
 * Responses:
 *   200 {"success": true}
 *   400 {"error": "..."}   missing/invalid username or password
 *   409 {"error": "..."}   username already taken
 *   500 {"error": "..."}   internal error (details logged server-side)
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();

require_fields($data, ['username', 'password']);

$username = str_field($data, 'username');
$password = (string) ($data['password'] ?? '');

if (!preg_match('/^[a-zA-Z0-9._]{3,20}$/', $username)) {
    json_error('Field "username" must be 3-20 characters (letters, numbers, dots, underscores).', 400);
}
if (strlen($password) < 8) {
    json_error('Field "password" must be at least 8 characters.', 400);
}

try {
    // Fast path: most duplicates are caught here. The UNIQUE index on
    // Users.username (uq_users_username, see schema.sql) is the race-proof
    // backstop — two concurrent requests can both pass this check, and the
    // loser's INSERT then fails with a duplicate-key error handled below.
    $check = $pdo->prepare('SELECT username FROM Users WHERE username = ? LIMIT 1');
    $check->execute([$username]);
    if ($check->fetch() !== false) {
        json_error('That username is already taken.', 409);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO Users (username, user_password, is_admin, artist_status)
         VALUES (:username, :user_password, FALSE, "none")'
    );
    $stmt->execute([
        ':username'      => $username,
        ':user_password' => password_hash($password, PASSWORD_BCRYPT),
    ]);

    json_response(['success' => true]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        // Lost a race on the UNIQUE(username) index.
        json_error('That username is already taken.', 409);
    }
    fail_with_log($e, 'register_user');
}
