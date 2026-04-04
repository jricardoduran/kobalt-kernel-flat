<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/common.php';

if (!defined('R2_AS_LIB')) {

    kobaltCors();
    $cfg = kobaltRequireToken();

    $action = (string)($_GET['action'] ?? '');
    $method = $_SERVER['REQUEST_METHOD'];
    header('Content-Type: application/json; charset=utf-8');

    if ($action === 'status') {
        $r = r2List($cfg, '', 1);
        echo json_encode(isset($r['error'])
            ? ['ok' => false, 'service' => $cfg['id'], 'error' => $r['error']]
            : ['ok' => true,  'service' => $cfg['id'], 'bucket' => $cfg['bucket'],
               'region' => $cfg['region'] ?? 'auto', 'objects' => $r['count']]
        );
        exit;
    }

    if ($action === 'blob' && $method === 'GET') {
        $bytes = r2Get($cfg, kobaltValidName($_GET['name'] ?? ''));
        if ($bytes === null) { http_response_code(404); echo json_encode(['ok'=>false,'error'=>'no encontrado']); exit; }
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . strlen($bytes));
        header('Cache-Control: no-store');
        echo $bytes;
        exit;
    }

    if ($action === 'blob' && $method === 'POST') {
        $name = kobaltValidName($_GET['name'] ?? '');
        $raw  = file_get_contents('php://input');
        if (!$raw) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'cuerpo vacío']); exit; }
        $r = r2Put($cfg, $name, $raw);
        echo json_encode(isset($r['error'])
            ? ['ok'=>false,'error'=>$r['error']]
            : ['ok'=>true,'name'=>$name,'size'=>strlen($raw)]
        );
        exit;
    }

    if ($action === 'list' && $method === 'GET') {
        $r = r2List($cfg, kobaltValidPrefix($_GET['prefix'] ?? ''));
        echo json_encode(isset($r['error'])
            ? ['ok'=>false,'error'=>$r['error']]
            : ['ok'=>true,'prefix'=>$_GET['prefix']??'','names'=>$r['names'],'count'=>count($r['names'])]
        );
        exit;
    }

    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>"acción inválida: {$action} {$method}"]);
    exit;

} 

function r2Put(array $cfg, string $name, string $body): array
{
    $url = r2Ep($cfg) . '/' . $name;
    [$code, $res, $err] = r2Curl('PUT', $url, r2Sign($cfg, 'PUT', $url, $body, 'application/octet-stream'), $body);
    if ($err)                           return ['error' => "curl: $err"];
    if ($code !== 200 && $code !== 204) return ['error' => "R2 PUT {$code}: {$res}"];
    return ['ok' => true];
}

function r2Get(array $cfg, string $name): ?string
{
    $url = r2Ep($cfg) . '/' . $name;
    [$code, $res] = r2Curl('GET', $url, r2Sign($cfg, 'GET', $url, '', ''));
    return ($code === 200) ? $res : null;
}

function r2List(array $cfg, string $prefix, int $max = 1000): array
{
    $q = ['list-type' => '2', 'max-keys' => (string)$max];
    if ($prefix !== '') $q['prefix'] = $prefix;
    $url = r2Ep($cfg) . '/?' . http_build_query($q);
    [$code, $res, $err] = r2Curl('GET', $url, r2Sign($cfg, 'GET', $url, '', ''));
    if ($err)        return ['error' => "curl: $err"];
    if ($code !== 200) return ['error' => "R2 LIST {$code}: {$res}"];
    $names = [];
    if (preg_match_all('/<Key>([^<]+)<\/Key>/', $res, $m)) {
        foreach ($m[1] as $k) {
            $n = basename($k);
            if (preg_match('/^[0-9a-f]{16,128}$/', $n)) $names[] = $n;
        }
    }
    sort($names);
    return ['names' => $names, 'count' => count($names)];
}

function r2Ep(array $cfg): string
{
    return 'https://' . $cfg['account_id'] . '.r2.cloudflarestorage.com/' . $cfg['bucket'];
}

function r2Curl(string $method, string $url, array $headers, string $body = ''): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_POSTFIELDS     => $body ?: null,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    return [$code, $res, $err];
}

function r2Sign(array $cfg, string $method, string $url, string $body, string $ct): array
{
    $p         = parse_url($url);
    $host      = $p['host'];
    $path      = $p['path'] ?? '/';
    $query     = $p['query'] ?? '';
    $now       = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $amzDate   = $now->format('Ymd\THis\Z');
    $dateStamp = $now->format('Ymd');
    $region    = $cfg['region'] ?? 'auto';
    $bodyHash  = hash('sha256', $body);

    $canonH  = "content-type:{$ct}\nhost:{$host}\nx-amz-content-sha256:{$bodyHash}\nx-amz-date:{$amzDate}\n";
    $signedH = 'content-type;host;x-amz-content-sha256;x-amz-date';

    $cq = '';
    if ($query) { parse_str($query, $qp); ksort($qp); $cq = http_build_query($qp); }

    $cr    = implode("\n", [$method, $path, $cq, $canonH, $signedH, $bodyHash]);
    $scope = "{$dateStamp}/{$region}/s3/aws4_request";
    $sts   = implode("\n", ['AWS4-HMAC-SHA256', $amzDate, $scope, hash('sha256', $cr)]);

    $kD  = hash_hmac('sha256', $dateStamp,     'AWS4' . $cfg['secret_key'], true);
    $kR  = hash_hmac('sha256', $region,        $kD, true);
    $kS  = hash_hmac('sha256', 's3',           $kR, true);
    $kK  = hash_hmac('sha256', 'aws4_request', $kS, true);
    $sig = hash_hmac('sha256', $sts, $kK);

    $auth = "AWS4-HMAC-SHA256 Credential={$cfg['access_key']}/{$scope}, SignedHeaders={$signedH}, Signature={$sig}";
    return ["Authorization: {$auth}", "Content-Type: {$ct}", "Host: {$host}",
            "x-amz-content-sha256: {$bodyHash}", "x-amz-date: {$amzDate}"];
}
