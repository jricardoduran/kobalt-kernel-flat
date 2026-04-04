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

### Paso 2 — Login (doLogin) y openSession

El servidor (`auth.php`) autentica y devuelve `{ H_u_hex, rawServices }`.
El cliente llama inmediatamente a `openSession`:

```
auth.php → { ok, H_u_hex, services: rawServices }
              ↓
app.js: openSession(H_u_hex, rawServices, state.remote)
```

`openSession()` hace — **régimen B (puente)**:
```
1. H_u_bytes = hexToBytes(H_u_hex)
2. anchor    = H(H_u_bytes, "kobalt:anchor", 32)   ← único secreto de sesión
3. H_u_bytes = null  ← destruido aquí, nunca entra al régimen L
4. db        = openUserStore(anchor)               ← IDB propia
5. nodeId    = getOrCreateNodeId(db)               ← instalación
6. db_id     = H(D, "db", 8)                       ← D efímero, µs
7. _storeServiceKeys(rawServices, H_u)             ← re-cifra con D, destruye H_u
8. connectedStorages = buildServices(session, remote)
9. Retorna { db, nodeId, db_id, connectedStorages, _anchor, _derive }
```

**Invariante absoluta**: `H_u` muere dentro de `openSession`. Nunca es campo de session.
**Invariante absoluta**: `D` nunca se almacena — se computa bajo demanda y muere al salir del scope.
**Único secreto en sesión**: `_anchor` (Tipo A, toda la sesión en RAM).

`session` resultante:
```javascript
{ db, nodeId, db_id, connectedStorages, _anchor, _derive }
// H_u nunca aparece aquí
// D nunca aparece aquí
```

**Invariante**: el login es local-first. No requiere servidor.
La recuperación de datos se delega al sync posterior.

### Paso 3 — Sync (triggerSync)

```
app.js: triggerSync()
  → K.flushPending(session, remote)          ← subir pendientes
  → K.syncActualidad(session, remote)        ← reconciliar
  → refreshEntities()                        ← solo si cambió algo
```

`flushPending()` hace:
```
Para cada entidad en STORE_PENDING:
  D = session._derive()                       ← efímero, µs
  → projectEntityToNetwork(session, eid, remote)
  → remote.put(entityId, encryptPayload(payload, D))
  → clearPending(db, eid)
```

`syncActualidad()` hace:
```
1. D        = session._derive()               ← efímero
2. actName  = H(D, "actuality", 8)            ← nombre opaco
3. Leer actualidad remota: remote.get(actName)
4. Descifrar: deserializeActualidad(blob, D)
5. Comparar mapHash local vs remoto
6. Si iguales → in_sync, nada que hacer
7. Si difieren → para cada entidad:
     - solo local → push (projectEntityToNetwork)
     - solo remota → pull (pullEntityFromNetwork)
     - ambas, diferente stateHash → el más reciente gana (ts)
8. Merge actualidades → guardar local + subir merged
```

### Paso 4 — Operación de Storage (via proxy)

Cuando el kernel llama `remote.put(name, bytes)`:

```
KobaltConnectors.makeStorages(instances, strategy).put(nameHex, bytes)
  → para cada conector activo (ordenados por prioridad):
      → makeStorage(session, serviceConfig).put(nameHex, bytes)
        → fetch(storages/proxy.php?action=blob&name=<hex>, {
            method: POST,
            body: bytes,
            headers: { Content-Type: application/octet-stream,
                       X-Kobalt-Token: <token>, X-Kobalt-Window: <window> }
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
kernel-flat/
│
├── index.html                    ← Estructura pura: HTML semántico + carga de scripts
│
├── core/
│   └── kernel_flat.js            ← Kernel FLAT v3.2.1 (O+M): anchor, derive,
│                                    entidades, actualidad, cifrado, sync, conflictos
│
├── red/
│   └── connectors.js             ← Infraestructura de red (I): KobaltConnectors
│                                    load, buildServices, makeStorage, makeStorages
│
├── visual/
│   ├── kobalt.css                ← Tokens de marca, temas dark/light, componentes CSS
│   └── kobalt.visual.js          ← Funciones puras de DOM diferencial (KobaltVisual)
│                                    setIfChanged, setBadge, toast, show/hide, setView
│
├── apps/
│   └── commerce.js               ← App (orquestación): dominio de inventario,
│                                    sync ≠ repaint, eventos UI
│
├── auth.php                      ← Servidor S: autentica, computa H_u, entrega services
├── debug.php                     ← Utilidades de diagnóstico
│
└── storages/
    ├── api.php                   ← Descubrimiento de storages: action=active|list|save
    ├── proxy.php                 ← Proxy central: enruta a GitLab, R2, PHPHost
    ├── common.php                ← Helpers compartidos entre proxies
    ├── store.php                 ← Lógica de almacenamiento
    ├── register.html             ← Admin UI de servicios
    ├── GitLab/
    │   ├── gitlab.php            ← Proxy GitLab (put/get/list/status)
    │   ├── test.php              ← Test de conectividad
    │   └── services/
    │       ├── kobalt1.json      ← Credenciales reales (SECRETO — en .gitignore)
    │       └── kobalt1.example.json ← Plantilla de configuración
    ├── R2/
    │   ├── r2.php                ← Proxy R2 (mismo contrato)
    │   └── services/             ← Credenciales R2 (en .gitignore)
    └── PHPHost/
        └── definition.json       ← Definición del conector PHPHost
```

### Clasificación ontológica

| Archivo | Régimen | Clase | Toca payloads? |
|---------|---------|-------|----------------|
| core/kernel_flat.js | L | O+M | Sí (cifra/descifra) |
| red/connectors.js | L→P | I | No (solo bytes opacos) |
| visual/kobalt.css | L | I visual | No |
| visual/kobalt.visual.js | L | I visual | No |
| apps/commerce.js | L | App | Interpreta payloads |
| index.html | L | Estructura | Presenta payloads |
| auth.php | S | S | No (entrega H_u cifrado) |
| storages/api.php | P | I | No |
| storages/proxy.php | P | I | No (relay) |
| storages/GitLab/gitlab.php | P | I | No (relay) |
| storages/R2/r2.php | P | I | No (relay) |

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

### Contrato de KobaltConnectors (L→P)

```javascript
remote.put(nameHex, Uint8Array)    → void
remote.get(nameHex)                → Uint8Array | null
remote.list(prefixHex)             → string[]
remote.status()                    → object[]
remote.hasConnectors()             → boolean
```

### Contrato del Kernel (L)

```javascript
// Apertura de sesión — régimen B→L
K.openSession(H_u_hex, rawServices, connectors)
  // → { db, nodeId, db_id, connectedStorages, _anchor, _derive }
  // H_u muere aquí. Nunca sale de openSession.

// Operaciones sobre session — régimen L
K.createEntity(session, payload)
K.saveEntityVersion(session, eid, payload)
K.flushPending(session, remote)
K.syncActualidad(session, remote)
K.loadAllEntitiesLocal(session)
K.loadEntityLocal(session, eid)
K.listPending(session)
K.closeSession(session)            // destruye _anchor y _derive
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

Luego en `storages/api.php`, agregar el tipo al array `$groups`:

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

**Nada más cambia.** `red/connectors.js` ya construye conectores para
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

H(key, data, n) = HMAC-SHA-256(key, data)[0..n] — función universal única.

### Cadena de derivación — lineal, irreversible

```
SERVIDOR:  H_u    = H("kobalt", canonical({name, phone, password}), 32)
                        ↓ cruza la frontera S→B
PUENTE:    anchor = H(H_u, "kobalt:anchor", 32)
           H_u = null  ← destruido aquí
                        ↓
LOCAL:     D      = H(anchor, "kobalt:key", 32)   ← Tipo B, µs de vida
           TODO nace de D
```

### Tabla de derivaciones

```
nodeId      = H(seed,   "kobalt:node",   8)   ← estable en la instalación
entityId    = H(D,      nodeId ∥ counter, 8)  ← ⊥ payload
stateHash   = H(D,      payload,         16)  ← depende de payload
mapHash     = H(D,      canonical(𝒜),   32)  ← resumen del universo visible
actualityId = H(D,      "actuality",     8)   ← nombre opaco en red
db_id       = H(D,      "db",            8)   ← prefijo IDB
```

### Actualidad

```
𝒜 = {ts, mapHash, entidades: {eid → (stateHash, ts)}}
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

### Cifrado de payload para red (3 capas LIFO)

```
LOCAL → RED:   semántica → AES-GCM(D) → Opacidad(α)   [α es el ÚLTIMO]
RED → LOCAL:   des-α → AES-GCM⁻¹(D) → semántica       [des-α es el PRIMERO]

blob = tag(4) ‖ iv(12) ‖ AES-GCM(D, payload)
```

**Invariante**: fromNetwork(toNetwork(x)) = x

---

## 8. Verificación de Invariantes

| # | Invariante | Verificación |
|---|-----------|--------------|
| I1 | entityId ⊥ payload | entityId = H(D, nodeId‖counter, 8), no H(payload) |
| I2 | stateHash depende de payload | stateHash = H(D, payload, 16) |
| I3 | La red no ve payloads claros | AES-GCM(D) + α antes de put |
| I4 | H_u nunca entra al régimen L | H_u = null al final del régimen B (openSession) |
| I5 | D nunca persiste | D se computa bajo demanda, muere al salir del scope |
| I6 | anchor es el único secreto de sesión | session = {…, _anchor, _derive} — sin H_u, sin D |
| I7 | Sin conectores → operativo en local | openSession retorna db siempre |
| I8 | Login no bloqueado por latencia | openSession es local-first |
| I9 | mapHash coincide → no hay trabajo | comparación O(1) en syncActualidad |
| I10 | Sync ≠ repaint | uiCache con firmas, setIfChanged |
| I11 | P no interpreta payloads | gitlab.php es relay puro |
| I12 | Agregar storage no toca código existente | Solo nuevo dir + 2 líneas en registry |

---

## 9. Identidad — Registro y Login con phone_hmac

### Registro (requiere nombre + teléfono + contraseña + código de país)

```
phone_norm = countryDial ‖ digits(phone)
name_norm  = lowercase(trim(name))
phone_hmac = H("kobalt:phone", phone_norm, 32)     ← clave de búsqueda
H_u        = H("kobalt", canonical({name: name_norm, password, phone: phone_norm}), 32)

Si phone_hmac ya existe → 409 (ya registrado)
Si no → guardar {phone_hmac, name_norm, phone_norm, H_u_enc, countryCode}
Retornar → {ok, H_u_hex, services: rawServices}
```

### Login (requiere teléfono + contraseña + código de país — NO nombre)

```
phone_norm = countryDial ‖ digits(phone)
phone_hmac = H("kobalt:phone", phone_norm, 32)     ← buscar
record     = findByPhoneHmac(users, phone_hmac)

Si no existe → 401 (no registrado)
H_u_check  = H("kobalt", canonical({name: record.name_norm, password, phone: phone_norm}), 32)
Si H_u_check ≠ record.H_u → 401 (clave incorrecta)
Si match → {ok, H_u_hex, services: rawServices}
              ↓
app.js llama openSession(H_u_hex, rawServices, connectors)
H_u muere en openSession. Nunca entra al régimen L.
```

### Propiedades

- Login solo necesita teléfono + contraseña (el nombre se recupera del registro)
- phone_hmac es HMAC unidireccional — no revela el teléfono
- H_u es determinista — mismo input → mismo resultado en cualquier servidor
- El password NUNCA se almacena (ni en claro ni hasheado)
- hash_equals() previene timing attacks en la verificación
