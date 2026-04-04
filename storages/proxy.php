<?php
// DEPRECATED — cada driver es ahora un endpoint directo.
// Usar ./storages/GitLab/gitlab.php o ./storages/R2/r2.php según el tipo.
http_response_code(410);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok' => false, 'error' => 'proxy.php deprecado — usar el endpoint directo del driver']);
exit;
