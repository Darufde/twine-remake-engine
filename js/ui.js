// Small UI helpers: element builder, pop-up windows, notifications, downloads.
(function () {
  const TR = window.TR;

  // h('div', { class: 'x', onclick: fn }, child, 'text', [more children])
  TR.h = function h(tag, props, ...children) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    children.forEach(add);
    return el;
  };
  const h = TR.h;

  TR.debounce = (fn, ms) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  let toastTimer;
  TR.toast = (msg, ms = 2600) => {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  };

  TR.download = (filename, text, type = 'text/html') => {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  TR.safeFileName = (s) => (String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'story');

  // A pop-up window. buttons: [{ label, kind: 'primary'|'danger', onClick }]
  // onClick may return false to keep the window open.
  TR.modal = ({ title, body, buttons = [{ label: 'Close' }], wide = false, onClose }) => {
    const root = document.getElementById('modal-root');
    const close = () => {
      // Let a half-typed field save itself (its "change" event) before it disappears.
      if (overlay.contains(document.activeElement)) document.activeElement.blur();
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === overlay) close(); };
    const footer = h('div', { class: 'modal-foot' }, buttons.map((b) =>
      h('button', {
        class: 'btn' + (b.kind ? ' btn-' + b.kind : ''),
        type: 'button',
        onclick: () => { if (!b.onClick || b.onClick() !== false) close(); },
      }, b.label)));
    const box = h('div', { class: 'modal' + (wide ? ' modal-wide' : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' }, h('h2', { text: title }), h('button', { class: 'icon-btn', title: 'Close', onclick: close }, '✕')),
      h('div', { class: 'modal-body' }, body),
      footer);
    const overlay = h('div', { class: 'modal-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } }, box);
    root.appendChild(overlay);
    document.addEventListener('keydown', onKey);
    const first = box.querySelector('input, select, textarea');
    if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
    return { close, box };
  };

  TR.confirmBox = (message, okLabel = 'Yes', kind = 'danger') => new Promise((resolve) => {
    let answered = false;
    TR.modal({
      title: 'Are you sure?',
      body: h('p', { text: message }),
      buttons: [
        { label: 'Cancel' },
        { label: okLabel, kind, onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });

  TR.askText = ({ title, label, value = '', okLabel = 'OK', hint }) => new Promise((resolve) => {
    let answered = false;
    const input = h('input', { class: 'input', type: 'text', value });
    const ok = () => { answered = true; resolve(input.value.trim()); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { ok(); m.close(); } });
    const m = TR.modal({
      title,
      body: h('label', { class: 'field' }, h('span', { text: label }), input, hint ? h('small', { class: 'hint', text: hint }) : null),
      buttons: [{ label: 'Cancel' }, { label: okLabel, kind: 'primary', onClick: ok }],
      onClose: () => { if (!answered) resolve(null); },
    });
  });

  // A dropdown menu attached to a button.
  TR.menu = (anchor, items) => {
    document.querySelectorAll('.menu').forEach((m) => m.remove());
    const r = anchor.getBoundingClientRect();
    let away = null;
    const close = () => {
      menu.remove();
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
    const menu = h('div', { class: 'menu' },
      items.map((it) => h('button', { type: 'button', class: 'menu-item', onclick: () => { close(); it.onClick(); } },
        h('strong', { text: it.label }), it.hint ? h('small', { text: it.hint }) : null)));
    document.body.appendChild(menu);
    // Keep the menu on screen: open upward if there is no room below.
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    const top = r.bottom + 4 + mh > window.innerHeight ? Math.max(8, r.top - 4 - mh) : r.bottom + 4;
    menu.style.top = top + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8)) + 'px';
    away = (e) => { if (!menu.contains(e.target)) close(); };
    setTimeout(() => {
      if (!menu.isConnected) return;
      document.addEventListener('pointerdown', away, true);
      window.addEventListener('resize', close);
      document.addEventListener('scroll', close, true);
    }, 0);
  };
})();
