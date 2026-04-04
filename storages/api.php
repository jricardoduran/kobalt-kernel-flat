<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(0);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('API_ADMIN_HASH', 'd4648b90ebd5de9a8099eb8e204fcfaf768a81e34af2ebdea22e4aef43589222');

define('API_DIR', __DIR__);

function apiError(int $code, string $msg): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

function apiAuth(): void
{
    $k = $_POST['_k'] ?? $_GET['_k'] ?? '';
    if (!hash_equals(API_ADMIN_HASH, strtolower($k))) {
        apiError(401, 'No autorizado');
    }
}

function apiTypeDir(string $typeId): ?string
{
    foreach (glob(API_DIR . '/*/definition.json') ?: [] as $f) {
        $d = json_decode(file_get_contents($f), true);
        if (is_array($d) && ($d['id'] ?? '') === $typeId) {
            return dirname($f);
        }
    }
    return null;
}

function apiServiceKey(): string
{
    return bin2hex(random_bytes(32));
}

$action = (string) ($_GET['action'] ?? '');
$typeId = preg_replace('/[^a-z0-9_-]/i', '', (string) ($_GET['type'] ?? ''));

if ($action === 'active') {
    
    $services = [];
    foreach (glob(API_DIR . '/*/definition.json') ?: [] as $defFile) {
        $def = json_decode(file_get_contents($defFile), true);
        if (!is_array($def) || empty($def['id'])) continue;
        $svcDir = dirname($defFile) . '/services';
        if (!is_dir($svcDir)) continue;
        foreach (glob($svcDir . '/*.json') ?: [] as $f) {
            $s = json_decode(file_get_contents($f), true);
            if (!is_array($s) || empty($s['enabled'])) continue;
            $services[] = [
                'id'       => $s['id']       ?? basename($f, '.json'),
                'label'    => $s['label']     ?? '',
                'type'     => $def['id'],
                'url'      => $s['url']       ?? ($def['connector'] ?? ''),
                'priority' => (int) ($s['priority'] ?? 10),
                'enabled'  => true,
            ];
        }
    }
    usort($services, fn($a, $b) => $a['priority'] - $b['priority']);
    echo json_encode([
        'ok'       => true,
        'storages' => $services,
        'strategy' => ['actualidad' => 'replicate_all', 'payloads' => 'first_available'],
        'sync'     => ['interval_ms' => 20000],
    ]);
    exit;
}

apiAuth();

if ($action === 'types') {
    $types = [];
    foreach (glob(API_DIR . '/*/definition.json') ?: [] as $f) {
        $d = json_decode(file_get_contents($f), true);
        if (is_array($d) && !empty($d['id'])) $types[] = $d;
    }
    usort($types, fn($a, $b) => strcmp($a['id'], $b['id']));
    echo json_encode(['ok' => true, 'types' => $types]);
    exit;
}

if ($action === 'list') {
    if (!$typeId) apiError(400, 'type requerido');
    $typeDir = apiTypeDir($typeId);
    $svcDir  = $typeDir ? $typeDir . '/services' : null;
    $svcs    = [];
    if ($svcDir && is_dir($svcDir)) {
        foreach (glob($svcDir . '/*.json') ?: [] as $f) {
            $s = json_decode(file_get_contents($f), true);
            if (!is_array($s)) continue;
            $svcs[] = [
                'id'         => $s['id']         ?? basename($f, '.json'),
                'label'      => $s['label']       ?? '',
                'enabled'    => $s['enabled']     ?? false,
                'priority'   => $s['priority']    ?? 10,
                'created_at' => $s['created_at']  ?? '',
                'url'        => $s['url']         ?? '',
            ];
        }
    }
    usort($svcs, fn($a, $b) => $a['priority'] - $b['priority']);
    echo json_encode(['ok' => true, 'type' => $typeId, 'services' => $svcs]);
    exit;
}

if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$typeId) apiError(400, 'type requerido');
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body) || empty($body['id'])) apiError(400, 'Payload inválido o id ausente');

    $typeDir = apiTypeDir($typeId);
    if (!$typeDir) apiError(400, "Tipo desconocido: {$typeId}");

    $id     = preg_replace('/[^a-z0-9_-]/', '', strtolower((string) $body['id']));
    if (!$id) apiError(400, 'id inválido');

    $svcDir = $typeDir . '/services';
    if (!is_dir($svcDir)) mkdir($svcDir, 0755, true);

    if (empty($body['service_key'])) $body['service_key'] = apiServiceKey();
    $body['id']         = $id;
    $body['created_at'] = $body['created_at'] ?? date('Y-m-d H:i:s');

    file_put_contents(
        $svcDir . '/' . $id . '.json',
        json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
    );
    echo json_encode(['ok' => true, 'id' => $id]);
    exit;
}

if ($action === 'delete' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$typeId) apiError(400, 'type requerido');
    $body = json_decode(file_get_contents('php://input'), true);
    $id   = preg_replace('/[^a-z0-9_-]/', '', (string) ($body['id'] ?? ''));
    if (!$id) apiError(400, 'id requerido');

    $typeDir = apiTypeDir($typeId);
    if ($typeDir) {
        $f = $typeDir . '/services/' . $id . '.json';
        if (file_exists($f)) unlink($f);
    }
    echo json_encode(['ok' => true]);
    exit;
}

if ($action === 'test') {
    if (!$typeId) apiError(400, 'type requerido');
    $serviceId = preg_replace('/[^a-z0-9_-]/', '', (string) ($_GET['service'] ?? ''));
    if (!$serviceId) apiError(400, 'service requerido');

    $typeDir = apiTypeDir($typeId);
    if (!$typeDir) apiError(404, "Tipo desconocido: {$typeId}");

    $cfgFile = $typeDir . '/services/' . $serviceId . '.json';
    if (!file_exists($cfgFile)) apiError(404, "Servicio '{$serviceId}' no encontrado");
    $cfg = json_decode(file_get_contents($cfgFile), true);

    $testFile = $typeDir . '/test.php';
    if (!file_exists($testFile)) apiError(500, "test.php no existe para tipo '{$typeId}'");

    $ok = false; $error = null;

    ob_start();
    try {
        require $testFile;
    } catch (Throwable $e) {
        $ok    = false;
        $error = 'Error interno: ' . $e->getMessage();
    }
    ob_end_clean();

    $encoded = json_encode(['ok' => (bool)$ok, 'error' => $error]);
    echo $encoded !== false ? $encoded : '{"ok":false,"error":"encoding error"}';
    exit;
}

apiError(400, "Acción inválida: {$action}");
