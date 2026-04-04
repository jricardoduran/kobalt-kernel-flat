<?php

$ok    = false;
$error = null;

try {
    if (empty($cfg['account_id']) || empty($cfg['access_key']) ||
        empty($cfg['secret_key']) || empty($cfg['bucket'])) {
        $error = 'Faltan credenciales en la configuración';
        return;
    }

    $bucket  = $cfg['bucket'];
    $account = $cfg['account_id'];
    $region  = $cfg['region'] ?? 'auto';
    $url     = "https://{$account}.r2.cloudflarestorage.com/{$bucket}/?list-type=2&max-keys=1";

    $now     = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $amzDate = $now->format('Ymd\THis\Z');
    $date    = $now->format('Ymd');
    $host    = parse_url($url, PHP_URL_HOST);
    $path    = parse_url($url, PHP_URL_PATH);
    $rawQ    = parse_url($url, PHP_URL_QUERY) ?? '';
    parse_str($rawQ, $qp); ksort($qp);
    $cq      = http_build_query($qp);

    $bodyHash = hash('sha256', '');
    $canonH   = "content-type:\nhost:{$host}\nx-amz-content-sha256:{$bodyHash}\nx-amz-date:{$amzDate}\n";
    $signedH  = 'content-type;host;x-amz-content-sha256;x-amz-date';
    $cr       = implode("\n", ['GET', $path, $cq, $canonH, $signedH, $bodyHash]);
    $scope    = "{$date}/{$region}/s3/aws4_request";
    $sts      = implode("\n", ['AWS4-HMAC-SHA256', $amzDate, $scope, hash('sha256', $cr)]);

    $kD  = hash_hmac('sha256', $date,           'AWS4' . $cfg['secret_key'], true);
    $kR  = hash_hmac('sha256', $region,         $kD, true);
    $kS  = hash_hmac('sha256', 's3',            $kR, true);
    $kK  = hash_hmac('sha256', 'aws4_request',  $kS, true);
    $sig = hash_hmac('sha256', $sts, $kK);

    $auth = "AWS4-HMAC-SHA256 Credential={$cfg['access_key']}/{$scope}, SignedHeaders={$signedH}, Signature={$sig}";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            "Authorization: {$auth}",
            'Content-Type: ',
            "Host: {$host}",
            "x-amz-content-sha256: {$bodyHash}",
            "x-amz-date: {$amzDate}",
        ],
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($cerr) { $error = "curl: {$cerr}"; return; }

    if ($code === 200) {
        $ok = true;
    } else {
        
        preg_match('/<Message>([^<]*)<\/Message>/', $res ?: '', $m);
        $error = $m[1] ?? "HTTP {$code}";
    }

} catch (Throwable $e) {
    $ok    = false;
    $error = $e->getMessage();
}
