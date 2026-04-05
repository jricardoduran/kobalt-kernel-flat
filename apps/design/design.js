(function(global) {
  'use strict';

  const V = () => global.KobaltVisual;
  let _currentView = 'tokens';
  let _containerId = null;

  // ── Secciones del design system ──────────────────────

  const SECTIONS = {

    tokens: () => `
      <div class="section-label">⬡ Paleta de color</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:24px">
        ${[
          ['--p-cyan',   'Cyan',   '#29C5F6'],
          ['--p-blue',   'Blue',   '#4D6AF7'],
          ['--p-purple', 'Purple', '#7B4FE0'],
          ['--ok',       'OK',     '#34D399'],
          ['--warn',     'Warn',   '#FBBF24'],
          ['--err',      'Error',  '#F87171'],
        ].map(([v, l, hex]) => `
          <div style="border-radius:var(--r-sm);overflow:hidden;border:1px solid var(--border-default)">
            <div style="height:52px;background:${hex}"></div>
            <div style="padding:8px 10px;background:var(--surface-raised)">
              <div style="font-size:.72rem;font-weight:700">${l}</div>
              <div style="font-size:.65rem;font-family:var(--font-mono);color:var(--text-muted)">${hex}</div>
            </div>
          </div>`).join('')}
      </div>

      <div class="section-label">⬡ Tipografía</div>
      <div class="block" style="margin-bottom:24px">
        <div class="block-body">
          <div style="margin-bottom:20px">
            <div style="font-size:2.4rem;font-weight:800;letter-spacing:-.04em;
                        background:var(--grad-main);-webkit-background-clip:text;
                        -webkit-text-fill-color:transparent;background-clip:text">
              KOBALT RED FLAT
            </div>
            <div style="font-size:.7rem;font-family:var(--font-mono);
                        color:var(--text-muted);margin-top:4px">
              DM Sans · 800 · gradient text
            </div>
          </div>
          ${[
            ['2rem',   '800', 'Heading 1 — Título principal'],
            ['1.4rem', '700', 'Heading 2 — Sección'],
            ['1rem',   '600', 'Heading 3 — Subsección'],
            ['.88rem', '500', 'Body — Texto de párrafo normal'],
            ['.78rem', '400', 'Small — Texto secundario y ayuda'],
          ].map(([size, w, label]) => `
            <div style="display:flex;align-items:baseline;gap:16px;
                        padding:10px 0;border-bottom:1px solid var(--border-subtle)">
              <div style="font-size:${size};font-weight:${w};min-width:280px">${label}</div>
              <div style="font-size:.65rem;font-family:var(--font-mono);
                          color:var(--text-muted)">${size} · ${w}</div>
            </div>`).join('')}
          <div style="margin-top:16px;font-family:var(--font-mono);
                      font-size:.82rem;color:var(--text-secondary);line-height:1.8">
            Mono: entityId = H(D, nodeId ∥ counter, 8)
            <span style="color:var(--p-cyan)">←</span>
            <span style="color:var(--text-muted)">JetBrains Mono · 500</span>
          </div>
        </div>
      </div>

      <div class="section-label">⬡ Gradientes</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        ${[
          ['grad-main',   'Gradiente principal',  'linear-gradient(135deg,#29C5F6,#4D6AF7,#7B4FE0)'],
          ['grad-btn',    'Botón primario',        'linear-gradient(135deg,#4D6AF7,#7B4FE0)'],
          ['grad-subtle', 'Fondo sutil',           'linear-gradient(135deg,rgba(41,197,246,.12),rgba(123,79,224,.08))'],
        ].map(([k, l, g]) => `
          <div style="border-radius:var(--r-sm);overflow:hidden;
                      border:1px solid var(--border-default)">
            <div style="height:64px;background:${g}"></div>
            <div style="padding:8px 10px;background:var(--surface-raised)">
              <div style="font-size:.72rem;font-weight:700">${l}</div>
              <div style="font-size:.6rem;font-family:var(--font-mono);
                          color:var(--text-muted)">--${k}</div>
            </div>
          </div>`).join('')}
      </div>
    `,

    botones: () => `
      <div class="section-label">⬡ Botones — variantes</div>
      <div class="block" style="margin-bottom:16px">
        <div class="block-head">
          <div class="block-icon">⬡</div>
          <div class="block-title">Variantes principales</div>
        </div>
        <div class="block-body">
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
            <button class="btn btn-primary btn-xl">◈ Acción principal</button>
            <button class="btn btn-primary btn-lg">↑ Sync</button>
            <button class="btn btn-primary">+ Crear</button>
            <button class="btn btn-primary btn-sm">▶ Ejecutar</button>
            <button class="btn btn-primary btn-xs">↻</button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
            <button class="btn btn-secondary btn-lg">⬇ Exportar</button>
            <button class="btn btn-secondary">◎ Ver detalles</button>
            <button class="btn btn-secondary btn-sm">⌥ Opciones</button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px">
            <button class="btn btn-cyan">⟡ Canal</button>
            <button class="btn btn-ghost">⊘ Cancelar</button>
            <button class="btn btn-danger">⊗ Eliminar</button>
            <button class="btn btn-ghost btn-icon btn-sm">⚙</button>
            <button class="btn btn-ghost btn-icon btn-sm">⊟</button>
            <button class="btn btn-primary btn-icon">+</button>
          </div>
        </div>
      </div>

      <div class="section-label">⬡ Badges</div>
      <div class="block">
        <div class="block-body">
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
            <span class="badge badge-ok badge-dot">SYNCED</span>
            <span class="badge badge-warn badge-dot">PENDING</span>
            <span class="badge badge-err badge-dot">ERROR</span>
            <span class="badge badge-blue">KERNEL 3.3</span>
            <span class="badge badge-cyan">LOCAL-FIRST</span>
            <span class="badge badge-purple">JANUS</span>
            <span class="badge badge-neutral">INACTIVO</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <span class="chip cyan">productos <strong>2,481</strong></span>
            <span class="chip ok">ventas hoy <strong>24</strong></span>
            <span class="chip warn">pendientes <strong>3</strong></span>
            <span class="chip blue">canales <strong>5</strong></span>
            <span class="chip">kernel <strong>3.3.0</strong></span>
          </div>
        </div>
      </div>
    `,

    datos: () => `
      <div class="section-label">⬡ Cards de estadísticas</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
                  gap:12px;margin-bottom:24px">
        ${[
          ['📦', '2,481',  'productos canónicos'],
          ['🔗', '8,934',  'enlaces Janus'],
          ['💸', '$4.2M',  'ingresos mes'],
          ['⚡', '99.8%',  'uptime sync'],
        ].map(([ico, val, lbl]) => `
          <div class="card stat-card">
            <span class="stat-icon">${ico}</span>
            <div class="stat-value">${val}</div>
            <div class="stat-label">${lbl}</div>
          </div>`).join('')}
      </div>

      <div class="section-label">⬡ Tabla de datos</div>
      <div class="table-wrap" style="margin-bottom:24px">
        <table>
          <thead><tr>
            <th>Producto</th><th>SKU</th>
            <th>Stock</th><th>Canal</th><th>Estado</th><th></th>
          </tr></thead>
          <tbody>
            ${[
              ['Auriculares BT Pro',  'AUR-001', 45, 'ML1',  'ok',   'SYNCED'],
              ['Aceite Lavanda 30ml', 'ACE-030',  3, 'SH1',  'warn', 'PENDING'],
              ['Imán Neodimio x100',  'IMA-100',  0, 'WOO1', 'err',  'AGOTADO'],
            ].map(([n, sku, stk, canal, cls, lbl]) => `
              <tr>
                <td>${n}</td>
                <td class="td-mono">${sku}</td>
                <td><span class="badge badge-${cls}">${stk} ud</span></td>
                <td><span class="badge badge-cyan">${canal}</span></td>
                <td><span class="badge badge-${cls} badge-dot">${lbl}</span></td>
                <td class="td-actions">
                  <button class="btn btn-ghost btn-icon btn-xs">✎</button>
                  <button class="btn btn-ghost btn-icon btn-xs">⚭</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="section-label">⬡ Lista de actividad</div>
      <div class="block">
        <div class="block-head">
          <div class="block-icon">⚡</div>
          <div class="block-title">Actividad reciente</div>
          <button class="btn btn-ghost btn-xs block-badge">Ver todo →</button>
        </div>
        <div class="block-body">
          <div class="item-list">
            ${[
              ['💸', 'Venta — Auriculares BT Pro', 'ML1 · hace 3 min · 2 unidades', '$89,000'],
              ['↑',  'Sync completado',            'GitLab · hace 12 min · 47 entidades', 'OK'],
              ['📦', 'Producto importado desde ML2','Janus creado · hace 28 min', 'NUEVO'],
            ].map(([ico, name, meta, val]) => `
              <div class="item-row">
                <div class="item-icon">${ico}</div>
                <div class="item-info">
                  <div class="item-name">${name}</div>
                  <div class="item-meta">${meta}</div>
                </div>
                <span class="item-value">${val}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `,

    formularios: () => `
      <div class="section-label">⬡ Inputs y selects</div>
      <div class="block" style="margin-bottom:16px">
        <div class="block-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
            <div class="input-group">
              <label class="input-label">Nombre del producto</label>
              <div class="input-wrap">
                <span class="input-ico">📦</span>
                <input class="k-input" type="text" placeholder="Ej: Auriculares BT Pro">
              </div>
            </div>
            <div class="input-group">
              <label class="input-label">SKU</label>
              <div class="input-wrap">
                <span class="input-ico">🔖</span>
                <input class="k-input" type="text" placeholder="Ej: AUR-BT-001">
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
            <div class="input-group">
              <label class="input-label">Canal</label>
              <select class="k-select">
                <option>🔗 Mercado Libre ML1</option>
                <option>🛍 Shopify SH1</option>
                <option>🏪 WooCommerce WOO1</option>
              </select>
            </div>
            <div class="input-group">
              <label class="input-label">Stock</label>
              <input class="k-input is-ok" type="number" value="45">
              <span class="input-hint">✓ Stock disponible</span>
            </div>
          </div>
          <div class="input-group">
            <label class="input-label">Búsqueda global</label>
            <div class="input-wrap">
              <span class="input-ico">⌕</span>
              <input class="k-input" type="search"
                     placeholder="Buscar por nombre, SKU o ID…">
            </div>
          </div>
        </div>
      </div>

      <div class="section-label">⬡ Toggles y switches</div>
      <div class="block">
        <div class="block-head">
          <div class="block-icon">⚙</div>
          <div class="block-title">Preferencias de sync</div>
        </div>
        <div class="block-body">
          ${[
            ['Sync automático',          'Sincroniza cada 20s con conectores activos',   true],
            ['Notificaciones stock bajo', 'Alerta cuando stock ≤ 3 unidades',             true],
            ['Modo solo lectura',         'Deshabilita operaciones de escritura',         false],
          ].map(([n, d, checked]) => `
            <div class="toggle-row">
              <div class="toggle-info">
                <div class="toggle-name">${n}</div>
                <div class="toggle-desc">${d}</div>
              </div>
              <label class="toggle">
                <input type="checkbox" ${checked ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>`).join('')}
        </div>
      </div>

      <div class="section-label">⬡ Ejemplo real — Tema adaptativo por conectividad</div>
      <div class="block" id="ds-connectivity-block">
        <div class="block-head">
          <div class="block-icon">📡</div>
          <div class="block-title">Tema adaptativo</div>
          <span class="badge ${navigator.onLine ? 'badge-ok' : 'badge-warn'}" style="margin-left:auto">
            ${navigator.onLine ? '● ONLINE' : '○ LOCAL'}
          </span>
        </div>
        <div class="block-body">
          <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:14px;line-height:1.6">
            Este toggle modifica <strong style="color:var(--text-primary)">KobaltDashboard</strong>
            en tiempo real. El tema cambia automáticamente al conectar / desconectar la red.
          </div>
          ${[
            ['auto-lc', '☀ Online claro · ◑ Offline oscuro'],
            ['auto-dc', '◑ Online oscuro · ☀ Offline claro'],
            ['stable',  '◈ Tema fijo — sin adaptación'],
          ].map(([val, label]) => {
            const cur = globalThis.KobaltDashboard?.getConnectivityMode?.() || 'auto-lc';
            return `
            <div class="toggle-row" style="margin-bottom:8px">
              <div class="toggle-info">
                <div class="toggle-name" style="font-size:.82rem">${label}</div>
              </div>
              <label class="toggle" style="cursor:pointer">
                <input type="radio" name="ds-conn-mode" value="${val}"
                       ${cur === val ? 'checked' : ''}
                       style="display:none">
                <span class="toggle-slider" style="${cur === val ? 'background:var(--accent)' : ''}"></span>
              </label>
            </div>`;
          }).join('')}
        </div>
      </div>
    `,

    feedback: () => `
      <div class="section-label">⬡ Alertas</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
        <div class="alert alert-ok">
          <span class="alert-icon">✓</span>
          <div class="alert-body">
            <div class="alert-title">Sincronización completada</div>
            <div class="alert-desc">47 entidades sincronizadas con GitLab. Hace 2 minutos.</div>
          </div>
        </div>
        <div class="alert alert-warn">
          <span class="alert-icon">⚠</span>
          <div class="alert-body">
            <div class="alert-title">Stock bajo detectado</div>
            <div class="alert-desc">3 productos con stock ≤ 3 unidades.</div>
          </div>
        </div>
        <div class="alert alert-err">
          <span class="alert-icon">⊗</span>
          <div class="alert-body">
            <div class="alert-title">Error de conexión ML2</div>
            <div class="alert-desc">Verifica las credenciales del conector.</div>
          </div>
        </div>
        <div class="alert alert-info">
          <span class="alert-icon">◈</span>
          <div class="alert-body">
            <div class="alert-title">Nuevo Janus disponible</div>
            <div class="alert-desc">5 productos de SH1 sin enlace canónico.</div>
          </div>
        </div>
      </div>

      <div class="section-label">⬡ Barras de progreso</div>
      <div class="block">
        <div class="block-body">
          ${[
            ['Ventas completadas', '234 / 300', 78, ''],
            ['Stock disponible',   '1,840 ud',  62, 'ok'],
            ['Sync pendiente',     '3 items',    4, 'warn'],
          ].map(([l, v, pct, cls]) => `
            <div class="progress-wrap">
              <div class="progress-head">
                <span class="progress-label">${l}</span>
                <span class="progress-val">${v}</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill ${cls}" style="width:${pct}%"></div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    `,

    layout: () => `
      <div class="section-label">⬡ Cards con borde gradiente</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
                  gap:14px;margin-bottom:24px">
        ${[
          ['◈', 'Kernel FLAT',     'Motor algebraico local-first. La verdad nace en el dispositivo.'],
          ['⚭', 'Sistema Janus',   'Relación pura entre canónico y canal. Lookup O(1).'],
          ['🔒', 'Opacidad total', 'Los conectores ven solo bytes opacos. AES-GCM + permutación.'],
        ].map(([ico, t, d]) => `
          <div class="card-grad">
            <div class="feature-icon">${ico}</div>
            <div class="feature-title">${t}</div>
            <div class="feature-desc">${d}</div>
          </div>`).join('')}
      </div>

      <div class="section-label">⬡ Bloques con grid</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="block">
          <div class="block-head">
            <div class="block-icon">📊</div>
            <div class="block-title">Rendimiento</div>
            <span class="badge badge-cyan block-badge">Abril</span>
          </div>
          <div class="block-body">
            <div style="font-size:.78rem;color:var(--text-muted);line-height:1.8">
              Los bloques organizan información relacionada en unidades visuales
              coherentes. Cabecera con icono, título y badge opcional.
              Cuerpo con padding uniforme de 18px.
            </div>
          </div>
        </div>
        <div class="block">
          <div class="block-head">
            <div class="block-icon">⚡</div>
            <div class="block-title">Sistema de iconos</div>
          </div>
          <div class="block-body">
            <div style="display:flex;flex-wrap:wrap;gap:10px">
              ${['◈','⟡','⚭','⬡','📦','🔗','🖼️','💸','📊','⚡','🔑','⚙','↑','⊗','✓','⚠'].map(ico => `
                <div style="width:36px;height:36px;border-radius:var(--r-xs);
                            background:var(--surface-overlay);
                            border:1px solid var(--border-default);
                            display:flex;align-items:center;justify-content:center;
                            font-size:1rem">${ico}</div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `,
  };

  // ── Render de la app ──────────────────────────────

  function render(containerId, view) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tabs = Object.keys(SECTIONS);
    const tabLabels = {
      tokens:      '🎨 Tokens',
      botones:     '⬡ Botones',
      datos:       '📊 Datos',
      formularios: '✎ Forms',
      feedback:    '⚡ Feedback',
      layout:      '⊞ Layout',
    };

    container.innerHTML = `
      <div style="max-width:900px">
        <div style="margin-bottom:24px">
          <div style="font-size:1.6rem;font-weight:800;letter-spacing:-.03em;
                      background:var(--grad-main);-webkit-background-clip:text;
                      -webkit-text-fill-color:transparent;background-clip:text;
                      margin-bottom:4px">Design System</div>
          <div style="font-size:.78rem;font-family:var(--font-mono);
                      color:var(--text-muted)">
            Kobalt UI · cyan → blue → purple · todos los componentes
          </div>
        </div>

        <div class="tab-bar">
          ${tabs.map(t => `
            <button class="tab-btn ${t === view ? 'active' : ''}"
                    data-view="${t}">${tabLabels[t] || t}</button>
          `).join('')}
        </div>

        <div id="ds-content" style="padding-top:20px">
          ${SECTIONS[view]?.() || ''}
        </div>
      </div>`;

    container.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        _currentView = btn.dataset.view;
        render(containerId, _currentView);
      });
    });

    // Listeners del bloque de conectividad (solo en vista formularios)
    container.querySelectorAll('[name="ds-conn-mode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        globalThis.KobaltDashboard?.setConnectivityMode?.(radio.value);
        render(containerId, _currentView);
      });
    });
  }

  // ── Contrato del dashboard ────────────────────────

  global.KobaltApp_Design = {
    meta: {
      id:    'design',
      label: 'Design System',
      icon:  '◈',
      desc:  'Componentes y tokens de la UI Kobalt',
    },

    mount(containerId, session) {
      _containerId = containerId;
      render(containerId, _currentView);
    },

    navigateTo(view) {
      if (SECTIONS[view]) {
        _currentView = view;
        if (_containerId) render(_containerId, _currentView);
      }
    },

    unmount() {
      _containerId = null;
    },
  };

})(globalThis);
