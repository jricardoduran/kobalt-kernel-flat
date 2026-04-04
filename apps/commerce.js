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

  // ═══ HELPERS DE VENTAS ═══

  function makeSalePayload(entity, qty, price, notes) {
    const d = parsePayload(entity.payload);
    const now = new Date();
    return {
      _type:       'sale',
      product_eid: entity.entityId,
      nombre:      d.nombre || d.name || '—',
      sku:         d.sku || '',
      qty:         Math.max(1, Number(qty) || 1),
      price:       Math.max(0, Number(price) || 0),
      total:       Math.max(1, Number(qty) || 1) * Math.max(0, Number(price) || 0),
      notes:       String(notes || '').trim(),
      month_key:   V().monthKey(now),
      created_at:  now.toISOString(),
    };
  }

  async function loadSales() {
    if (!session) return [];
    return K().loadEntitiesByType(session.db, 'sale');
  }

  async function loadSalesByMonth(mk) {
    const all = await loadSales();
    return all.filter(s => {
      try { return parsePayload(s.payload).month_key === mk; }
      catch { return false; }
    });
  }

  // ═══ POS — estado ═══
  let posFilter      = 'all';
  let currentSaleEid = null;

  function setPosFilter(f) {
    posFilter = f;
    document.querySelectorAll('#tab-pos .fbtn')
      .forEach(b => b.classList.toggle('on', b.id === 'pos-f-' + f));
    refreshPOS();
  }

  async function refreshPOS() {
    if (!session) return;
    let prods = await K().loadEntitiesByType(session.db, 'product');

    if (posFilter === 'stock')
      prods = prods.filter(p => Number(parsePayload(p.payload).stock) > 0);

    const raw = nfd($('pos-search')?.value || '');
    if (raw) prods = prods.filter(p => {
      const d = parsePayload(p.payload);
      return nfd(d.nombre || '').includes(raw) ||
             (d.sku || '').toLowerCase().includes(raw);
    });

    const grid = $('pos-grid');
    if (!grid) return;

    if (!prods.length) {
      grid.innerHTML = `<div style="color:var(--text-muted);font-size:.82rem;padding:32px 0">Sin productos</div>`;
      return;
    }

    const { esc } = V();
    grid.innerHTML = prods.map(p => {
      const d  = parsePayload(p.payload);
      const bc = V().stockBadgeClass(d.stock);
      const bl = V().stockBadgeLabel(d.stock);
      return `
        <div class="card pcard" data-eid="${esc(p.entityId)}" style="cursor:pointer">
          <div style="font-size:.78rem;font-weight:700;line-height:1.4;
                      display:-webkit-box;-webkit-line-clamp:2;
                      -webkit-box-orient:vertical;overflow:hidden">
            ${esc(d.nombre || d.name || '—')}
          </div>
          ${d.sku ? `<div style="font-size:.65rem;color:var(--text-muted)">${esc(d.sku)}</div>` : ''}
          <span class="sbadge ${bc}">${bl}</span>
          <div style="font-size:.7rem;font-weight:700;color:var(--accent);margin-top:auto">
            VENDER →
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.pcard').forEach(c =>
      c.addEventListener('click', () => openSaleModal(c.dataset.eid)));
  }

  async function openSaleModal(eid) {
    const entity = await K().loadEntityLocal(session.db, eid);
    if (!entity) return;
    const d = parsePayload(entity.payload);
    currentSaleEid = eid;
    $('sale-pname').textContent = d.nombre || d.name || '—';
    $('sale-pmeta').textContent =
      [d.sku ? 'SKU: ' + d.sku : null,
       d.stock != null ? 'Stock: ' + d.stock : null]
      .filter(Boolean).join(' · ');
    $('sale-qty').value   = 1;
    $('sale-price').value = '';
    $('sale-notes').value = '';
    $('sale-modal').style.display = 'flex';
    $('sale-qty').focus();
  }

  async function recordSale() {
    if (!currentSaleEid || !session) return;
    const entity = await K().loadEntityLocal(session.db, currentSaleEid);
    if (!entity) return;
    const qty   = Math.max(1, Number($('sale-qty').value)   || 1);
    const price = Math.max(0, Number($('sale-price').value) || 0);
    const notes = $('sale-notes').value.trim();
    const sp    = makeSalePayload(entity, qty, price, notes);

    await K().createEntity(session, sp, 'sale');

    const d = parsePayload(entity.payload);
    if (d.stock !== null && d.stock !== undefined)
      await updateField(currentSaleEid, 'stock', Math.max(0, Number(d.stock) - qty));

    $('sale-modal').style.display = 'none';
    currentSaleEid = null;
    V().toast('Venta: ' + qty + '× ' + (d.nombre || d.name || '—').slice(0, 30));
    doSync().catch(() => setBadge('badge-warn', 'PENDING'));
    await refreshPOS();
  }

  function saleSummary(sales) {
    const count   = sales.length;
    const units   = sales.reduce((a, s) => {
      try { return a + (parsePayload(s.payload).qty || 0); } catch { return a; }
    }, 0);
    const revenue = sales.reduce((a, s) => {
      try { return a + (parsePayload(s.payload).total || 0); } catch { return a; }
    }, 0);
    return { count, units, revenue, avg: count > 0 ? revenue / count : 0 };
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
          <div class="cname-wrap" data-eid="${esc(p.entityId)}">
            <div class="cname-view">
              <span class="cname-text">${esc(d.nombre || d.name || '—')}</span>
              <button class="cname-edit-btn" title="Editar nombre"
                      data-role="edit-nombre" data-eid="${esc(p.entityId)}">✎</button>
            </div>
            <div class="cname-edit" style="display:none">
              <input class="fi cname-input" type="text"
                     data-role="nombre-input" data-eid="${esc(p.entityId)}"
                     value="${esc(d.nombre || d.name || '')}">
              <button class="cname-save-btn" data-role="nombre-save"
                      data-eid="${esc(p.entityId)}" title="Guardar">✓</button>
              <button class="cname-cancel-btn" data-role="nombre-cancel"
                      data-eid="${esc(p.entityId)}" title="Cancelar">✕</button>
            </div>
          </div>
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

    // Edición de nombre — dos estados: vista ↔ edición
    $('grid').querySelectorAll('[data-role="edit-nombre"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.cname-wrap');
        wrap.querySelector('.cname-view').style.display = 'none';
        wrap.querySelector('.cname-edit').style.display = 'flex';
        const inp = wrap.querySelector('.cname-input');
        inp.focus();
        inp.select();
      });
    });

    $('grid').querySelectorAll('[data-role="nombre-save"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const wrap    = btn.closest('.cname-wrap');
        const inp     = wrap.querySelector('.cname-input');
        const eid     = btn.dataset.eid;
        const newName = inp.value.trim();
        if (!newName) { V().toast('El nombre no puede estar vacío'); return; }
        // Actualizar texto visible de inmediato — sin reconstruir el grid
        wrap.querySelector('.cname-text').textContent = newName;
        wrap.querySelector('.cname-view').style.display = '';
        wrap.querySelector('.cname-edit').style.display = 'none';
        // Persistir en kernel
        await updateField(eid, 'nombre', newName);
      });
    });

    $('grid').querySelectorAll('[data-role="nombre-cancel"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.cname-wrap');
        // Restaurar input al valor visible actual
        wrap.querySelector('.cname-input').value =
          wrap.querySelector('.cname-text').textContent;
        wrap.querySelector('.cname-view').style.display = '';
        wrap.querySelector('.cname-edit').style.display = 'none';
      });
    });

    // Enter guarda, Escape cancela desde el input
    $('grid').querySelectorAll('[data-role="nombre-input"]').forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          inp.closest('.cname-wrap').querySelector('[data-role="nombre-save"]').click();
        }
        if (e.key === 'Escape') {
          inp.closest('.cname-wrap').querySelector('[data-role="nombre-cancel"]').click();
        }
      });
    });
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
    if (field === 'nombre') {
      // Nombre ya actualizado en DOM — solo sync en background
      doSync().catch(() => setBadge('badge-warn', 'PENDING'));
    } else {
      await refreshEntities();
      doSync().catch(() => setBadge('badge-warn', 'PENDING'));
    }
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

    // POS — listeners
    $('pos-search')?.addEventListener('input', () => refreshPOS());
    $('pos-f-all')?.addEventListener('click', () => setPosFilter('all'));
    $('pos-f-stock')?.addEventListener('click', () => setPosFilter('stock'));
    $('sale-modal-close')?.addEventListener('click', () => {
      $('sale-modal').style.display = 'none';
      currentSaleEid = null;
    });
    $('sale-qty-m')?.addEventListener('click', () => {
      $('sale-qty').value = Math.max(1, Number($('sale-qty').value) - 1);
    });
    $('sale-qty-p')?.addEventListener('click', () => {
      $('sale-qty').value = Number($('sale-qty').value) + 1;
    });
    $('sale-confirm')?.addEventListener('click', recordSale);
    $('sale-qty')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') recordSale();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && currentSaleEid) {
        $('sale-modal').style.display = 'none';
        currentSaleEid = null;
      }
    });

    // Tabs de navegación de la app
    document.querySelectorAll('.app-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.app-tab').forEach(b => b.classList.remove('on'));
        document.querySelectorAll('.tab-page').forEach(p => {
          p.classList.remove('on');
          p.style.display = 'none';
        });
        btn.classList.add('on');
        const tab = $('tab-' + btn.dataset.tab);
        if (tab) { tab.style.display = 'block'; tab.classList.add('on'); }
        if (btn.dataset.tab === 'pos')       refreshPOS();
        if (btn.dataset.tab === 'historial') refreshHistorial();
      });
    });
  });

})();
