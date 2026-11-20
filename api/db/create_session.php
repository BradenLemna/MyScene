<?php
/**
 * POST /db-api/create_session.php
 *
 * Verifies a username/password pair and, on success, creates a DB-backed
 * session row (30-day expiry, see auth.php) for it.
 *
 * Body (JSON):
 *   username (required)
 *   password (required)
 *
 * Responses:
 *   200 {"verified": true, "session_id": "..."}   on success
 *   200 {"verified": false}                       invalid pair
 *   400 {"error": "..."}                          missing username or password
 *   500 {"error": "..."}                          internal error
 */

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/auth.php';

$data = read_json_body();

require_fields($data, ['username', 'password']);

$username = str_field($data, 'username');
$password = (string) ($data['password'] ?? '');

try {
    if (!verify_password($pdo, $username, $password)) {
        json_response(['verified' => false]);
    }
    json_response(['verified' => true, 'session_id' => create_session($pdo, $username)]);
} catch (PDOException $e) {
    fail_with_log($e, 'create_session');
}
