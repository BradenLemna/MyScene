<?php
/**
 * POST /db-api/track_event.php
 *
 * Records one analytics event for the privacy-friendly counter (EXP-002).
 * The frontend sends one small beacon per event (public/js/track.js).
 *
 * Body (JSON):
 *   page    (required — one of: index, viewArtist, addArtist, login)
 *   event   (required — one of: pageview, search_run, search_success,
 *                        profile_view, insta_click, offline_notice_shown)
 *   detail  (optional, max 60 chars — e.g. "results:5", "artist:Burn Absolute")
 *
 * Privacy: stores nothing but page/event/detail/timestamp. No IP address,
 * no user agent, no cookies, no PII (see docs/METRICS.md).
 *
 * Responses:
 *   200 {"success": true}
 *   400 {"error": "..."}   missing/invalid fields
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();

$pageAllowlist = ['index', 'viewArtist', 'addArtist', 'login'];
$eventAllowlist = [
    'pageview',
    'search_run',
    'search_success',
    'profile_view',
    'insta_click',
    'offline_notice_shown',
];

$page = str_field($data, 'page');
$event = str_field($data, 'event');
$detail = str_field($data, 'detail');

if (!in_array($page, $pageAllowlist, true)) {
    json_error('Field "page" is not a known page.', 400);
}
if (!in_array($event, $eventAllowlist, true)) {
    json_error('Field "event" is not a known event.', 400);
}
enforce_max_lengths($data, ['detail' => 60]);

try {
    $stmt = $pdo->prepare(
        'INSERT INTO AnalyticsEvents (page, event, detail, created_at)
         VALUES (:page, :event, :detail, NOW())'
    );
    $stmt->execute([
        ':page'   => $page,
        ':event'  => $event,
        ':detail' => $detail !== '' ? $detail : null,
    ]);

    json_response(['success' => true]);
} catch (PDOException $e) {
    fail_with_log($e, 'track_event');
}
