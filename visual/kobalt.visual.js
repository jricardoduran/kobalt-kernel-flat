
(function(global) {
  'use strict';

  // ═══ ASSET CACHE — local-first para recursos externos ═══
  // Principio: la red es el origen del asset, no su hogar permanente.
  // Primera vez → fetch → localStorage. Siempre después → local.

  function blobToDataURL(blob) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(blob);
    });
  }

  async function loadAsset(key, url) {
    const storageKey = 'kobalt:asset:' + key;

    // 1. Local primero
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) return cached;
    } catch {}

    // 2. Primera vez — red
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const isText = url.match(/\.(css|js|json|txt)(\?|$)/);
      const value  = isText
        ? await r.text()
        : await blobToDataURL(await r.blob());
      try { localStorage.setItem(storageKey, value); } catch {}
      return value;
    } catch {
      return null; // fallo silencioso — nunca rompe el render
    }
  }

  async function loadAssetCSS(key, url) {
    const css = await loadAsset(key, url);
    if (!css) return;
    let el = document.getElementById('kobalt-asset-' + key);
    if (!el) {
      el = document.createElement('style');
      el.id = 'kobalt-asset-' + key;
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  async function loadAssetImg(imgElement, code, url) {
    const cached = await loadAsset('flag:' + code.toLowerCase(), url);
    if (cached) imgElement.src = cached;
    else imgElement.src = url; // fallback directo al CDN
  }

  // ═══ COUNTRIES — datos de países ═══
  const COUNTRIES = [
    {code:'AF',dial:'93',  name:'Afganistán'},
    {code:'AL',dial:'355', name:'Albania'},
    {code:'DZ',dial:'213', name:'Argelia'},
    {code:'AR',dial:'54',  name:'Argentina'},
    {code:'AU',dial:'61',  name:'Australia'},
    {code:'AT',dial:'43',  name:'Austria'},
    {code:'BE',dial:'32',  name:'Bélgica'},
    {code:'BO',dial:'591', name:'Bolivia'},
    {code:'BR',dial:'55',  name:'Brasil'},
    {code:'CA',dial:'1',   name:'Canadá'},
    {code:'CL',dial:'56',  name:'Chile'},
    {code:'CN',dial:'86',  name:'China'},
    {code:'CO',dial:'57',  name:'Colombia'},
    {code:'CR',dial:'506', name:'Costa Rica'},
    {code:'CU',dial:'53',  name:'Cuba'},
    {code:'DO',dial:'1809',name:'República Dominicana'},
    {code:'EC',dial:'593', name:'Ecuador'},
    {code:'EG',dial:'20',  name:'Egipto'},
    {code:'SV',dial:'503', name:'El Salvador'},
    {code:'ES',dial:'34',  name:'España'},
    {code:'US',dial:'1',   name:'Estados Unidos'},
    {code:'FR',dial:'33',  name:'Francia'},
    {code:'DE',dial:'49',  name:'Alemania'},
    {code:'GT',dial:'502', name:'Guatemala'},
    {code:'HN',dial:'504', name:'Honduras'},
    {code:'IN',dial:'91',  name:'India'},
    {code:'ID',dial:'62',  name:'Indonesia'},
    {code:'IE',dial:'353', name:'Irlanda'},
    {code:'IL',dial:'972', name:'Israel'},
    {code:'IT',dial:'39',  name:'Italia'},
    {code:'JP',dial:'81',  name:'Japón'},
    {code:'MX',dial:'52',  name:'México'},
    {code:'NI',dial:'505', name:'Nicaragua'},
    {code:'NL',dial:'31',  name:'Países Bajos'},
    {code:'NZ',dial:'64',  name:'Nueva Zelanda'},
    {code:'PA',dial:'507', name:'Panamá'},
    {code:'PY',dial:'595', name:'Paraguay'},
    {code:'PE',dial:'51',  name:'Perú'},
    {code:'PL',dial:'48',  name:'Polonia'},
    {code:'PT',dial:'351', name:'Portugal'},
    {code:'PR',dial:'1787',name:'Puerto Rico'},
    {code:'GB',dial:'44',  name:'Reino Unido'},
    {code:'RU',dial:'7',   name:'Rusia'},
    {code:'ZA',dial:'27',  name:'Sudáfrica'},
    {code:'SE',dial:'46',  name:'Suecia'},
    {code:'CH',dial:'41',  name:'Suiza'},
    {code:'TH',dial:'66',  name:'Tailandia'},
    {code:'TR',dial:'90',  name:'Turquía'},
    {code:'UA',dial:'380', name:'Ucrania'},
    {code:'UY',dial:'598', name:'Uruguay'},
    {code:'VE',dial:'58',  name:'Venezuela'},
    {code:'VN',dial:'84',  name:'Vietnam'},
  ];

  function flagUrl(code) {
    return 'https://flagcdn.com/w40/' + (code || 'co').toLowerCase() + '.png';
  }

  function detectCountryFromBrowser() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const map = {
        'America/Bogota':'CO','America/New_York':'US','America/Chicago':'US',
        'America/Los_Angeles':'US','America/Mexico_City':'MX',
        'Europe/Madrid':'ES','America/Argentina/Buenos_Aires':'AR',
        'America/Santiago':'CL','America/Lima':'PE','America/Guayaquil':'EC',
        'America/Sao_Paulo':'BR','Europe/Paris':'FR','Europe/Berlin':'DE',
        'America/Caracas':'VE','America/Asuncion':'PY','America/La_Paz':'BO',
        'America/Montevideo':'UY','America/Panama':'PA','America/Costa_Rica':'CR',
        'America/Guatemala':'GT','America/Tegucigalpa':'HN',
        'America/Managua':'NI','America/El_Salvador':'SV',
        'America/Santo_Domingo':'DO','America/Puerto_Rico':'PR'
      };
      if (map[tz]) return map[tz];
    } catch {}
    try {
      const lang = navigator.languages?.[0] || navigator.language || 'es-CO';
      const c = lang.split('-')[1]?.toUpperCase();
      if (c && COUNTRIES.some(x => x.code === c)) return c;
    } catch {}
    return 'CO';
  }

  function createCountryPicker(containerId, opts) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const defaultCode = opts?.default || detectCountryFromBrowser();
    let selected = COUNTRIES.find(c => c.code === defaultCode)
                || COUNTRIES.find(c => c.code === 'CO');
    let isOpen = false;
    let filtered = [...COUNTRIES];

    container.classList.add('cp');
    container.innerHTML = `
      <button type="button" class="cp-btn" id="${containerId}-btn">
        <img class="cp-flag" id="${containerId}-flag"
             src="${flagUrl(selected.code)}" alt="${selected.code}">
        <span class="cp-name" id="${containerId}-name">
          ${selected.name} (+${selected.dial})
        </span>
        <svg class="cp-chevron" viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor"
                stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <div class="cp-drop" id="${containerId}-drop" style="display:none">
        <input class="cp-search" id="${containerId}-search"
               type="text" placeholder="Buscar país…" autocomplete="off">
        <div class="cp-list" id="${containerId}-list"></div>
      </div>`;

    // Cachear bandera inicial en background
    const flagEl = document.getElementById(containerId + '-flag');
    loadAssetImg(flagEl, selected.code, flagUrl(selected.code));

    function renderList() {
      const list = document.getElementById(containerId + '-list');
      if (!filtered.length) {
        list.innerHTML = '<div class="cp-empty">Sin resultados</div>';
        return;
      }
      list.innerHTML = filtered.map(c => `
        <div class="cp-item ${c.code === selected.code ? 'cp-sel' : ''}"
             data-code="${c.code}" data-dial="${c.dial}">
          <img class="cp-item-flag"
               src="${flagUrl(c.code)}" alt="${c.code}"
               loading="lazy">
          <span class="cp-item-name">${c.name}</span>
          <span class="cp-item-dial">+${c.dial}</span>
        </div>`).join('');

      // Cachear banderas visibles en background
      list.querySelectorAll('.cp-item-flag').forEach(img => {
        const code = img.alt;
        loadAssetImg(img, code, flagUrl(code));
      });

      list.querySelectorAll('.cp-item').forEach(item => {
        item.addEventListener('click', () => {
          selected = COUNTRIES.find(c => c.code === item.dataset.code);
          const fl = document.getElementById(containerId + '-flag');
          loadAssetImg(fl, selected.code, flagUrl(selected.code));
          document.getElementById(containerId + '-name').textContent =
            selected.name + ' (+' + selected.dial + ')';
          close();
          opts?.onChange?.(selected.code, selected.dial);
        });
      });
    }

    function open() {
      isOpen = true;
      filtered = [...COUNTRIES];
      document.getElementById(containerId + '-drop').style.display = '';
      container.classList.add('open');
      renderList();
      setTimeout(() =>
        document.getElementById(containerId + '-search')?.focus(), 50);
    }

    function close() {
      isOpen = false;
      document.getElementById(containerId + '-drop').style.display = 'none';
      container.classList.remove('open');
    }

    document.getElementById(containerId + '-btn')
      .addEventListener('click', () => isOpen ? close() : open());

    document.getElementById(containerId + '-search')
      .addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        filtered = COUNTRIES.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.dial.includes(q) ||
          c.code.toLowerCase().includes(q));
        renderList();
      });

    document.addEventListener('click', e => {
      if (isOpen && !container.contains(e.target)) close();
    });

    return {
      getCode: () => selected.code,
      getDial: () => selected.dial,
      setCode(code) {
        const c = COUNTRIES.find(x => x.code === code);
        if (!c) return;
        selected = c;
        const fl = document.getElementById(containerId + '-flag');
        loadAssetImg(fl, c.code, flagUrl(c.code));
        document.getElementById(containerId + '-name').textContent =
          c.name + ' (+' + c.dial + ')';
      }
    };
  }

  // ═══ CUENTAS LOCALES — device registry ═══
  const DEVICE_REGISTRY_KEY = 'device:user_registry:v2';

  function getLocalAccounts() {
    try { return JSON.parse(localStorage.getItem(DEVICE_REGISTRY_KEY) || '[]'); }
    catch { return []; }
  }

  function findLocalByPhone(countryCode, phoneDigits) {
    const digits = String(phoneDigits).replace(/\D+/g, '');
    if (!digits || digits.length < 6) return null;
    return getLocalAccounts().find(a =>
      a.countryCode === countryCode &&
      String(a.phoneDigits).replace(/\D+/g, '') === digits
    ) || null;
  }

  function saveLocalAccount(account) {
    const accounts = getLocalAccounts();
    const idx = accounts.findIndex(a => a.db_id === account.db_id);
    const prev = idx >= 0 ? accounts[idx] : {};
    const merged = {
      ...prev,
      ...account,
      name: account.name || prev.name || '',
      lastSeenAt: Date.now(),
    };
    if (idx >= 0) accounts[idx] = merged;
    else accounts.unshift(merged);
    accounts.sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
    try {
      localStorage.setItem(DEVICE_REGISTRY_KEY,
        JSON.stringify(accounts.slice(0, 20)));
    } catch {}
  }

  function createAccountsDrawer(opts) {
    function renderAccounts() {
      const list = document.getElementById('drawer-account-list');
      if (!list) return;
      const accounts = getLocalAccounts();
      if (!accounts.length) {
        list.innerHTML =
          '<div class="drawer-empty">Sin cuentas previas en este dispositivo.</div>';
        return;
      }
      list.innerHTML = accounts.map(a => `
        <div class="account-card">
          <div class="acc-avatar">${(a.name || '?')[0].toUpperCase()}</div>
          <div class="acc-info">
            <div class="acc-name">${a.name || '—'}</div>
            <div class="acc-sub">
              <img src="${flagUrl(a.countryCode || 'CO')}"
                   alt="${a.countryCode || ''}" id="acc-flag-${a.db_id}">
              +${a.countryDial || ''} ${a.phoneDigits || ''}
            </div>
          </div>
          <button class="btn-use"
                  data-dial="${a.countryDial || ''}"
                  data-phone="${a.phoneDigits || ''}"
                  data-country="${a.countryCode || 'CO'}">
            Usar
          </button>
        </div>`).join('');

      // Cachear banderas de cuentas
      accounts.forEach(a => {
        const img = document.getElementById('acc-flag-' + a.db_id);
        if (img) loadAssetImg(img, a.countryCode || 'CO',
          flagUrl(a.countryCode || 'CO'));
      });

      list.querySelectorAll('.btn-use').forEach(btn => {
        btn.addEventListener('click', () => {
          opts?.onSelect?.({
            countryDial: btn.dataset.dial,
            phoneDigits:  btn.dataset.phone,
            countryCode:  btn.dataset.country,
          });
          close();
        });
      });
    }

    function open() {
      renderAccounts();
      document.getElementById('accounts-drawer')?.classList.add('open');
      document.getElementById('drawer-overlay')?.classList.add('open');
    }

    function close() {
      document.getElementById('accounts-drawer')?.classList.remove('open');
      document.getElementById('drawer-overlay')?.classList.remove('open');
    }

    document.getElementById('drawer-overlay')
      ?.addEventListener('click', close);
    document.getElementById('drawer-close-btn')
      ?.addEventListener('click', close);
    document.getElementById('drawer-clear-btn')
      ?.addEventListener('click', () => {
        localStorage.removeItem(DEVICE_REGISTRY_KEY);
        close();
      });

    return { open, close };
  }

  // ═══ FUNCIONES BASE ═══

  function byId(id) { return document.getElementById(id); }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function show(el) { if (typeof el === 'string') el = byId(el); if (el) el.style.display = ''; }
  function hide(el) { if (typeof el === 'string') el = byId(el); if (el) el.style.display = 'none'; }

  function toggle(showId, hideId) { show(showId); hide(hideId); }

  function setIfChanged(el, text) {
    if (typeof el === 'string') el = byId(el);
    if (el && el.textContent !== String(text)) el.textContent = String(text);
  }

  function setHTMLIfChanged(el, html) {
    if (typeof el === 'string') el = byId(el);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  function computeVisibleSignature(items) {
    let s = '';
    for (const it of items) {
      s += (it.entityId || '') + ':' + (it.stateHash || '') + '|';
    }
    return s;
  }

  function setBadge(el, cls, text) {
    if (typeof el === 'string') el = byId(el);
    if (!el) return;
    el.className = 'badge ' + cls;
    el.textContent = text;
  }

  function setLog(el, msg) {
    if (typeof el === 'string') el = byId(el);
    if (el) el.textContent = msg;
  }

  function setView(viewName) {
    document.querySelectorAll('.panel-view').forEach(p => p.classList.remove('active'));
    const target = byId('view-' + viewName);
    if (target) target.classList.add('active');
  }

  function toast(msg, duration) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), duration || 3000);
  }

  global.KobaltVisual = {
    byId, esc, show, hide, toggle,
    setIfChanged, setHTMLIfChanged,
    computeVisibleSignature, setBadge, setLog,
    setView, toast,
    loadAsset, loadAssetCSS, loadAssetImg,
    COUNTRIES, flagUrl, detectCountryFromBrowser,
    createCountryPicker, getLocalAccounts, saveLocalAccount, findLocalByPhone,
    createAccountsDrawer,
  };

})(globalThis);
