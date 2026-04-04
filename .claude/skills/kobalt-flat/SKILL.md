---
name: kobalt-flat
description: |
  Skill para TODO el trabajo sobre Kobalt Red FLAT. Actívala siempre que
  el usuario mencione: Kobalt, kernel FLAT, FLAT, local-first, anchor,
  derive, D, entityId, stateHash, nodeId, H_u, actualidad, mapHash,
  sync, opacidad, conectores, storages, proxy, commerce, index.html,
  kobalt.css, kobalt.visual.js, deploy.js, kobalt.app, o cualquier
  componente de este sistema. También al hablar de apps sobre el kernel,
  conectores remotos, separación visual, o planificación arquitectónica.
---

# Kobalt Red FLAT — Skill completa v3.2.1

---

## PARTE 1 — QUÉ ES ESTE SISTEMA
### Leer completa antes de cualquier análisis o cambio

---

### 1.1 La idea central

La mayoría de las apps guardan la verdad en un servidor.
El usuario pide, el servidor responde, la app muestra.

**Este sistema es lo opuesto.**

La verdad nace en el dispositivo del usuario.
El servidor solo recibe copias cifradas, opacas, que no puede leer.
La red no define qué existe — solo guarda proyecciones del estado local.

```
Sistema tradicional:  usuario → servidor → base de datos → respuesta
Kernel FLAT:          usuario → local → (proyección opaca) → red pasiva
```

Esto se llama **local-first**: la app funciona completamente sin red.
El sync con la red es una consecuencia, no un requisito.

---

### 1.2 Las cuatro ideas que lo definen

**Idea 1 — Identidad de génesis**
Una entidad no es su contenido. Es el acto de haberla creado.
Dos entidades con el mismo nombre son diferentes porque nacieron
en momentos distintos, en instalaciones distintas.

```
entityId = H(D, nodeId ∥ counter, 8)
          ↑                ↑
          clave de sesión  punto de creación + ordinal
```

`entityId` no cambia aunque el contenido cambie completamente.

**Idea 2 — Estado separado de identidad**
El contenido actual de una entidad se representa como una huella:

```
stateHash = H(D, payload, 16)
```

`stateHash` sí cambia cuando cambia el payload.
`entityId` no cambia nunca.
Son dos cosas distintas: *qué soy* vs *cómo estoy ahora*.

**Idea 3 — Actualidad compacta**
El sistema no guarda historia. Guarda el estado actual de cada entidad.
La actualidad es un mapa comprimido:

```
𝒜 = { entityId → (stateHash, ts) }
mapHash = H(D, canonical(𝒜), 32)
```

`mapHash` es una guardia: si coincide entre local y remoto,
no hay trabajo de sync. Una sola comparación O(1) antes de cualquier trabajo.

**Idea 4 — Opacidad total hacia la red**
La red recibe bytes que no puede interpretar.
Nombres opacos. Contenido cifrado. Sin semántica expuesta.
Los conectores (GitLab, R2, etc.) son almacenes ciegos.

---

### 1.3 La función universal — una sola transformación

Todo el sistema de identidad y derivación usa una única función:

```
H(key, data, n) = HMAC-SHA256(key, data)[0..n]
```

No hay diez funciones distintas. Hay diez usos de la misma función:

| Para qué | key | data | n |
|----------|-----|------|---|
| Identidad de usuario | "kobalt" | canonical(registro) | 32 |
| Secreto de sesión (anchor) | H_u | "kobalt:anchor" | 32 |
| Clave universal (D) | anchor | "kobalt:key" | 32 |
| ID de base de datos | D | "db" | 8 |
| Prefijo de nombres | D | "name" | 7 |
| Identidad de entidad | D | nodeId ∥ counter | 8 |
| Huella de estado | D | payload | 16 |
| Guardia de actualidad | D | canonical(𝒜) | 32 |
| ID de actualidad remota | D | "actuality" | 8 |
| Identidad de instalación | seed | "kobalt:node" | 8 |

Si aparece una nueva derivación, debe añadirse a esta tabla.
Si no encaja, es una primitiva nueva — justificar por qué.

---

### 1.4 Los tres regímenes — separación absoluta

El sistema tiene tres zonas que nunca se mezclan:

**S — Servidor**
Existe solo durante el login. Computa H_u y desaparece.
No conoce entidades. No conoce payloads. No conoce anchor.
Su única función: verificar identidad y devolver H_u.

```
S posee:  autenticación, H_u, service_keys cifrados
S no posee: payloads, anchor, D, lógica del kernel
Propiedad: S ∩ K = ∅  (servidor y kernel no comparten nada)
```

**B — Puente** (dura microsegundos, es la función openSession)
Recibe H_u, computa anchor, destruye H_u, abre la sesión.
H_u nunca sale de aquí como campo de sesión.

```
B hace:
  anchor = H(H_u, "kobalt:anchor", 32)
  H_u = null  ← destruido
  D = H(anchor, "kobalt:key", 32)  ← Tipo B, µs
  db_id = H(D, "db", 8)
  guarda service_keys re-cifrados con D
  retorna session = { db, nodeId, db_id, _anchor, _derive }
```

**L — Local** (todo el tiempo que dura la sesión)
Aquí vive toda la ontología del sistema.
anchor es el único secreto que persiste (en RAM, nunca en disco).
D se computa bajo demanda y muere al salir del scope.

```
L posee:  anchor, D (efímero), entidades, actualidad, sync, frontera
L no posee: H_u, credenciales del servidor, lógica de autenticación
```

---

### 1.5 Los conectores — infraestructura ciega

Los conectores (GitLab, R2, etc.) no son parte del kernel.
Son almacenes remotos pasivos que implementan cuatro operaciones:

```
put(nameHex, bytes)   → guardar blob opaco
get(nameHex)          → recuperar blob opaco
list(prefixHex)       → listar nombres con prefijo
status()              → verificar conectividad
```

No saben qué significan los bytes que guardan.
Añadir un conector nuevo no toca ningún archivo existente.
Solo una nueva carpeta con su propio driver.

---

### 1.6 La efemeridad de las claves

El sistema tiene tres tipos de vida para los secretos:

```
Tipo A:  anchor — horas (toda la sesión, en session._anchor)
         Es el único secreto persistente en RAM.

Tipo B grupal: D durante syncSession — ~100ms
         Se computa una vez por ciclo de sync, luego muere.

Tipo B puro: D durante createEntity/saveEntityVersion — ~µs
         Se computa, se usa, sale del scope, muere.
```

`_derive` no es un secreto. Es una función que sabe cómo producir D.
Saber la receta no es tener el plato.
`closeSession` destruye `_anchor` y `_derive`.
D ya murió hace horas por scope — no hay nada que limpiar de D.

---

### 1.7 Las tres capas hacia la red — orden estricto

Para enviar datos a la red, se aplican tres capas en orden:

```
LOCAL → RED:
  1. Semántica (payload claro)
  2. AES-GCM con D (cifrado autenticado)
  3. Opacidad α — ÚLTIMO (permutación byte a byte)

RED → LOCAL:
  1. Opacidad⁻¹ α⁻¹ — PRIMERO
  2. AES-GCM⁻¹ con D
  3. Semántica (payload claro)
```

Este orden no conmuta. No se puede aplicar en otro orden.
La opacidad borra toda estructura visible — ni el IV de AES es reconocible.
Invariante: `fromNetwork(toNetwork(x)) = x`

---

### 1.8 El DOM diferencial — sync ≠ repaint

Sincronizar con la red no significa actualizar la pantalla.
La pantalla se actualiza solo si el estado visible cambió.

```
renderizar ⟺ firma_visible_nueva ≠ firma_visible_anterior
```

La firma visible de cada componente incluye exactamente los datos
que el usuario puede ver. Si no cambió ninguno, el DOM no se toca.

```javascript
// Firma correcta del grid (incluye pending — es estado visible)
const sig = JSON.stringify(products.map(p => ({
  id: p.entityId,
  sh: p.stateHash,
  pending: !!pendingMap[p.entityId]
})));
if (cache.grid !== sig) { cache.grid = sig; renderGrid(products); }
```

---

### 1.9 Mapa de archivos — cada pieza hace una sola cosa

```
kernel_flat.js       → O+M: ontología y mecánica. El núcleo.
connectors.js        → I red: DistributedStore, tokens efímeros.
kobalt.css           → I visual: tokens de marca, temas, CSS.
kobalt.visual.js     → I visual JS: funciones puras de DOM.
[app].js (commerce)  → App: orquestación kernel + UI.
index.html           → Estructura: HTML puro + carga de scripts.
auth.php             → S: registro + login + H_u.
storages/proxy.php   → I: relay pasivo para storages.
storages/*/driver    → I: driver específico de cada conector.
```

**Orden de carga obligatorio en index.html:**
```html
<link rel="stylesheet" href="./visual/kobalt.css">
...
<script src="./core/kernel_flat.js"></script>
<script src="./red/connectors.js"></script>
<script src="./visual/kobalt.visual.js"></script>
<script src="./apps/[app].js"></script>
```

**Regla de separación visual:**
```
index.html      → estructura (HTML semántico, sin CSS inline)
kobalt.css      → apariencia (única fuente de CSS)
kobalt.visual.js → comportamiento DOM (única fuente de setIfChanged, toast, etc.)
[app].js        → lógica de dominio (usa KobaltVisual, no reimplementa)
```

---

### 1.10 Las clases internas — qué es qué

Cada pieza del sistema tiene una clase que determina dónde vive:

**O — Ontología fuerte** (irreducible, sin esto el kernel no funciona)
`anchor`, `derive`, `nodeId`, `entityId`, `stateHash`

**M — Mecánica estructural** (opera sobre O, construida encima)
`actuality`, `mapHash`, `pending`, `frontera`, `sync`

**T — Transporte masivo** (snapshot ⊂ sync, no es ontología nueva)
`snapshot`, `zipAdapter`

**I — Infraestructura** (reemplazable sin tocar O ni M)
`IndexedDB`, `connectors`, `serviceConfig`, `kobalt.visual.js`, `kobalt.css`

Antes de tocar cualquier pieza: ¿es O, M, T o I?
Esa respuesta determina dónde vive y qué tan cuidadoso hay que ser.

---

## PARTE 2 — EL FILTRO
### Aplicar antes de cualquier decisión de código

---

### 2.1 Las cinco preguntas obligatorias

Antes de escribir una línea de código, responder:

```
1. ¿Qué clase es esto?      O, M, T, o I
2. ¿A qué régimen pertenece? S, B, o L
3. ¿Qué invariante preserva? nombrar al menos uno
4. ¿Es una primitiva real?   o una instancia semántica de algo ya existente
5. ¿Ya existe estructura algebraica que lo explique? si sí → usarla, no crear
```

Si no se pueden responder → no avanzar. Primero claridad.

---

### 2.2 El flujo de trabajo obligatorio

```
1. CLARIDAD MATEMÁTICA
   → ¿Qué transforma qué? (entradas → salidas)
   → ¿Qué invariantes se mantienen?
   → ¿Qué clase (O/M/T/I)? ¿Qué régimen (S/B/L)?

2. CLARIDAD CONCEPTUAL
   → ¿En qué archivo vive? (ver mapa 1.9)
   → ¿Qué contrato tiene con el resto?
   → ¿Cómo afecta a los invariantes?

3. PLANIFICACIÓN
   → Lista de cambios con justificación
   → Si toca O o M: confirmar antes de ejecutar

4. EJECUCIÓN
   → Código simple, fiable, mínimo
   → Un commit por cambio conceptual distinto
   → Después de cada bloque: node deploy.js
```

---

### 2.3 Invariantes que nunca se rompen

```
I1:  entityId ⊥ payload
     entityId = H(D, nodeId ∥ counter, 8) — nunca del contenido

I2:  stateHash = H(D, payload, 16)
     cambia cuando y solo cuando cambia el payload

I3:  nodeId estable en la instalación
     nace de seed persistente en IDB

I4:  counter monotónico local — nunca decrece

I5:  toda entidad creada queda pending hasta proyectarse

I6:  mapHash coincide → no hay trabajo de sync estructural

I7:  sync ≠ repaint
     renderizar ⟺ firma visible nueva ≠ firma visible anterior

I8:  la red no bloquea el acceso (login es local-first)

I9:  los conectores no introducen ontología nueva

I10: H_u nunca persiste en L como campo de session

I11: D nunca se almacena fuera del scope que lo computa

I12: fromNetwork(toNetwork(x)) = x

I13: index.html no tiene CSS inline — todo en kobalt.css

I14: [app].js no reimplementa funciones de KobaltVisual

I15: asset externo → local-first
     Todo recurso externo (imagen, CSS, fuente) se cachea en localStorage
     tras la primera carga. La red es el origen, no el hogar permanente.
     Patrón: loadAsset(key, url) → localStorage → fallback al CDN
     Si ves un <img src="https://..."> sin pasar por loadAssetImg → violación.
```

---

### 2.4 Reglas por archivo

**kernel_flat.js**
- No crear conceptos si ya existe algo con esas propiedades
- Si dos funciones comparten transformación → son una función universal
- D nunca se almacena — computa, usa, muere
- canonical() en PHP y JS producen exactamente los mismos bytes

**connectors.js**
- storeServiceKeys vive SOLO en el kernel (dentro de openSession)
- Los tokens son efímeros: H(service_key, id ∥ window, 16), expiran en 30s
- Tolerar fallos individuales — nunca bloquear por un conector

**kobalt.css + kobalt.visual.js**
- kobalt.css es la única fuente de CSS del sistema
- kobalt.visual.js es la única fuente de setIfChanged, toast, setBadge, etc.
- Las apps usan KobaltVisual — no reimplementan estas funciones

**[app].js**
- doSync() siempre con catch visible — los errores no se absorben
- gridSig incluye pending — es estado visible
- parsePayload es una función universal — no duplicar try/catch inline
- Una mutación exitosa no garantiza sync exitoso — son operaciones distintas

**storages/**
- Añadir conector: solo nueva carpeta + definition.json + driver
- Nunca modificar api.php, proxy.php, common.php para añadir tipos
- services/*.json no van al repo — services/*.example.json sí

---

### 2.5 Señales de alerta — reconocer antes de cometer

| Si piensas esto... | Es señal de este error |
|--------------------|----------------------|
| "voy a guardar D para no recomputar" | D es Tipo B — muere al salir del scope |
| "voy a pasar H_u_hex a esta función L" | H_u murió en B — pasar session |
| "voy a añadir un `case` a proxy.php" | Cada tipo tiene su propio driver |
| "voy a poner este CSS en index.html" | Todo CSS va en kobalt.css |
| "voy a reescribir setIfChanged en la app" | Está en KobaltVisual — usar eso |
| "el entityId puede venir del nombre" | entityId ⊥ payload — siempre de génesis |
| "el servidor necesita saber el tipo de entidad" | S ∩ K = ∅ — servidor es ciego |
| "voy a añadir otro store IDB para separar" | 1 store con prefijos basta |
| "snapshot es una entidad especial" | snapshot ⊂ sync — mismo merge |
| "doSync() sin await aquí no importa" | Los errores de sync siempre son visibles |
| "<img src> directo a CDN en cada render" | Usar loadAssetImg para cachear |
| "<link> a CDN sin caché local"           | Usar loadAssetCSS para cachear |

---

## PARTE 3 — ESTADO ACTUAL DEL PROYECTO

**Repositorio**: https://github.com/jricardoduran/kobalt-kernel-flat
**Carpeta local**: `C:\Users\Usuario\kernel-flat`
**Servidor**: https://kobalt.app/flat/testClaudeCode/current/
**Deploy**: `node deploy.js` (ejecutar después de cada bloque de commits)
**Kernel**: v3.2.1 — `core/kernel_flat.js`

**Tensiones pendientes — en orden de ejecución:**
```
T1: CSS en index.html → mover a kobalt.css, cargar kobalt.visual.js
T2: storeServiceKeys en connectors.js → eliminar
T3: ARCHITECTURE.md desactualizado → reescribir
T4: doSync() sin catch → corregir en mutaciones
T5: gridSig sin pending → corregir en refreshEntities
T6: parsePayload duplicado → función universal
T7: proxy.php conoce tipos → separar drivers (decisión arquitectónica)
T8: kobalt1.json en repo → gitignore + example.json
```

**Modelo canónico**: `kernel_flat.js` v3.2.1
Si ves código que pasa H_u_hex a funciones L después de openSession → regresión.
