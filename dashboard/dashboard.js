/* ═══ DASHBOARD KOBALT ═══
 * Clase: App — orquestador de módulos
 * Contrato:
 *   - Recibe la sesión del kernel después del login
 *   - Monta/desmonta apps en su contenedor
 *   - Cada app es un módulo independiente
 *   - La sesión es el único punto de contacto
 */

(function(global) {
  'use strict';

  /* ── Árbol de navegación — 3 niveles: sección → app → vista ──────
   * type: 'section' | 'app' | 'view'
   * Las secciones abren/cierran como acordeones.
   * Las apps se montan cuando se navega a ellas.
   * Las vistas se delegan al método navigateTo() de la app activa.
   */
  /* ── Árbol de navegación — cargado dinámicamente desde data/apps.json ──
   * Convenio de derivación por id:
   *   script:  ./apps/{id}/{id}.js   (salvo "script": false en el JSON)
   *   css:     ./apps/{id}/{id}.css  (salvo "css": false en el JSON)
   *   mount:   globalThis.KobaltApp_{Capitalize(id)}?.mount
   *   unmount: globalThis.KobaltApp_{Capitalize(id)}?.unmount
   * Para añadir una app: solo tocar data/apps.json.
   * Para habilitar/deshabilitar: "enabled": false en apps.json.
   */
  let _NAV_TREE = [];

  function _capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function _buildNavTree(config) {
    function deriveScript(id, override) {
      if (override === false) return null;
      if (typeof override === 'string') return override;
      return `./apps/${id}/${id}.js`;
    }
    function deriveCSS(id, override) {
      if (override === false) return null;
      if (typeof override === 'string') return override;
      return `./apps/${id}/${id}.css`;
    }
    function deriveMount(id) {
      return () => globalThis['KobaltApp_' + _capitalize(id)]?.mount;
    }
    function deriveUnmount(id) {
      return () => globalThis['KobaltApp_' + _capitalize(id)]?.unmount;
    }

    return (config.sections || []).map(section => ({
      id:          section.id,
      label:       section.label,
      icon:        section.icon,
      type:        'section',
      defaultOpen: section.defaultOpen ?? false,
      children: (section.apps || [])
        .filter(app => app.enabled !== false)
        .map(app => ({
          id:      app.id,
          label:   app.label,
          icon:    app.icon,
          type:    'app',
          desc:    app.desc || '',
          script:  deriveScript(app.id, app.script),
          css:     deriveCSS(app.id, app.css),
          mount:   deriveMount(app.id),
          unmount: deriveUnmount(app.id),
          children: (app.views || [])
            .filter(v => v.enabled !== false)
            .map(v => ({
              id:   v.id,
              label: v.label,
              icon:  '·',
              type:  'view',
              ...(v.view ? { view: v.view } : {}),
            })),
        })),
    }));
  }

  // Fallback mínimo si apps.json no está disponible
  const _NAV_FALLBACK = {
    sections: [{
      id: 'tienda', label: 'Tienda', icon: '🏪', defaultOpen: true,
      apps: [{ id: 'commerce', label: 'Comercio', icon: '📦',
               desc: 'Inventario y punto de venta', script: false, enabled: true,
               views: [
                 { id: 'inventario', label: 'Inventario' },
                 { id: 'pos',        label: 'Vender' },
                 { id: 'historial',  label: 'Historial' },
                 { id: 'pagos',      label: 'Medios de pago' },
               ] }] },
    { id: 'sistema', label: 'Sistema', icon: '⚙️', defaultOpen: false,
      apps: [
        { id: 'sesion', label: 'Sesión',         icon: '🔑', desc: 'Estado del kernel', script: false, css: false, enabled: true },
        { id: 'config', label: 'Configuración',  icon: '🎨', desc: 'Apariencia',        script: false, css: false, enabled: true },
      ] }],
  };

  async function _loadNavTree() {
    try {
      const resp = await fetch('./data/apps.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const config = await resp.json();
      _NAV_TREE = _buildNavTree(config);
    } catch (e) {
      console.warn('[Dashboard] apps.json no disponible, usando fallback:', e.message);
      _NAV_TREE = _buildNavTree(_NAV_FALLBACK);
    }
  }

  /* ── Estado del dashboard ─────────────────────────────────────── */
  let _session       = null;
  let _activeAppId   = null;   // app montada actualmente
  let _activeNodeId  = null;   // nodo activo (app o view)
  let _collapsed     = false;
  let _openSections  = new Set();
  let _loadedScripts = new Set();

  const $ = id => document.getElementById(id);

  /* ═══ CONECTIVIDAD — motor de detección ═══
   * Clase: I (infraestructura visual) — no toca kernel
   * Fuente: navigator.onLine + eventos online/offline
   * Precisión: detecta red activa, no WAN real.
   * Para tema adaptativo es suficiente.
   *
   * Modos:
   *   'stable'  → tema fijo, red no influye
   *   'auto-lc' → online=light, offline=dark  (Ligth cuando Conectado)
   *   'auto-dc' → online=dark,  offline=light (Dark cuando Conectado)
   */

  const CONNECTIVITY_KEY = 'kobalt:connectivity:mode';
  const THEME_KEY        = 'kobalt:theme';

  let _connectivityMode = localStorage.getItem(CONNECTIVITY_KEY) || 'auto-lc';

  function isOnline() { return navigator.onLine; }

  function applyAdaptiveTheme() {
    if (_connectivityMode === 'stable') return;
    const theme = _connectivityMode === 'auto-lc'
      ? (isOnline() ? 'light' : 'dark')
      : (isOnline() ? 'dark'  : 'light');
    applyThemeGlobal(theme);
  }

  function applyThemeGlobal(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('dashboard')?.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    const iconD = $('thIconD');
    const iconL = $('thIconL');
    if (iconD) iconD.style.display = theme === 'dark'  ? '' : 'none';
    if (iconL) iconL.style.display = theme === 'light' ? '' : 'none';
  }

  function setConnectivityMode(mode) {
    _connectivityMode = mode;
    localStorage.setItem(CONNECTIVITY_KEY, mode);
    applyAdaptiveTheme();
  }

  function getConnectivityMode() { return _connectivityMode; }

  window.addEventListener('online',  () => {
    applyAdaptiveTheme();
    updateConnectivityIndicator(true);
  });
  window.addEventListener('offline', () => {
    applyAdaptiveTheme();
    updateConnectivityIndicator(false);
  });

  function updateConnectivityIndicator(online) {
    const el = $('db-connectivity');
    if (!el) return;
    el.textContent = online ? '● ONLINE' : '○ LOCAL';
    el.className   = 'db-connectivity-badge ' + (online ? 'online' : 'offline');
  }

  /* ── Utilidades de árbol ──────────────────────────────────────── */

  function flatNodes() {
    const nodes = [];
    function walk(list, parentApp) {
      for (const n of list) {
        nodes.push({ ...n, _parentApp: parentApp });
        if (n.children) walk(n.children, n.type === 'app' ? n : parentApp);
      }
    }
    _NAV_TREE.forEach(s => {
      nodes.push({ ...s, _parentApp: null });
      if (s.children) walk(s.children, null);
    });
    return nodes;
  }

  function findNode(id) {
    return flatNodes().find(n => n.id === id) || null;
  }

  function findAppNode(id) {
    return flatNodes().find(n => n.id === id && n.type === 'app') || null;
  }

  function viewsOfApp(appId) {
    const app = findAppNode(appId);
    return app?.children?.filter(c => c.type === 'view') || [];
  }

  /* ── Persistencia de estado de secciones ─────────────────────── */

  function loadSectionState() {
    try {
      const raw = localStorage.getItem('kobalt:nav:open');
      if (raw) {
        JSON.parse(raw).forEach(id => _openSections.add(id));
        return;
      }
    } catch {}
    // Defaults — abrir las secciones con defaultOpen:true
    _NAV_TREE.forEach(s => { if (s.defaultOpen) _openSections.add(s.id); });
  }

  function saveSectionState() {
    localStorage.setItem('kobalt:nav:open',
      JSON.stringify([..._openSections]));
  }

  /* ── Renderizar sidebar ───────────────────────────────────────── */

  function renderSidebar() {
    const nav = $('db-nav');
    if (!nav) return;

    nav.innerHTML = _NAV_TREE.map(section => renderSection(section)).join('');

    // Delegación de eventos en el nav
    nav.querySelectorAll('[data-node]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        navigateTo(btn.dataset.node);
      });
    });
  }

  function renderSection(section) {
    const isOpen = _openSections.has(section.id);
    return `
      <div class="db-section" data-section="${section.id}">
        <button class="db-nav-item db-section-head"
                data-node="${section.id}"
                data-tooltip="${section.label}">
          <span class="db-nav-icon">${section.icon}</span>
          <span class="db-nav-label">${section.label}</span>
          <span class="db-chevron ${isOpen ? 'open' : ''}">›</span>
        </button>
        <div class="db-section-body ${isOpen ? 'open' : ''}">
          ${(section.children || []).map(app => renderApp(app)).join('')}
        </div>
      </div>`;
  }

  function renderApp(app) {
    const isActiveApp  = app.id === _activeAppId;
    const hasViews     = !!(app.children?.length);
    const viewsHtml = hasViews && isActiveApp
      ? `<div class="db-app-children active">
          ${app.children.map(v => renderView(v, app.id)).join('')}
         </div>`
      : hasViews
      ? `<div class="db-app-children">
          ${app.children.map(v => renderView(v, app.id)).join('')}
         </div>`
      : '';

    return `
      <div class="db-app-group">
        <button class="db-nav-item db-app-head ${isActiveApp ? 'active' : ''}"
                data-node="${app.id}"
                data-tooltip="${app.label}">
          <span class="db-nav-icon">${app.icon}</span>
          <span class="db-nav-label">${app.label}</span>
        </button>
        ${viewsHtml}
      </div>`;
  }

  function renderView(view, parentAppId) {
    const isActive = view.id === _activeNodeId;
    return `
      <button class="db-nav-item db-nav-view ${isActive ? 'active' : ''}"
              data-node="${view.id}"
              data-tooltip="${view.label}">
        <span class="db-nav-icon db-view-dot">›</span>
        <span class="db-nav-label">${view.label}</span>
      </button>`;
  }

  /* ── Cargar script/CSS dinámicamente ─────────────────────────── */

  function loadScript(src) {
    if (!src || _loadedScripts.has(src)) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload  = () => { _loadedScripts.add(src); res(); };
      s.onerror = () => rej(new Error('No se pudo cargar: ' + src));
      document.head.appendChild(s);
    });
  }

  function loadCSS(href) {
    if (!href || _loadedScripts.has(href)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
    _loadedScripts.add(href);
  }

  /* ── Navegar a un nodo ────────────────────────────────────────── */

  async function navigateTo(nodeId) {
    const node = findNode(nodeId);
    if (!node) return;

    /* SECCIÓN — toggle acordeón */
    if (node.type === 'section') {
      if (_openSections.has(nodeId)) {
        _openSections.delete(nodeId);
      } else {
        _openSections.add(nodeId);
      }
      saveSectionState();
      renderSidebar();
      return;
    }

    /* VISTA — delegar al navigateTo de la app padre */
    if (node.type === 'view') {
      const parentApp = node._parentApp;
      if (!parentApp) return;

      // Montar la app padre si no está montada
      if (_activeAppId !== parentApp.id) {
        await _mountApp(parentApp);
      }

      // Delegar la vista a la app
      _activeNodeId = nodeId;
      updateBreadcrumb(parentApp, node);
      renderSidebar();
      localStorage.setItem('kobalt:nav:active', nodeId);

      // node.view separa el id de nav del id de vista interno de la app
      // ej: 'design.tokens' (nav) → 'tokens' (app.navigateTo)
      const appGlobal = _getAppGlobal(parentApp);
      appGlobal?.navigateTo?.(node.view || nodeId);
      return;
    }

    /* APP — montar la app */
    if (node.type === 'app') {
      await _mountApp(node);
      return;
    }
  }

  /* ── Montar app ───────────────────────────────────────────────── */

  async function _mountApp(appNode) {
    // Desmontar app anterior si es diferente
    if (_activeAppId && _activeAppId !== appNode.id) {
      const prev = findAppNode(_activeAppId);
      if (prev) {
        try { prev.unmount?.()?.(); } catch {}
      }
      const prevContainer = $('db-app-' + _activeAppId);
      if (prevContainer) prevContainer.classList.remove('active');
    }

    _activeAppId  = appNode.id;
    _activeNodeId = appNode.id;

    updateBreadcrumb(appNode);
    renderSidebar();

    localStorage.setItem('kobalt:nav:active', appNode.id);

    // Contenedor de la app
    let container = $('db-app-' + appNode.id);
    if (!container) {
      container = document.createElement('div');
      container.id        = 'db-app-' + appNode.id;
      container.className = 'db-app-container';
      $('db-content').appendChild(container);
    }
    container.classList.add('active');

    // Cargar CSS y script
    if (appNode.css)    loadCSS(appNode.css);
    if (appNode.script) {
      try {
        await loadScript(appNode.script);
      } catch (e) {
        container.innerHTML = `
          <div class="db-app-empty">
            <div class="db-app-empty-icon">⚠️</div>
            <div>No se pudo cargar ${appNode.label}</div>
            <div style="font-size:.72rem">${e.message}</div>
          </div>`;
        return;
      }
    }

    // Apps especiales inline
    if (appNode.id === 'sesion') {
      renderSesionApp(container);
      return;
    }
    if (appNode.id === 'config') {
      renderAparienciaConfig(container);
      return;
    }

    const mountFn = appNode.mount?.();
    if (mountFn) {
      try {
        mountFn(container.id, _session);
      } catch (e) {
        console.error('[Dashboard] Error montando', appNode.id, e);
      }
    } else {
      container.innerHTML = `
        <div class="db-app-empty">
          <div class="db-app-empty-icon">${appNode.icon}</div>
          <div style="font-weight:600">${appNode.label}</div>
          <div>En construcción</div>
        </div>`;
    }
  }

  /* ── Obtener global de una app ────────────────────────────────── */

  function _getAppGlobal(appNode) {
    return globalThis['KobaltApp_' + _capitalize(appNode.id)] || null;
  }

  /* ── Breadcrumb ───────────────────────────────────────────────── */

  function updateBreadcrumb(appNode, viewNode) {
    const bc = $('db-breadcrumb');
    if (!bc) return;
    if (viewNode) {
      bc.innerHTML =
        `<strong>${appNode.icon} ${appNode.label}</strong>
         <span style="color:var(--border-default)"> / </span>
         <span>${viewNode.label}</span>`;
    } else {
      bc.innerHTML =
        `<strong>${appNode.icon} ${appNode.label}</strong>
         <span style="color:var(--text-muted);font-size:.72rem">
           — ${appNode.desc || ''}
         </span>`;
    }
  }

  /* ── App inline: Sesión ───────────────────────────────────────── */

  function renderSesionApp(container) {
    if (!_session) return;
    const s = _session;
    container.innerHTML = `
      <div style="max-width:480px">
        <div style="font-size:.68rem;font-weight:700;
                    letter-spacing:.1em;text-transform:uppercase;
                    color:var(--text-muted);margin-bottom:16px">
          Estado del kernel
        </div>
        ${[
          ['Node ID', s.nodeId  || '—'],
          ['DB ID',   s.db_id   || '—'],
          ['Kernel',  global.__KOBALT__?.version || '—'],
        ].map(([label, val]) => `
          <div style="display:flex;justify-content:space-between;
                      padding:10px 0;
                      border-bottom:1px solid var(--border-subtle);
                      font-size:.82rem">
            <span style="color:var(--text-muted)">${label}</span>
            <span style="font-family:var(--font-mono);
                         font-size:.78rem">${val}</span>
          </div>
        `).join('')}
        <div style="margin-top:20px">
          <button id="db-logout-btn" class="btn"
                  style="color:var(--err);
                         border-color:rgba(244,112,128,.25)">
            Cerrar sesión
          </button>
        </div>
      </div>`;
    $('db-logout-btn')?.addEventListener('click', logout);
  }

  /* ── App inline: Configuración / Apariencia ──────────────────── */

  function renderAparienciaConfig(container) {
    const mode   = getConnectivityMode();
    const online = isOnline();
    const curTheme = document.documentElement.getAttribute('data-theme') || 'dark';

    container.innerHTML = `
      <div style="max-width:560px">

        <div style="margin-bottom:28px">
          <div style="font-size:1.3rem;font-weight:800;letter-spacing:-.03em;
                      background:var(--grad-main);-webkit-background-clip:text;
                      -webkit-text-fill-color:transparent;background-clip:text;
                      margin-bottom:4px">
            Apariencia
          </div>
          <div style="font-size:.78rem;font-family:var(--font-mono);
                      color:var(--text-muted)">
            Personalización visual del dashboard
          </div>
        </div>

        <!-- Estado de red -->
        <div class="block" style="margin-bottom:16px">
          <div class="block-head">
            <div class="block-icon">📡</div>
            <div class="block-title">Estado de conectividad</div>
            <span class="db-connectivity-badge ${online ? 'online' : 'offline'}">
              ${online ? '● ONLINE' : '○ LOCAL'}
            </span>
          </div>
          <div class="block-body" style="font-size:.8rem;color:var(--text-muted);line-height:1.7">
            Detectado via <code style="font-family:var(--font-mono);font-size:.75rem;
            color:var(--p-cyan)">navigator.onLine</code>.
            El sistema escucha eventos en tiempo real —
            el tema cambia automáticamente cuando cambia la conexión.
          </div>
        </div>

        <!-- Modo de tema adaptativo -->
        <div class="block" style="margin-bottom:16px">
          <div class="block-head">
            <div class="block-icon">🎨</div>
            <div class="block-title">Modo de tema adaptativo</div>
          </div>
          <div class="block-body">
            ${[
              ['auto-lc', '☀ Online claro · ◑ Offline oscuro',
               'Cuando estás conectado, tema claro. Cuando pierdes la conexión, oscuro. Ideal para entornos de trabajo diurno.'],
              ['auto-dc', '◑ Online oscuro · ☀ Offline claro',
               'Modo oscuro cuando estás activo en red, claro cuando trabajas sin conexión.'],
              ['stable',  '◈ Siempre estable',
               'El tema no cambia con la conectividad. Usa el selector manual de abajo.'],
            ].map(([val, label, desc]) => `
              <label style="display:flex;align-items:flex-start;gap:12px;
                            padding:13px 14px;margin-bottom:8px;border-radius:var(--r-sm);
                            cursor:pointer;
                            border:1px solid ${mode === val ? 'var(--accent)' : 'var(--border-default)'};
                            background:${mode === val ? 'var(--accent-dim)' : 'var(--surface-overlay)'};
                            transition:all .15s">
                <input type="radio" name="connectivity-mode" value="${val}"
                       ${mode === val ? 'checked' : ''}
                       style="margin-top:3px;accent-color:var(--accent)">
                <div>
                  <div style="font-size:.84rem;font-weight:600;margin-bottom:3px">${label}</div>
                  <div style="font-size:.73rem;color:var(--text-muted);line-height:1.5">${desc}</div>
                </div>
              </label>`).join('')}
          </div>
        </div>

        <!-- Selector manual — solo en modo stable -->
        <div class="block" id="cfg-manual-theme"
             style="margin-bottom:16px;display:${mode === 'stable' ? 'block' : 'none'}">
          <div class="block-head">
            <div class="block-icon">☾</div>
            <div class="block-title">Tema manual</div>
          </div>
          <div class="block-body">
            <div style="display:flex;gap:10px">
              <button class="btn btn-secondary" id="cfg-set-dark"
                      style="${curTheme === 'dark' ? 'border-color:var(--accent);color:var(--accent)' : ''}">
                ◑ Oscuro
              </button>
              <button class="btn btn-secondary" id="cfg-set-light"
                      style="${curTheme === 'light' ? 'border-color:var(--accent);color:var(--accent)' : ''}">
                ☀ Claro
              </button>
            </div>
          </div>
        </div>

        <div class="alert alert-info">
          <span class="alert-icon">◈</span>
          <div class="alert-body">
            <div class="alert-title">Configuración persistente</div>
            <div class="alert-desc">
              El modo seleccionado se guarda en localStorage
              y se aplica automáticamente en cada sesión.
            </div>
          </div>
        </div>

      </div>`;

    // Radio buttons — cambiar modo
    container.querySelectorAll('[name="connectivity-mode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        setConnectivityMode(radio.value);
        renderAparienciaConfig(container);
      });
    });

    // Botones de tema manual
    container.querySelector('#cfg-set-dark')?.addEventListener('click', () => {
      applyThemeGlobal('dark');
      renderAparienciaConfig(container);
    });
    container.querySelector('#cfg-set-light')?.addEventListener('click', () => {
      applyThemeGlobal('light');
      renderAparienciaConfig(container);
    });
  }

  /* ── Toggle sidebar ───────────────────────────────────────────── */

  function toggleSidebar() {
    _collapsed = !_collapsed;
    const sidebar = $('db-sidebar');
    sidebar?.classList.toggle('collapsed', _collapsed);
    const btn = $('db-toggle-icon');
    if (btn) btn.textContent = _collapsed ? '→' : '←';
    localStorage.setItem('kobalt:sidebar:collapsed',
      _collapsed ? '1' : '0');
  }

  /* ── Logout ───────────────────────────────────────────────────── */

  function logout() {
    if (_activeAppId) {
      const app = findAppNode(_activeAppId);
      try { app?.unmount?.()?.(); } catch {}
    }
    _session      = null;
    _activeAppId  = null;
    _activeNodeId = null;

    $('dashboard').classList.remove('visible');
    $('screen-login').style.display = '';

    document.querySelectorAll('.db-app-container')
      .forEach(c => c.remove());
  }

  /* ── Actualizar chips de stats en el topbar ───────────────────── */

  function updateStats(stats) {
    // stats: Array de { label, value, variant }
    // variant: 'ok' | 'warn' | 'err' | 'cyan' | 'blue'
    const bar = $('db-stats-bar');
    if (!bar) return;
    bar.innerHTML = stats.map(s =>
      `<span class="chip ${s.variant || 'cyan'}">
        ${s.label ? `<span style="opacity:.6;font-size:.58rem;text-transform:uppercase;letter-spacing:.5px">${s.label}</span>` : ''}
        <strong>${s.value}</strong>
      </span>`
    ).join('');
  }

  /* ── API pública del dashboard ────────────────────────────────── */

  global.KobaltDashboard = {

    async open(session) {
      _session = session;

      $('screen-login').style.display = 'none';
      const db = $('dashboard');
      db.classList.add('visible');

      // Aplicar tema — adaptativo o guardado
      applyAdaptiveTheme();
      // Si stable, aplicar el guardado
      if (_connectivityMode === 'stable') {
        applyThemeGlobal(localStorage.getItem(THEME_KEY) || 'dark');
      }

      // Restaurar estado de sidebar
      _collapsed = localStorage.getItem('kobalt:sidebar:collapsed') === '1';
      $('db-sidebar')?.classList.toggle('collapsed', _collapsed);
      const icon = $('db-toggle-icon');
      if (icon) icon.textContent = _collapsed ? '→' : '←';

      // Cargar árbol de apps desde data/apps.json
      await _loadNavTree();

      // Cargar estado de secciones y renderizar nav
      loadSectionState();
      renderSidebar();

      // Restaurar última app/vista o ir a commerce por defecto
      const last = localStorage.getItem('kobalt:nav:active') || 'commerce';
      navigateTo(last);
    },

    logout,
    navigateTo,
    updateStats,
    isOnline,
    getConnectivityMode,
    setConnectivityMode,
    applyThemeGlobal,
  };

  /* ── Inicialización del DOM ───────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', () => {
    updateConnectivityIndicator(isOnline());

    $('db-collapse-btn-el')?.addEventListener('click', toggleSidebar);

    $('db-logout-foot')?.addEventListener('click', logout);

    $('db-sync-btn')?.addEventListener('click', () => {
      if (_activeAppId) {
        const app = findAppNode(_activeAppId);
        _getAppGlobal(app)?.doSync?.();
      }
    });

    if (window.innerWidth <= 768) {
      const mobileMenu = $('db-mobile-menu');
      if (mobileMenu) mobileMenu.style.display = '';
      document.addEventListener('click', e => {
        if (!e.target.closest('#db-sidebar') &&
            !e.target.closest('#db-mobile-menu')) {
          $('db-sidebar')?.classList.remove('mobile-open');
        }
      });
      mobileMenu?.addEventListener('click', () => {
        $('db-sidebar')?.classList.toggle('mobile-open');
      });
    }
  });

})(globalThis);
