<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

define('GL_AS_LIB', true);
define('R2_AS_LIB', true);
require_once __DIR__ . '/GitLab/gitlab.php';
require_once __DIR__ . '/R2/r2.php';

kobaltCors();
header('Content-Type: application/json; charset=utf-8');

$cfg    = kobaltRequireToken();
$type   = $cfg['type'] ?? '';
$action = (string) ($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'];

switch ($type) {

    case 'gitlab':

        if ($action === 'status') {
            $r = glReq($cfg, 'GET', '/projects/' . urlencode($cfg['project_id']));
            echo json_encode(isset($r['error'])
                ? ['ok' => false, 'service' => $cfg['id'], 'error' => $r['error']]
                : ['ok' => true,  'service' => $cfg['id'], 'type' => 'gitlab',
                   'project' => $r['name'] ?? $cfg['project_id'], 'branch' => $cfg['branch']]
            );
            exit;
        }

        if ($action === 'blob' && $method === 'GET') {
            $bytes = glGet($cfg, kobaltValidName($_GET['name'] ?? ''));
            if ($bytes === null) {
                http_response_code(404);
                echo json_encode(['ok' => false, 'error' => 'no encontrado']);
                exit;
            }
            header('Content-Type: application/octet-stream');
            header('Content-Length: ' . strlen($bytes));
            header('Cache-Control: no-store');
            echo $bytes;
            exit;
        }

        if ($action === 'blob' && $method === 'POST') {
            $name = kobaltValidName($_GET['name'] ?? '');
            $raw  = file_get_contents('php://input');
            if (!$raw) kobaltJsonError(400, 'cuerpo vacío');
            $r = glPut($cfg, $name, $raw);
            echo json_encode(isset($r['error'])
                ? ['ok' => false, 'error' => $r['error']]
                : ['ok' => true, 'service' => $cfg['id'], 'name' => $name, 'size' => strlen($raw)]
            );
            exit;
        }

        if ($action === 'list' && $method === 'GET') {
            $r = glList($cfg, kobaltValidPrefix($_GET['prefix'] ?? ''));
            echo json_encode(isset($r['error'])
                ? ['ok' => false, 'error' => $r['error']]
                : ['ok' => true, 'service' => $cfg['id'], 'names' => $r['names'], 'count' => count($r['names'])]
            );
            exit;
        }

        break;

    case 'r2':

        if ($action === 'status') {
            $r = r2List($cfg, '', 1);
            echo json_encode(isset($r['error'])
                ? ['ok' => false, 'service' => $cfg['id'], 'error' => $r['error']]
                : ['ok' => true,  'service' => $cfg['id'], 'type' => 'r2',
                   'bucket' => $cfg['bucket'], 'objects' => $r['count']]
            );
            exit;
        }

        if ($action === 'blob' && $method === 'GET') {
            $bytes = r2Get($cfg, kobaltValidName($_GET['name'] ?? ''));
            if ($bytes === null) {
                http_response_code(404);
                echo json_encode(['ok' => false, 'error' => 'no encontrado']);
                exit;
            }
            header('Content-Type: application/octet-stream');
            header('Content-Length: ' . strlen($bytes));
            header('Cache-Control: no-store');
            echo $bytes;
            exit;
        }

        if ($action === 'blob' && $method === 'POST') {
            $name = kobaltValidName($_GET['name'] ?? '');
            $raw  = file_get_contents('php://input');
            if (!$raw) kobaltJsonError(400, 'cuerpo vacío');
            $r = r2Put($cfg, $name, $raw);
            echo json_encode(isset($r['error'])
                ? ['ok' => false, 'error' => $r['error']]
                : ['ok' => true, 'service' => $cfg['id'], 'name' => $name, 'size' => strlen($raw)]
            );
            exit;
        }

        if ($action === 'list' && $method === 'GET') {
            $r = r2List($cfg, kobaltValidPrefix($_GET['prefix'] ?? ''));
            echo json_encode(isset($r['error'])
                ? ['ok' => false, 'error' => $r['error']]
                : ['ok' => true, 'service' => $cfg['id'], 'names' => $r['names'], 'count' => count($r['names'])]
            );
            exit;
        }

        break;

    default:
        kobaltJsonError(500, "tipo de servicio desconocido: {$type}");
}

kobaltJsonError(400, "acción inválida: {$action} {$method}");
