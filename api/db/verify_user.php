<?php
/**
 * POST /db-api/verify_user.php
 *
 * Verifies a username/password pair against the Users table.
 *
 * The credential check (bcrypt, with transparent legacy-plaintext
 * upgrade) lives in auth.php so create_session.php shares it.
 *
 * Body (JSON):
 *   username (required)
 *   password (required)
 *
 * Responses:
 *   200 {"verified": true|false}   (false when the pair is invalid)
 *   400 {"error": "..."}           missing username or password
 *   500 {"error": "..."}           internal error
 */

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/auth.php';

$data = read_json_body();

require_fields($data, ['username', 'password']);

$username = str_field($data, 'username');
$password = (string) ($data['password'] ?? '');

try {
    $verified = verify_password($pdo, $username, $password);
} catch (PDOException $e) {
    fail_with_log($e, 'verify_user');
}

json_response(['verified' => $verified]);
