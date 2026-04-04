
(function(global) {
  'use strict';

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
  };

})(globalThis);
