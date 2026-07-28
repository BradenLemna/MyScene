<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require __DIR__ . "/db.php";

$data     = json_decode(file_get_contents("php://input"), true);
$artist_name = $data["artist_name"] ?? "";

$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

try {
    $stmt = $pdo->prepare("SELECT * FROM Artists WHERE artist_name = ?");
    $stmt->execute([$artist_name]);
    $result = $stmt->fetch();
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    exit;
}

if ($result === false) {
    http_response_code(404);
    echo json_encode(["error" => "Artist not found"]);
    exit;
}

$artist = $result;
echo json_encode($artist);

$stmt->closeCursor();
$pdo = null;
?>