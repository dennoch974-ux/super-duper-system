/* ui.js — DOM-помощники, компоненты интерфейса, маршрутизация. */
(function (global) {
  'use strict';

  var C = global.CORE;

  /* ---------- построение DOM ---------- */

  function h(tag, attrs, children) {
    var parts = String(tag).split(/(?=[.#])/);
    var el = document.createElement(parts[0] || 'div');
    parts.slice(1).forEach(function (p) {
      if (p[0] === '.') el.classList.add(p.slice(1));
      else if (p[0] === '#') el.id = p.slice(1);
    });
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      children = attrs; attrs = null;
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className += (el.className ? ' ' : '') + v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    append(el, children);
    return el;
  }

  function append(el, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) { children.forEach(function (c) { append(el, c); }); return; }
    if (children instanceof Node) { el.appendChild(children); return; }
    el.appendChild(document.createTextNode(String(children)));
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- пиктограммы ---------- */

  var ICONS = {
    dashboard: 'M3 3h7v8H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 15h7v6H3z',
    edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14 7l3 3',
    calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
    table: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16',
    lock: 'M6 11h12v10H6zM9 11V8a3 3 0 0 1 6 0v3',
    unlock: 'M6 11h12v10H6zM9 11V8a3 3 0 0 1 5.6-1.5',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
    slides: 'M3 4h18v12H3zM12 16v4M8 20h8',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.9H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9.3A1.6 1.6 0 0 0 10.4 3.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.4 1h.1a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.6 1z',
    users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
    log: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
    logout: 'M16 17l5-5-5-5M21 12H9M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7',
    check: 'M4 12l5 5L20 6',
    alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7h.01',
    x: 'M6 6l12 12M18 6L6 18',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    filter: 'M3 5h18l-7 8v6l-4 2v-8z',
    refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
    file: 'M6 2h8l6 6v14H6zM14 2v6h6',
    print: 'M6 9V2h12v7M6 18H4v-7h16v7h-2M8 14h8v8H8z',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 15h8v6H8z',
    archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
    send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z'
  };

  function icon(name, cls) {
    var d = ICONS[name] || ICONS.info;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return svg;
  }

  /* Эмблема: алмазный ромб */
  function logoMark(size) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('class', 'mark');
    if (size) { svg.style.width = size + 'px'; svg.style.height = size + 'px'; }
    svg.innerHTML =
      '<path d="M24 3 43 18 24 45 5 18z" fill="none" stroke="#8fb8f2" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M5 18h38M24 3l-7 15 7 27 7-27-7-15" fill="none" stroke="#4d8ce8" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M17 18h14l-7 27z" fill="#1f6feb" fill-opacity=".35"/>';
    return svg;
  }

  /* ---------- уведомления ---------- */

  var toastHost = null;
  function toast(message, type, ms) {
    if (!toastHost) {
      toastHost = h('div.toasts');
      document.body.appendChild(toastHost);
    }
    var kind = type || 'info';
    var t = h('div.toast' + (kind !== 'info' ? '.' + kind : ''), [
      icon(kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : kind === 'warn' ? 'alert' : 'info'),
      h('div', message)
    ]);
    toastHost.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .2s, transform .2s';
      t.style.opacity = '0'; t.style.transform = 'translateX(14px)';
      setTimeout(function () { t.remove(); }, 220);
    }, ms || 3400);
  }

  /* ---------- модальные окна ---------- */

  var openModals = [];

  function modal(opts) {
    var backdrop = h('div.modal-backdrop');
    var box = h('div.modal' + (opts.width === 'wide' ? '.wide' : opts.width === 'xwide' ? '.xwide' : ''));
    var api = {
      el: box,
      close: function () {
        backdrop.remove();
        openModals = openModals.filter(function (m) { return m !== api; });
        if (opts.onClose) opts.onClose();
      }
    };
    var head = h('div.modal-head', [
      h('div', [
        h('h2', opts.title),
        opts.sub ? h('div.sub', opts.sub) : null
      ]),
      h('button.modal-close', { type: 'button', onclick: api.close, title: 'Закрыть' }, icon('x'))
    ]);
    var body = h('div.modal-body', opts.body);
    box.appendChild(head);
    box.appendChild(body);
    if (opts.foot) box.appendChild(h('div.modal-foot', opts.foot));
    backdrop.appendChild(box);
    backdrop.addEventListener('mousedown', function (e) {
      if (e.target === backdrop && opts.dismissable !== false) api.close();
    });
    document.body.appendChild(backdrop);
    openModals.push(api);
    setTimeout(function () {
      var f = box.querySelector('input,select,textarea,button.btn-primary');
      if (f) f.focus();
    }, 40);
    return api;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openModals.length) openModals[openModals.length - 1].close();
  });

  function confirmBox(opts) {
    return new Promise(function (resolve) {
      /* Ответ фиксируется один раз: закрытие окна не должно перебивать нажатие «ОК». */
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      var m = modal({
        title: opts.title,
        sub: opts.sub,
        body: typeof opts.text === 'string' ? h('div', { style: { lineHeight: '1.6' } }, opts.text) : opts.text,
        foot: [
          h('button.btn', { type: 'button', onclick: function () { finish(false); m.close(); } }, opts.cancelText || 'Отмена'),
          h('button.btn.' + (opts.danger ? 'btn-danger' : 'btn-primary'), {
            type: 'button',
            onclick: function () { finish(true); m.close(); }
          }, opts.okText || 'Подтвердить')
        ],
        onClose: function () { finish(false); }
      });
    });
  }

  function promptBox(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      var input = h('input', {
        type: opts.password ? 'password' : 'text',
        value: opts.value || '',
        placeholder: opts.placeholder || ''
      });
      var m = modal({
        title: opts.title,
        sub: opts.sub,
        body: h('div.field', [opts.label ? h('label', opts.label) : null, input,
        opts.help ? h('div.help', opts.help) : null]),
        foot: [
          h('button.btn', { type: 'button', onclick: function () { finish(null); m.close(); } }, 'Отмена'),
          h('button.btn.btn-primary', {
            type: 'button',
            onclick: function () { finish(input.value); m.close(); }
          }, opts.okText || 'Сохранить')
        ],
        onClose: function () { finish(null); }
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { finish(input.value); m.close(); }
      });
    });
  }

  /* ---------- выгрузка файлов ---------- */

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1200);
  }

  function safeFileName(s) {
    return String(s).replace(/[\\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  }

  /* ---------- отображение значений ---------- */

  function doneClass(done) {
    if (done === null || done === undefined) return '';
    if (done >= 0.98) return 'val-good';
    if (done >= 0.85) return 'val-warn';
    return 'val-bad';
  }
  function doneBarClass(done) {
    if (done === null || done === undefined) return '';
    if (done >= 0.98) return 'g';
    if (done >= 0.85) return 'a';
    return 'r';
  }
  function progress(done, big) {
    var pct = done === null || done === undefined ? 0 : Math.max(0, Math.min(1.15, done));
    return h('div.progress' + (big ? '.progress-lg' : '') + (doneBarClass(done) ? '.' + doneBarClass(done) : ''),
      h('i', { style: { width: (pct * 100 / 1.15).toFixed(1) + '%' } }));
  }
  function pctCell(done) {
    return h('span.num' + (doneClass(done) ? '.' + doneClass(done) : ''), C.fmtPct(done));
  }
  function devCell(v) {
    if (!v) return h('span.num.muted', '—');
    return h('span.num.' + (v >= 0 ? 'val-good' : 'val-bad'), C.fmtSigned(v, 'auto'));
  }
  function statusBadge(status) {
    if (status === 'closed') return h('span.badge.badge-closed', 'Закрыт');
    if (status === 'noplan') return h('span.badge.badge-none', 'Нет плана');
    return h('span.badge.badge-open', 'Открыт');
  }

  function kpi(opts) {
    return h('div.kpi' + (opts.tone ? '.k-' + opts.tone : ''), [
      h('div.k-label', opts.label),
      h('div.k-value.num', [opts.value, opts.unit ? h('span.k-unit', opts.unit) : null]),
      opts.sub ? h('div.k-sub', opts.sub) : null
    ]);
  }

  function empty(title, text, action) {
    return h('div.empty', [icon('archive'), h('h3', title), h('div.small', text), action ? h('div.mt-3', action) : null]);
  }

  function notice(kind, content) {
    return h('div.notice.notice-' + kind, [
      icon(kind === 'warn' || kind === 'danger' ? 'alert' : kind === 'success' ? 'check' : 'info'),
      h('div', content)
    ]);
  }

  function monthSelect(value, months, onChange, attrs) {
    var list = months && months.length ? months.slice() : [C.todayKey()];
    if (list.indexOf(value) < 0) list.unshift(value);
    var sel = h('select', Object.assign({
      onchange: function () { onChange(sel.value); }
    }, attrs || {}), list.map(function (m) {
      return h('option', { value: m, selected: m === value }, C.monthTitle(m));
    }));
    return sel;
  }

  /* ---------- маршрутизация ---------- */

  var Router = {
    routes: {},
    current: null,
    on: function (name, fn) { Router.routes[name] = fn; return Router; },
    go: function (name, params) {
      var q = params ? '?' + Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&') : '';
      var target = '#/' + name + q;
      if (location.hash === target) Router.refresh();   // повторный переход — перерисовываем экран
      else location.hash = target;
    },
    refresh: function () { if (Router._handle) Router._handle(); },
    parse: function () {
      var raw = location.hash.replace(/^#\/?/, '');
      var qi = raw.indexOf('?');
      var name = qi >= 0 ? raw.slice(0, qi) : raw;
      var params = {};
      if (qi >= 0) {
        raw.slice(qi + 1).split('&').forEach(function (kv) {
          if (!kv) return;
          var p = kv.split('=');
          params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
        });
      }
      return { name: name || '', params: params };
    },
    /* Защита от потери несохранённых данных.
       Экран с формой ввода выставляет Router.guard — функцию, которая
       возвращает true, пока есть несохранённые изменения. */
    guard: null,
    _prev: null,
    _revert: false,
    _leave: false,

    askLeave: function (intended) {
      confirmBox({
        title: 'Есть несохранённые данные',
        text: 'Внесённые объёмы ещё не сохранены. Если перейти в другой раздел, они будут потеряны.',
        okText: 'Уйти без сохранения', cancelText: 'Остаться и сохранить', danger: true
      }).then(function (leave) {
        if (!leave) return;
        Router.guard = null;
        Router._leave = true;
        location.hash = intended;
      });
    },

    start: function (fallback) {
      function handle() {
        /* Возврат на прежний адрес после отказа от перехода — экран не перерисовываем,
           чтобы сохранить уже введённые значения. */
        if (Router._revert) { Router._revert = false; Router._prev = location.hash; return; }

        var target = location.hash;
        if (!Router._leave && Router.guard && Router._prev !== null &&
          target !== Router._prev && Router.guard()) {
          Router._revert = true;
          location.hash = Router._prev;
          Router.askLeave(target);
          return;
        }
        Router._leave = false;
        Router.guard = null;
        Router._prev = location.hash;

        var r = Router.parse();
        var fn = Router.routes[r.name] || Router.routes[fallback];
        Router.current = r;
        if (fn) fn(r.params);
      }
      Router._handle = handle;
      if (Router._bound) window.removeEventListener('hashchange', Router._bound);
      Router._bound = handle;
      window.addEventListener('hashchange', handle);
      window.onbeforeunload = function () {
        return (Router.guard && Router.guard()) ? 'Есть несохранённые изменения' : null;
      };
      handle();
    }
  };

  /* ---------- прочее ---------- */

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
    };
  }

  function spinnerOverlay(text) {
    var m = modal({
      title: text || 'Выполняется операция…',
      dismissable: false,
      body: h('div', { style: { padding: '10px 0', color: 'var(--muted)' } }, 'Пожалуйста, подождите.')
    });
    m.el.querySelector('.modal-close').style.display = 'none';
    return m;
  }

  global.UI = {
    h: h, clear: clear, $: $, $$: $$, append: append,
    icon: icon, logoMark: logoMark, toast: toast, modal: modal,
    confirm: confirmBox, prompt: promptBox,
    downloadBlob: downloadBlob, safeFileName: safeFileName,
    doneClass: doneClass, doneBarClass: doneBarClass, progress: progress,
    pctCell: pctCell, devCell: devCell, statusBadge: statusBadge,
    kpi: kpi, empty: empty, notice: notice, monthSelect: monthSelect,
    Router: Router, debounce: debounce, spinnerOverlay: spinnerOverlay
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
