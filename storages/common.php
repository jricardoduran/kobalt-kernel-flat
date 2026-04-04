<?php
declare(strict_types=1);

define('KOBALT_STORAGES_DIR', __DIR__);

define('KOBALT_STRATEGY', [
    'actualidad' => 'replicate_all',
    'payloads'   => 'first_available',
]);
define('KOBALT_SYNC', ['interval_ms' => 20000]);
define('KOBALT_MAX_PER_USER', 2);

define('KOBALT_ADMIN_HASH', 'd4648b90ebd5de9a8099eb8e204fcfaf768a81e34af2ebdea22e4aef43589222');
define('KOBALT_ADMIN_KEY',  'PACARINAS2026');

function kobaltRequireAuth(): void
{
    $k = $_POST['_k'] ?? $_GET['_k'] ?? '';

    if (!hash_equals(KOBALT_ADMIN_HASH, strtolower($k))) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['ok' => false, 'error' => 'No autorizado']);
        exit;
    }
}

function kobaltValidToken(
    string $serviceKey,
    string $serviceId,
    string $tokenHex,
    int    $windowClient
): bool {
    $windowNow = (int) floor(time() / 30);

    foreach ([$windowNow - 1, $windowNow, $windowNow + 1, $windowClient] as $w) {
        $ctx      = 'kobalt:storage' . $serviceId . $w;
        $hmac     = hash_hmac('sha256', $ctx, $serviceKey, true); 
        $truncated = bin2hex(substr($hmac, 0, 16));               
        if (hash_equals($truncated, strtolower($tokenHex))) {
            return true;
        }
    }
    return false;
}

function kobaltRequireToken(): array
{
    $serviceId = preg_replace('/[^a-z0-9_-]/i', '', (string) ($_GET['service'] ?? ''));
    $tokenHex  = preg_replace('/[^0-9a-f]/i', '', (string) ($_SERVER['HTTP_X_KOBALT_TOKEN'] ?? ''));
    $window    = (int) ($_SERVER['HTTP_X_KOBALT_WINDOW'] ?? 0);

    if (!$serviceId || strlen($tokenHex) !== 32) {
        kobaltJsonError(401, 'Token o servicio ausente');
    }

    $cfg = kobaltLoadAnyService($serviceId);
    if (!$cfg || empty($cfg['service_key'])) {
        kobaltJsonError(401, 'Servicio no encontrado o sin clave');
    }

    $serviceKeyBin = hex2bin($cfg['service_key']);
    if (!kobaltValidToken($serviceKeyBin, $serviceId, $tokenHex, $window)) {
        kobaltJsonError(401, 'Token inválido o expirado');
    }

    return $cfg;
}

function kobaltLoadAnyService(string $id): ?array
{
    $id = preg_replace('/[^a-z0-9_-]/i', '', $id);
    if (!$id) return null;

    foreach (glob(KOBALT_STORAGES_DIR . '/*/services/' . $id . '.json') ?: [] as $f) {
        $c = json_decode(file_get_contents($f), true);
        if (is_array($c) && !empty($c['enabled'])) {
            return $c;
        }
    }
    return null;
}

function kobaltLoadServiceInDir(string $dir, string $id): ?array
{
    if (!is_dir($dir)) return null;

    if ($id !== '') {
        $f = $dir . '/' . preg_replace('/[^a-z0-9_-]/i', '', $id) . '.json';
        if (!file_exists($f)) return null;
        $c = json_decode(file_get_contents($f), true);
        return (is_array($c) && !empty($c['enabled'])) ? $c : null;
    }

    $all = [];
    foreach (glob($dir . '/*.json') ?: [] as $f) {
        $c = json_decode(file_get_contents($f), true);
        if (is_array($c) && !empty($c['enabled'])) $all[] = $c;
    }
    usort($all, fn($a, $b) => ($a['priority'] ?? 99) - ($b['priority'] ?? 99));
    return $all[0] ?? null;
}

function kobaltAllEnabledServices(): array
{
    $services = [];

    foreach (glob(KOBALT_STORAGES_DIR . '/*/definition.json') ?: [] as $defFile) {
        $def = json_decode(file_get_contents($defFile), true);
        if (!is_array($def) || empty($def['id'])) continue;

        $typeId      = $def['id'];
        $servicesDir = dirname($defFile) . '/services';
        if (!is_dir($servicesDir)) continue;

        foreach (glob($servicesDir . '/*.json') ?: [] as $f) {
            $svc = json_decode(file_get_contents($f), true);
            if (!is_array($svc) || empty($svc['enabled'])) continue;

            $services[] = [
                'id'       => $svc['id']       ?? basename($f, '.json'),
                'label'    => $svc['label']     ?? '',
                'type'     => $typeId,
                'url'      => $svc['url']       ?? ($def['connector'] ?? ''),
                'priority' => (int) ($svc['priority'] ?? 10),
                'enabled'  => true,
            ];
        }
    }

    usort($services, fn($a, $b) => $a['priority'] - $b['priority']);
    return $services;
}

function kobaltEncrypt(string $plaintext, string $keyBin): string
{
    $iv  = random_bytes(12);
    $tag = '';
    $ct  = openssl_encrypt($plaintext, 'aes-256-gcm', $keyBin, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    return $iv . $ct . $tag; 
}

function kobaltDecrypt(string $blob, string $keyBin): ?string
{
    if (strlen($blob) < 28) return null; 
    $iv  = substr($blob, 0, 12);
    $tag = substr($blob, -16);
    $ct  = substr($blob, 12, -16);
    $pt  = openssl_decrypt($ct, 'aes-256-gcm', $keyBin, OPENSSL_RAW_DATA, $iv, $tag);
    return $pt === false ? null : $pt;
}

function kobaltGenerateServiceKey(): string
{
    return bin2hex(random_bytes(32));
}

function kobaltValidName(string $n): string
{
    $n = strtolower(trim($n));
    if (!preg_match('/^[0-9a-f]{16,128}$/', $n)) {
        kobaltJsonError(400, "nombre inválido: {$n}");
    }
    return $n;
}

function kobaltValidPrefix(string $p): string
{
    $p = strtolower(trim($p));
    if ($p !== '' && !preg_match('/^[0-9a-f]{2,64}$/', $p)) {
        kobaltJsonError(400, "prefijo inválido: {$p}");
    }
    return $p;
}

function kobaltJsonError(int $code, string $message): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

function kobaltCors(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Kobalt-Admin, X-Kobalt-Token, X-Kobalt-Window, X-Kobalt-Service');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}
