<?php
/**
 * POST /db-api/toggle_favorite.php
 *
 * Adds or removes one (user, artist) favorite (Batch 5). The Node route
 * (POST /toggleFavorite) is the session gate — this endpoint is stateless.
 *
 * Body (JSON):
 *   username   (required — the account doing the toggling)
 *   artist_name (required — the artist to favorite/unfavorite)
 *
 * Responses:
 *   200 {"favorited": true|false}   favorited=true when the favorite was added
 *   400 {"error": "..."}   invalid fields
 *   404 {"error": "..."}   unknown artist
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();

require_fields($data, ['username', 'artist_name']);

$username = str_field($data, 'username');
$artistName = str_field($data, 'artist_name');

if (!preg_match('/^[a-zA-Z0-9._]{3,20}$/', $username)) {
    json_error('Field "username" must be a valid username.', 400);
}
enforce_max_lengths($data, ['artist_name' => 50]);

try {
    $stmt = $pdo->prepare('SELECT id FROM Artists WHERE artist_name = ?');
    $stmt->execute([$artistName]);
    if (!$stmt->fetch()) {
        json_error('Artist not found.', 404);
    }

    $stmt = $pdo->prepare(
        'SELECT 1 FROM UserFavorites WHERE username = ? AND artist_name = ?'
    );
    $stmt->execute([$username, $artistName]);
    $existing = $stmt->fetch();

    if ($existing) {
        $stmt = $pdo->prepare(
            'DELETE FROM UserFavorites WHERE username = ? AND artist_name = ?'
        );
        $stmt->execute([$username, $artistName]);
        $favorited = false;
    } else {
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO UserFavorites (username, artist_name) VALUES (?, ?)'
            );
            $stmt->execute([$username, $artistName]);
            $favorited = true;
        } catch (PDOException $e) {
            // A concurrent toggle raced us to the same favorite — the end
            // state is "favorited", so answer that.
            if (isset($e->errorInfo[1]) && (int) $e->errorInfo[1] === 1062) {
                $favorited = true;
            } else {
                throw $e;
            }
        }
    }

    json_response(['favorited' => $favorited]);
} catch (PDOException $e) {
    fail_with_log($e, 'toggle_favorite');
}
