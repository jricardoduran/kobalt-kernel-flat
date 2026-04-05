<?php
declare(strict_types=1);

define('CURRENT_DIR', __DIR__ . '/current');
define('MANIFEST_FILE', CURRENT_DIR . '/_manifest.json');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

if (!is_dir(CURRENT_DIR)) mkdir(CURRENT_DIR, 0755, true);

$action = $_GET['action'] ?? 'status';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'status' && $method === 'GET') {
    $m = file_exists(MANIFEST_FILE) ? json_decode(file_get_contents(MANIFEST_FILE), true) : [];
    echo json_encode(['ok' => true, 'last_deploy' => $m['last_deploy'] ?? null, 'count' => $m['count'] ?? 0]);
    exit;
}

if ($action === 'manifest' && $method === 'GET') {
    echo file_exists(MANIFEST_FILE) ? file_get_contents(MANIFEST_FILE) : json_encode(['ok' => true, 'files' => []]);
    exit;
}

if ($action === 'file' && $method === 'POST') {
    $body     = json_decode(file_get_contents('php://input'), true);
    $filename = $body['filename'] ?? '';
    $content  = $body['content']  ?? null;
    $binary   = $body['binary']   ?? false;

    if (!$filename || $content === null) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'filename y content requeridos']);
        exit;
    }

    if (str_contains($filename, '..')) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'filename invalido']);
        exit;
    }

    $path = CURRENT_DIR . '/' . ltrim($filename, '/');
    $dir  = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0755, true);

    $bytes = file_put_contents($path, $binary ? base64_decode($content) : $content);

    $m = file_exists(MANIFEST_FILE) ? json_decode(file_get_contents(MANIFEST_FILE), true) : [];
    $m['files'][$filename] = ['size' => $bytes, 'ts' => time()];
    $m['last_deploy'] = date('Y-m-d H:i:s');
    $m['count'] = count($m['files']);
    file_put_contents(MANIFEST_FILE, json_encode($m, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

    echo json_encode(['ok' => true, 'filename' => $filename, 'size' => $bytes]);
    exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'accion desconocida']);
