<?php

$url = rtrim($cfg['url'] ?? '', '/');
if (!$url) {
    $ok = false; $error = 'URL del servicio no configurada'; return;
}

$ch = curl_init($url . '?action=status');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_FOLLOWLOCATION => true,
]);
$res  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($err) {
    $ok = false; $error = "cURL: {$err}"; return;
}

$data  = json_decode($res, true);
$ok    = ($code === 200 && is_array($data) && ($data['ok'] ?? false));
$error = $ok ? null : "HTTP {$code} — respuesta: " . substr($res, 0, 120);
