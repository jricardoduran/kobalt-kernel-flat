<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

kobaltCors();
header('Content-Type: application/json; charset=utf-8');

$cfg    = kobaltRequireToken();
$action = (string) ($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'];

$dataDir = $cfg['data_dir'] ?? (__DIR__ . '/data/' . $cfg['id']);
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

if ($action === 'status') {
    $files = glob($dataDir . '/*') ?: [];
    echo json_encode([
        'ok'      => true,
        'service' => $cfg['id'],
        'label'   => $cfg['label'] ?? $cfg['id'],
        'type'    => 'phphost',
        'objects' => count($files),
        'dir'     => basename($dataDir),
    ]);
    exit;
}

if ($action === 'blob' && $method === 'GET') {
    $name = kobaltValidName($_GET['name'] ?? '');
    $path = $dataDir . '/' . $name;

    if (!file_exists($path)) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'no encontrado']);
        exit;
    }

    $bytes = file_get_contents($path);
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . strlen($bytes));
    header('Cache-Control: no-store');
    echo $bytes;
    exit;
}

if ($action === 'blob' && $method === 'POST') {
    $name = kobaltValidName($_GET['name'] ?? '');
    $raw  = file_get_contents('php://input');

    if (!$raw) {
        kobaltJsonError(400, 'cuerpo vacío');
    }

    $path = $dataDir . '/' . $name;
    $ok   = file_put_contents($path, $raw, LOCK_EX);

    if ($ok === false) {
        kobaltJsonError(500, 'error de escritura en disco');
    }

    echo json_encode([
        'ok'      => true,
        'service' => $cfg['id'],
        'name'    => $name,
        'size'    => strlen($raw),
    ]);
    exit;
}

if ($action === 'list' && $method === 'GET') {
    $prefix = kobaltValidPrefix($_GET['prefix'] ?? '');
    $names  = [];

    foreach (glob($dataDir . '/' . $prefix . '*') ?: [] as $f) {
        $n = basename($f);
        
        if (preg_match('/^[0-9a-f]{16,128}$/', $n)) {
            $names[] = $n;
        }
    }

    sort($names);
    echo json_encode([
        'ok'     => true,
        'service' => $cfg['id'],
        'prefix' => $prefix,
        'names'  => $names,
        'count'  => count($names),
    ]);
    exit;
}

kobaltJsonError(400, "acción inválida: {$action} {$method}");
