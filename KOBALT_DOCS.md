# Kobalt FLAT v3 — Documentación de Código

> Toda la documentación del sistema en un solo lugar.
> Los archivos fuente (`.php`, `.js`) no contienen comentarios — este archivo es la fuente de verdad documental.

---

## Índice

- [Arquitectura general](#arquitectura-general)
- [auth.php](#authphp)
- [storages/common.php](#storagescommonphp)
- [storages/api.php](#storagesapiphp)
- [storages/store.php](#storagesStorephp)
- [storages/proxy.php](#storagesProxyphp)
- [storages/R2/r2.php](#storagesr2r2php)
- [storages/GitLab/gitlab.php](#storagesgitlabgitlabphp)
- [storages/*/test.php](#storagestestphp)
- [apps/commerce.js](#appscommercejs)
- [red/connectors.js](#redconnectorsjs)
- [visual/kobalt.visual.js](#visualkobaltvisualjs)
- [debug.php](#debugphp)
- [Rotación de credenciales](#rotación-de-credenciales)
- [Agregar un tipo de storage nuevo](#agregar-un-tipo-de-storage-nuevo)

---

## Arquitectura general

```
Régimen L (cliente, local-first)       Régimen S (servidor, pasivo)
─────────────────────────────          ─────────────────────────────
index.html                             auth.php
core/kernel_flat.js                    storages/
apps/commerce.js                         api.php          ← admin + discovery
red/connectors.js                        common.php       ← funciones compartidas
visual/kobalt.visual.js                  store.php        ← endpoint PHPHost
                                         proxy.php        ← proxy GitLab/R2
                                         GitLab/
                                         R2/
                                         PHPHost/
                                       data/
                                         users.json       ← SECRETO
                                         kobalt_errors.log
```

**Doctrina fundamental:**
- La verdad semántica nace en local (IDB del nodo). La red es persistencia opaca y pasiva.
- El servidor puede caer después del login sin afectar las operaciones del nodo.
- `nodeId` = identidad estable de la instalación local.
- `entityId` nace de génesis local (nodeId + contador), no del servidor.
- `stateHash` representa el estado actual del payload.
- `H_u` = identidad de usuario. Vive solo en el login. Desaparece.

**Cadena de derivación de claves:**
```
password → H_u = HMAC("kobalt", canonical({name, password, phone}))
H_u      → anchor = HMAC(H_u, "kobalt:anchor", 32)
anchor   → D      = HMAC(anchor, "kobalt:key", 32)
D        → AES-GCM-decrypt(service_key_enc_IDB) → service_key  [vive µs]
service_key → token = HMAC(service_key, "kobalt:storage"||id||window, 16)
```

---

## auth.php

**Ubicación:** raíz del proyecto (mismo nivel que `index.html`)

**Propósito:** único punto de autenticación del régimen S. Computa `H_u`, persiste usuarios, entrega `service_keys` cifrados con `H_u`.

**Endpoints:**

| Método | Acción | Input | Output |
|--------|--------|-------|--------|
| GET | `?action=status` | — | `{ok, version}` |
| POST | `?action=register` | `{name, phone, password}` | `{ok, H_u, services}` |
| POST | `?action=login` | `{name, phone, password}` | `{ok, H_u, services}` |

**Invariantes:**
- I1: el servidor NUNCA almacena el password — solo `H_u`
- I2: `service_key` NUNCA viaja en claro — siempre cifrado con `H_u` (AES-256-GCM)
- I3: S ∩ K = ∅ — servidor y kernel no comparten lógica
- I4: después del login, el servidor puede caer sin afectar operaciones

**Logging:** todos los errores PHP van a `data/kobalt_errors.log`. El `register_shutdown_function` captura errores fatales que no puede atrapar `try/catch`.

### Funciones

#### `canonical($obj): string`
Serialización canónica determinista compatible con `canonical()` en `kernel_flat.js`.
- null → `'null'`
- bool → `'true'` / `'false'`
- int/float → `json_encode($obj)`
- string → `json_encode($obj, JSON_UNESCAPED_UNICODE)`
- array indexado → `[v1,v2,...]`
- array asociativo → claves ordenadas alfabéticamente → `{"k1":v1,"k2":v2}`

**CRÍTICO:** debe producir exactamente los mismos bytes que `canonical()` en JS. De esto depende que `H_u` del servidor === `H_u` que el cliente computaría.

#### `computeHu(name, phone, password): string`
```
H_u = HMAC("kobalt", canonical({name, password, phone}), SHA-256) → hex 64 chars
```
Determinista: mismo input → mismo `H_u` en cualquier servidor.

#### `normalizeName(string $n): string`
`trim + mb_strtolower + colapsar espacios`. Garantiza que "Ricardo Duran" y "  RICARDO DURAN  " producen el mismo `H_u`.

#### `normalizePhone(string $p): string`
Elimina todo carácter no numérico. "317-637-1365" → "3176371365".

#### `loadUsers(): array`
Lee `data/users.json`. Si no existe, retorna `[]`. Formato: array de `{name_norm, phone_norm, H_u, created_at}`.

#### `saveUsers(array $users): void`
Escribe `data/users.json`. Crea `data/` con permisos 0700 si no existe.

#### `findByHu(array $users, string $hu): ?array`
Búsqueda lineal por `H_u`. Retorna el registro del usuario o `null`.

#### `buildServicePackage(string $H_u_hex): array`
Para cada servicio en `storages/*/services/*.json` que tenga `enabled=true` y `service_key`:
1. Lee `service_key` (hex) → convierte a binario
2. Cifra con `H_u` usando `kobaltEncrypt()` → `key_enc` (AES-256-GCM)
3. Incluye `{id, label, url, key_enc}` — NUNCA el `service_key` en claro

El nodo en `openSession()`:
1. Descifra `key_enc` con `H_u` → `service_key` [µs]
2. Re-cifra con `D` → guarda en IDB bajo `"svc:" + id`
3. `H_u` y `service_key` mueren (salen del scope)

---

## storages/common.php

**Propósito:** base compartida del sistema de storages. Solo define funciones y constantes — nunca ejecuta lógica HTTP.

**Constantes:**

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `KOBALT_STORAGES_DIR` | `__DIR__` | Directorio raíz de storages |
| `KOBALT_STRATEGY` | `{actualidad: replicate_all, payloads: first_available}` | Estrategia de sync global |
| `KOBALT_SYNC` | `{interval_ms: 20000}` | Intervalo de sync |
| `KOBALT_MAX_PER_USER` | `2` | Máximo de entidades por usuario |
| `KOBALT_ADMIN_HASH` | `d4648b90...` | HMAC esperado para auth admin |
| `KOBALT_ADMIN_KEY` | `PACARINAS2026` | KEY para HMAC admin |

**Nota:** `KOBALT_ADMIN_HASH` y `KOBALT_ADMIN_KEY` son usados por `kobaltRequireAuth()`. `api.php` tiene su propia constante `API_ADMIN_HASH` inline (no depende de `common.php` para autenticar).

### Funciones

#### `kobaltRequireAuth(): void`
Guard para endpoints admin (`storages/api.php` ya no la usa — tiene auth inline).
- Lee `_k` desde `$_POST` o `$_GET`
- `hash_equals(KOBALT_ADMIN_HASH, strtolower($k))` → autorizado o 401

#### `kobaltValidToken(serviceKey, serviceId, tokenHex, windowClient): bool`
Verifica el token HMAC efímero del nodo.
```
window = Math.floor(Date.now() / 30_000)
ctx    = "kobalt:storage" + serviceId + window
token  = HMAC(service_key, ctx, SHA-256)[0..16] → 32 hex chars
```
Acepta ventanas `window-1`, `window`, `window+1` (tolerancia ±30s de reloj).
INVARIANTE: conocer el token no revela `service_key` (HMAC unidireccional).

#### `kobaltRequireToken(): array`
Guard para endpoints operacionales (`store.php`, `proxy.php`).
- Lee `X-Kobalt-Token` y `X-Kobalt-Window` del request
- Busca el servicio con `kobaltLoadAnyService()`
- Valida el token con `kobaltValidToken()`
- Si válido: retorna la configuración completa del servicio
- Si inválido: 401 y exit

#### `kobaltLoadAnyService(string $id): ?array`
Escanea `KOBALT_STORAGES_DIR/*/services/<id>.json`.
No necesita saber qué tipos existen (función universal).
Retorna el primer servicio habilitado con ese id, o `null`.

#### `kobaltLoadServiceInDir(string $dir, string $id): ?array`
Variante acotada a un directorio específico.
Si `$id` vacío: retorna el primero habilitado ordenado por prioridad.

#### `kobaltAllEnabledServices(): array`
Todos los servicios habilitados de todos los tipos.
Retorna solo metadata pública — NUNCA `service_key` ni credenciales nativas.

#### `kobaltEncrypt(string $plaintext, string $keyBin): string`
AES-256-GCM. Formato de salida: `iv(12 bytes) ‖ ciphertext ‖ tag(16 bytes)`.
Compatible con el kernel JS (misma estructura).

#### `kobaltDecrypt(string $blob, string $keyBin): ?string`
Inverso de `kobaltEncrypt`. Retorna `null` si falla la autenticación GCM.

#### `kobaltGenerateServiceKey(): string`
`bin2hex(random_bytes(32))` → 64 hex chars. Se llama al crear un servicio nuevo.

#### `kobaltValidName(string $n): string`
Valida nombre de blob: hex 16-128 chars. Si inválido: 400 y exit.

#### `kobaltValidPrefix(string $p): string`
Valida prefijo de lista: hex 2-64 chars, o vacío. Si inválido: 400 y exit.

#### `kobaltJsonError(int $code, string $message): void`
Respuesta de error uniforme. Siempre termina en `exit`.

#### `kobaltCors(): void`
Headers CORS + manejo de preflight OPTIONS (204 y exit).

---

## storages/api.php

**Propósito:** punto de entrada único para discovery y administración de storages. Reemplaza `services_api.php` + `admin.php` (eliminados).

**Auth:** inline con `API_ADMIN_HASH`. No depende de `common.php` para autenticar — es atómico.

**Endpoints:**

| Auth | Método | Acción | Descripción |
|------|--------|--------|-------------|
| No | GET | `?action=active` | Servicios habilitados para el kernel |
| Sí | GET | `?action=types` | Tipos disponibles (definition.json) |
| Sí | GET | `?action=list&type=X` | Servicios de un tipo (sin credenciales) |
| Sí | POST | `?action=save&type=X` | Guarda servicio |
| Sí | POST | `?action=delete&type=X` | Elimina servicio |
| Sí | GET | `?action=test&type=X&service=Y` | Prueba conexión real |

**Invariante de extensión:** añadir tipo nuevo = crear `{Tipo}/definition.json + test.php + driver.php`. `api.php` no cambia nunca.

### Funciones

#### `apiError(int $code, string $msg): void`
Respuesta de error uniforme. Termina en exit.

#### `apiAuth(): void`
`hash_equals(API_ADMIN_HASH, strtolower($_GET['_k']))`. 401 si falla.

#### `apiTypeDir(string $typeId): ?string`
Escanea `*/definition.json`, busca el que tenga `id === $typeId`. Retorna el directorio padre.

#### `apiServiceKey(): string`
`bin2hex(random_bytes(32))`. Genera clave de servicio nueva.

**Acción `test`:** usa `ob_start()`/`ob_end_clean()` + try-catch alrededor de `require $testFile`. Captura cualquier output inesperado del test para no corromper el JSON de respuesta.

---

## storages/store.php

**Propósito:** endpoint de almacenamiento para el tipo PHPHost (filesystem local del servidor).

**Auth:** token HMAC efímero via `kobaltRequireToken()`.

**Endpoints:**

| Método | Acción | Descripción |
|--------|--------|-------------|
| GET | `?action=status` | Estado del servicio |
| GET | `?action=blob&name=X` | Lee un blob por nombre |
| POST | `?action=blob&name=X` | Escribe un blob (body = bytes raw) |
| GET | `?action=list&prefix=X` | Lista blobs con prefijo |

**Storage:** los blobs se guardan en `<base_path>/<name>` donde `base_path` es configurable por servicio. Los nombres son hex 16-128 chars — sin jerarquía, sin semántica.

---

## storages/proxy.php

**Propósito:** proxy transparente del nodo hacia servicios remotos (GitLab, R2). Presenta la misma interfaz que `store.php`.

**Auth:** token HMAC efímero via `kobaltRequireToken()`.

**Flujo:**
1. Valida token → obtiene `$cfg` con credenciales del servicio
2. Detecta tipo (`gitlab` o `r2`) desde `$cfg['type']`
3. Delega al driver correspondiente (`gitlab.php` o `r2.php`) via include guard
4. Retorna la respuesta del driver sin modificación

**Invariante:** el nodo es ciego al tipo de storage. Misma interfaz para todos.

---

## storages/R2/r2.php

**Propósito:** conector Cloudflare R2. Implementa blob GET/POST, list, status contra la API S3 de R2.

**Include guard:** `define('R2_AS_LIB', true)` antes de incluir → carga solo funciones, sin ejecutar routing HTTP.

**Firma AWS Signature V4:** implementada en PHP puro (sin librerías externas).

### Funciones

#### `r2Put(array $cfg, string $name, string $body): array`
PUT de un blob al bucket. Retorna `['ok' => true]` o `['error' => '...']`.

#### `r2Get(array $cfg, string $name): ?string`
GET de un blob. Retorna el contenido o `null` si no existe (404).

#### `r2List(array $cfg, string $prefix, int $max = 1000): array`
LIST del bucket con prefijo opcional. Retorna `{names: [...], count: N}`.
Filtra solo nombres que sean hex 16-128 chars (invariante del sistema).

#### `r2Ep(array $cfg): string`
Construye el endpoint: `https://{account_id}.r2.cloudflarestorage.com/{bucket}`.

#### `r2Curl(string $method, string $url, array $headers, string $body = ''): array`
Wrapper de curl. Retorna `[$code, $response, $error]`.

#### `r2Sign(array $cfg, string $method, string $url, string $body, string $ct): array`
AWS Signature V4. Pasos: canonical request → string to sign → signing key → signature.
Retorna array de headers HTTP listos para usar con curl.

---

## storages/GitLab/gitlab.php

**Propósito:** conector GitLab. Cada blob = archivo en el repositorio (un commit por escritura).

**Include guard:** `define('GL_AS_LIB', true)` antes de incluir.

**Credenciales:** `token` (Personal Access Token con scope `api`), `project_id`, `branch`, `base_path`.

### Funciones

#### `glPut(array $cfg, string $name, string $bytes): array`
Crea o actualiza un archivo en el repo. Detecta si existe (GET) para elegir POST (crear) o PUT (actualizar). El contenido va en base64.

#### `glGet(array $cfg, string $name): ?string`
Lee el archivo raw del repo. Retorna el contenido binario o `null`.

#### `glList(array $cfg, string $prefix): array`
Lista archivos en `base_path/` con paginación (100 por página).
Filtra solo nombres hex 16-128 chars.

#### `glReq(array $cfg, string $method, string $path, ?array $body = null, bool $raw = false)`
HTTP helper para la API de GitLab v4. Maneja auth con `PRIVATE-TOKEN` header.
Retorna array (JSON decodificado) o string raw si `$raw = true`.
- 404 → retorna `null`
- 4xx/5xx → retorna `['error' => message]`

---

## storages/*/test.php

**Contrato estricto:** todos los `test.php` son autónomos — sin cadena de require.
- **Entrada:** `$cfg` (array con credenciales del servicio, inyectado por `api.php`)
- **Salida:** `$ok` (bool), `$error` (string|null)
- Sin `echo`, sin `header()`, sin `exit`

**R2/test.php:** AWS Signature V4 inline, curl directo a `/?list-type=2&max-keys=1`. Extrae mensaje de error del XML si falla.

**GitLab/test.php:** curl directo a `/api/v4/projects/{project_id}`. Mensajes específicos: 401 → "Token inválido", 404 → "Proyecto no encontrado".

**PHPHost/test.php:** verifica que el `base_path` del servicio sea accesible y escribible en el filesystem local.

---

## apps/commerce.js

**Propósito:** aplicación de inventario (instancia semántica del kernel). Interpreta payloads como productos. No reimplementa identidad, cifrado, sync ni opacidad.

**Constantes:**
- `AUTH_URL = './auth.php'` — endpoint de autenticación
- `STORAGE_URL = './storages/api.php'` — discovery de storages activos

**Flujo de boot:**
```
DOMContentLoaded
  → C().load(STORAGE_URL)      ← storagesConfig (lista pública de servicios)
  → bind button handlers
```

**Flujo de auth:**
```
doAuth(action, storagesConfig)
  → fetch AUTH_URL?action=register|login
  → guard: resp.status >= 500 → throw "Error del servidor: HTTP 500"
  → resp.json() → data
  → K().openSession(data.H_u, data.services, null)
  → C().buildServices(session, storagesConfig)
  → K().bindSessionStorages(session, cs)
  → refreshEntities() + doSync() + setInterval
```

### Funciones

#### `doAuth(action, storagesConfig): async`
Autenticación completa. Captura errores en catch → `V().setIfChanged('login-msg', error)`.

#### `doAdd(): async`
Crea entidad de tipo `product` con `{_type, name, stock}`. Llama `K().createEntity()`.

#### `doSync(): async`
`K().syncSession(session)`. Actualiza badge de sync. Si `r.pulls > 0` → refresca lista.

#### `refreshEntities(): async`
`K().loadEntitiesByType(db, 'product')`. Computa firma visual para evitar repaint innecesario (I7: sync ≠ repaint).

#### `renderKernelInfo(): async`
Muestra información del kernel en la UI: nodeId, db_id, versión, conteo por tipo.

#### `doLogout(): async`
`K().closeSession(session)`. Limpia timers, muestra pantalla de login.

---

## red/connectors.js

**Propósito:** transporte del nodo hacia los servicios de storage. El nodo opera directamente — el servidor Kobalt puede caer sin afectar operaciones.

**Invariantes:**
- I1: `service_key` nunca persiste más de µs (Tipo B)
- I2: token expira en ≤ 30s aunque sea interceptado
- I3: el nodo es ciego al tipo de servicio
- I4: si todos los servicios caen → `local_only`
- I5: IDB contiene todo lo necesario para operar sin el servidor Kobalt

**Generación de token por llamada:**
```
D           = HMAC(anchor, "kobalt:key", 32)
service_key = AES-GCM⁻¹(service_key_enc_IDB, D)
window      = Math.floor(Date.now() / 30_000)
token       = HMAC(service_key, "kobalt:storage"‖id‖window, 16)
D = null, service_key = null  ← todo muere
```

**Cache de discovery:** `localStorage['kobalt_storages_active']`. Si el servidor cae, usa caché.

### Funciones

#### `load(apiUrl): async`
Descarga storages activos desde `?action=active`. Si falla, usa caché localStorage. Si caché también falla, retorna estructura vacía (no lanza).

#### `buildServices(session, cfg): async`
Construye `ConnectedStorages` desde las `service_key_enc` en IDB.
Para cada servicio: descifra key → crea objeto `ConnectedStorage` con métodos `get/put/list`.

#### `makeConnectedStorage(session, svcId, url, fallbackUrl): object`
Fábrica de `ConnectedStorage`. Cada método genera token efímero, hace fetch, limpia.

#### `blobGet(session, svc, name): async → Uint8Array|null`
Descarga blob con token HMAC. Intenta `url` y luego `fallbackUrl`.

#### `blobPut(session, svc, name, bytes): async → bool`
Sube blob con token HMAC.

#### `blobList(session, svc, prefix): async → string[]`
Lista blobs con prefijo. Retorna array de nombres hex.

#### `makeEmptyStorages(): ConnectedStorages`
Retorna estructura vacía para operar en `local_only`. Todos los métodos retornan null/false/[].

---

## visual/kobalt.visual.js

**Propósito:** capa de presentación del sistema. Expone `KobaltVisual` en el scope global.

### Funciones

#### `byId(id): Element`
`document.getElementById`. Lanza si no existe.

#### `show(id) / hide(id)`
Gestión de visibilidad de elementos.

#### `setIfChanged(id, value)`
Actualiza `textContent` solo si cambió. Evita repaint innecesario.

#### `setHTMLIfChanged(el, html)`
Actualiza `innerHTML` solo si cambió. Evita repaint innecesario.

#### `computeVisibleSignature(items): string`
`JSON.stringify(items)`. Sirve como firma para detectar cambios en la lista de entidades.

#### `esc(str): string`
Escapa HTML para prevenir XSS en templates.

#### `toast(msg, duration = 2500)`
Notificación temporal no bloqueante.

#### `setBadge(id, cls, text)`
Actualiza clase y texto de un badge de estado.

---

## debug.php

**Propósito:** panel de diagnóstico protegido por clave en URL.

**Acceso:** `debug.php?k=KOBALT_DEBUG_2026`

**Muestra:**
- Test de funciones críticas: `hash_hmac`, `openssl AES-256-GCM`, `kobaltEncrypt`, `require common.php`
- Estado de archivos: existencia + permisos
- Extensiones PHP: openssl, hash, curl, json, mbstring
- Log de errores: últimas 100 líneas de `data/kobalt_errors.log`

**Acción `?clear=1`:** limpia el log de errores (requiere también `?k=...`).

---

## Rotación de credenciales

### Contraseña admin (storages/register.html)

1. Abrir `docs/kobalt_hmac_generator.html` en local (sin conexión)
2. Ingresar nueva contraseña + KEY actual (`PACARINAS2026`)
3. Copiar el HMAC resultante (64 hex chars)
4. Reemplazar en `storages/api.php` línea con `API_ADMIN_HASH`
5. Subir solo `storages/api.php`

### KEY admin (para cambiar también la KEY)
Ambas constantes deben cambiar juntas:
- `API_ADMIN_HASH` en `storages/api.php`
- `HMAC_KEY` en `storages/register.html`

---

## Agregar un tipo de storage nuevo

Crear carpeta con exactamente 3 archivos:

```
storages/NuevoTipo/
├── definition.json   ← describe campos del formulario de registro
├── test.php          ← autónomo: $cfg entrada, $ok/$error salida, sin require
└── driver.php        ← conector: implementa get/put/list/delete
```

`api.php`, `register.html`, `common.php` — **nunca se tocan**.

`api.php` descubre el nuevo tipo automáticamente via `glob('*/definition.json')`.

### Contrato de test.php

```php
<?php
// Sin <?php declare, sin require, sin echo, sin header, sin exit
$ok    = false;
$error = null;
try {
    // ... lógica de prueba usando $cfg ...
    $ok = true;
} catch (Throwable $e) {
    $error = $e->getMessage();
}
// api.php lee $ok y $error después del require
```

### Formato de definition.json

```json
{
  "id": "nombre_tipo",
  "label": "Nombre visible",
  "accent": "#color_hex",
  "connector": "./storages/proxy.php",
  "fields": [
    { "id": "campo", "label": "Label", "type": "text|password|number", "required": true }
  ]
}
```
