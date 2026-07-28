<?php
require __DIR__ . "/vendor/autoload.php";   // Load Composer packages

// Load the .env file from the project root
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

// Validate that required variables are present
$dotenv->required(["DB_HOST", "DB_NAME", "DB_USERNAME", "DB_PASSWORD", "DB_CHARSET"]);

// Access variables via $_ENV
$host = $_ENV["DB_HOST"];
$db = $_ENV["DB_NAME"];
$user = $_ENV["DB_USERNAME"];
$pass = $_ENV["DB_PASSWORD"];
$charset = $_ENV["DB_CHARSET"];

$dsn = "mysql:host=$host;dbname=$db;charset=$charset;port=3306";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
];

try {
     $pdo = new PDO($dsn, $user, $pass, $options);
     // echo "Connected successfully via PDO!";
} catch (\PDOException $e) {
     throw new \PDOException($e->getMessage(), (int)$e->getCode());
}
?>