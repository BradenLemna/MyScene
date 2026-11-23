<?php
/**
 * POST /db-api/get_artists_with_events.php
 *
 * Returns the distinct artists with at least one upcoming event in the next
 * `days` days (Batch 4 Dates filter). Full artist rows, so the frontend can
 * render the usual cards.
 *
 * Body (JSON) or query string:
 *   days (optional, whole number 1..365, default 30)
 *
 * The date window is [today, today + days) — the same window
 * get_nearby_events.php uses.
 *
 * Responses:
 *   200 {"artists": [ {...artist row...}, ... ]}  (empty array when none)
 *   400 {"error": "..."}   invalid days
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

const DEFAULT_DAYS = 30;
const MAX_DAYS     = 365;

$data = read_json_body();
if (!array_key_exists('days', $data) && isset($_GET['days'])) {
    $data['days'] = $_GET['days'];
}

// Whole-number day window (JSON numbers and numeric strings both pass).
$days = DEFAULT_DAYS;
if (isset($data['days']) && $data['days'] !== null && $data['days'] !== '') {
    if (!is_numeric($data['days']) || floor((float) $data['days']) !== (float) $data['days']) {
        json_error('Field "days" must be a whole number of days.', 400);
    }
    $days = (int) $data['days'];
    if ($days < 1 || $days > MAX_DAYS) {
        json_error('Field "days" must be between 1 and ' . MAX_DAYS . '.', 400);
    }
}

// [today, today + days) in the server's calendar — the same clock the DB
// uses for the event_date comparisons.
$today  = (new DateTimeImmutable())->format('Y-m-d');
$cutoff = (new DateTimeImmutable("+{$days} days"))->format('Y-m-d');

try {
    $stmt = $pdo->prepare(
        'SELECT DISTINCT a.*
           FROM Artists a
           JOIN Events e ON e.artist_id = a.id
          WHERE e.event_date >= :today
            AND e.event_date < :cutoff
          ORDER BY a.artist_name'
    );
    $stmt->execute([':today' => $today, ':cutoff' => $cutoff]);
    $artists = $stmt->fetchAll();
} catch (PDOException $e) {
    fail_with_log($e, 'get_artists_with_events');
}

json_response(['artists' => $artists]);
