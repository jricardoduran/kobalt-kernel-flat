(function() {
  'use strict';

  const K = () => globalThis.__KOBALT__?.api;
  const C = () => globalThis.KobaltConnectors;
  const V = () => globalThis.KobaltVisual;

  const AUTH_URL    = './auth.php';
  const STORAGE_URL = './storages/api.php';

  let session    = null;
  let syncHandle = null;
  let uiCache    = { grid: '', stats: '', badge: '' };

  // F1–F5 — estado visual
  let viewMode     = localStorage.getItem('kobalt:view') || 'list';
  let activeFilter = 'all';
  let activeSort   = 'ts-desc';
  let searchQuery  = '';

  // ─── UI diferencial de cuentas locales ───────────────
  let _accountsSig = '';

  function accountsSig() {
    return V().getLocalAccounts()
      .map(a => a.db_id + (a.name || '') + (a.lastSeenAt || 0))
      .join('|');
  }

  function syncAccountsUI() {
    const sig = accountsSig();
    if (sig === _accountsSig) return;
    _accountsSig = sig;

    const accounts = V().getLocalAccounts();
    const btn   = $('btn-accounts');
    const badge = $('acc-badge');
    if (!btn) return;

    if (accounts.length && !session) {
      btn.style.display = '';
      if (badge) { badge.textContent = accounts.length; badge.style.display = ''; }
    } else {
      btn.style.display = 'none';
    }
  }

  const $ = id => document.getElementById(id);

  function parsePayload(raw) {
    try { return JSON.parse(raw); }
    catch { return { _error: true, nombre: '[payload corrupto]', stock: 0, sku: '' }; }
  }

  // F5 — normalización NFD para búsqueda insensible a tildes
  function nfd(s) {
    return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // F2 — chips de resumen (opera sobre el conjunto completo, sin filtrar)
  function updateChips(products) {
    const total   = products.length;
    const nostock = products.filter(p => Number(parsePayload(p.payload).stock ?? 0) === 0).length;
    const low     = products.filter(p => { const s = Number(parsePayload(p.payload).stock ?? 0); return s > 0 && s <= 3; }).length;
    const nosku   = products.filter(p => !(parsePayload(p.payload).sku || '').trim()).length;
    V().setIfChanged($('chip-total'), total + ' producto' + (total !== 1 ? 's' : ''));
    const ns = $('chip-nostock'), lo = $('chip-low'), nk = $('chip-nosku');
    if (ns) { ns.style.display = nostock ? '' : 'none'; V().setIfChanged(ns, nostock + ' agotado' + (nostock !== 1 ? 's' : '')); }
    if (lo) { lo.style.display = low     ? '' : 'none'; V().setIfChanged(lo, low     + ' bajo stock'); }
    if (nk) { nk.style.display = nosku   ? '' : 'none'; V().setIfChanged(nk, nosku   + ' sin SKU'); }
  }

  // F3 — cambio de filtro activo
  function setFilter(f) {
    activeFilter = f;
    document.querySelectorAll('.fbtn').forEach(b => b.classList.toggle('on', b.dataset.f === f));
    refreshEntities();
  }

  // F1 — aplicar clase de vista (solo CSS, sin reconstruir DOM)
  function applyViewMode() {
    const g = $('grid');
    if (g) {
      g.classList.toggle('view-list', viewMode === 'list');
      g.classList.toggle('view-grid', viewMode === 'grid');
    }
    const vl = $('btn-view-list'), vg = $('btn-view-grid');
    if (vl) vl.classList.toggle('active', viewMode === 'list');
    if (vg) vg.classList.toggle('active', viewMode === 'grid');
  }

  /* ═══════════════════════════════════════════════════
     HELPERS UI — sync ≠ repaint
     ═══════════════════════════════════════════════════ */

  function setBadge(cls, text) {
    const key = cls + '::' + text;
    if (uiCache.badge === key) return;
    uiCache.badge = key;
    const b = $('sync-badge');
    b.className = 'badge ' + cls;
    V().setIfChanged(b, text);
  }

  function setStatus(text, type, action) {
    const el = $('statusOut');
    if (!el) return;
    if (!text) { el.textContent = ''; el.className = ''; return; }
    el.className = 'visible st-' + (type || 'warn');
    if (action) {
      el.innerHTML = V().esc(text) + ' <button class="link-btn" style="margin-left:6px">' + V().esc(action.label) + '</button>';
      el.querySelector('button').addEventListener('click', action.fn);
    } else {
      el.textContent = text;
    }
  }

  /* ═══════════════════════════════════════════════════
     TABS — Ingresar / Registrar
     ═══════════════════════════════════════════════════ */

  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    $('panelLogin').classList.toggle('active', name === 'login');
    $('panelRegister').classList.toggle('active', name === 'register');
    setStatus('');
  }

  /* ═══════════════════════════════════════════════════
     TEMA
     ═══════════════════════════════════════════════════ */

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('kobalt:theme', t);
    const d = $('thIconD'), l = $('thIconL'), lb = $('thLabel');
    if (d) d.style.display = t === 'dark' ? '' : 'none';
    if (l) l.style.display = t === 'light' ? '' : 'none';
    if (lb) lb.textContent = t === 'dark' ? 'Oscuro' : 'Claro';
  }

  /* ═══════════════════════════════════════════════════
     AUTH — registro + login
     ═══════════════════════════════════════════════════ */

  async function doRegister(storagesConfig) {
    const name = $('regName').value.trim();
    const dial        = window._regPicker?.getDial() || '57';
    const countryCode = window._regPicker?.getCode() || 'CO';
    const phone = $('regPhone').value.trim().replace(/\D+/g, '');
    const pass = $('regPass').value;

    if (!name)  { setStatus('Escribe el nombre completo.', 'err'); return; }
    if (!phone) { setStatus('Escribe el teléfono.', 'err'); return; }
    if (!pass)  { setStatus('Escribe la contraseña.', 'err'); return; }

    setStatus('Registrando identidad…', 'warn');

    try {
      const resp = await fetch(`${AUTH_URL}?action=register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, password: pass, countryDial: dial, countryCode }),
      });
      const data = await resp.json();

      if (!data.ok) {
        const e = (data.error || '').toLowerCase();
        if (e.includes('ya tiene cuenta')) {
          setStatus('Este teléfono ya tiene una cuenta. ¿Quieres ingresar?', 'err',
            { label: 'Ingresar', fn: () => switchTab('login') });
        } else if (e.includes('requerido')) {
          setStatus('Completa nombre, teléfono y contraseña para registrarte.', 'err');
        } else {
          setStatus(data.error, 'err');
        }
        return;
      }

      setStatus('Registrado. Abriendo sesión…', 'ok');
      await openKernelSession({
        ...data,
        name:        name,
        countryCode: countryCode,
        countryDial: dial,
        phoneDigits: phone,
      }, storagesConfig);

    } catch {
      setStatus('Sin conexión. Revisa tu internet.', 'err');
    }
  }

  async function doLogin(storagesConfig) {
    const dial        = window._loginPicker?.getDial() || '57';
    const countryCode = window._loginPicker?.getCode() || 'CO';
    const phone = $('loginPhone').value.trim().replace(/\D+/g, '');
    const pass  = $('loginPass').value;

    if (!phone) { setStatus('Escribe el teléfono.', 'err'); return; }
    if (!pass)  { setStatus('Escribe la contraseña.', 'err'); return; }

    setStatus('Verificando identidad…', 'warn');

    try {
      const resp = await fetch(`${AUTH_URL}?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: pass, countryDial: dial, countryCode }),
      });
      const data = await resp.json();

      if (!data.ok) {
        const e = (data.error || '').toLowerCase();
        if (e.includes('phone') || e.includes('teléfono') || e.includes('telefono')) {
          setStatus('Teléfono no registrado. ¿Quieres crear una cuenta?', 'err',
            { label: 'Regístrate', fn: () => switchTab('register') });
        } else if (e.includes('contraseña') || e.includes('password') || e.includes('clave')) {
          setStatus('Contraseña incorrecta. Inténtalo de nuevo.', 'err');
        } else if (e.includes('requerido')) {
          setStatus('Completa todos los campos para continuar.', 'err');
        } else {
          setStatus(data.error, 'err');
        }
        return;
      }

      setStatus('Identidad verificada. Abriendo sesión…', 'ok');
      await openKernelSession({
        ...data,
        countryCode: countryCode,
        countryDial: dial,
        phoneDigits: phone,
      }, storagesConfig);

    } catch {
      setStatus('Sin conexión. Revisa tu internet.', 'err');
    }
  }

  /* ═══════════════════════════════════════════════════
     SESIÓN — puente S → B → L
     ═══════════════════════════════════════════════════ */

  async function openKernelSession(authData, storagesConfig) {
    session = await K().openSession(authData.H_u, authData.services || [], null);

    const cs = await C().buildServices(session, storagesConfig);
    K().bindSessionStorages(session, cs);

    V().saveLocalAccount({
      db_id:        session.db_id,
      name:         authData.name || '',
      countryCode:  authData.countryCode  || 'CO',
      countryDial:  authData.countryDial  || '57',
      phoneDigits:  authData.phoneDigits  || '',
    });

    $('screen-login').style.display = 'none';
    $('screen-app').style.display = 'block';
    $('sync-badge').style.display = '';
    $('btn-sync').style.display = '';
    $('btn-logout').style.display = '';
    $('btn-accounts').style.display = 'none';

    V().setIfChanged($('ki-session'), session.db_id.slice(0, 12) + '…');
    await refreshEntities();
    await renderKernelInfo();
    await doSync();

    const interval = storagesConfig?.sync?.interval_ms || 20000;
    syncHandle = setInterval(() => doSync(true), interval);
  }

  /* ═══════════════════════════════════════════════════
     SYNC — con repaint diferencial
     ═══════════════════════════════════════════════════ */

  async function doSync(silent) {
    if (!session) return;
    if (!session.connectedStorages?.hasConnectors?.()) {
      setBadge('badge-warn', 'LOCAL');
      return;
    }
    if (!silent) setBadge('badge-warn', '⟳');

    try {
      const r = await K().syncSession(session);
      const cls = (r.status === 'in_sync' || r.status === 'synced' || r.status === 'first_push')
        ? 'badge-ok' : r.status === 'local_only' ? 'badge-warn' : 'badge-err';
      setBadge(cls, r.status === 'in_sync' ? 'IN SYNC' : r.status);
      if (r.pulls > 0) await refreshEntities();
    } catch {
      setBadge('badge-err', 'ERROR');
    }
  }

  /* ═══════════════════════════════════════════════════
     ENTIDADES — grid con repaint diferencial
     ═══════════════════════════════════════════════════ */

  async function refreshEntities() {
    if (!session) return;
    const allProducts = await K().loadEntitiesByType(session.db, 'product');
    const pendingMap  = await K().listPending(session.db);

    // F2 — chips siempre del conjunto completo
    updateChips(allProducts);

    // F3 — filtro activo
    const FILTERS = {
      all:     ()  => true,
      nosku:   p   => !(parsePayload(p.payload).sku || '').trim(),
      nostock: p   => Number(parsePayload(p.payload).stock ?? 0) === 0,
      low:     p   => { const s = Number(parsePayload(p.payload).stock ?? 0); return s > 0 && s <= 3; },
    };
    let products = allProducts.filter(FILTERS[activeFilter] ?? FILTERS.all);

    // F5 — búsqueda NFD sobre nombre y SKU
    const q = nfd(searchQuery);
    if (q) {
      products = products.filter(p => {
        const d = parsePayload(p.payload);
        return nfd(d.nombre || d.name || '').includes(q) || nfd(d.sku || '').includes(q);
      });
    }

    // F4 — ordenación
    const SORTERS = {
      'ts-desc':  (a, b) => (b.ts || 0) - (a.ts || 0),
      'ts-asc':   (a, b) => (a.ts || 0) - (b.ts || 0),
      'name-az':  (a, b) => { const da = parsePayload(a.payload), db = parsePayload(b.payload); return (da.nombre||da.name||'').localeCompare(db.nombre||db.name||'', 'es'); },
      'name-za':  (a, b) => { const da = parsePayload(a.payload), db = parsePayload(b.payload); return (db.nombre||db.name||'').localeCompare(da.nombre||da.name||'', 'es'); },
      'stk-desc': (a, b) => Number(parsePayload(b.payload).stock ?? 0) - Number(parsePayload(a.payload).stock ?? 0),
    };
    products = [...products].sort(SORTERS[activeSort] ?? SORTERS['ts-desc']);

    // gridSig incluye el orden y el conjunto filtrado
    const gridSig = JSON.stringify(products.map(p => ({
      id: p.entityId,
      sh: p.stateHash,
      pending: !!pendingMap[p.entityId],
    })));

    if (uiCache.grid !== gridSig) {
      uiCache.grid = gridSig;
      renderGrid(products, pendingMap);
    }

    await renderKernelInfo();
  }

  function renderGrid(products, pendingMap) {
    const grid = $('grid');
    const empty = $('empty');

    if (!products.length) {
      grid.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    grid.style.display = 'grid';
    empty.style.display = 'none';

    const { esc } = V();
    grid.innerHTML = products.map(p => {
      const d = parsePayload(p.payload);
      const stk = Number(d.stock ?? 0);
      const cls = stk === 0 ? 's0' : (stk <= 3 ? 'sl' : 'sk');
      const lbl = stk === 0 ? 'AGOTADO' : (stk <= 3 ? 'BAJO' : 'OK');
      const ts  = p.ts ? new Date(p.ts).toLocaleString('es') : '—';
      const dotCls = pendingMap && pendingMap[p.entityId] ? 'p' : 's';
      return `<div class="card" data-eid="${esc(p.entityId)}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div class="cname">${esc(d.nombre || d.name || '—')}</div>
          <span class="sbadge ${cls}">${lbl} ${stk}</span>
        </div>
        <div class="fields">
          <span class="fl">SKU</span>
          <input class="fi sku" data-role="sku" data-eid="${esc(p.entityId)}" value="${esc(d.sku || '')}" placeholder="—">
          <span class="fl">STOCK</span>
          <div class="sc">
            <button class="sb sbm" data-role="delta" data-eid="${esc(p.entityId)}" data-delta="-1">−</button>
            <input class="fi stk" type="number" data-role="stock" data-eid="${esc(p.entityId)}" value="${stk}">
            <button class="sb sbp" data-role="delta" data-eid="${esc(p.entityId)}" data-delta="1">+</button>
          </div>
        </div>
        <div class="cmeta">
          <span style="display:flex;align-items:center;gap:4px">
            <span class="dot ${dotCls}"></span> ${esc(p.entityId.slice(0,8))}…
          </span>
          <span>${esc(ts)}</span>
        </div>
      </div>`;
    }).join('');

    bindGridEvents();
  }

  function bindGridEvents() {
    $('grid').querySelectorAll('[data-role="delta"]').forEach(btn =>
      btn.addEventListener('click', () => adjustStock(btn.dataset.eid, Number(btn.dataset.delta)))
    );
    $('grid').querySelectorAll('[data-role="sku"]').forEach(inp =>
      inp.addEventListener('change', () => updateField(inp.dataset.eid, 'sku', inp.value))
    );
    $('grid').querySelectorAll('[data-role="stock"]').forEach(inp =>
      inp.addEventListener('change', () => updateField(inp.dataset.eid, 'stock', Number(inp.value || 0)))
    );
  }

  async function addProduct() {
    if (!session) return;
    const nombre = $('add-name').value.trim();
    if (!nombre) { V().toast('Nombre requerido'); return; }
    await K().createEntity(session, {
      _type: 'product', nombre,
      sku: $('add-sku').value.trim(),
      stock: Number($('add-stk').value || 0),
    }, 'product');
    $('add-name').value = ''; $('add-sku').value = ''; $('add-stk').value = '0';
    $('add-bar').classList.remove('open');
    await refreshEntities();
    V().toast('Producto creado');
    doSync().catch(() => setBadge('badge-warn', 'PENDING'));
  }

  async function updateField(eid, field, value) {
    const e = await K().loadEntityLocal(session.db, eid);
    if (!e) return;
    const p = parsePayload(e.payload);
    p[field] = field === 'stock' ? Math.max(0, Number(value || 0)) : value;
    await K().saveEntityVersion(session, eid, p);
    await refreshEntities();
    doSync().catch(() => setBadge('badge-warn', 'PENDING'));
  }

  async function adjustStock(eid, delta) {
    const e = await K().loadEntityLocal(session.db, eid);
    if (!e) return;
    const p = parsePayload(e.payload);
    p.stock = Math.max(0, Number(p.stock || 0) + delta);
    await K().saveEntityVersion(session, eid, p);
    await refreshEntities();
    doSync().catch(() => setBadge('badge-warn', 'PENDING'));
  }

  async function exportJSON() {
    if (!session) return;
    const ents = await K().loadAllEntitiesLocal(session.db);
    const data = ents.map(e => { try { return { ...JSON.parse(e.payload), _eid: e.entityId }; } catch { return null; } }).filter(Boolean);
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })),
      download: `kobalt_export_${Date.now()}.json`
    });
    a.click();
  }

  /* ═══════════════════════════════════════════════════
     KERNEL INFO
     ═══════════════════════════════════════════════════ */

  async function renderKernelInfo() {
    if (!session) return;
    V().setIfChanged($('ki-node'), session.nodeId);
    V().setIfChanged($('ki-db'), session.db_id);
    V().setIfChanged($('ki-version'), K().KERNEL_VERSION);
    const counts = await K().countByType(session.db);
    V().setIfChanged($('ki-count'), String(Object.values(counts).reduce((s, n) => s + n, 0)));
    V().setIfChanged($('ki-status'), session.status || 'activa');
  }

  /* ═══════════════════════════════════════════════════
     LOGOUT
     ═══════════════════════════════════════════════════ */

  async function doLogout() {
    if (syncHandle) { clearInterval(syncHandle); syncHandle = null; }
    if (session) { await K().closeSession(session); session = null; }
    uiCache = { grid: '', stats: '', badge: '' };
    $('screen-app').style.display = 'none';
    $('screen-login').style.display = '';
    $('sync-badge').style.display = 'none';
    $('btn-sync').style.display = 'none';
    $('btn-logout').style.display = 'none';
    if (V().getLocalAccounts().length) $('btn-accounts').style.display = '';
    $('grid').innerHTML = '';
    setStatus('');
  }

  /* ═══════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', async () => {
    const storagesConfig = await C().load(STORAGE_URL);

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.addEventListener('click', () => switchTab(b.dataset.tab))
    );
    document.querySelectorAll('[data-switch-tab]').forEach(b =>
      b.addEventListener('click', () => switchTab(b.dataset.switchTab))
    );

    // Theme
    applyTheme(localStorage.getItem('kobalt:theme') || 'dark');
    $('btnTheme').addEventListener('click', () => {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    // Auth buttons
    $('btnLogin').addEventListener('click', () => doLogin(storagesConfig));
    $('btnRegister').addEventListener('click', () => doRegister(storagesConfig));

    // Pickers de país
    window._loginPicker = V().createCountryPicker('loginCountryPicker');
    window._regPicker   = V().createCountryPicker('regCountryPicker');

    // Drawer de cuentas
    const drawer = V().createAccountsDrawer({
      onSelect({ countryDial, phoneDigits, countryCode }) {
        window._loginPicker?.setCode(countryCode);
        $('loginPhone').value = phoneDigits;
        switchTab('login');
      }
    });

    // Botón de cuentas — dinámico, diferencial
    $('btn-accounts').addEventListener('click', () => drawer.open());
    syncAccountsUI();
    window.addEventListener('storage', e => {
      if (e.key === 'device:user_registry:v2') syncAccountsUI();
    });
    setInterval(syncAccountsUI, 2000);

    // Detect-while-typing — cuenta conocida
    $('loginPhone').addEventListener('input', () => {
      const countryCode = window._loginPicker?.getCode() || 'CO';
      const digits = $('loginPhone').value.replace(/\D+/g, '');
      const found = V().findLocalByPhone(countryCode, digits);
      if (found) {
        let hint = document.getElementById('phone-hint');
        if (!hint) {
          hint = document.createElement('div');
          hint.id = 'phone-hint';
          hint.style.cssText = 'font-size:.72rem;color:var(--accent);margin-top:4px;cursor:pointer;font-weight:600;';
          $('loginPhone').parentNode.appendChild(hint);
        }
        hint.textContent = '\u{1F464} ' + (found.name || 'Cuenta conocida') + ' — clic para pre-rellenar';
        hint.onclick = () => {
          window._loginPicker?.setCode(found.countryCode);
          $('loginPhone').value = found.phoneDigits;
          hint.remove();
        };
      } else {
        document.getElementById('phone-hint')?.remove();
      }
    });

    // Enter key
    ['loginPhone','loginPass'].forEach(id =>
      $(id).addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(storagesConfig); })
    );
    ['regName','regPhone','regPass'].forEach(id =>
      $(id).addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(storagesConfig); })
    );

    // App controls
    $('btn-sync').addEventListener('click', () => doSync(false));
    $('btn-logout').addEventListener('click', doLogout);
    $('btn-toggle-add').addEventListener('click', () => $('add-bar').classList.toggle('open'));
    $('btn-close-add').addEventListener('click', () => $('add-bar').classList.remove('open'));
    $('btn-add-product').addEventListener('click', addProduct);
    $('btn-export').addEventListener('click', exportJSON);

    // F1 — toggle vista lista/grilla
    $('btn-view-list').addEventListener('click', () => {
      viewMode = 'list';
      localStorage.setItem('kobalt:view', 'list');
      applyViewMode();
    });
    $('btn-view-grid').addEventListener('click', () => {
      viewMode = 'grid';
      localStorage.setItem('kobalt:view', 'grid');
      applyViewMode();
    });
    applyViewMode();

    // F3 — filtros rápidos
    document.querySelectorAll('.fbtn').forEach(b =>
      b.addEventListener('click', () => setFilter(b.dataset.f))
    );
    // marcar el activo inicial
    document.querySelectorAll('.fbtn').forEach(b =>
      b.classList.toggle('on', b.dataset.f === activeFilter)
    );

    // F4 — ordenación
    $('sort-select').addEventListener('change', () => {
      activeSort = $('sort-select').value;
      refreshEntities();
    });

    // F5 — búsqueda mejorada
    $('search-input').addEventListener('input', () => {
      searchQuery = $('search-input').value;
      refreshEntities();
    });
  });

})();
