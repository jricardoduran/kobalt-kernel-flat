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

  /* ── Registro de apps ─────────────────────────────
   * Cada app declara su propia metadata.
   * El dashboard no sabe qué hace cada app.
   * Solo sabe cómo montarla y desplazarla.
   */
  const APP_REGISTRY = [
    {
      id:      'commerce',
      label:   'Comercio',
      icon:    '🏪',
      desc:    'Inventario y punto de venta',
      group:   'principal',
      script:  null,   // ya cargado como script estático
      css:     './apps/commerce/commerce.css',
      mount:   () => global.KobaltApp_Commerce?.mount,
      unmount: () => global.KobaltApp_Commerce?.unmount,
    },
    {
      id:      'canales',
      label:   'Canales',
      icon:    '🔗',
      desc:    'ML, Shopify, WooCommerce',
      group:   'principal',
      script:  './apps/canales/canales.js',
      css:     './apps/canales/canales.css',
      mount:   () => global.KobaltApp_Canales?.mount,
      unmount: () => global.KobaltApp_Canales?.unmount,
    },
    {
      id:      'imagenes',
      label:   'Imágenes',
      icon:    '🖼️',
      desc:    'Procesador de imágenes',
      group:   'principal',
      script:  './apps/imagenes/imagenes.js',
      css:     './apps/imagenes/imagenes.css',
      mount:   () => global.KobaltApp_Imagenes?.mount,
      unmount: () => global.KobaltApp_Imagenes?.unmount,
    },
    {
      id:      'sesion',
      label:   'Sesión',
      icon:    '🔑',
      desc:    'Estado del kernel y nodo',
      group:   'sistema',
      script:  null,   // app inline, sin archivo externo
      css:     null,
      mount:   null,
      unmount: null,
    },
  ];

  const GROUPS = {
    principal: 'Principal',
    sistema:   'Sistema',
  };

  /* ── Estado del dashboard ─────────────────────── */
  let _session      = null;
  let _activeAppId  = null;
  let _collapsed    = false;
  let _loadedScripts = new Set();

  const $ = id => document.getElementById(id);

  /* ── Renderizar sidebar ───────────────────────── */
  function renderSidebar() {
    const nav = $('db-nav');
    if (!nav) return;

    // Agrupar apps
    const groups = {};
    APP_REGISTRY.forEach(app => {
      if (!groups[app.group]) groups[app.group] = [];
      groups[app.group].push(app);
    });

    nav.innerHTML = Object.entries(groups).map(
      ([groupId, apps]) => `
        <div class="db-nav-group">
          <div class="db-nav-group-label">
            ${GROUPS[groupId] || groupId}
          </div>
          ${apps.map(app => `
            <button
              class="db-nav-item ${app.id === _activeAppId ? 'active' : ''}"
              data-app="${app.id}"
              data-tooltip="${app.label}"
              title="${app.desc}"
            >
              <span class="db-nav-icon">${app.icon}</span>
              <span class="db-nav-label">${app.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="db-nav-sep"></div>
      `
    ).join('');

    nav.querySelectorAll('.db-nav-item').forEach(btn => {
      btn.addEventListener('click', () =>
        navigateTo(btn.dataset.app));
    });
  }

  /* ── Cargar script de app dinámicamente ────────── */
  function loadScript(src) {
    if (!src || _loadedScripts.has(src))
      return Promise.resolve();
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

  /* ── Navegar a una app ──────────────────────────── */
  async function navigateTo(appId) {
    const app = APP_REGISTRY.find(a => a.id === appId);
    if (!app) return;

    // Desmontar app anterior
    if (_activeAppId && _activeAppId !== appId) {
      const prev = APP_REGISTRY.find(a => a.id === _activeAppId);
      try { prev?.unmount?.()?.(); } catch {}
      const prevContainer = $('db-app-' + _activeAppId);
      if (prevContainer) prevContainer.classList.remove('active');
    }

    _activeAppId = appId;

    // Actualizar breadcrumb
    const bc = $('db-breadcrumb');
    if (bc) bc.innerHTML =
      `<strong>${app.icon} ${app.label}</strong>
       <span style="color:var(--border-default)"> / </span>
       <span>${app.desc}</span>`;

    // Actualizar sidebar
    document.querySelectorAll('.db-nav-item').forEach(b =>
      b.classList.toggle('active', b.dataset.app === appId));

    // Mostrar contenedor de la app
    let container = $('db-app-' + appId);
    if (!container) {
      container = document.createElement('div');
      container.id = 'db-app-' + appId;
      container.className = 'db-app-container';
      $('db-content').appendChild(container);
    }
    container.classList.add('active');

    // Cargar script y CSS si no están cargados
    if (app.css)    loadCSS(app.css);
    if (app.script) {
      try {
        await loadScript(app.script);
      } catch (e) {
        container.innerHTML = `
          <div class="db-app-empty">
            <div class="db-app-empty-icon">⚠️</div>
            <div>No se pudo cargar ${app.label}</div>
            <div style="font-size:.72rem">${e.message}</div>
          </div>`;
        return;
      }
    }

    // Montar app — app inline (sesion) o módulo externo
    if (appId === 'sesion') {
      renderSesionApp(container);
      return;
    }

    const mountFn = app.mount?.();
    if (mountFn) {
      try {
        mountFn(container.id, _session);
      } catch (e) {
        console.error('[Dashboard] Error montando', appId, e);
      }
    } else {
      container.innerHTML = `
        <div class="db-app-empty">
          <div class="db-app-empty-icon">${app.icon}</div>
          <div style="font-weight:600">${app.label}</div>
          <div>En construcción</div>
        </div>`;
    }

    // Guardar última app activa
    localStorage.setItem('kobalt:dashboard:last', appId);
  }

  /* ── App inline: Sesión ─────────────────────────── */
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
          ['Node ID',    s.nodeId   || '—'],
          ['DB ID',      s.db_id    || '—'],
          ['Kernel',     global.__KOBALT__?.version || '—'],
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

  /* ── Toggle sidebar ─────────────────────────────── */
  function toggleSidebar() {
    _collapsed = !_collapsed;
    const sidebar = $('db-sidebar');
    sidebar?.classList.toggle('collapsed', _collapsed);
    const btn = $('db-toggle-icon');
    if (btn) btn.textContent = _collapsed ? '→' : '←';
    localStorage.setItem('kobalt:sidebar:collapsed',
      _collapsed ? '1' : '0');
  }

  /* ── Logout ─────────────────────────────────────── */
  function logout() {
    // Desmontar app activa
    if (_activeAppId) {
      const app = APP_REGISTRY.find(a => a.id === _activeAppId);
      try { app?.unmount?.()?.(); } catch {}
    }
    _session     = null;
    _activeAppId = null;

    $('dashboard').classList.remove('visible');
    $('screen-login').style.display = '';

    // Limpiar contenedores de apps
    document.querySelectorAll('.db-app-container')
      .forEach(c => c.remove());
  }

  /* ── API pública del dashboard ──────────────────── */
  global.KobaltDashboard = {

    /* El kernel llama a esto después del login */
    open(session) {
      _session = session;

      // Mostrar dashboard
      $('screen-login').style.display = 'none';
      const db = $('dashboard');
      db.classList.add('visible');

      // Restaurar estado de sidebar
      _collapsed = localStorage.getItem(
        'kobalt:sidebar:collapsed') === '1';
      $('db-sidebar')?.classList.toggle(
        'collapsed', _collapsed);
      const icon = $('db-toggle-icon');
      if (icon) icon.textContent = _collapsed ? '→' : '←';

      // Renderizar nav
      renderSidebar();

      // Ir a la última app visitada o commerce por defecto
      const last = localStorage.getItem(
        'kobalt:dashboard:last') || 'commerce';
      navigateTo(last);
    },

    logout,
    navigateTo,
  };

  /* ── Inicialización del DOM ─────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    $('db-collapse-btn-el')?.addEventListener(
      'click', toggleSidebar);

    // Logout desde el pie de la sidebar
    $('db-logout-foot')?.addEventListener('click', logout);

    // Sync desde la topbar
    $('db-sync-btn')?.addEventListener('click', () => {
      global.KobaltApp_Commerce?.doSync?.();
    });

    // Móvil: mostrar botón de menú y manejar overlay
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
