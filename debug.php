<?php

define('DEBUG_KEY', 'KOBALT_DEBUG_2026');
define('LOG_FILE',  __DIR__ . '/data/kobalt_errors.log');
define('MAX_LINES', 100);

if (($_GET['k'] ?? '') !== DEBUG_KEY) {
    http_response_code(403);
    echo '403 Forbidden';
    exit;
}

ini_set('display_errors', '1');
error_reporting(E_ALL);
header('Content-Type: text/html; charset=utf-8');

function check(string $label, bool $ok, string $detail = ''): string
{
    $icon  = $ok ? '✅' : '❌';
    $color = $ok ? '#22c55e' : '#ef4444';
    $d     = $detail ? " <span style='color:#94a3b8'>($detail)</span>" : '';
    return "<tr><td>$icon</td><td>$label</td><td style='color:$color'>".($ok?'OK':'FALLO')."$d</td></tr>";
}

function perm(string $path): string
{
    if (!file_exists($path)) return '— no existe';
    $perms = substr(sprintf('%o', fileperms($path)), -4);
    $rw    = is_readable($path) ? 'R' : '-';
    $rw   .= is_writable($path) ? 'W' : '-';
    return "$perms [$rw]";
}

$logLines = [];
$logSize  = 0;
if (file_exists(LOG_FILE)) {
    $raw      = file(LOG_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    $logLines = array_slice($raw, -MAX_LINES);
    $logSize  = filesize(LOG_FILE);
}

$tests = [];

try {
    $h = hash_hmac('sha256', 'test', 'key');
    $tests['hash_hmac SHA-256'] = [strlen($h) === 64, 'resultado: ' . substr($h, 0, 8) . '...'];
} catch (Throwable $e) { $tests['hash_hmac SHA-256'] = [false, $e->getMessage()]; }

try {
    $tag = '';
    $enc = openssl_encrypt('test', 'aes-256-gcm', str_repeat("\x00", 32), OPENSSL_RAW_DATA, str_repeat("\x00", 12), $tag);
    $tests['OpenSSL AES-256-GCM'] = [$enc !== false, 'encrypt OK'];
} catch (Throwable $e) { $tests['OpenSSL AES-256-GCM'] = [false, $e->getMessage()]; }

try {
    $j = json_encode(['ok' => true, 'data' => ['a', 'b']]);
    $d = json_decode($j, true);
    $tests['json_encode / json_decode'] = [$d['ok'] === true, $j];
} catch (Throwable $e) { $tests['json_encode / json_decode'] = [false, $e->getMessage()]; }

try {
    $g = glob(__DIR__ . '/storages/*/definition.json') ?: [];
    $tests['glob storages/*/definition.json'] = [count($g) > 0, count($g) . ' encontrados: ' . implode(', ', array_map('basename', array_map('dirname', $g)))];
} catch (Throwable $e) { $tests['glob storages/*/definition.json'] = [false, $e->getMessage()]; }

try {
    ob_start();
    require_once __DIR__ . '/storages/common.php';
    $out = ob_get_clean();
    $tests['require storages/common.php'] = [true, $out ? 'output: ' . substr($out, 0, 40) : 'sin output (correcto)'];
} catch (Throwable $e) { ob_end_clean(); $tests['require storages/common.php'] = [false, $e->getMessage()]; }

if (function_exists('kobaltEncrypt')) {
    try {
        $enc = kobaltEncrypt(str_repeat("\x01", 32), str_repeat("\x02", 32));
        $tests['kobaltEncrypt()'] = [strlen($enc) > 0, strlen($enc) . ' bytes cifrados'];
    } catch (Throwable $e) { $tests['kobaltEncrypt()'] = [false, $e->getMessage()]; }
} else {
    $tests['kobaltEncrypt()'] = [false, 'función no definida'];
}

$files = [
    'auth.php'                           => __DIR__ . '/auth.php',
    'storages/common.php'                => __DIR__ . '/storages/common.php',
    'storages/api.php'                   => __DIR__ . '/storages/api.php',
    'data/'                              => __DIR__ . '/data',
    'data/users.json'                    => __DIR__ . '/data/users.json',
    'data/kobalt_errors.log'             => LOG_FILE,
];

?><!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Kobalt Debug</title>
  <style>
    body { background:#030810; color:#e0e6f4; font:13px/1.6 'JetBrains Mono',monospace; padding:28px 24px; }
    h2 { color:#4D6AF7; font-size:11px; letter-spacing:.22em; text-transform:uppercase; margin:24px 0 10px; }
    table { width:100%; border-collapse:collapse; margin-bottom:18px; }
    td { padding:5px 12px; border-bottom:1px solid rgba(75,106,247,.12); }
    td:first-child { width:28px; }
    .log { background:#070e1a; border:1px solid rgba(75,106,247,.15); border-radius:8px; padding:14px 18px;
           font-size:11px; line-height:1.9; max-height:420px; overflow-y:auto; white-space:pre-wrap; word-break:break-all; }
    .err { color:#ef4444; }
    .warn { color:#eab308; }
    .ok { color:#22c55e; }
    .dim { color:#6b7a99; }
    .badge { display:inline-block; padding:1px 8px; border-radius:99px; font-size:9px; letter-spacing:.1em; }
    .meta { color:#6b7a99; font-size:11px; margin-bottom:18px; }
  </style>
</head>
<body>

<h1 style="color:#29C5F6; font-size:14px; letter-spacing:.15em; text-transform:uppercase; margin-bottom:4px">
  ⚙ Kobalt FLAT — Debug Panel
</h1>
<div class="meta">
  PHP <?= PHP_VERSION ?> · <?= php_uname('s') ?> · <?= date('Y-m-d H:i:s') ?>
  · max_execution_time=<?= ini_get('max_execution_time') ?>s
  · memory_limit=<?= ini_get('memory_limit') ?>
</div>

<!-- FUNCIONES CRÍTICAS -->
<h2>Funciones y extensiones</h2>
<table>
<?php foreach ($tests as $label => [$ok, $detail]): ?>
  <?= check($label, $ok, $detail) ?>
<?php endforeach; ?>
</table>

<!-- ARCHIVOS -->
<h2>Archivos críticos</h2>
<table>
<?php foreach ($files as $label => $path): ?>
  <?= check($label, file_exists($path), perm($path)) ?>
<?php endforeach; ?>
</table>

<!-- PHP CONFIG -->
<h2>Configuración PHP</h2>
<table>
  <?= check('openssl extension', extension_loaded('openssl'), phpversion('openssl') ?: '') ?>
  <?= check('hash extension', extension_loaded('hash'), phpversion('hash') ?: '') ?>
  <?= check('curl extension', extension_loaded('curl'), phpversion('curl') ?: '') ?>
  <?= check('json extension', extension_loaded('json'), phpversion('json') ?: '') ?>
  <?= check('mbstring extension', extension_loaded('mbstring'), '') ?>
  <?= check('output_buffering OFF', !ini_get('output_buffering'), 'val='.ini_get('output_buffering')) ?>
</table>

<!-- LOG -->
<h2>
  Log de errores PHP
  <?php if ($logSize > 0): ?>
    <span class="badge" style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3)">
      <?= number_format($logSize) ?> bytes
    </span>
  <?php else: ?>
    <span class="badge" style="background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.3)">
      Sin errores
    </span>
  <?php endif; ?>
</h2>

<div class="log">
<?php if (empty($logLines)): ?>
<span class="ok">✓ Log vacío — sin errores registrados</span>
<?php else: ?>
<?php foreach ($logLines as $line): ?>
<?php
  $cls = 'dim';
  if (stripos($line, 'fatal') !== false || stripos($line, 'error') !== false) $cls = 'err';
  elseif (stripos($line, 'warning') !== false) $cls = 'warn';
?>
<span class="<?= $cls ?>"><?= htmlspecialchars($line) ?></span>
<?php endforeach; ?>
<?php endif; ?>
</div>

<div style="margin-top:18px; font-size:10px; color:#6b7a99">
  Mostrando últimas <?= MAX_LINES ?> líneas.
  <a href="?k=<?= DEBUG_KEY ?>" style="color:#4D6AF7">Recargar</a> ·
  <a href="?k=<?= DEBUG_KEY ?>&clear=1" style="color:#ef4444" onclick="return confirm('Limpiar log?')">Limpiar log</a>
</div>

<?php

if (($_GET['clear'] ?? '') === '1') {
    file_put_contents(LOG_FILE, '');
    echo '<script>location.href="?k=' . DEBUG_KEY . '"</script>';
}
?>

</body>
</html>
