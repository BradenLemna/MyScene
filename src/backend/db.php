<?php
require __DIR__ . "/vendor/autoload.php";   // Load Composer packages

// Load the .env file from the project root
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

// Validate that required variables are present
$dotenv->required(["DB_HOST", "DB_NAME", "DB_USERNAME", "DB_PASSWORD"]);

// Access variables via $_ENV
$conn = new mysqli(
    $_ENV["DB_HOST"],
    $_ENV["DB_USERNAME"],
    $_ENV["DB_PASSWORD"],
    $_ENV["DB_NAME"]
);

if ($conn->connect_error) {
    http_response_code(500);
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}
// echo "Connected successfully to database."
?>