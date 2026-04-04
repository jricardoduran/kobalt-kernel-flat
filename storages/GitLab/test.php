<?php

$ok    = false;
$error = null;

try {
    if (empty($cfg['token']) || empty($cfg['project_id'])) {
        $error = 'Faltan token o project_id en la configuración';
        return;
    }

    $projEnc = rawurlencode((string) $cfg['project_id']);
    $url     = 'https://gitlab.com/api/v4/projects/' . $projEnc;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'PRIVATE-TOKEN: ' . $cfg['token'],
            'Content-Type: application/json',
        ],
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($cerr) { $error = "curl: {$cerr}"; return; }

    $data = json_decode($res ?: '{}', true) ?: [];

    if ($code === 200 && isset($data['id'])) {
        $ok = true;
    } elseif ($code === 401) {
        $error = 'Token inválido o sin permisos';
    } elseif ($code === 404) {
        $error = "Proyecto '{$cfg['project_id']}' no encontrado";
    } else {
        $error = $data['message'] ?? $data['error'] ?? "HTTP {$code}";
    }

} catch (Throwable $e) {
    $ok    = false;
    $error = $e->getMessage();
}
