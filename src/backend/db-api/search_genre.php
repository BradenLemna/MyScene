<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require __DIR__ . "/db.php";

$data     = json_decode(file_get_contents("php://input"), true);
$genre    = $data["music_genre"] ?? "";

$stmt = $pdo->prepare("SELECT * FROM Artists WHERE music_genre = ?");
$stmt->execute([$genre]);
$result = $stmt->fetch();

$artists = [];

while($row = $result->fetch_assoc()) {
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