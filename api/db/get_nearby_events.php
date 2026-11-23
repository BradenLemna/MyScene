<?php
/**
 * POST /db-api/get_nearby_events.php
 *
 * Returns upcoming events whose stored coordinates fall within a radius of
 * a point, soonest first (Batch 4 "Shows Near You"). Events without
 * coordinates are never returned.
 *
 * Body (JSON) or query string:
 *   latitude  (required, -90..90)
 *   longitude (required, -180..180)
 *   radius    (optional, miles, default 10, max 500)
 *   days      (optional, whole number 1..365, default 30 — the date window)
 *
 * The date window is [today, today + days): today's shows are included and
 * the window spans exactly `days` calendar days.
 *
 * Responses:
 *   200 {"events": [ {id, artist_name, venue_name, location_city,
 *                     location_region, event_date, event_time, ticket_url,
 *                     latitude, longitude, distance_miles}, ... ]}
 *       (empty array when nothing matches)
 *   400 {"error": "..."}   missing/invalid coordinates, radius or days
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

const EARTH_RADIUS_MILES = 3959.0;
const MAX_RADIUS_MILES   = 500.0;
const DEFAULT_DAYS       = 30;
const MAX_DAYS           = 365;
const MAX_RESULTS        = 200;

$data = read_json_body();
foreach (['latitude', 'longitude', 'radius', 'days'] as $key) {
    if (!array_key_exists($key, $data) && isset($_GET[$key])) {
        $data[$key] = $_GET[$key];
    }
}

$lat    = float_field($data, 'latitude');
$lon    = float_field($data, 'longitude');
$radius = float_field($data, 'radius') ?? 10.0;

if ($lat === null || $lon === null) {
    json_error('Missing required field(s): latitude, longitude.', 400);
}
if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
    json_error('Coordinates are out of range.', 400);
}
if ($radius <= 0 || $radius > MAX_RADIUS_MILES) {
    json_error('Field "radius" must be greater than 0 and at most ' . (int) MAX_RADIUS_MILES . ' miles.', 400);
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

// Cheap bounding box first (uses idx_events_coords), exact haversine after —
// the same math as get_nearby_artists.php.
$latDelta = rad2deg($radius / EARTH_RADIUS_MILES);
$cosLat   = max(cos(deg2rad($lat)), 0.01); // avoid blow-up at the poles
$lonDelta = min(180.0, rad2deg($radius / (EARTH_RADIUS_MILES * $cosLat)));

try {
    $stmt = $pdo->prepare(
        'SELECT * FROM (
            SELECT e.id, a.artist_name, e.venue_name, e.location_city,
                   e.location_region, e.event_date, e.event_time, e.ticket_url,
                   e.latitude, e.longitude,
                   :r * 2 * ASIN(SQRT(
                       POWER(SIN(RADIANS(e.latitude - :lat1) / 2), 2) +
                       COS(RADIANS(:lat2)) * COS(RADIANS(e.latitude)) *
                       POWER(SIN(RADIANS(e.longitude - :lon1) / 2), 2)
                   )) AS distance_miles
              FROM Events e
              JOIN Artists a ON a.id = e.artist_id
             WHERE e.latitude  IS NOT NULL
               AND e.longitude IS NOT NULL
               AND e.event_date >= :today
               AND e.event_date < :cutoff
               AND e.latitude  BETWEEN :minLat AND :maxLat
               AND e.longitude BETWEEN :minLon AND :maxLon
         ) nearby
         WHERE distance_miles <= :radius
         ORDER BY event_date, event_time, artist_name
         LIMIT ' . MAX_RESULTS
    );
    $stmt->execute([
        ':r'      => EARTH_RADIUS_MILES,
        ':lat1'   => $lat,
        ':lat2'   => $lat,
        ':lon1'   => $lon,
        ':today'  => $today,
        ':cutoff' => $cutoff,
        ':minLat' => $lat - $latDelta,
        ':maxLat' => $lat + $latDelta,
        ':minLon' => $lon - $lonDelta,
        ':maxLon' => $lon + $lonDelta,
        ':radius' => $radius,
    ]);
    $events = $stmt->fetchAll();
} catch (PDOException $e) {
    fail_with_log($e, 'get_nearby_events');
}

foreach ($events as &$event) {
    $event['distance_miles'] = round((float) $event['distance_miles'], 2);
}
unset($event);

json_response(['events' => $events]);
