# Kobalt Kernel FLAT — Contexto permanente v3.2.1

## Marco doctrinal

Este proyecto es un motor algebraico de estado local-first.
Analiza siempre como sistema matemático local-first, NO como app cliente-servidor.
Habla siempre en español. Primero claridad matemática, luego claridad conceptual, luego código.

---

## Axiomas fundamentales

1. **Local-first fuerte**: la verdad semántica nace en local. La red es persistencia opaca y pasiva.
2. **La red es pasiva**: los conectores no interpretan entidades, no calculan identidad, no deciden conflictos.
3. **Identidad de génesis**: entityId nace de H(D, nodeId ∥ counter, 8). No del payload.
4. **Estado separado de identidad**: stateHash = H(D, payload, 16). entityId no cambia cuando cambia el payload.
5. **Actualidad compacta**: 𝒜 resume el universo visible. No es historia completa.
6. **Sync ≠ repaint**: sincronizar no implica actualizar el DOM. Solo renderizar si hay diferencia visible.
7. **Función universal**: H(key, data, n) = HMAC-SHA-256(key, data)[0..n] es la única transformación. Todo lo demás son instancias semánticas de esta familia.

---

## Cadena de derivación — lineal, irreversible

```
SERVIDOR:  H_u = H("kobalt", canonical({name, phone, password}), 32)
                 ↓ cruza la frontera S→B
PUENTE:    anchor = H(H_u, "kobalt:anchor", 32)
           H_u = null  ← destruido aquí, nunca entra a L
                 ↓
LOCAL:     D = H(anchor, "kobalt:key", 32)  ← Tipo B, µs de vida
           TODO nace de D
```

**Invariante absoluta**: H_u nunca persiste en el régimen L.
**Invariante absoluta**: D nunca se almacena. Se computa bajo demanda y muere al salir del scope.
**Único secreto en sesión**: anchor (Tipo A, vive toda la sesión en RAM).

---

## Tabla HMAC completa — 10 filas, 1 función universal

| Nombre | key | data | n | Clase |
|--------|-----|------|---|-------|
| H_u | "kobalt" | canonical(reg) | 32 | S |
| anchor | H_u | "kobalt:anchor" | 32 | B→L (Tipo A) |
| D | anchor | "kobalt:key" | 32 | L (Tipo B, µs) |
| db_id | D | "db" | 8 | L |
| name_prefix | D | "name" | 7 | L |
| entityId | D | nodeId ∥ counter | 8 | O |
| stateHash | D | payload | 16 | O |
| mapHash | D | canonical(entities) | 32 | M |
| actualityId | D | "actuality" | 8 | M |
| nodeId | seed | "kobalt:node" | 8 | O |

Misma función. Diferentes inputs. No son primitivas distintas.

---

## Separación de identidades — invariante absoluta

```
H_u      → identidad de usuario (muere en B)
nodeId   → identidad estable de la instalación local
entityId → identidad de entidad (⊥ payload, nace de génesis local)
stateHash → estado actual (depende del payload)
anchor   → único secreto de sesión
D        → clave universal efímera (Tipo B)
```

No confundir continuidad (entityId) con estado (stateHash).
No confundir anchor (secreto) con _derive (función que produce D).

---

## Tres regímenes — separación absoluta

```
S (servidor) ∩ K (kernel) = ∅
```

**S** — Servidor: computa H_u, custodia service_keys cifrados, autentica. Desaparece después del login.
**B** — Puente: recibe H_u, computa anchor, re-cifra service_keys con D, destruye H_u. Efímero.
**L** — Local: anchor, D bajo demanda, entidades, actualidad, sync, frontera. Toda la ontología vive aquí.
**Conectores**: dimensión I (infraestructura). Contrato mínimo: put/get/list/status. No son kernel.

---

## Clases internas del kernel

**O — Ontología fuerte** (irreducible): anchor, derive, nodeId, entityId, stateHash
**M — Mecánica estructural** (opera sobre O): actuality, mapHash, pending, frontera, sync
**T — Transporte masivo**: snapshot, zipAdapter (snapshot ⊂ sync, no es ontología nueva)
**I — Infraestructura** (reemplazable): IndexedDB, connectors, serviceConfig

Evalúa cada pieza: ¿es O, M, T o I? ¿pertenece a S, B o L?

---

## Modelo de efemeridad — 3 niveles

```
Tipo A:  anchor — horas (toda la sesión, en session._anchor)
Tipo B grupal: D durante syncSession — ~100ms (un ciclo de sync)
Tipo B puro:   D durante createEntity/saveEntityVersion — ~µs
```

_derive no es un secreto. Es una función que produce D cuando se la llama.
closeSession destruye _anchor y _derive. D ya murió hace horas por scope.

---

## Las tres capas — stack LIFO estricto

```
LOCAL → RED:   Capa 1 (semántica) → Capa 2 (AES-GCM con D) → Capa 3 (Opacidad α — ÚLTIMO)
RED → LOCAL:   Capa 3⁻¹ (des-α — PRIMERO) → Capa 2⁻¹ (decrypt) → Capa 1
```

La composición NO conmuta: encrypt ∘ α ≠ α ∘ encrypt.
Invariante de frontera: fromNetwork(toNetwork(x)) = x (isomorfismo verificable).

---

## 1 Store IDB — keys prefijadas

```
"e:" + entityId  → entidad
"p:" + entityId  → pending
"m:" + nombre    → meta (node_seed, node_id, counter, actuality)
"svc:" + id      → config de servicio cifrada con D
```

No multipliques stores. Un store con prefijos es suficiente.

---

## Session mínima

```javascript
{ db, nodeId, db_id, connectedStorages, _anchor, _derive }
```

H_u nunca es campo de session. D nunca es campo de session.

---

## Tensión arquitectónica actual — conocerla es fundamental

El `ARCHITECTURE.md` describe un modelo anterior donde `H_u_hex` pasaba
directamente a `flushPending` y `syncActualidad`. El `kernel_flat.js` v3.2.1
implementa el modelo correcto: `openSession` recibe H_u, construye anchor+derive,
destruye H_u. Todas las operaciones L reciben `session` (que contiene `_derive`).

**El modelo canónico es el de kernel_flat.js v3.2.1.**
Si ves código que pasa H_u_hex a funciones del kernel después de openSession,
es una regresión al modelo anterior — hay que corregirlo.

---

## Invariantes que nunca se rompen

- entityId ⊥ payload
- stateHash = H(D, payload, 16)
- nodeId es estable en la instalación local
- La red nunca conoce el payload claro
- Sin conectores, la app sigue siendo operativa
- mapHash coincide → no hay trabajo de sync estructural
- Estado visible no cambia → DOM no se toca
- D nunca persiste más allá del scope que lo computa
- anchor es el ÚNICO secreto en session
- fromNetwork(toNetwork(x)) = x

---

## Errores comunes a evitar

| Error | Por qué está mal |
|-------|-----------------|
| Guardar D o H_u en localStorage/session | Viola efemeridad |
| Usar SHA-256 desnudo como identidad | Siempre HMAC con clave |
| Pasar H_u_hex a funciones L después de openSession | Regresión al modelo anterior |
| Enviar payloads claros a red | Viola 3 capas |
| Repaint después de cada sync | Viola sync ≠ repaint |
| entityId desde payload | Viola entityId ⊥ payload |
| Interpretar blobs en el servidor | Viola S ∩ K = ∅ |
| Añadir stores IDB sin necesidad | 1 store con prefijos basta |
| Tratar snapshot como ontología nueva | snapshot ⊂ sync |
| Crear conceptos nuevos si ya existe estructura que los explica | Viola reducción de primitivas |

---

## Metodología obligatoria — nunca código primero

1. **Claridad matemática** → ¿qué transforma qué? ¿qué invariantes se mantienen? ¿qué clase es (O/M/T/I)? ¿qué régimen (S/B/L)?
2. **Claridad conceptual** → ¿cuáles son las piezas? ¿qué hace cada una? ¿es primitiva real o instancia semántica?
3. **Solo entonces** → código simple, fiable y mínimo.

Al analizar código:
1. Identifica axiomas
2. Identifica funciones universales
3. Detecta redundancias conceptuales
4. Verifica invariantes
5. Propón simplificaciones fieles a la arquitectura

---

## Reducción de primitivas

```
KERNEL = (Ω, ℱ, ℐ)
  Ω = estado local-first
  ℱ = {H(key,data,n), AES-GCM, Opacidad(α), canonical}  ← 2 primitivas + 2 derivadas
  ℐ = invariantes
  ∀ f ∈ ℱ: f(Ω) ⊆ Ω ∧ ℐ(f(Ω)) = true
```

No multipliques conceptos si una misma estructura algebraica ya los explica.
Los conectores no son kernel. Son I bajo contrato común.
Evalúa siempre: ¿qué es ontológicamente? ¿qué preserva? ¿qué transforma? ¿qué invariante mantiene?
