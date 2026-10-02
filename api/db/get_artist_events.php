<?php
/**
 * POST /db-api/get_artist_events.php
 *
 * Returns every event listed for an artist, oldest first. The frontend
 * splits the list into previous/upcoming by event_date.
 *
 * Body (JSON) or query string:
 *   artist_name (required)
 *
 * Responses:
 *   200 {"events": [ {id, artist_name, venue_name, location_city,
 *                     location_region, event_date, event_time, ticket_url,
 *                     latitude, longitude}, ... ]}
 *       (empty array when the artist has no events)
 *   400 {"error": "..."}   missing artist_name
 *   404 {"error": "..."}   artist not found
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();
$artist_name = str_field($data, 'artist_name');
if ($artist_name === '') {
    $artist_name = str_field($_GET, 'artist_name');
}
if ($artist_name === '') {
    json_error('Missing required field(s): artist_name.', 400);
}

try {
    $artist = $pdo->prepare('SELECT id FROM Artists WHERE artist_name = ? LIMIT 1');
    $artist->execute([$artist_name]);
    $artist_id = $artist->fetchColumn();

    if ($artist_id === false) {
        json_error('Artist not found.', 404);
    }

    $stmt = $pdo->prepare(
        'SELECT e.id, a.artist_name, e.venue_name, e.location_city,
                e.location_region, e.event_date, e.event_time, e.ticket_url,
                e.latitude, e.longitude
           FROM Events e
           JOIN Artists a ON a.id = e.artist_id
          WHERE e.artist_id = ?
          ORDER BY e.event_date, e.event_time'
    );
    $stmt->execute([(int) $artist_id]);
    $events = $stmt->fetchAll();
} catch (PDOException $e) {
    fail_with_log($e, 'get_artist_events');
}

json_response(['events' => $events]);
