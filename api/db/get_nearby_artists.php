<?php
/**
 * POST /db-api/get_nearby_artists.php
 *
 * Returns artists whose stored coordinates fall within a radius of a point,
 * nearest first. Artists without coordinates are never returned.
 *
 * Body (JSON) or query string:
 *   latitude  (required, -90..90)
 *   longitude (required, -180..180)
 *   radius    (optional, miles, default 10, max 500)
 *
 * Responses:
 *   200 {"artists": [ {...artist row..., "distance_miles": 3.2}, ... ]}
 *   400 {"error": "..."}   missing/invalid coordinates or radius
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

const EARTH_RADIUS_MILES = 3959.0;
const MAX_RADIUS_MILES   = 500.0;
const MAX_RESULTS        = 200;

$data = read_json_body();
foreach (['latitude', 'longitude', 'radius'] as $key) {
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

// Cheap bounding box first (uses idx_artists_coords), exact haversine after.
$latDelta = rad2deg($radius / EARTH_RADIUS_MILES);
$cosLat   = max(cos(deg2rad($lat)), 0.01); // avoid blow-up at the poles
$lonDelta = min(180.0, rad2deg($radius / (EARTH_RADIUS_MILES * $cosLat)));

try {
    $stmt = $pdo->prepare(
        'SELECT * FROM (
            SELECT a.*,
                   :r * 2 * ASIN(SQRT(
                       POWER(SIN(RADIANS(a.latitude - :lat1) / 2), 2) +
                       COS(RADIANS(:lat2)) * COS(RADIANS(a.latitude)) *
                       POWER(SIN(RADIANS(a.longitude - :lon1) / 2), 2)
                   )) AS distance_miles
              FROM Artists a
             WHERE a.latitude  IS NOT NULL
               AND a.longitude IS NOT NULL
               AND a.latitude  BETWEEN :minLat AND :maxLat
               AND a.longitude BETWEEN :minLon AND :maxLon
         ) nearby
         WHERE distance_miles <= :radius
         ORDER BY distance_miles, artist_name
         LIMIT ' . MAX_RESULTS
    );
    $stmt->execute([
        ':r'      => EARTH_RADIUS_MILES,
        ':lat1'   => $lat,
        ':lat2'   => $lat,
        ':lon1'   => $lon,
        ':minLat' => $lat - $latDelta,
        ':maxLat' => $lat + $latDelta,
        ':minLon' => $lon - $lonDelta,
        ':maxLon' => $lon + $lonDelta,
        ':radius' => $radius,
    ]);
    $artists = $stmt->fetchAll();
} catch (PDOException $e) {
    fail_with_log($e, 'get_nearby_artists');
}

foreach ($artists as &$artist) {
    $artist['distance_miles'] = round((float) $artist['distance_miles'], 2);
}
unset($artist);

json_response(['artists' => $artists]);
