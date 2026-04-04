# Kernel FLAT v3.2 — Especificación

> *La verdad nace en local. La red es persistencia opaca y pasiva.*

## Síntesis

v3.2 = arquitectura v3.1 (D universal, 1 store, sin N) + mejores ideas de v3.3
(assert, zipAdapter, boundaryRoundTripOk, buildStateName, manifest S/B/L + O/M/I).

## Cadena

```
H_u → anchor = HMAC(H_u, "kobalt:anchor", 32) → D = HMAC(anchor, "kobalt:key", 32) → TODO
```

## Tabla HMAC

| Nombre | key | data | n | Produce |
|--------|-----|------|---|---------|
| H_u | "kobalt" | canonical(reg) | 32 | Raíz |
| anchor | H_u | "kobalt:anchor" | 32 | Secreto sesión |
| D | anchor | "kobalt:key" | 32 | Clave universal |
| db_id | D | "db" | 8 | Nombre IDB |
| name_prefix | D | "name" | 7 | Prefijo naming |
| entityId | D | nodeId ‖ counter | 8 | Identidad |
| stateHash | D | payload | 16 | Sello |
| mapHash | D | canonical(entities) | 32 | Guardia |
| actualityId | D | "actuality" | 8 | Naming |
| nodeId | seed | "kobalt:node" | 8 | Instalación |

## 3 Capas

```
LOCAL → RED:  Capa 1 → Capa 2 (AES con D) → Capa 3 (Opacidad — ÚLTIMO)
RED → LOCAL:  Capa 3⁻¹ (PRIMERO) → Capa 2⁻¹ → Capa 1
```

## 1 Store IDB

```
"e:" + entityId → entidad    "p:" + entityId → pending    "m:" + nombre → meta
```

## Session mínima

```javascript
{ db, nodeId, db_id, connectedStorages, _anchor, _derive }
```

## Servidor envía solo H_u

```
POST auth.php?action=register → {name, phone, password} → {ok, H_u}
POST auth.php?action=login    → {name, phone, password} → {ok, H_u}
```

## API

```javascript
const K = () => globalThis.__KOBALT__?.api;
const s = await K().openSession(H_u_hex, cs);
await K().createEntity(s, {name: 'X', stock: 10}, 'product');
await K().saveEntityVersion(s, eid, {name: 'Y', stock: 5});
await K().syncSession(s);
const entries = await K().exportSnapshot(s.db);
await K().importSnapshot(s, entries);
await K().closeSession(s);
```

## Árbol

```
kobalt_flat_v3/
├── core/kernel_flat.js ─── 871 lín  Kernel v3.2
├── KERNEL_FLAT_v3.md ───── (este archivo)
├── SKILL.md ────────────── Skill completo
├── index.html ──────────── Puente β
├── apps/commerce.js ────── App demo
├── red/connectors.js ───── Transporte opaco
├── visual/kobalt.css ───── Diseño
├── visual/kobalt.visual.js DOM diferencial
└── storage/
    ├── auth.php ──────────  Registro + Login
    ├── storages.php ──────  storages.json
    ├── gitlab/services/
    ├── r2/services/
    └── users/
```

