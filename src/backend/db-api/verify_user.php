<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

require __DIR__ . "/db.php";

$data     = json_decode(file_get_contents("php://input"), true);
$username = $data["username"] ?? "";
$password = $data["password"] ?? "";

if (empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode(["error" => "Username and password are required"]);
    exit;
}

$stmt = $pdo->prepare("SELECT * FROM Users WHERE username = ? AND user_password = ?");
$stmt->execute([$username, $password]);
$result = $stmt->fetch();

$verified = $stmt->rowCount() > 0;

echo json_encode(["verified" => $verified]);

$stmt->closeCursor();
$pdo = null;
?>