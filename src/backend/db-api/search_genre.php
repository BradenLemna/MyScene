<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require __DIR__ . "/db.php";

$data     = json_decode(file_get_contents("php://input"), true);
$genre    = $data['music_genre'] ?? "";
echo json_encode(["genre" => $genre]);
echo json_encode(["message" => "Searching for artists in genre: $genre"]);

$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

try {
    $stmt = $pdo->prepare("SELECT * FROM Artists WHERE music_genre = :genre");
    $stmt->execute(['genre' => $genre]);
    $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    exit;
}

$artists = [];

foreach ($result as $row) {
    $artists[] = $row;
}

if(empty($artists)) {
    echo json_encode(["message" => "No artists found for genre: $genre", "artists" =>[]]);
} else {
    echo json_encode(["artists" => $artists]);
}

$stmt->closeCursor();
$pdo = null;
?>