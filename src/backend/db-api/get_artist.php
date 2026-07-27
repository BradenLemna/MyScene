<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require __DIR__ . "/db.php";

$data     = json_decode(file_get_contents("php://input"), true);
$artist_name = $data["artist_name"] ?? "";

$stmt = $conn->prepare("SELECT * FROM Artists WHERE artist_name = ?");
$stmt->bind_param("s", $artist_name);
$stmt->execute();

$result = $stmt->get_result();
if ($result->num_rows === 0) {
    http_response_code(404);
    echo json_encode(["error" => "Artist not found"]);
    exit;
}

$artist = $result->fetch_assoc();
echo json_encode($artist);

$stmt->close();
$conn->close();
?>