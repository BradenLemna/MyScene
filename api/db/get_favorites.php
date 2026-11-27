<?php
/**
 * POST /db-api/get_favorites.php
 *
 * Returns the artists a user has favorited, full rows so the favorites
 * page can render the usual cards. The Node route (GET /getFavorites)
 * is the session gate; this endpoint is stateless.
 *
 * Body (JSON):
 *   username (required — the account whose favorites to return)
 *
 * Responses:
 *   200 {"favorites": [ {...artist row...}, ... ]}  (empty array when none)
 *   400 {"error": "..."}   invalid fields
 *   500 {"error": "..."}   internal error
 */

require __DIR__ . '/bootstrap.php';

$data = read_json_body();

require_fields($data, ['username']);

$username = str_field($data, 'username');

if (!preg_match('/^[a-zA-Z0-9._]{3,20}$/', $username)) {
    json_error('Field "username" must be a valid username.', 400);
}

try {
    $stmt = $pdo->prepare(
        'SELECT a.*
           FROM UserFavorites uf
           JOIN Artists a ON a.artist_name = uf.artist_name
          WHERE uf.username = ?
          ORDER BY a.artist_name ASC'
    );
    $stmt->execute([$username]);
    $favorites = $stmt->fetchAll();
} catch (PDOException $e) {
    fail_with_log($e, 'get_favorites');
}

json_response(['favorites' => $favorites]);
