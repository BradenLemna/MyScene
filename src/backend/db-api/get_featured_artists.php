<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require __DIR__ . "/db.php";

$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

try {
    $stmt = $pdo->prepare("SELECT * FROM Artists WHERE is_featured = 1");
    $stmt->execute();

    $featured_artists = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(["featured_artists" => $featured_artists]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Database error: " . $e->getMessage()]);
}

$stmt->closeCursor();
$pdo = null;
?>