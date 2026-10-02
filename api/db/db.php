<?php
/**
 * Legacy entry point — kept for backwards compatibility with the old
 * deployment scripts that copied this file next to the db-api endpoints.
 *
 * All endpoints now require db-api/bootstrap.php directly, which locates
 * the project root (vendor/ + .env) automatically. Including this file
 * simply pulls in that same bootstrap.
 */

$bootstrap = __DIR__ . '/bootstrap.php';
if (!is_file($bootstrap)) {
    // Legacy fallback: db.php copied somewhere outside the db-api directory.
    $bootstrap = __DIR__ . '/db-api/bootstrap.php';
}
require $bootstrap;
