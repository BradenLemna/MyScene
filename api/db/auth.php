<?php
/**
 * Shared auth helpers for the db-api endpoints (Batch 2).
 *
 * This is a library file, NOT an endpoint: every endpoint that needs it
 * requires bootstrap.php first, then this file:
 *
 *     require __DIR__ . '/bootstrap.php';
 *     require __DIR__ . '/auth.php';
 *
 * Used by verify_user.php, create_session.php, me.php, logout.php and
 * request_artist_access.php. All database access uses prepared statements.
 */

declare(strict_types=1);

/** Sessions live this many days before they are purged lazily. */
const SESSION_TTL_DAYS = 30;

/**
 * Verify a username/password pair against the Users table.
 *
 * Passwords are stored as bcrypt hashes (password_hash). Legacy rows that
 * still contain plaintext passwords are compared safely and transparently
 * upgraded to a bcrypt hash on the first successful login, so existing
 * databases keep working without a manual migration.
 */
function verify_password(PDO $pdo, string $username, string $password): bool
{
    $stmt = $pdo->prepare('SELECT user_password FROM Users WHERE username = ? LIMIT 1');
    $stmt->execute([$username]);
    $stored = $stmt->fetchColumn();

    if ($stored === false) {
        return false;
    }
    $stored = (string) $stored;

    if (preg_match('/^\$2[abyxy]\$/', $stored)) {
        // Modern row: stored bcrypt hash.
        if (!password_verify($password, $stored)) {
            return false;
        }
        if (password_needs_rehash($stored, PASSWORD_DEFAULT)) {
            try {
                $rehash = $pdo->prepare('UPDATE Users SET user_password = ? WHERE username = ?');
                $rehash->execute([password_hash($password, PASSWORD_DEFAULT), $username]);
            } catch (PDOException $e) {
                error_log('[myscene:auth] password rehash failed: ' . $e->getMessage());
            }
        }
        return true;
    }

    // Legacy row: plaintext password. Compare with a timing-safe check and
    // upgrade the row to a bcrypt hash on first successful login.
    if (!hash_equals($stored, $password)) {
        return false;
    }
    try {
        $upgrade = $pdo->prepare('UPDATE Users SET user_password = ? WHERE username = ?');
        $upgrade->execute([password_hash($password, PASSWORD_DEFAULT), $username]);
        error_log("[myscene:auth] upgraded plaintext password for user '{$username}' to a bcrypt hash.");
    } catch (PDOException $e) {
        error_log('[myscene:auth] plaintext password upgrade failed: ' . $e->getMessage());
    }
    return true;
}

/**
 * Create a new session row for a verified user and return its id
 * (64 hex chars — the Sessions.session_id CHAR(64) primary key).
 */
function create_session(PDO $pdo, string $username): string
{
    $session_id = bin2hex(random_bytes(32));
    $stmt = $pdo->prepare(
        'INSERT INTO Sessions (session_id, username, created_at, expires_at)
         VALUES (:session_id, :username, NOW(), DATE_ADD(NOW(), INTERVAL ' . SESSION_TTL_DAYS . ' DAY))'
    );
    $stmt->execute([
        ':session_id' => $session_id,
        ':username'   => $username,
    ]);
    return $session_id;
}

/**
 * Look up the account a session id belongs to, or null when the session is
 * unknown or expired. Expired rows are purged lazily on every lookup, so
 * the table does not grow without bound (no cron needed at this scale).
 */
function session_user(PDO $pdo, string $session_id): ?array
{
    try {
        $pdo->exec('DELETE FROM Sessions WHERE expires_at < NOW()');
    } catch (PDOException $e) {
        error_log('[myscene:auth] expired session purge failed: ' . $e->getMessage());
    }

    $stmt = $pdo->prepare(
        'SELECT s.session_id AS session_id, s.username AS username,
                u.is_admin AS is_admin, u.artist_status AS artist_status
         FROM Sessions s
         JOIN Users u ON u.username = s.username
         WHERE s.session_id = ?
         LIMIT 1'
    );
    $stmt->execute([$session_id]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

/**
 * Delete a session row (logout). Returns the number of deleted rows (0
 * when the session was already gone — logout stays idempotent).
 */
function delete_session(PDO $pdo, string $session_id): int
{
    $stmt = $pdo->prepare('DELETE FROM Sessions WHERE session_id = ?');
    $stmt->execute([$session_id]);
    return $stmt->rowCount();
}
