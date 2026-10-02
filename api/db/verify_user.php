<?php
/**
 * POST /db-api/verify_user.php
 *
 * Verifies a username/password pair against the Users table.
 *
 * Passwords are stored as bcrypt hashes (password_hash). Legacy rows that
 * still contain plaintext passwords are compared safely and transparently
 * upgraded to a bcrypt hash on the first successful login, so existing
 * databases keep working without a manual migration.
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

$data = read_json_body();

require_fields($data, ['username', 'password']);

$username = str_field($data, 'username');
$password = (string) ($data['password'] ?? '');

try {
    $stmt = $pdo->prepare('SELECT user_password FROM Users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $stored = $stmt->fetchColumn();
} catch (PDOException $e) {
    fail_with_log($e, 'verify_user');
}

$verified = false;

if ($stored !== false) {
    $stored = (string) $stored;

    if (preg_match('/^\$2[abyxy]\$/', $stored)) {
        // Modern row: stored bcrypt hash.
        $verified = password_verify($password, $stored);

        if ($verified && password_needs_rehash($stored, PASSWORD_DEFAULT)) {
            try {
                $rehash = $pdo->prepare('UPDATE Users SET user_password = ? WHERE username = ?');
                $rehash->execute([password_hash($password, PASSWORD_DEFAULT), $username]);
            } catch (PDOException $e) {
                error_log('[myscene:verify_user] password rehash failed: ' . $e->getMessage());
            }
        }
    } else {
        // Legacy row: plaintext password. Compare with a timing-safe check
        // and upgrade the row to a bcrypt hash on first successful login.
        if (hash_equals($stored, $password)) {
            $verified = true;
            try {
                $upgrade = $pdo->prepare('UPDATE Users SET user_password = ? WHERE username = ?');
                $upgrade->execute([password_hash($password, PASSWORD_DEFAULT), $username]);
                error_log("[myscene:verify_user] upgraded plaintext password for user '{$username}' to a bcrypt hash.");
            } catch (PDOException $e) {
                error_log('[myscene:verify_user] plaintext password upgrade failed: ' . $e->getMessage());
            }
        }
    }
}

json_response(['verified' => $verified]);
