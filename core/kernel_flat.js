/*
 * Kernel FLAT v3.2.1 — síntesis
 *
 * La verdad nace en local. La red es persistencia opaca y pasiva.
 * Las claves no existen — se computan, se usan, se destruyen.
 *
 * ═══════════════════════════════════════════════════════════════
 *  CAMBIOS v3.2.1 respecto a v3.2
 * ═══════════════════════════════════════════════════════════════
 *
 *  + saveRaw(db, key, value)          — KV genérico expuesto (I)
 *  + loadRaw(db, key)                 — KV genérico expuesto (I)
 *  + _storeServiceKeys(...)           — interno: cifra service_keys con D
 *  ~ openSession(H_u_hex, services, cs) — acepta rawServices del login
 *
 *  Los service_keys de los storages entran en el kernel en openSession,
 *  se descifran con H_u, se re-cifran con D y se guardan en IDB bajo
 *  el prefijo "svc:". Después H_u muere. El nodo queda autónomo.
 *
 * ═══════════════════════════════════════════════════════════════
 *  REGÍMENES — S → B → L
 * ═══════════════════════════════════════════════════════════════
 *
 *  S (Servidor): computa H_u y entrega service_keys cifrados. S ∩ K = ∅.
 *  B (Puente):   recibe H_u, almacena service_keys en IDB, destruye H_u.
 *  L (Local):    anchor, D, entidades, actualidad, sync, frontera, servicios.
 *
 * ═══════════════════════════════════════════════════════════════
 *  CLASES INTERNAS — O / M / I
 * ═══════════════════════════════════════════════════════════════
 *
 *  O (Ontología fuerte):     anchor, derive, nodeId, entityId, stateHash
 *  M (Mecánica estructural): actuality, mapHash, pending, frontera, snapshot, sync
 *  I (Infraestructura):      IndexedDB, connector, zipAdapter, serviceConfig
 *
 * ═══════════════════════════════════════════════════════════════
 *  PRIMITIVAS (2) + DERIVADAS (2)
 * ═══════════════════════════════════════════════════════════════
 *
 *  HMAC(key, data, n) = HMAC-SHA-256(key, data)[0..n]
 *  AES-GCM(key, iv, data) = cifrado autenticado
 *  Opacidad(D, bytes): sustitución byte a byte via α = buildAlphabet(D)
 *  canonical(x): JSON con keys ordenadas
 *
 * ═══════════════════════════════════════════════════════════════
 *  CADENA — lineal, 3 valores
 * ═══════════════════════════════════════════════════════════════
 *
 *  H_u → anchor = HMAC(H_u, "kobalt:anchor", 32)
 *       → D = HMAC(anchor, "kobalt:key", 32) → TODO
 *
 * ═══════════════════════════════════════════════════════════════
 *  1 STORE IDB — keys prefijadas
 * ═══════════════════════════════════════════════════════════════
 *
 *  "e:" + entityId  → entidad
 *  "p:" + entityId  → pending
 *  "m:" + nombre    → meta (node_seed, node_id, counter, actuality)
 *  "svc:" + id      → config de servicio de storage (cifrada con D)
 *
 * ═══════════════════════════════════════════════════════════════
 */
(function(global) {
  'use strict';

  const KERNEL_NAME    = 'kernel_flat';
  const KERNEL_VERSION = '3.3.0';
  const DB_PREFIX      = 'kobalt:';
  const STORE          = 'kv';

  const NAME_FLAT      = 0x01;
  const NAME_STATE     = 0x02;
  const NAME_ACTUALITY = 0x03;
  const NAME_SNAPSHOT  = 0x04;

  const PFX_ENTITY  = 'e:';
  const PFX_PENDING = 'p:';
  const PFX_META    = 'm:';
  const PFX_SERVICE = 'svc:'; // configuraciones de servicios de storage

  // ═══════════════════════════════════════════════════════════════
  // A. HELPERS — utilidades puras
  // ═══════════════════════════════════════════════════════════════

  function assert(cond, msg) { if (!cond) throw new Error(msg); }

  function safeJsonParse(text, fallback) {
    try { return JSON.parse(text); } catch { return fallback ?? null; }
  }

  function bytesToHex(b) {
    return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function hexToBytes(h) {
    const c = h.replace(/[^0-9a-f]/gi, '');
    const o = new Uint8Array(c.length / 2);
    for (let i = 0; i < o.length; i++) o[i] = parseInt(c.slice(i * 2, i * 2 + 2), 16);
    return o;
  }

  function toBytesUtf8(s) { return new TextEncoder().encode(String(s)); }
  function fromBytesUtf8(b) { return new TextDecoder().decode(b); }

  function concatBytes(...arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  }

  function uint32ToBytes(n) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n >>> 0, false);
    return b;
  }

  function normalizePayload(p) {
    if (p instanceof Uint8Array) return p;
    if (typeof p === 'string') return toBytesUtf8(p);
    if (typeof p === 'object' && p !== null) return toBytesUtf8(canonical(p));
    return toBytesUtf8(String(p));
  }

  function payloadToString(p) {
    if (p instanceof Uint8Array) return fromBytesUtf8(p);
    if (typeof p === 'object' && p !== null) return canonical(p);
    return String(p);
  }

  // ═══════════════════════════════════════════════════════════════
  // B. PRIMITIVA 1 — HMAC-SHA-256
  // ═══════════════════════════════════════════════════════════════

  async function H(key, data, n) {
    const k = key instanceof Uint8Array ? key : toBytesUtf8(String(key));
    const d = data instanceof Uint8Array ? data : toBytesUtf8(String(data));
    const ck = await crypto.subtle.importKey(
      'raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', ck, d));
    return n ? sig.slice(0, n) : sig;
  }

  // ═══════════════════════════════════════════════════════════════
  // C. DERIVADA 1 — canonical
  // ═══════════════════════════════════════════════════════════════

  function canonical(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(canonical).join(',') + ']';
    return '{' + Object.keys(obj).sort()
      .map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
  }

  // ═══════════════════════════════════════════════════════════════
  // D. ANCHOR + DERIVE — cadena lineal H_u → anchor → D
  // ═══════════════════════════════════════════════════════════════

  async function computeAnchor(H_u_bytes) {
    return H(H_u_bytes, 'kobalt:anchor', 32);
  }

  function makeDerive(anchor) {
    return async function derive() {
      return H(anchor, 'kobalt:key', 32);
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // E. DERIVADA 2 — Opacidad
  // ═══════════════════════════════════════════════════════════════

  function buildAlphabet(seed) {
    const s = seed instanceof Uint8Array ? seed : hexToBytes(seed);
    const arr = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 255; i >= 0; i--) {
      j = (j + s[i % s.length] + i) % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return Uint8Array.from(arr);
  }

  function invertAlphabet(alpha) {
    const inv = new Uint8Array(256);
    for (let i = 0; i < 256; i++) inv[alpha[i]] = i;
    return inv;
  }

  function applyAlphabet(bytes, alpha) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = alpha[bytes[i]];
    return out;
  }

  // ═══════════════════════════════════════════════════════════════
  // F. IDENTIDADES — todas son HMAC(D, data, n)
  // ═══════════════════════════════════════════════════════════════

  async function computeNodeId(seed) { return H(seed, 'kobalt:node', 8); }

  async function computeEntityId(D, nodeId, counter32) {
    const n = nodeId instanceof Uint8Array ? nodeId : hexToBytes(nodeId);
    return H(D, concatBytes(n, uint32ToBytes(counter32)), 8);
  }

  async function computeStateHash(D, payload) {
    return H(D, normalizePayload(payload), 16);
  }

  // ═══════════════════════════════════════════════════════════════
  // G. PRIMITIVA 2 — AES-256-GCM (Capa 2)
  //    blob = iv(12) ‖ ciphertext. D es la clave directamente.
  // ═══════════════════════════════════════════════════════════════

  async function encrypt(data, D) {
    const key = await crypto.subtle.importKey('raw', D, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, normalizePayload(data)));
    return concatBytes(iv, ct);
  }

  async function decrypt(blob, D) {
    assert(blob instanceof Uint8Array && blob.length >= 28, 'decrypt: blob inválido o corto');
    const key = await crypto.subtle.importKey('raw', D, { name: 'AES-GCM' }, false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.slice(0, 12) }, key, blob.slice(12)
    ));
  }

  // ═══════════════════════════════════════════════════════════════
  // H. NAMING — 16 bytes claros
  // ═══════════════════════════════════════════════════════════════

  async function buildClearName(D, tipo, id8) {
    const prefix = await H(D, 'name', 7);
    const id = id8 instanceof Uint8Array ? id8 : hexToBytes(id8);
    const name = new Uint8Array(16);
    name.set(prefix, 0);
    name[7] = tipo & 0xFF;
    name.set(id.slice(0, 8), 8);
    return name;
  }

  async function buildFlatName(D, entityId) {
    return buildClearName(D, NAME_FLAT, entityId);
  }

  async function buildStateName(D, entityId, stateHash) {
    const eid = entityId instanceof Uint8Array ? entityId : hexToBytes(entityId);
    const sh = stateHash instanceof Uint8Array ? stateHash : hexToBytes(stateHash);
    const stateId = await H(D, concatBytes(eid, sh), 8);
    return buildClearName(D, NAME_STATE, stateId);
  }

  async function buildActualityName(D) {
    return buildClearName(D, NAME_ACTUALITY, await H(D, 'actuality', 8));
  }

  function opacifyName(clearName, alpha) {
    return bytesToHex(applyAlphabet(clearName, alpha));
  }

  // ═══════════════════════════════════════════════════════════════
  // I. FRONTERA — isomorfismo toNetwork / fromNetwork
  //    Invariante: fromNetwork(toNetwork(x)) = x
  // ═══════════════════════════════════════════════════════════════

  function toNetwork(clearName, clearBlob, alpha) {
    return {
      name: bytesToHex(applyAlphabet(clearName, alpha)),
      blob: applyAlphabet(clearBlob, alpha),
    };
  }

  function fromNetwork(opaqueBlob, alphaInv) {
    return applyAlphabet(opaqueBlob, alphaInv);
  }

  function boundaryRoundTripOk(clearName, clearBlob, alpha) {
    const alphaInv = invertAlphabet(alpha);
    const projected = toNetwork(clearName, clearBlob, alpha);
    const recovered = fromNetwork(projected.blob, alphaInv);
    return bytesToHex(recovered) === bytesToHex(clearBlob);
  }

  // ═══════════════════════════════════════════════════════════════
  // J. ACTUALIDAD — proyección del estado actual
  // ═══════════════════════════════════════════════════════════════

  async function buildActuality(db, D) {
    const all = await _kvRange(db, PFX_ENTITY);
    const entities = {};
    for (const e of all) entities[e.entityId] = { stateHash: e.stateHash, ts: e.ts };
    const mapHash = bytesToHex(await H(D, toBytesUtf8(canonical(entities)), 32));
    return { ts: Date.now(), mapHash, entities };
  }

  async function rebuildActuality(session) {
    const D = await session._derive();
    const act = await buildActuality(session.db, D);
    await saveActualityLocal(session.db, act);
    return act;
  }

  async function mergeActualities(L, R, D) {
    const entities = {};
    const keys = new Set([
      ...Object.keys(L?.entities || {}),
      ...Object.keys(R?.entities || {}),
    ]);
    for (const eid of keys) {
      const l = L?.entities?.[eid], r = R?.entities?.[eid];
      if (!l) { entities[eid] = r; continue; }
      if (!r) { entities[eid] = l; continue; }
      entities[eid] = Number(r.ts || 0) >= Number(l.ts || 0) ? r : l;
    }
    const mapHash = D
      ? bytesToHex(await H(D, toBytesUtf8(canonical(entities)), 32))
      : '';
    return { ts: Date.now(), mapHash, entities };
  }

  async function saveActualityLocal(db, act) { await _kvPut(db, PFX_META + 'actuality', act); }

  async function loadActualityLocal(db) {
    return await _kvGet(db, PFX_META + 'actuality') || { ts: 0, mapHash: '', entities: {} };
  }

  // ═══════════════════════════════════════════════════════════════
  // K. PERSISTENCIA — 1 store IDB con keys prefijadas
  // ═══════════════════════════════════════════════════════════════

  function _idbOpen(name, version, upgrade) {
    return new Promise((ok, fail) => {
      const r = indexedDB.open(name, version);
      r.onupgradeneeded = e => upgrade(e.target.result);
      r.onsuccess = e => ok(e.target.result);
      r.onerror = e => fail(e.target.error);
    });
  }

  function _kvPut(db, key, value) {
    return new Promise((ok, fail) => {
      const r = db.transaction([STORE], 'readwrite').objectStore(STORE).put(value, key);
      r.onsuccess = () => ok();
      r.onerror = e => fail(e.target.error);
    });
  }

  function _kvGet(db, key) {
    return new Promise((ok, fail) => {
      const r = db.transaction([STORE], 'readonly').objectStore(STORE).get(key);
      r.onsuccess = e => ok(e.target.result ?? null);
      r.onerror = e => fail(e.target.error);
    });
  }

  function _kvDel(db, key) {
    return new Promise((ok, fail) => {
      const r = db.transaction([STORE], 'readwrite').objectStore(STORE).delete(key);
      r.onsuccess = () => ok();
      r.onerror = e => fail(e.target.error);
    });
  }

  function _kvRange(db, prefix) {
    return new Promise((ok, fail) => {
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
      const rows = [];
      const r = db.transaction([STORE], 'readonly').objectStore(STORE).openCursor(range);
      r.onsuccess = e => {
        const c = e.target.result;
        if (c) { rows.push(c.value); c.continue(); } else ok(rows);
      };
      r.onerror = e => fail(e.target.error);
    });
  }

  function _kvKeys(db, prefix) {
    return new Promise((ok, fail) => {
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
      const keys = [];
      const r = db.transaction([STORE], 'readonly').objectStore(STORE).openKeyCursor(range);
      r.onsuccess = e => {
        const c = e.target.result;
        if (c) { keys.push(c.key); c.continue(); } else ok(keys);
      };
      r.onerror = e => fail(e.target.error);
    });
  }

  async function openUserStore(db_id) {
    return _idbOpen(DB_PREFIX + db_id, 1, db => {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    });
  }

  // ── KV genérico expuesto — para uso de conectores y extensiones ────────────
  //
  // saveRaw / loadRaw permiten que connectors.js guarde y lea configuraciones
  // de servicios en IDB (prefijo "svc:") sin necesidad de conocer los internos.
  //
  // CLASE: I (infraestructura) — no son primitivas del kernel.

  async function saveRaw(db, key, value) {
    await _kvPut(db, key, value);
  }

  async function loadRaw(db, key) {
    return _kvGet(db, key);
  }

  // ── Identidad de instalación ───────────────────────────────────

  async function getOrCreateNodeSeed(db) {
    let s = await _kvGet(db, PFX_META + 'node_seed');
    if (!s) {
      s = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      await _kvPut(db, PFX_META + 'node_seed', s);
    }
    return hexToBytes(s);
  }

  async function getOrCreateNodeId(db) {
    let n = await _kvGet(db, PFX_META + 'node_id');
    if (!n) {
      n = bytesToHex(await computeNodeId(await getOrCreateNodeSeed(db)));
      await _kvPut(db, PFX_META + 'node_id', n);
    }
    return n;
  }

  async function nextCreateCounter(db) {
    const cur = Number(await _kvGet(db, PFX_META + 'counter') || 0);
    const next = (cur + 1) >>> 0;
    assert(next !== 0, 'counter overflow');
    await _kvPut(db, PFX_META + 'counter', next);
    return next;
  }

  // ── Almacenamiento de entidades ────────────────────────────────

  async function saveEntityLocal(db, eid, sh, ts, payload, meta = {}) {
    await _kvPut(db, PFX_ENTITY + eid, {
      ...meta, entityId: eid, stateHash: sh, ts, payload: payloadToString(payload),
    });
  }

  async function loadEntityLocal(db, eid) { return _kvGet(db, PFX_ENTITY + eid); }
  async function loadAllEntitiesLocal(db) { return _kvRange(db, PFX_ENTITY); }

  async function loadEntitiesByType(db, type) {
    return (await _kvRange(db, PFX_ENTITY)).filter(e => e.type === type);
  }

  async function countByType(db) {
    const counts = {};
    for (const e of await _kvRange(db, PFX_ENTITY)) {
      const t = e.type || '_untyped';
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }

  // ── Pending ────────────────────────────────────────────────────

  async function markPending(db, eid, sh, ts) { await _kvPut(db, PFX_PENDING + eid, { stateHash: sh, ts }); }
  async function clearPending(db, eid) { await _kvDel(db, PFX_PENDING + eid); }

  async function listPending(db) {
    const keys = await _kvKeys(db, PFX_PENDING);
    const out = {};
    for (const k of keys) out[k.slice(PFX_PENDING.length)] = await _kvGet(db, k);
    return out;
  }

  // ═══════════════════════════════════════════════════════════════
  // L. FLUJOS L — solo local, Capa 1
  // ═══════════════════════════════════════════════════════════════

  async function createEntity(session, clearPayload, type) {
    const { db } = session;
    const D = await session._derive();
    const nodeId  = await getOrCreateNodeId(db);
    const counter = await nextCreateCounter(db);
    const entityId  = bytesToHex(await computeEntityId(D, nodeId, counter));
    const stateHash = bytesToHex(await computeStateHash(D, clearPayload));
    const ts = Date.now();
    await saveEntityLocal(db, entityId, stateHash, ts, clearPayload, {
      type: type || null, genesisNodeId: nodeId, genesisCounter: counter,
    });
    await markPending(db, entityId, stateHash, ts);
    return { entityId, stateHash, ts, type: type || null };
  }

  async function saveEntityVersion(session, entityId, clearPayload) {
    const { db } = session;
    assert(/^[0-9a-f]{16}$/i.test(String(entityId)), 'entityId inválido');
    const prev = await loadEntityLocal(db, entityId);
    assert(prev, 'saveEntityVersion: entidad no existe (I11)');
    const D = await session._derive();
    const stateHash = bytesToHex(await computeStateHash(D, clearPayload));
    const ts = Date.now();
    await saveEntityLocal(db, entityId, stateHash, ts, clearPayload, {
      type: prev.type || null, genesisNodeId: prev.genesisNodeId, genesisCounter: prev.genesisCounter,
    });
    await markPending(db, entityId, stateHash, ts);
    return { stateHash, ts };
  }

  // ═══════════════════════════════════════════════════════════════
  // M. FLUJOS F — frontera (Capa 1 → 2 → 3 o inverso)
  // ═══════════════════════════════════════════════════════════════

  async function projectToRemote(db, D, entityId, cs) {
    const e = await loadEntityLocal(db, entityId);
    assert(e, 'projectToRemote: entidad no encontrada');
    const clearName = await buildFlatName(D, entityId);
    const clearBlob = await encrypt(e.payload, D);
    const alpha = buildAlphabet(D);
    const { name, blob } = toNetwork(clearName, clearBlob, alpha);
    await cs.put(name, blob);
    await clearPending(db, entityId);
  }

  // pullFromRemote — Corrección I: preserva el ts de la versión remota.
  //
  // PROBLEMA ANTERIOR: asignaba ts = Date.now(), haciendo artificialmente
  // "más nueva" cualquier entidad importada, deformando el merge posterior.
  //
  // CORRECCIÓN: recibe el ts remoto (desde remoteAct.entities[eid].ts)
  // y lo preserva. Si no se provee (null), cae en Date.now() solo como
  // último recurso — situación que no debería ocurrir en sync normal.
  //
  // INVARIANTE: ts local = ts de la versión que se está restaurando.

  async function pullFromRemote(db, D, entityId, cs, remoteTs = null) {
    const clearName = await buildFlatName(D, entityId);
    const alpha = buildAlphabet(D);
    const opaqueBlob = await cs.get(opacifyName(clearName, alpha));
    if (!opaqueBlob) return null;
    const clearBlob = fromNetwork(opaqueBlob, invertAlphabet(alpha));
    const plain = fromBytesUtf8(await decrypt(clearBlob, D));
    const sh = bytesToHex(await computeStateHash(D, plain));

    // Preservar ts remoto: no inventar un timestamp de importación
    const ts = remoteTs ?? Date.now();

    const prev = await loadEntityLocal(db, entityId);
    let type = prev?.type || null;
    if (!type) { try { type = JSON.parse(plain)?._type || null; } catch {} }
    await saveEntityLocal(db, entityId, sh, ts, plain,
      prev ? { type, genesisNodeId: prev.genesisNodeId, genesisCounter: prev.genesisCounter }
           : { type });
    await clearPending(db, entityId);
    return { entityId, stateHash: sh, ts };
  }

  async function flushPending(db, D, cs) {
    const p = await listPending(db);
    let flushed = 0, failed = 0;
    const errors = [];
    for (const eid of Object.keys(p)) {
      try { await projectToRemote(db, D, eid, cs); flushed++; }
      catch (err) { failed++; errors.push({ entityId: eid, error: err?.message }); }
    }
    return { flushed, failed, errors };
  }

  async function syncActuality(db, D, cs) {
    const actClear = await buildActualityName(D);
    const alpha = buildAlphabet(D);
    const alphaInv = invertAlphabet(alpha);

    let remoteAct = null;
    try {
      const opaqueBlob = await cs.get(opacifyName(actClear, alpha));
      if (opaqueBlob) remoteAct = safeJsonParse(fromBytesUtf8(await decrypt(fromNetwork(opaqueBlob, alphaInv), D)));
    } catch (err) {
      return { status: 'remote_error', pulls: 0, pushes: 0, conflicts: [], errors: [{ error: err?.message }] };
    }

    const localAct = await buildActuality(db, D);

    if (!remoteAct) {
      if (localAct.mapHash) {
        try {
          const clearBlob = await encrypt(canonical(localAct), D);
          const { name, blob } = toNetwork(actClear, clearBlob, alpha);
          await cs.put(name, blob, { strategy: 'replicate_all' });
          await saveActualityLocal(db, localAct);
        } catch {}
      }
      return { status: 'first_push', pulls: 0, pushes: 0, conflicts: [], errors: [] };
    }

    if (localAct.mapHash && localAct.mapHash === remoteAct.mapHash)
      return { status: 'in_sync', pulls: 0, pushes: 0, conflicts: [], errors: [] };

    const allIds = new Set([...Object.keys(localAct.entities), ...Object.keys(remoteAct.entities)]);
    let pulls = 0, pushes = 0;
    const conflicts = [], errors = [];

    for (const eid of allIds) {
      try {
        const Lx = localAct.entities[eid], Rx = remoteAct.entities[eid];
        if (!Lx && Rx)  { const r = await pullFromRemote(db, D, eid, cs, Rx.ts); if (r) pulls++; continue; }
        if (Lx && !Rx)  { await projectToRemote(db, D, eid, cs); pushes++; continue; }
        if (!Lx || !Rx) continue;
        if (Lx.stateHash === Rx.stateHash) continue;
        if (Number(Rx.ts || 0) >= Number(Lx.ts || 0)) { const r = await pullFromRemote(db, D, eid, cs, Rx.ts); if (r) pulls++; }
        else { await projectToRemote(db, D, eid, cs); pushes++; }
      } catch (err) { errors.push({ entityId: eid, error: err?.message }); }
    }

    const merged = await mergeActualities(await buildActuality(db, D), remoteAct, D);
    await saveActualityLocal(db, merged);
    try {
      const clearBlob = await encrypt(canonical(merged), D);
      const { name, blob } = toNetwork(actClear, clearBlob, alpha);
      await cs.put(name, blob, { strategy: 'replicate_all' });
    } catch {}

    return { status: conflicts.length ? 'conflicts' : 'synced', pulls, pushes, conflicts, errors };
  }

  async function syncSession(session) {
    if (!session?.db) throw new Error('syncSession: no db');
    if (!session.connectedStorages?.hasConnectors?.())
      return { flushed: 0, failed: 0, status: 'local_only', pulls: 0, pushes: 0, conflicts: [], errors: [] };
    const { db, connectedStorages: cs } = session;
    const D = await session._derive();
    const flush = await flushPending(db, D, cs);
    const sync  = await syncActuality(db, D, cs);
    session.status = sync.status || session.status;
    return { ...sync, flushed: flush.flushed, failed: flush.failed, flush_errors: flush.errors };
  }

  // ═══════════════════════════════════════════════════════════════
  // N. CONFLICTOS + RELOJ
  // ═══════════════════════════════════════════════════════════════

  async function checkClockReliability(db) {
    const now = Date.now();
    const last = Number(await _kvGet(db, PFX_META + 'last_ts') || 0);
    await _kvPut(db, PFX_META + 'last_ts', now);
    const d = last - now;
    return d > 5000 ? { reliable: false, reason: `retrocedió ${d}ms`, delta: d } : { reliable: true, delta: d };
  }

  async function detectConflict(session, entityId) {
    const { db, connectedStorages: cs } = session;
    const D = await session._derive();
    const local = await loadEntityLocal(db, entityId);
    let rP = null, rT = null;
    try {
      const alpha    = buildAlphabet(D);
      const alphaInv = invertAlphabet(alpha);

      // Obtener payload remoto
      const opaqueBlob = await cs.get(opacifyName(await buildFlatName(D, entityId), alpha));
      if (opaqueBlob) {
        rP = fromBytesUtf8(await decrypt(fromNetwork(opaqueBlob, alphaInv), D));
      }

      // Corrección II: ts remoto desde la actuality REMOTA fresca, no desde
      // la proyección local. La actuality local puede estar desincronizada.
      // Se descifra la actuality remota directamente para obtener el ts real.
      const actClear     = await buildActualityName(D);
      const opaqueActBlob = await cs.get(opacifyName(actClear, alpha));
      if (opaqueActBlob) {
        const remoteAct = safeJsonParse(
          fromBytesUtf8(await decrypt(fromNetwork(opaqueActBlob, alphaInv), D))
        );
        rT = remoteAct?.entities?.[entityId]?.ts ?? null;
      }

    } catch {}
    return {
      entityId,
      local:  { payload: local?.payload, ts: local?.ts },
      remote: { payload: rP, ts: rT },
    };
  }

  async function resolveConflict(session, entityId, decision) {
    const { db, connectedStorages: cs } = session;
    const D = await session._derive();
    if (decision === 'keep_local') { await projectToRemote(db, D, entityId, cs); return { resolved: 'kept_local' }; }
    if (decision === 'keep_remote') { const r = await pullFromRemote(db, D, entityId, cs); assert(r, 'no encontrada en red'); return { resolved: 'kept_remote' }; }
    throw new Error('decisión inválida: keep_local o keep_remote');
  }

  // ═══════════════════════════════════════════════════════════════
  // O. SNAPSHOT
  // ═══════════════════════════════════════════════════════════════

  async function exportSnapshot(db) {
    return (await loadAllEntitiesLocal(db)).map(e => ({
      entityId: e.entityId, stateHash: e.stateHash, ts: e.ts,
      payload: e.payload, type: e.type || null,
    }));
  }

  function mergeSnapshotEntry(local, snap) {
    if (!local) return 'insert';
    if (snap.ts > local.ts) return 'replace';
    if (snap.ts < local.ts) return 'ignore';
    return snap.stateHash === local.stateHash ? 'identical' : 'ignore';
  }

  async function importSnapshot(session, entries) {
    assert(Array.isArray(entries), 'importSnapshot: entries debe ser array');
    const { db } = session;
    const D = await session._derive();
    let inserted = 0, replaced = 0, ignored = 0;
    for (const snap of entries) {
      if (!snap.entityId || !snap.payload) continue;
      const local = await loadEntityLocal(db, snap.entityId);
      const decision = mergeSnapshotEntry(local, snap);
      if (decision === 'insert' || decision === 'replace') {
        const sh = bytesToHex(await computeStateHash(D, snap.payload));
        await saveEntityLocal(db, snap.entityId, sh, snap.ts, snap.payload, {
          type: snap.type || local?.type || null,
          genesisNodeId: local?.genesisNodeId || null,
          genesisCounter: local?.genesisCounter || null,
        });
        if (decision === 'insert') inserted++; else replaced++;
      } else ignored++;
    }
    const act = await buildActuality(db, D);
    await saveActualityLocal(db, act);
    return { inserted, replaced, ignored, total: entries.length, mapHash: act.mapHash };
  }

  async function exportSnapshotZip(session, zipAdapter) {
    assert(zipAdapter?.pack, 'exportSnapshotZip: falta zipAdapter.pack');
    const entries = await exportSnapshot(session.db);
    const payload = toBytesUtf8(canonical({ ts: Date.now(), count: entries.length, entries }));
    return zipAdapter.pack('snapshot.json', payload);
  }

  async function importSnapshotZip(session, zipBytes, zipAdapter) {
    assert(zipAdapter?.unpack, 'importSnapshotZip: falta zipAdapter.unpack');
    const unpacked = await zipAdapter.unpack(zipBytes);
    const raw = unpacked instanceof Uint8Array ? unpacked : (unpacked?.['snapshot.json'] || null);
    assert(raw, 'importSnapshotZip: snapshot.json no encontrado');
    const bundle = safeJsonParse(fromBytesUtf8(raw));
    assert(bundle?.entries, 'importSnapshotZip: bundle inválido');
    return importSnapshot(session, bundle.entries);
  }

  // ═══════════════════════════════════════════════════════════════
  // P. SERVICE KEYS — almacenamiento seguro en IDB
  //
  //    Llamado internamente por openSession cuando el servidor
  //    entrega rawServices en la respuesta del login.
  //
  //    Flujo:
  //      1. Para cada servicio: descifrar key_enc con H_u  [µs]
  //      2. Re-cifrar service_key con D                    [µs]
  //      3. Guardar en IDB: "svc:" + id → {url, key_enc, ...}
  //      4. service_key muere (sale del scope del loop)
  //
  //    INVARIANTE: H_u_bytes debe pasarse ANTES de ser destruido.
  //    D también es efímero: sale del scope de openSession.
  // ═══════════════════════════════════════════════════════════════

  async function _storeServiceKeys(db, D, rawServices, H_u_bytes) {
    for (const svc of rawServices) {
      if (!svc.id || !svc.key_enc || !svc.url) continue;
      try {
        // Descifrar service_key con H_u → [µs]
        const keyEncBytes = hexToBytes(svc.key_enc);
        const serviceKey  = await decrypt(keyEncBytes, H_u_bytes); // Tipo B

        // Re-cifrar con D (más efímero que H_u) → guardar en IDB
        const keyEncD = await encrypt(serviceKey, D);              // Tipo B

        await _kvPut(db, PFX_SERVICE + svc.id, {
          id:           svc.id,
          url:          svc.url,
          fallback_url: svc.fallback_url || null,
          key_enc:      bytesToHex(keyEncD),
          label:        svc.label || svc.id,
        });
        // serviceKey muere al salir del bloque try
      } catch (err) {
        console.warn('[kobalt] storeServiceKeys: error en servicio', svc.id, err?.message);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Q. openSession + closeSession
  //
  //    openSession(H_u_hex, rawServices, cs)
  //
  //    rawServices: array de {id, url, fallback_url, key_enc}
  //      llegado del servidor en el login.
  //      Si no hay servicios (modo offline o primer arranque),
  //      puede ser null o [].
  //
  //    ORDEN DE OPERACIONES (efemeridad garantizada):
  //      1. H_u_bytes ← hexToBytes(H_u_hex)
  //      2. anchor    ← HMAC(H_u_bytes, "kobalt:anchor", 32)
  //      3. D         ← HMAC(anchor, "kobalt:key", 32)          [Tipo B]
  //      4. db_id     ← HMAC(D, "db", 8)
  //      5. Guardar service_keys: descifrar con H_u, re-cifrar con D
  //      6. H_u_bytes y D salen del scope → mueren
  //      7. session = {db, nodeId, db_id, cs, _anchor, _derive}
  //
  //    INVARIANTE: H_u nunca entra al régimen L como campo de session.
  // ═══════════════════════════════════════════════════════════════

  async function openSession(H_u_hex, rawServices, cs) {
    // H_u_bytes disponible solo en este scope — muere al finalizar openSession
    const H_u_bytes = hexToBytes(H_u_hex);
    const anchor    = await computeAnchor(H_u_bytes);
    const derive    = makeDerive(anchor);

    // D: Tipo B — vive solo dentro de openSession
    const D     = await derive();
    const db_id = bytesToHex(await H(D, 'db', 8));
    const db    = await openUserStore(db_id);

    try {
      const nodeId   = await getOrCreateNodeId(db);
      const localAct = await loadActualityLocal(db);
      if (!Object.keys(localAct.entities || {}).length)
        await saveActualityLocal(db, { ts: Date.now(), mapHash: '', entities: {} });

      // Almacenar service_keys ANTES de que H_u_bytes y D salgan del scope
      // INVARIANTE: este es el único momento donde H_u está disponible en L
      if (Array.isArray(rawServices) && rawServices.length) {
        await _storeServiceKeys(db, D, rawServices, H_u_bytes);
      }

      // H_u_bytes y D salen del scope aquí → mueren (Tipo B para D)
      return {
        db,
        nodeId,
        db_id,
        connectedStorages: cs || null,
        _anchor: anchor,
        _derive: derive,
      };

    } catch (err) {
      try { db?.close?.(); } catch {}
      throw err;
    }
  }

  function bindSessionStorages(session, cs) {
    session.connectedStorages = cs || null;
    return session;
  }

  async function closeSession(session) {
    if (!session) return;
    try { session.db?.close?.(); } catch {}
    session._anchor           = null;
    session._derive           = null;
    session.db                = null;
    session.connectedStorages = null;
  }

  // ═══════════════════════════════════════════════════════════════
  // R. MANIFIESTO
  // ═══════════════════════════════════════════════════════════════

  function kernelManifest() {
    return {
      name:    KERNEL_NAME,
      version: KERNEL_VERSION,
      doctrine: [
        'La verdad nace en local',
        'La red es persistencia opaca y pasiva',
        'El servidor computa H_u y desaparece',
        'Anchor es el único secreto de sesión',
        'D es la clave universal: cifrado, opacidad, identidades, sellos, naming',
        'La frontera local↔red es un isomorfismo: fromNetwork(toNetwork(x)) = x',
        'Snapshot = bundle de versiones + merge por timestamp',
        'Los service_keys se re-cifran con D en openSession y nunca salen en claro',
      ],
      realms: {
        S: { name: 'Servidor',  owns: ['H_u', 'autenticación', 'service_keys cifrados'], excludes: ['payload', 'anchor'] },
        B: { name: 'Puente',    owns: ['recepción de H_u', 'computeAnchor', '_storeServiceKeys', 'destrucción de H_u'] },
        L: { name: 'Local',     owns: ['anchor', 'D', 'entidades', 'actualidad', 'sync', 'frontera', 'svc:* en IDB'] },
      },
      classes: {
        O: { name: 'Ontología fuerte',     members: ['anchor', 'derive', 'nodeId', 'entityId', 'stateHash'] },
        M: { name: 'Mecánica estructural', members: ['actuality', 'mapHash', 'pending', 'frontera', 'sync'] },
        T: { name: 'Transporte masivo',    members: ['snapshot', 'zipAdapter'],
             note: 'snapshot ⊂ sync pero no es proyección estructural — es bundle de transferencia' },
        I: { name: 'Infraestructura',      members: ['IndexedDB', 'connector', 'serviceConfig'] },
      },
      store: '1 IDB store "kv": e: (entidad), p: (pending), m: (meta), svc: (servicios)',
      invariants: [
        'entityId ⊥ payload',
        'stateHash = HMAC(D, payload, 16)',
        'fromNetwork(toNetwork(x)) = x',
        'sync ≠ repaint',
        'snapshot ⊂ sync',
        'D efímero: Tipo B, µs de vida',
        'anchor es el ÚNICO secreto en session',
        'service_key nunca persiste más de µs',
        'token = HMAC(service_key, "kobalt:storage"‖id‖window, 16) — expira ≤ 30s',
      ],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ═══════════════════════════════════════════════════════════════

  const api = {};
  Object.assign(api, {
    // Primitivas y utilidades
    H, canonical,
    assert, safeJsonParse,
    bytesToHex, hexToBytes, toBytesUtf8, fromBytesUtf8,
    concatBytes, uint32ToBytes, normalizePayload, payloadToString,

    // Cadena de derivación
    computeAnchor, makeDerive,

    // Opacidad
    buildAlphabet, invertAlphabet, applyAlphabet,

    // Identidades
    computeNodeId, computeEntityId, computeStateHash,

    // Cifrado
    encrypt, decrypt,

    // Naming y frontera
    buildClearName, buildFlatName, buildStateName, buildActualityName, opacifyName,
    toNetwork, fromNetwork, boundaryRoundTripOk,

    // Actualidad
    buildActuality, rebuildActuality, mergeActualities,
    saveActualityLocal, loadActualityLocal,

    // Persistencia IDB
    openUserStore, getOrCreateNodeSeed, getOrCreateNodeId, nextCreateCounter,
    saveEntityLocal, loadEntityLocal, loadAllEntitiesLocal,
    loadEntitiesByType, countByType,
    markPending, clearPending, listPending,

    // KV genérico — para conectores y extensiones (clase I)
    saveRaw, loadRaw,

    // Flujos L
    createEntity, saveEntityVersion,

    // Flujos F
    flushPending, syncActuality, projectToRemote, pullFromRemote,

    // Conflictos y reloj
    checkClockReliability, detectConflict, resolveConflict,

    // Snapshot
    exportSnapshot, importSnapshot, mergeSnapshotEntry,
    exportSnapshotZip, importSnapshotZip,

    // Sesión
    openSession, bindSessionStorages, syncSession, closeSession,

    // Manifiesto
    kernelManifest,

    // Constantes
    KERNEL_NAME, KERNEL_VERSION,
    NAME_FLAT, NAME_STATE, NAME_ACTUALITY, NAME_SNAPSHOT,
    PFX_SERVICE,
  });

  global.__KOBALT__ = {};
  global.__KOBALT__.api = api;

})(globalThis);
