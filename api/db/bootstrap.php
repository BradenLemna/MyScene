<?php
/**
 * MyScene db-api shared bootstrap.
 *
 * Every endpoint in this directory starts with:
 *
 *     require __DIR__ . '/bootstrap.php';
 *
 * and can then use the $pdo connection plus the helper functions defined here.
 *
 * This file:
 *   1. Locates the project root (the directory holding vendor/ and .env) by
 *      walking up from this file — so it works both from the repository
 *      (api/db) and from a deployed layout
 *      (e.g. /var/www/myscene-api/db-api).
 *   2. Loads environment variables — via vlucas/phpdotenv when the Composer
 *      vendor directory is available, with a minimal built-in .env parser as
 *      a fallback for minimal deployments.
 *   3. Opens the PDO connection to the MyScene MySQL database.
 *   4. Provides the JSON/CORS/validation helpers used by the endpoints.
 *
 * Security notes:
 *   - PHP errors are never displayed to API clients (display_errors off);
 *     failures are logged server-side and answered with a generic 500.
 *   - All database access in the endpoints uses prepared statements.
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');

/* ------------------------------------------------------------------ */
/* Response / request helpers                                          */
/* ------------------------------------------------------------------ */

/** Send a JSON response and stop. */
function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** Send a JSON error payload and stop. */
function json_error(string $message, int $status = 400): void
{
    json_response(['error' => $message], $status);
}

/** Standard CORS headers; answers OPTIONS preflights immediately. */
function cors_headers(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/** Parse the JSON request body; returns [] for empty or invalid bodies. */
function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/** Trimmed string value from a data array ('' when missing or non-scalar). */
function str_field(array $data, string $key): string
{
    $value = $data[$key] ?? '';
    return is_scalar($value) ? trim((string) $value) : '';
}

/**
 * Ensure required fields are present and non-empty in the request data.
 * Responds with 400 (listing the missing fields) otherwise.
 */
function require_fields(array $data, array $fields): void
{
    $missing = [];
    foreach ($fields as $field) {
        $value = $data[$field] ?? null;
        if ($value === null || (is_string($value) && trim($value) === '')) {
            $missing[] = $field;
        }
    }
    if ($missing !== []) {
        json_error('Missing required field(s): ' . implode(', ', $missing) . '.', 400);
    }
}

/**
 * Enforce the VARCHAR column limits so the database never rejects a request
 * with a low-level truncation error. Values that are absent/null pass through.
 */
function enforce_max_lengths(array $data, array $limits): void
{
    foreach ($limits as $field => $max) {
        $value = $data[$field] ?? null;
        if (is_string($value) && strlen($value) > $max) {
            json_error('Field "' . $field . '" must be at most ' . $max . ' characters.', 400);
        }
    }
}

/**
 * Nullable numeric field (e.g. JSON lat/lon coordinates).
 *
 * JSON numbers pass through, numeric strings are parsed, absent/null/empty
 * values become null. Anything else answers 400 so the database never
 * receives a bogus coordinate. (Mirrors floatField() in the Node API.)
 */
function float_field(array $data, string $key): ?float
{
    $value = $data[$key] ?? null;
    if ($value === null || $value === '') {
        return null;
    }
    if (is_numeric($value)) {
        return (float) $value;
    }
    json_error('Field "' . $key . '" must be a number.', 400);
}

/**
 * Log a throwable server-side and answer with a generic 500.
 * Never leaks SQL details or environment information to API clients.
 */
function fail_with_log(Throwable $e, string $context): void
{
    error_log('[myscene:' . $context . '] ' . $e::class . ': ' . $e->getMessage());
    json_error('Internal server error. Please try again later.', 500);
}

/* ------------------------------------------------------------------ */
/* Environment loading                                                 */
/* ------------------------------------------------------------------ */

/** Walk up from $startDir looking for a directory containing vendor/ or .env. */
function myscene_project_root(?string $startDir = null): ?string
{
    $dir = realpath($startDir ?: __DIR__);
    while ($dir !== false && $dir !== '/' && $dir !== '.') {
        if (is_dir($dir . '/vendor') || is_file($dir . '/.env')) {
            return $dir;
        }
        $parent = dirname($dir);
        if ($parent === $dir) {
            break;
        }
        $dir = $parent;
    }
    return null;
}

$root = myscene_project_root();

if ($root !== null) {
    if (is_file($root . '/vendor/autoload.php')) {
        require $root . '/vendor/autoload.php';
        if (is_file($root . '/.env')) {
            // createImmutable: real process environment variables always win
            // over values from the .env file.
            Dotenv\Dotenv::createImmutable($root)->load();
        }
    } elseif (is_file($root . '/.env')) {
        // No Composer vendor directory available: parse the .env file with a
        // minimal KEY=VALUE parser so the API still works on minimal deploys.
        foreach (file($root . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$name, $value] = explode('=', $line, 2);
            $_ENV[trim($name)] = trim($value);
        }
    }
}

/** Read an environment variable: real process env first, then .env ($_ENV). */
function myscene_env(string $name, ?string $default = null): ?string
{
    $value = getenv($name);
    if ($value !== false && $value !== '') {
        return $value;
    }
    $value = $_ENV[$name] ?? null;
    return ($value === null || $value === '') ? $default : $value;
}

$missing = [];
foreach (['DB_HOST', 'DB_NAME', 'DB_USERNAME', 'DB_PASSWORD'] as $required) {
    if (myscene_env($required) === null) {
        $missing[] = $required;
    }
}
if ($missing !== []) {
    error_log('[myscene:bootstrap] Missing required environment variables: ' . implode(', ', $missing));
    json_error('Server misconfiguration: missing database settings. Check the .env file.', 500);
}

/* ------------------------------------------------------------------ */
/* Database connection                                                 */
/* ------------------------------------------------------------------ */

$host    = myscene_env('DB_HOST');
$name    = myscene_env('DB_NAME');
$user    = myscene_env('DB_USERNAME');
$pass    = myscene_env('DB_PASSWORD');
$port    = myscene_env('DB_PORT', '3306');
$charset = myscene_env('DB_CHARSET', 'utf8mb4');

try {
    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$name};charset={$charset}",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    error_log('[myscene:bootstrap] Database connection failed: ' . $e->getMessage());
    json_error('Internal server error: database unavailable.', 500);
}

/* Standard CORS headers for every endpoint. */
cors_headers();
