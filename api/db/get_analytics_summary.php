<?php
/**
 * POST /db-api/get_analytics_summary.php
 *
 * Aggregates the privacy-friendly analytics counter (EXP-002) for the admin
 * dashboard (Batch 3): window totals, top artists, top genres, and a daily
 * pageview series.
 *
 * Body (JSON):
 *   days (optional — one of: 30, 90, 365; defaults to 30)
 *
 * Response:
 *   200 {
 *     "days": 30,
 *     "totals": {"pageviews": N, "searches": N, "profile_views": N},
 *     "top_artists":     [{"artist": "...", "views": N}, ...],      // top 10 by profile_view
 *     "top_genres":      [{"genre": "...", "searches": N}, ...],    // top 10 by search_success
 *     "daily_pageviews": [{"date": "YYYY-MM-DD", "pageviews": N}, ...]
 *   }
 *   400 {"error": "..."}   invalid days
 *   500 {"error": "..."}   internal error
 *
 * Detail formats (see docs/METRICS.md): profile_view rows carry
 * "artist:{name}"; search_success rows carry "genre:{genres}|results:{n}".
 * Legacy search_success rows ("results:{n}" only) count toward the totals
 * but not the genre ranking.
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();

$allowedDays = [30, 90, 365];
$days = 30;
if (array_key_exists('days', $data)) {
    $provided = $data['days'];
    $isNumber = (is_int($provided) || (is_string($provided) && ctype_digit($provided)));
    if (!$isNumber || !in_array((int) $provided, $allowedDays, true)) {
        json_error('Field "days" must be one of: 30, 90, 365.', 400);
    }
    $days = (int) $provided;
}

// Rolling window: the last $days days from now.
$since = date('Y-m-d H:i:s', time() - $days * 86400);

try {
    // ---------- totals ----------
    $totals = ['pageviews' => 0, 'searches' => 0, 'profile_views' => 0];
    $eventToKey = [
        'pageview'     => 'pageviews',
        'search_run'   => 'searches',
        'profile_view' => 'profile_views',
    ];
    $countStmt = $pdo->prepare(
        'SELECT COUNT(*) FROM AnalyticsEvents WHERE event = ? AND created_at >= ?'
    );
    foreach ($eventToKey as $event => $key) {
        $countStmt->execute([$event, $since]);
        $totals[$key] = (int) $countStmt->fetchColumn();
    }

    // ---------- top 10 artists by profile_view ----------
    $stmt = $pdo->prepare(
        'SELECT detail, COUNT(*) AS views
         FROM AnalyticsEvents
         WHERE event = "profile_view" AND detail IS NOT NULL AND created_at >= ?
         GROUP BY detail
         ORDER BY views DESC, detail ASC
         LIMIT 10'
    );
    $stmt->execute([$since]);
    $topArtists = [];
    foreach ($stmt->fetchAll() as $row) {
        $detail = (string) $row['detail'];
        $name = str_starts_with($detail, 'artist:') ? substr($detail, strlen('artist:')) : $detail;
        $topArtists[] = ['artist' => $name, 'views' => (int) $row['views']];
    }

    // ---------- top 10 genres by search_success ----------
    // One search_success row can carry several genres
    // ("genre:Rock,Punk|results:7"), so per-genre counts are aggregated in
    // PHP from the raw detail rows. The table is tiny (tens of thousands of
    // rows a year — see docs/METRICS.md), so this is cheap and exact.
    $stmt = $pdo->prepare(
        'SELECT detail, COUNT(*) AS searches
         FROM AnalyticsEvents
         WHERE event = "search_success" AND detail IS NOT NULL AND created_at >= ?
         GROUP BY detail
         ORDER BY searches DESC, detail ASC
         LIMIT 200'
    );
    $stmt->execute([$since]);
    $genreCounts = [];
    foreach ($stmt->fetchAll() as $row) {
        $detail = (string) $row['detail'];
        $searches = (int) $row['searches'];
        $genrePart = $detail;
        $pipe = strpos($detail, '|');
        if ($pipe !== false) {
            $genrePart = substr($detail, 0, $pipe);
        }
        if (!str_starts_with($genrePart, 'genre:')) {
            continue; // legacy "results:{n}" rows — no genre recorded
        }
        foreach (explode(',', substr($genrePart, strlen('genre:'))) as $genre) {
            $genre = trim($genre);
            if ($genre === '') {
                continue;
            }
            $genreCounts[$genre] = ($genreCounts[$genre] ?? 0) + $searches;
        }
    }
    $genreItems = [];
    foreach ($genreCounts as $genre => $count) {
        $genreItems[] = ['genre' => $genre, 'searches' => $count];
    }
    usort($genreItems, static fn (array $a, array $b): int =>
        $b['searches'] <=> $a['searches'] ?: strcmp($a['genre'], $b['genre']));
    $topGenres = array_slice($genreItems, 0, 10);

    // ---------- daily pageview series ----------
    $stmt = $pdo->prepare(
        'SELECT DATE(created_at) AS day, COUNT(*) AS pageviews
         FROM AnalyticsEvents
         WHERE event = "pageview" AND created_at >= ?
         GROUP BY DATE(created_at)
         ORDER BY day ASC'
    );
    $stmt->execute([$since]);
    $dailyPageviews = [];
    foreach ($stmt->fetchAll() as $row) {
        $dailyPageviews[] = ['date' => (string) $row['day'], 'pageviews' => (int) $row['pageviews']];
    }

    json_response([
        'days'            => $days,
        'totals'          => $totals,
        'top_artists'     => $topArtists,
        'top_genres'      => $topGenres,
        'daily_pageviews' => $dailyPageviews,
    ]);
} catch (PDOException $e) {
    fail_with_log($e, 'get_analytics_summary');
}
