<?php
/**
 * POST /db-api/get_recent_activity.php
 *
 * Returns the newest entries from the ActivityLog audit trail — the
 * admin dashboard's "Recent Changes" feed (who added what, who approved
 * or rejected whom, recent sign-ups). The Node route
 * (GET /getRecentActivity) is the admin gate; this endpoint is stateless.
 *
 * Response:
 *   200 {"recent_activity": [{
 *           "actor_username": "...",
 *           "action": "artist_added|event_added|artist_approved|artist_rejected|artist_requested|account_created",
 *           "target": "...",
 *           "created_at": "YYYY-MM-DD HH:MM:SS"
 *       }, ...]}
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

try {
    $stmt = $pdo->query(
        'SELECT actor_username, action, target, created_at
         FROM ActivityLog
         ORDER BY id DESC
         LIMIT 25'
    );
    $rows = $stmt->fetchAll();
} catch (PDOException $e) {
    fail_with_log($e, 'get_recent_activity');
}

json_response(['recent_activity' => $rows]);
