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
  const NAV_TREE = [
    {
      id:          'tienda',
      label:       'Tienda',
      icon:        '🏪',
      type:        'section',
      defaultOpen: true,
      children: [
        {
          id:      'commerce',
          label:   'Comercio',
          icon:    '📦',
          type:    'app',
          desc:    'Inventario y punto de venta',
          script:  null,
          css:     './apps/commerce/commerce.css',
          mount:   () => global.KobaltApp_Commerce?.mount,
          unmount: () => global.KobaltApp_Commerce?.unmount,
          children: [
            { id: 'inventario', label: 'Inventario', icon: '·', type: 'view' },
            { id: 'pos',        label: 'Vender',     icon: '·', type: 'view' },
            { id: 'historial',  label: 'Historial',  icon: '·', type: 'view' },
          ],
        },
        {
          id:      'canales',
          label:   'Canales',
          icon:    '🔗',
          type:    'app',
          desc:    'ML, Shopify, WooCommerce',
          script:  './apps/canales/canales.js',
          css:     './apps/canales/canales.css',
          mount:   () => global.KobaltApp_Canales?.mount,
          unmount: () => global.KobaltApp_Canales?.unmount,
        },
      ],
    },
    {
      id:          'herramientas',
      label:       'Herramientas',
      icon:        '🛠️',
      type:        'section',
      defaultOpen: false,
      children: [
        {
          id:      'imagenes',
          label:   'Imágenes',
          icon:    '🖼️',
          type:    'app',
          desc:    'Procesador de imágenes',
          script:  './apps/imagenes/imagenes.js',
          css:     './apps/imagenes/imagenes.css',
          mount:   () => global.KobaltApp_Imagenes?.mount,
          unmount: () => global.KobaltApp_Imagenes?.unmount,
        },
      ],
    },
    {
      id:          'sistema',
      label:       'Sistema',
      icon:        '⚙️',
      type:        'section',
      defaultOpen: false,
      children: [
        {
          id:      'sesion',
          label:   'Sesión',
          icon:    '🔑',
          type:    'app',
          desc:    'Estado del kernel y nodo',
          script:  null,
          css:     null,
          mount:   null,
          unmount: null,
        },
      ],
    },
  ];

  /* ── Estado del dashboard ─────────────────────────────────────── */
  let _session       = null;
  let _activeAppId   = null;   // app montada actualmente
  let _activeNodeId  = null;   // nodo activo (app o view)
  let _collapsed     = false;
  let _openSections  = new Set();
  let _loadedScripts = new Set();

  const $ = id => document.getElementById(id);

  /* ── Utilidades de árbol ──────────────────────────────────────── */

  function flatNodes() {
    const nodes = [];
    function walk(list, parentApp) {
      for (const n of list) {
        nodes.push({ ...n, _parentApp: parentApp });
        if (n.children) walk(n.children, n.type === 'app' ? n : parentApp);
      }
    }
    NAV_TREE.forEach(s => {
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
    NAV_TREE.forEach(s => { if (s.defaultOpen) _openSections.add(s.id); });
  }

  function saveSectionState() {
    localStorage.setItem('kobalt:nav:open',
      JSON.stringify([..._openSections]));
  }

  /* ── Renderizar sidebar ───────────────────────────────────────── */

  function renderSidebar() {
    const nav = $('db-nav');
    if (!nav) return;

    nav.innerHTML = NAV_TREE.map(section => renderSection(section)).join('');

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

      // Llamar al método navigateTo de la app si existe
      const appGlobal = _getAppGlobal(parentApp);
      appGlobal?.navigateTo?.(nodeId);
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

    // App especial inline: sesión
    if (appNode.id === 'sesion') {
      renderSesionApp(container);
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
    const map = {
      commerce:  global.KobaltApp_Commerce,
      canales:   global.KobaltApp_Canales,
      imagenes:  global.KobaltApp_Imagenes,
    };
    return map[appNode.id] || null;
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

    open(session) {
      _session = session;

      $('screen-login').style.display = 'none';
      const db = $('dashboard');
      db.classList.add('visible');

      // Restaurar estado de sidebar
      _collapsed = localStorage.getItem('kobalt:sidebar:collapsed') === '1';
      $('db-sidebar')?.classList.toggle('collapsed', _collapsed);
      const icon = $('db-toggle-icon');
      if (icon) icon.textContent = _collapsed ? '→' : '←';

      // Cargar estado de secciones
      loadSectionState();

      // Renderizar nav
      renderSidebar();

      // Restaurar última app/vista o ir a commerce por defecto
      const last = localStorage.getItem('kobalt:nav:active') || 'commerce';
      navigateTo(last);
    },

    logout,
    navigateTo,
    updateStats,
  };

  /* ── Inicialización del DOM ───────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', () => {
    $('db-collapse-btn-el')?.addEventListener('click', toggleSidebar);

    $('db-logout-foot')?.addEventListener('click', logout);

    $('db-sync-btn')?.addEventListener('click', () => {
      global.KobaltApp_Commerce?.doSync?.();
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
