<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/common.php';

if (!defined('GL_AS_LIB')) {

    kobaltCors();
    $cfg = kobaltRequireToken();

    $action = (string)($_GET['action'] ?? '');
    $method = $_SERVER['REQUEST_METHOD'];
    header('Content-Type: application/json; charset=utf-8');

    if ($action === 'status') {
        $r = glReq($cfg, 'GET', '/projects/' . urlencode($cfg['project_id']));
        echo json_encode(isset($r['error'])
            ? ['ok' => false, 'service' => $cfg['id'], 'error' => $r['error']]
            : ['ok' => true,  'service' => $cfg['id'], 'project' => $r['name'] ?? $cfg['project_id'],
               'branch' => $cfg['branch'], 'base_path' => $cfg['base_path']]
        );
        exit;
    }

    if ($action === 'blob' && $method === 'GET') {
        $bytes = glGet($cfg, kobaltValidName($_GET['name'] ?? ''));
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
        $r = glPut($cfg, $name, $raw);
        echo json_encode(isset($r['error'])
            ? ['ok'=>false,'error'=>$r['error']]
            : ['ok'=>true,'name'=>$name,'size'=>strlen($raw)]
        );
        exit;
    }

    if ($action === 'list' && $method === 'GET') {
        $r = glList($cfg, kobaltValidPrefix($_GET['prefix'] ?? ''));
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

function glPut(array $cfg, string $name, string $bytes): array
{
    $pathEnc = urlencode($cfg['base_path'] . '/' . $name);
    $projEnc = urlencode($cfg['project_id']);

    $exists = glReq($cfg, 'GET',
        '/projects/' . $projEnc . '/repository/files/' . $pathEnc .
        '?ref=' . urlencode($cfg['branch'])
    );
    $httpMethod = isset($exists['file_name']) ? 'PUT' : 'POST';

    $r = glReq($cfg, $httpMethod,
        '/projects/' . $projEnc . '/repository/files/' . $pathEnc,
        ['branch' => $cfg['branch'], 'content' => base64_encode($bytes),
         'encoding' => 'base64', 'commit_message' => 'kobalt: ' . substr($name, 0, 12)]
    );

    if (isset($r['error'])) return ['error' => $r['error']];
    if (empty($r['file_path']) && empty($r['branch']))
        return ['error' => 'GitLab write failed: ' . json_encode($r)];
    return ['ok' => true];
}

function glGet(array $cfg, string $name): ?string
{
    $pathEnc = urlencode($cfg['base_path'] . '/' . $name);
    $projEnc = urlencode($cfg['project_id']);
    $r = glReq($cfg, 'GET',
        '/projects/' . $projEnc . '/repository/files/' . $pathEnc .
        '/raw?ref=' . urlencode($cfg['branch']),
        null, true
    );
    return ($r === null || $r === false) ? null : $r;
}

function glList(array $cfg, string $prefix): array
{
    $names   = [];
    $page    = 1;
    $perPage = 100;
    $projEnc = urlencode($cfg['project_id']);

    do {
        $q   = http_build_query(['path'=>$cfg['base_path'],'ref'=>$cfg['branch'],
                                  'per_page'=>$perPage,'page'=>$page,'recursive'=>'false']);
        $res = glReq($cfg, 'GET', '/projects/' . $projEnc . '/repository/tree?' . $q);
        if (isset($res['error']) || !is_array($res)) break;
        foreach ($res as $item) {
            $n = $item['name'] ?? '';
            if (($item['type']??'') === 'blob' && preg_match('/^[0-9a-f]{16,128}$/', $n)
                && str_starts_with($n, $prefix)) $names[] = $n;
        }
        $page++;
    } while (count($res) === $perPage);

    sort($names);
    return ['names' => $names];
}

function glReq(array $cfg, string $method, string $path, ?array $body = null, bool $raw = false)
{
    $url = 'https://gitlab.com/api/v4' . $path;
    $ch  = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['PRIVATE-TOKEN: ' . $cfg['token'], 'Content-Type: application/json'],
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_TIMEOUT        => 30,
    ];
    if ($body) {
        $opts[CURLOPT_CUSTOMREQUEST] = $method;
        $opts[CURLOPT_POSTFIELDS]    = json_encode($body);
    }
    curl_setopt_array($ch, $opts);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($err)        return ['error' => "curl: $err"];
    if ($code === 404) return null;
    if ($code >= 400) {
        $d = json_decode($res ?: '{}', true);
        return ['error' => $d['message'] ?? $d['error'] ?? "HTTP {$code}"];
    }
    if ($raw) return $res;
    $d = json_decode($res ?: '{}', true);
    return is_array($d) ? $d : ['error' => 'respuesta inválida'];
}
