<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require __DIR__ . "/db.php";

$stmt = $conn->prepare("SELECT * FROM Artists WHERE is_featured = 1");
$stmt->execute();

$result = $stmt->get_result();
$featured_artists = [];

while($row = $result->fetch_assoc()) {
    $featured_artists[] = $row;
}

echo json_encode(["featured_artists" => $featured_artists]);

$stmt->close();
$conn->close();
?>