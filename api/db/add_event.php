<?php
/**
 * POST /db-api/add_event.php
 *
 * Adds a concert/event listing for an existing artist.
 *
 * Body (JSON):
 *   artist_name     (required — must already exist in Artists)
 *   venue_name      (required, max 80 chars)
 *   location_city   (required, max 40 chars)
 *   location_region (required, max 40 chars)
 *   event_date      (required, YYYY-MM-DD)
 *   event_time      (optional, HH:MM 24h)
 *   ticket_url      (optional, http(s) URL, max 255 chars)
 *   longitude       (optional, float)
 *   latitude        (optional, float)
 *
 * Responses:
 *   200 {"success": true, "id": 7, "message": "..."}
 *   400 {"error": "..."}   missing/invalid fields
 *   404 {"error": "..."}   artist not found
 *   409 {"error": "..."}   same artist/venue/date already listed
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();

require_fields($data, ['artist_name', 'venue_name', 'location_city', 'location_region', 'event_date']);
enforce_max_lengths($data, [
    'artist_name'     => 50,
    'venue_name'      => 80,
    'location_city'   => 40,
    'location_region' => 40,
    'ticket_url'      => 255,
]);

$ticket_url = str_field($data, 'ticket_url');
if ($ticket_url !== '' && !preg_match('~^https?://~i', $ticket_url)) {
    json_error('Field "ticket_url" must start with http:// or https://.', 400);
}

$event = [
    'artist_name'     => str_field($data, 'artist_name'),
    'venue_name'      => str_field($data, 'venue_name'),
    'location_city'   => str_field($data, 'location_city'),
    'location_region' => str_field($data, 'location_region'),
    'event_date'      => date_field($data, 'event_date'),
    'event_time'      => time_field($data, 'event_time'),
    'ticket_url'      => $ticket_url !== '' ? $ticket_url : null,
    'longitude'       => float_field($data, 'longitude'),
    'latitude'        => float_field($data, 'latitude'),
];

try {
    $artist = $pdo->prepare('SELECT id FROM Artists WHERE artist_name = ? LIMIT 1');
    $artist->execute([$event['artist_name']]);
    $artist_id = $artist->fetchColumn();

    if ($artist_id === false) {
        json_error('Artist not found. Add the artist before listing their events.', 404);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO Events
            (artist_id, venue_name, location_city, location_region,
             event_date, event_time, ticket_url, longitude, latitude)
         VALUES
            (:artist_id, :venue_name, :location_city, :location_region,
             :event_date, :event_time, :ticket_url, :longitude, :latitude)'
    );
    $stmt->execute([
        ':artist_id'       => (int) $artist_id,
        ':venue_name'      => $event['venue_name'],
        ':location_city'   => $event['location_city'],
        ':location_region' => $event['location_region'],
        ':event_date'      => $event['event_date'],
        ':event_time'      => $event['event_time'],
        ':ticket_url'      => $event['ticket_url'],
        ':longitude'       => $event['longitude'],
        ':latitude'        => $event['latitude'],
    ]);

    json_response([
        'success' => true,
        'id'      => (int) $pdo->lastInsertId(),
        'message' => 'Event was successfully added.',
    ]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        // UNIQUE(artist_id, venue_name, event_date)
        json_error('That artist already has an event at this venue on that date.', 409);
    }
    fail_with_log($e, 'add_event');
}
