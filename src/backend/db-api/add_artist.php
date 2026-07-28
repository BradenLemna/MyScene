<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require __DIR__ . "/db.php";

$data = json_decode(file_get_contents("php://input"), true);

// Parse data
$artist_name     = $data["artist_name"]     ?? "";
$location_city   = $data["location_city"]   ?? "";
$location_region = $data["location_region"] ?? "";
$music_genre     = $data["music_genre"]     ?? "";
$insta_handle    = $data["insta_handle"]    ?? "";
$image_src       = $data["image_src"]       ?? "";

// Validate required fields
if(empty($artist_name) || empty($location_city) || empty($location_region) || empty($music_genre)) {
    http_response_code(400);
    echo json_encode(["error" => "Artist name, city, region, and music genre are required field."]);
    exit;
}

$stmt = $pdo->prepare("
    INSERT INTO Artists (artist_name, location_city, location_region, music_genre, insta_handle, image_src)
    VALUES (?, ?, ?, ?, ?, ?)
");

$stmt->bindParam(1, $artist_name);
$stmt->bindParam(2, $location_city);
$stmt->bindParam(3, $location_region);
$stmt->bindParam(4, $music_genre);
$stmt->bindParam(5, $insta_handle);
$stmt->bindParam(6, $image_src);

if ($stmt->execute()) {
    echo json_encode(["success" => true]);
} else {
    http_response_code(500);
    echo json_encode(["error" => $stmt->error]);
}

$stmt->closeCursor();
$pdo = null;
?>