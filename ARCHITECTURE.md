# Kobalt FLAT — Arquitectura de Storages · Síntesis Funcional

> La verdad nace en local. La red es persistencia opaca y pasiva.
> Los proxies son intermediarios autenticados: no interpretan, solo relay.

---

## 0. Por qué los storages no funcionaban en V3

El problema era estructural: V3 intentaba transmitir `service_keys` cifrados
durante el login (`auth.php → buildServicePackage → services[]`), pero:

1. Los JSON de servicio no contenían `service_key` (campo generado aparte).
2. El glob buscaba en `storages/*/services/*.json` — ruta incorrecta.
3. El sistema de tokens HMAC efímeros requería un secreto compartido
   que nunca se materializaba correctamente.

**Solución adoptada (V5)**: eliminar la dependencia del login para descubrir
storages. Los storages se descubren **independientemente** del login, via
`connectors_registry.php`. El proxy (`gitlab.php`) custodia las credenciales.
El nodo solo necesita saber la URL del proxy.

---

## 1. Topología del Sistema

```
L₁, L₂, …, Lₙ          ← nodos locales (navegadores)
      │
      │  HTTP (contrato mínimo: put/get/list/status)
      ▼
P₁, P₂, …, Pₘ          ← proxies (servidor PHP, Wasmer, otros)
      │
      │  credenciales nativas (GitLab PAT, R2 keys)
      ▼
Σ₁, Σ₂, …, Σₖ          ← storages reales (GitLab API, R2 API)
```

### Propiedad fundamental

```
L no conoce credenciales de Σ.
P no interpreta payloads de L.
Σ no sabe que existe L.
```

---

## 2. El Flujo Completo — Paso a Paso

### Paso 1 — Boot (DOMContentLoaded)

```
app.js: init()
  → ensureRemote()                              ← descubrir storages
  → loadRuntimeCatalog()                        ← catálogo para config UI
```

`ensureRemote()` hace:
```
fetch(connectors_registry.php?action=active)
  → { services: [{id, type, url, enabled, priority}], strategy, sync }
  → DistributedStore.createFromRuntime(config)
  → state.remote = ds (si hay conectores) | null (si no)
```

**Invariante**: si el servidor no responde, se usa caché de localStorage.
Si no hay caché, `state.remote = null` → local-only. El boot nunca bloquea.

### Paso 2 — Login (doLogin)

```
app.js: doLogin()
  → K.bootstrapUser({ name, phone, password }, state.remote)
```

`bootstrapUser()` hace:
```
1. H_u = SHA-256(canonical({name, phone, password}))     ← identidad
2. db  = openUserStore(H_u)                               ← IDB propia
3. nodeId = getOrCreateNodeId(db)                         ← instalación
4. Si remote existe:
     → intenta leer actualidad remota (blob cifrado)
     → si encuentra → guarda localmente para sync posterior
5. Retorna { db, H_u, H_u_hex, nodeId, status }
```

**Invariante**: el login es local-first. No requiere servidor.
La recuperación de datos se delega al sync posterior.

### Paso 3 — Sync (triggerSync)

```
app.js: triggerSync()
  → K.flushPending(db, H_u_hex, remote)          ← subir pendientes
  → K.syncActualidad(db, H_u_hex, remote)         ← reconciliar
  → refreshEntities()                              ← solo si cambió algo
```

`flushPending()` hace:
```
Para cada entidad en STORE_PENDING:
  → projectEntityToNetwork(db, H_u, eid, remote)
  → remote.put(entityId, encryptPayload(payload, H_u))
  → clearPending(db, eid)
```

`syncActualidad()` hace:
```
1. actName = deriveActualidadName(H_u)                    ← nombre opaco
2. Leer actualidad remota: remote.get(actName)
3. Descifrar: deserializeActualidad(blob, H_u)
4. Comparar mapHash local vs remoto
5. Si iguales → in_sync, nada que hacer
6. Si difieren → para cada entidad:
     - solo local → push (projectEntityToNetwork)
     - solo remota → pull (pullEntityFromNetwork)
     - ambas, diferente stateHash → el más reciente gana (ts)
7. Merge actualidades → guardar local + subir merged
```

### Paso 4 — Operación de Storage (via proxy)

Cuando el kernel llama `remote.put(name, bytes)`:

```
DistributedStore.put(nameHex, bytes)
  → para cada conector activo (ordenados por prioridad):
      → buildPhpConnector.put(nameHex, bytes)
        → fetch(GitLab/gitlab.php?action=blob&name=<hex>, {
            method: POST,
            body: bytes,
            headers: { Content-Type: application/octet-stream }
          })
```

`gitlab.php` recibe y hace:
```
1. loadService(serviceId)           ← lee GitLab/services/kobalt1.json
2. $cfg contiene: token, project_id, branch, base_path
3. glPut($cfg, $name, $bytes)       ← sube a GitLab API
   → verifica si archivo existe (GET)
   → POST (crear) o PUT (actualizar)
   → commit con mensaje "kobalt: <prefix>"
```

---

## 3. Archivos del Proyecto — Qué es cada uno

```
kobalt_flat/
│
├── index.html                    ← UI completa (login + inventario + config)
├── app.js                        ← orquestación, sync ≠ repaint, UI logic
│
├── kernel_flat.js                ← kernel FLAT (H_u, entidades, actualidad,
│                                    cifrado, sync, conflictos)
│
├── distributed_store.js          ← capa de conectores (DistributedStore)
│                                    timeout, fallback, estrategia
│
├── connectors_registry.php       ← descubrimiento de storages (servidor)
│                                    action=active | action=list | action=save
│
├── services.runtime.json         ← config de runtime (strategy, sync interval)
│
├── GitLab/
│   ├── gitlab.php                ← proxy GitLab (put/get/list/status)
│   ├── register.html             ← admin UI para servicios GitLab
│   ├── register.php              ← admin API (save/list/delete/test)
│   └── services/
│       └── kobalt1.json          ← credenciales del servicio (SECRETO)
│
└── R2/
    ├── r2.php                    ← proxy R2 (mismo contrato)
    └── services/                 ← credenciales R2
```

### Clasificación ontológica

| Archivo | Régimen | Clase | Toca payloads? |
|---------|---------|-------|----------------|
| kernel_flat.js | L | O+M | Sí (cifra/descifra) |
| distributed_store.js | L→P | I | No (solo bytes) |
| app.js | L | App | Interpreta payloads |
| index.html | L | Visual | Presenta payloads |
| connectors_registry.php | P | I | No |
| gitlab.php | P | I | No (relay) |
| register.php | P | I (admin) | No |

---

## 4. Contratos

### Contrato de Proxy (P)

Todo proxy implementa exactamente 4 operaciones:

```
GET  ?action=status                → {ok, service, ...}
GET  ?action=blob&name=<hex>       → bytes | 404
POST ?action=blob&name=<hex>       → {ok, name, size}
GET  ?action=list&prefix=<hex>     → {ok, names: [...], count}
```

**Invariante**: el proxy no sabe qué significan los bytes.
Solo valida que `name` sea hex 16-128 chars.

### Contrato de DistributedStore (L→P)

```javascript
remote.put(nameHex, Uint8Array)    → {ok, target, mode, results}
remote.get(nameHex)                → Uint8Array | null
remote.list(prefixHex)             → string[]
remote.status()                    → {active, strategy, statuses}
remote.hasConnectors()             → boolean
```

### Contrato del Kernel (L)

```javascript
K.bootstrapUser(registration, remote)
K.createEntity(db, payload)
K.saveEntityVersion(db, eid, payload)
K.flushPending(db, H_u, remote)
K.syncActualidad(db, H_u, remote)
K.loadAllEntitiesLocal(db)
K.loadEntityLocal(db, eid)
K.listPending(db)
```

---

## 5. Cómo Agregar un Nuevo Tipo de Storage

Solo crear un nuevo directorio con 3 archivos:

```
NuevoTipo/
├── nuevo.php             ← proxy (implementa put/get/list/status)
├── register.html         ← admin UI (autocontenida)
├── register.php          ← admin API (save/list/delete/test)
└── services/             ← directorio de credenciales
```

Luego en `connectors_registry.php`, agregar el tipo al array `$groups`:

```php
$groups = [
    'r2'        => __DIR__ . '/R2/services',
    'gitlab'    => __DIR__ . '/GitLab/services',
    'nuevo'     => __DIR__ . '/NuevoTipo/services',    // ← solo esta línea
];
```

Y en `sanitize_service_public()`, mapear el endpoint:

```php
$endpoint = match($kind) {
    'r2'     => './R2/r2.php',
    'gitlab' => './GitLab/gitlab.php',
    'nuevo'  => './NuevoTipo/nuevo.php',                // ← solo esta línea
};
```

**Nada más cambia.** `distributed_store.js` ya construye conectores para
cualquier tipo que tenga `url` y `enabled=true`.

---

## 6. Sync ≠ Repaint — Cómo funciona

El principio: `renderizar ⟺ sig(visible_nuevo) ≠ sig(visible_anterior)`

Implementación en `app.js`:

```javascript
state.uiCache = {
  badge: '',          // firma del badge de sync
  grid: '',           // firma del grid de productos
  stats: '',          // firma de contadores
  session: '',        // firma del strip de sesión
  kernel: '',         // firma de kernel info
  // ...
};
```

Cada función de render computa una firma del contenido:

```javascript
async function refreshEntities() {
  // ... obtener datos ...
  
  const gridSig = JSON.stringify(products.map(p => ({
    eid: p._eid, ts: p._ts, stateHash: p._stateHash,
    nombre: p.nombre, stock: p.stock, pending: !!pendingMap[p._eid]
  })));
  
  if (state.uiCache.grid !== gridSig) {
    state.uiCache.grid = gridSig;
    renderGrid(products);  // solo aquí se toca el DOM
  }
}
```

Para elementos individuales:

```javascript
function setIfChanged(el, value) {
  const next = String(value);
  if (el.textContent !== next) el.textContent = next;
}
```

El autosync usa `{ silent: true }` para no agitar el badge:

```javascript
setInterval(() => triggerSync({ silent: true }), intervalMs);
```

---

## 7. Fórmulas Matemáticas del Sistema

### Identidad de usuario
```
H_u = SHA-256(canonical({name, phone, password}))[0..31]
```

### Identidad de nodo
```
nodeId = SHA-256(nodeSeed)[0..7]
```

### Identidad de entidad
```
entityId = SHA-256(nodeId ‖ counter32)[0..7]    ⊥ payload
```

### Sello de estado
```
stateHash = SHA-256(payload)[0..15]             depende de payload
```

### Actualidad
```
𝒜 = {ts, mapHash, entidades: {eid → (stateHash, ts)}}
mapHash = SHA-256(canonical(entidades))
```

### Guardia compacta
```
mapHash_L = mapHash_R  →  nada que hacer
mapHash_L ≠ mapHash_R  →  reconciliar item por item
```

### Merge
```
∀ eid ∈ L ∪ R:  winner(eid) = argmax_{x∈{L,R}} ts_x(eid)
```

### Cifrado de payload para red
```
blob = t4(4 bytes) ‖ iv(12 bytes) ‖ AES-GCM(HKDF(H_u), payload)
```

### Nombre de actualidad en red
```
actName = H_u[0..10] ‖ TYPE_ACT    →  24 hex chars
```

---

## 8. Verificación de Invariantes

| # | Invariante | Verificación |
|---|-----------|--------------|
| I1 | entityId ⊥ payload | entityId = H(nodeId‖counter), no H(payload) |
| I2 | stateHash depende de payload | stateHash = H(payload) |
| I3 | La red no ve payloads claros | AES-GCM antes de put |
| I4 | Sin conectores → operativo en local | bootstrapUser retorna db siempre |
| I5 | Login no bloqueado por latencia | bootstrapUser es local-first |
| I6 | mapHash coincide → no hay trabajo | comparación O(1) en syncActualidad |
| I7 | Sync ≠ repaint | uiCache con firmas, setIfChanged |
| I8 | P no interpreta payloads | gitlab.php es relay puro |
| I9 | Agregar storage no toca código existente | Solo nuevo dir + 2 líneas en registry |

---

## 9. Identidad — Registro y Login con phone_hmac

### Registro (requiere nombre + teléfono + contraseña + código de país)

```
phone_norm = countryDial ‖ digits(phone)
name_norm  = lowercase(trim(name))
phone_hmac = HMAC("kobalt:phone", phone_norm)     ← clave de búsqueda
H_u        = HMAC("kobalt", canonical({name: name_norm, password, phone: phone_norm}))

Si phone_hmac ya existe → 409 (ya registrado)
Si no → guardar {phone_hmac, name_norm, phone_norm, H_u, countryCode}
Retornar → {ok, H_u, services}
```

### Login (requiere teléfono + contraseña + código de país — NO nombre)

```
phone_norm = countryDial ‖ digits(phone)
phone_hmac = HMAC("kobalt:phone", phone_norm)     ← buscar
record     = findByPhoneHmac(users, phone_hmac)

Si no existe → 401 (no registrado)
H_u_check  = HMAC("kobalt", canonical({name: record.name_norm, password, phone: phone_norm}))
Si H_u_check ≠ record.H_u → 401 (clave incorrecta)
Si match → {ok, H_u, services}
```

### Propiedades

- Login solo necesita teléfono + contraseña (el nombre se recupera del registro)
- phone_hmac es HMAC unidireccional — no revela el teléfono
- H_u es determinista — mismo input → mismo resultado en cualquier servidor
- El password NUNCA se almacena (ni en claro ni hasheado)
- hash_equals() previene timing attacks en la verificación
