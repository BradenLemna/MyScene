<?php
/**
 * POST /db-api/logout.php
 *
 * Deletes a session row. Idempotent: an unknown or already-deleted
 * session id still answers 200, so a double logout is not an error.
 *
 * Body (JSON):
 *   session_id (required)
 *
 * Responses:
 *   200 {"success": true}
 *   400 {"error": "..."}   missing session_id
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/auth.php';

$data = read_json_body();

require_fields($data, ['session_id']);

try {
    delete_session($pdo, str_field($data, 'session_id'));
    json_response(['success' => true]);
} catch (PDOException $e) {
    fail_with_log($e, 'logout');
}
