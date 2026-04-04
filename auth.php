<?php
declare(strict_types=1);
/*
 * auth.php — Registro y Login para Kernel FLAT
 *
 * REGISTRO:  POST ?action=register  {name, phone, password, countryDial, countryCode}
 * LOGIN:     POST ?action=login     {phone, password, countryDial}
 * STATUS:    GET  ?action=status
 *
 * DOCTRINA:
 *   S computa H_u y desaparece. S ∩ K = ∅.
 *   password NUNCA se almacena.
 *   Login solo requiere teléfono + contraseña.
 *   phone_hmac = HMAC("kobalt:phone", phone_norm) → clave de búsqueda.
 *   H_u = HMAC("kobalt", canonical({name, password, phone})) → identidad.
 */

ini_set('display_errors', '0');
error_reporting(E_ALL);

define('KOBALT_LOG', __DIR__ . '/data/kobalt_errors.log');
ini_set('log_errors', '1');
ini_set('error_log', KOBALT_LOG);

register_shutdown_function(function () {
    $e = error_get_last();
    if (!$e) return;
    if (!in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) return;
    @file_put_contents(KOBALT_LOG, date('[Y-m-d H:i:s]') . ' FATAL ' . $e['message'] . ' in ' . $e['file'] . ':' . $e['line'] . PHP_EOL, FILE_APPEND | LOCK_EX);
    if (!headers_sent()) { header('Content-Type: application/json'); echo json_encode(['ok' => false, 'error' => 'Error interno']); }
});

require_once __DIR__ . '/storages/common.php';
kobaltCors();
header('Content-Type: application/json');

define('DATA_DIR',   __DIR__ . '/data');
define('USERS_FILE', DATA_DIR . '/users.json');

/* ═══════════════════════════════════════════════════════
   FUNCIONES PURAS — ontología de identidad
   ═══════════════════════════════════════════════════════ */

function canonical($obj): string {
    if (is_null($obj)) return 'null';
    if (is_bool($obj)) return $obj ? 'true' : 'false';
    if (is_int($obj) || is_float($obj)) return json_encode($obj);
    if (is_string($obj)) return json_encode($obj, JSON_UNESCAPED_UNICODE);
    if (is_array($obj)) {
        if (array_values($obj) === $obj)
            return '[' . implode(',', array_map('canonical', $obj)) . ']';
        $keys = array_keys($obj);
        sort($keys, SORT_STRING);
        $pairs = [];
        foreach ($keys as $k)
            $pairs[] = json_encode((string) $k, JSON_UNESCAPED_UNICODE) . ':' . canonical($obj[$k]);
        return '{' . implode(',', $pairs) . '}';
    }
    return json_encode($obj);
}

function computeHu(string $nameNorm, string $phoneNorm, string $password): string {
    return bin2hex(hash_hmac('sha256', canonical(['name' => $nameNorm, 'password' => $password, 'phone' => $phoneNorm]), 'kobalt', true));
}

function computePhoneHmac(string $phoneNorm): string {
    return bin2hex(hash_hmac('sha256', $phoneNorm, 'kobalt:phone', true));
}

function normalizeName(string $n): string {
    return preg_replace('/\s+/', ' ', mb_strtolower(trim($n), 'UTF-8'));
}

function normalizePhone(string $countryDial, string $phone): string {
    return preg_replace('/\D+/', '', $countryDial) . preg_replace('/\D+/', '', $phone);
}

/* ═══════════════════════════════════════════════════════
   PERSISTENCIA
   ═══════════════════════════════════════════════════════ */

function loadUsers(): array {
    if (!file_exists(USERS_FILE)) return [];
    $d = json_decode(file_get_contents(USERS_FILE), true);
    return is_array($d) ? $d : [];
}

function saveUsers(array $users): void {
    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0700, true);
    file_put_contents(USERS_FILE, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function findByPhoneHmac(array $users, string $phoneHmac): ?array {
    foreach ($users as $u) { if (($u['phone_hmac'] ?? '') === $phoneHmac) return $u; }
    return null;
}

/* ═══════════════════════════════════════════════════════
   SERVICE PACKAGE — cifrar service_keys con H_u
   ═══════════════════════════════════════════════════════ */

function buildServicePackage(string $H_u_hex): array {
    $services = [];
    $H_u_bin  = hex2bin($H_u_hex);
    foreach (glob(__DIR__ . '/storages/*/services/*.json') ?: [] as $f) {
        $svc = json_decode(file_get_contents($f), true);
        if (!is_array($svc) || empty($svc['enabled']) || empty($svc['service_key'])) continue;
        $entry = [
            'id'      => $svc['id'],
            'label'   => $svc['label'] ?? $svc['id'],
            'url'     => $svc['url']   ?? '',
            'key_enc' => bin2hex(kobaltEncrypt(hex2bin($svc['service_key']), $H_u_bin)),
        ];
        if (!empty($svc['fallback_url'])) $entry['fallback_url'] = $svc['fallback_url'];
        $services[] = $entry;
    }
    return $services;
}

/* ═══════════════════════════════════════════════════════
   ROUTING
   ═══════════════════════════════════════════════════════ */

$action = (string) ($_GET['action'] ?? '');

if ($action === 'status') {
    echo json_encode(['ok' => true, 'version' => '4.0.0']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST requerido']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!$body) { http_response_code(400); echo json_encode(['ok' => false, 'error' => 'JSON inválido']); exit; }

/* ── REGISTRO ────────────────────────────────────────────
   Input:  {name, phone, password, countryDial, countryCode}
   Output: {ok, H_u, services}
   ─────────────────────────────────────────────────────── */
if ($action === 'register') {
    $name        = (string) ($body['name']        ?? '');
    $phone       = (string) ($body['phone']       ?? '');
    $password    = (string) ($body['password']     ?? '');
    $countryDial = (string) ($body['countryDial']  ?? '');
    $countryCode = (string) ($body['countryCode']  ?? '');

    if (!$name || !$phone || !$password || !$countryDial) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'name, phone, password y countryDial requeridos']);
        exit;
    }

    $nameNorm  = normalizeName($name);
    $phoneNorm = normalizePhone($countryDial, $phone);
    $phoneHmac = computePhoneHmac($phoneNorm);
    $users     = loadUsers();

    if (findByPhoneHmac($users, $phoneHmac)) {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'Este teléfono ya tiene cuenta']);
        exit;
    }

    $H_u     = computeHu($nameNorm, $phoneNorm, $password);
    $users[] = [
        'phone_hmac'  => $phoneHmac,
        'name_norm'   => $nameNorm,
        'phone_norm'  => $phoneNorm,
        'H_u'         => $H_u,
        'countryCode' => $countryCode,
        'created_at'  => date('c'),
    ];
    saveUsers($users);

    echo json_encode(['ok' => true, 'H_u' => $H_u, 'services' => buildServicePackage($H_u)]);
    exit;
}

/* ── LOGIN ───────────────────────────────────────────────
   Input:  {phone, password, countryDial}
   Output: {ok, H_u, services}

   Busca por phone_hmac → recupera name_norm → recomputa H_u → verifica.
   No necesita nombre: el servidor lo tiene del registro.
   ─────────────────────────────────────────────────────── */
if ($action === 'login') {
    $phone       = (string) ($body['phone']       ?? '');
    $password    = (string) ($body['password']     ?? '');
    $countryDial = (string) ($body['countryDial']  ?? '');

    if (!$phone || !$password || !$countryDial) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'phone, password y countryDial requeridos']);
        exit;
    }

    $phoneNorm = normalizePhone($countryDial, $phone);
    $phoneHmac = computePhoneHmac($phoneNorm);
    $user      = findByPhoneHmac(loadUsers(), $phoneHmac);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Teléfono no registrado']);
        exit;
    }

    $H_u_computed = computeHu($user['name_norm'], $phoneNorm, $password);

    if (!hash_equals($user['H_u'], $H_u_computed)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Clave incorrecta']);
        exit;
    }

    echo json_encode(['ok' => true, 'H_u' => $user['H_u'], 'services' => buildServicePackage($user['H_u'])]);
    exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Acción no reconocida']);
