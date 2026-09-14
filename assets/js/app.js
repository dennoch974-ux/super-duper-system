/* app.js — точка входа: авторизация, каркас, навигация. */
(function (global) {
  'use strict';

  var C = global.CORE, UI = global.UI;
  var h = UI.h, Router = UI.Router;

  var APP_TITLE = 'Учёт объёмов дорожных работ';

  /* ===================== ЭКРАН ВХОДА ===================== */

  function renderLogin(errorText) {
    document.body.className = 'is-login';
    var db = C.Data.db();
    var root = UI.clear(document.getElementById('root'));

    var sites = C.Data.sites();
    var select = h('select', { id: 'login-user' }, [
      h('optgroup', { label: 'Участки' }, sites.map(function (s) {
        return h('option', { value: s.id }, s.name + ' (' + s.code + ')');
      })),
      h('optgroup', { label: 'Управление' }, [
        h('option', { value: 'admin' }, 'Администратор системы'),
        db.settings.viewerEnabled ? h('option', { value: 'viewer' }, 'Руководство — только просмотр') : null
      ].filter(Boolean))
    ]);
    var pwd = h('input', { type: 'password', id: 'login-pwd', placeholder: '••••••••', autocomplete: 'current-password' });
    var errBox = errorText ? h('div.login-error', errorText) : null;

    function submit(e) {
      if (e) e.preventDefault();
      var res = C.Auth.login(select.value, pwd.value);
      if (!res.ok) { renderLogin(res.error); return; }
      location.hash = '';
      boot();
    }

    var totalKm = 0;
    sites.forEach(function (s) {
      var m = String(s.roads || '').match(/(\d+)\s*км/g) || [];
      m.forEach(function (x) { totalKm += parseInt(x, 10) || 0; });
    });
    var staff = sites.reduce(function (a, s) { return a + (s.staff || 0); }, 0);

    root.appendChild(h('div.login-wrap', [
      h('div.login-hero', [
        h('div.login-brand', [
          UI.logoMark(),
          h('div.login-brand-text', [h('b', db.settings.org), h('span', db.settings.dept)])
        ]),
        h('div', [
          h('div.login-rule'),
          h('div.login-title', 'Учёт объёмов дорожных работ'),
          h('div.login-sub', 'Ежедневный и еженедельный ввод выполненных объёмов по участкам, ' +
            'месячные своды, закрытие периода и формирование отчётных презентаций.'),
          h('div.login-facts', [
            h('div.login-fact', [h('b', String(sites.length)), h('span', 'дорожных участков')]),
            h('div.login-fact', [h('b', C.fmtNum(staff, 0)), h('span', 'человек в штате')]),
            h('div.login-fact', [h('b', C.fmtNum(totalKm, 0)), h('span', 'км в обслуживании')])
          ])
        ]),
        h('div.login-foot', 'Данные хранятся локально в браузере рабочего места. ' +
          'Для передачи в управление используйте выгрузку пакета данных.')
      ]),
      h('div.login-panel', h('form.login-card', { onsubmit: submit }, [
        h('h2', 'Вход в систему'),
        h('div.hint', 'Выберите участок и введите пароль, выданный администратором.'),
        errBox,
        h('div.field', [h('label', { for: 'login-user' }, 'Участок или роль'), select]),
        h('div.field', [h('label', { for: 'login-pwd' }, 'Пароль'), pwd]),
        h('button.btn.btn-primary.btn-lg', { type: 'submit' }, 'Войти'),
        h('div.login-note', [
          h('div', 'Пароль по умолчанию для участка — его код на латинице и год через дефис (например, ldu-2026).'),
          h('div.mt-1', 'Администратор: пароль muad-admin. Смените пароли при первом входе.')
        ])
      ]))
    ]));
    setTimeout(function () { pwd.focus(); }, 60);
  }

  /* ===================== КАРКАС ===================== */

  var NAV = {
    site: [
      { group: 'Работа участка' },
      { id: 'site-dash', title: 'Обзор', icon: 'dashboard' },
      { id: 'site-entry', title: 'Внести объёмы', icon: 'edit' },
      { id: 'site-month', title: 'Месячная таблица', icon: 'table' },
      { group: 'Отчётность' },
      { id: 'site-summary', title: 'Свод за месяц', icon: 'chart' },
      { id: 'site-close', title: 'Закрытие месяца', icon: 'lock' },
      { group: 'Прочее' },
      { id: 'site-data', title: 'Передача данных', icon: 'send' },
      { id: 'site-settings', title: 'Пароль и профиль', icon: 'settings' }
    ],
    admin: [
      { group: 'Аналитика' },
      { id: 'admin-dash', title: 'Обзор по управлению', icon: 'dashboard' },
      { id: 'admin-summary', title: 'Своды и выгрузки', icon: 'chart' },
      { id: 'admin-reports', title: 'Отчёты и презентации', icon: 'slides' },
      { group: 'Планирование' },
      { id: 'admin-plans', title: 'Планы по участкам', icon: 'upload' },
      { id: 'admin-months', title: 'Статусы периодов', icon: 'calendar' },
      { group: 'Администрирование' },
      { id: 'admin-sites', title: 'Участки и доступы', icon: 'users' },
      { id: 'admin-works', title: 'Справочник работ', icon: 'file' },
      { id: 'admin-contracts', title: 'Контракты и объекты', icon: 'shield' },
      { id: 'admin-data', title: 'Данные и копии', icon: 'archive' },
      { id: 'admin-audit', title: 'Журнал действий', icon: 'log' }
    ],
    viewer: [
      { group: 'Аналитика' },
      { id: 'admin-dash', title: 'Обзор по управлению', icon: 'dashboard' },
      { id: 'admin-summary', title: 'Своды и выгрузки', icon: 'chart' },
      { id: 'admin-reports', title: 'Отчёты и презентации', icon: 'slides' },
      { id: 'admin-months', title: 'Статусы периодов', icon: 'calendar' }
    ]
  };

  function renderShell() {
    document.body.className = '';
    var s = C.Auth.current();
    var db = C.Data.db();
    var root = UI.clear(document.getElementById('root'));

    var navItems = NAV[s.role] || [];
    var navEl = h('nav.nav', navItems.map(function (it) {
      if (it.group) return h('div.nav-group', it.group);
      return h('button.nav-item', {
        type: 'button', dataset: { route: it.id },
        onclick: function () { Router.go(it.id); }
      }, [UI.icon(it.icon), h('span', it.title), it.badge ? h('span.badge-dot', it.badge) : null]);
    }));

    var site = s.siteId ? C.Data.site(s.siteId) : null;

    var shell = h('div.app', [
      h('aside.sidebar', [
        h('div.sidebar-head', [
          UI.logoMark(),
          h('div', [h('b', db.settings.deptShort), h('span', db.settings.org)])
        ]),
        h('div.who', [
          h('div.role', s.role === 'admin' ? 'Администратор' : s.role === 'viewer' ? 'Просмотр' : 'Ответственный за участок'),
          h('div.name', s.title),
          site ? h('div.sub', site.chief) : null
        ]),
        navEl,
        h('div.sidebar-foot', [
          h('button.btn.btn-sm', {
            type: 'button',
            onclick: function () {
              C.Auth.logout();
              renderLogin();
            }
          }, [UI.icon('logout'), 'Выйти из системы']),
          h('div', 'Версия 1.0 · данные хранятся локально')
        ])
      ]),
      h('main.main', [
        h('header.topbar', [
          h('div', [h('div.crumbs#crumbs'), h('h1#page-title', APP_TITLE)]),
          h('div.spacer'),
          h('div.row#page-actions')
        ]),
        h('div.content#content')
      ])
    ]);
    root.appendChild(shell);
  }

  function setPage(title, crumbs, actions) {
    var t = document.getElementById('page-title');
    if (t) t.textContent = title;
    var c = document.getElementById('crumbs');
    if (c) c.textContent = crumbs || '';
    var a = document.getElementById('page-actions');
    if (a) {
      UI.clear(a);
      if (actions) UI.append(a, actions);
    }
    UI.$$('.nav-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.route === (Router.current && Router.current.name));
    });
    var content = document.getElementById('content');
    if (content) { UI.clear(content); content.scrollTop = 0; window.scrollTo(0, 0); }
    return content;
  }

  /* ===================== ЗАПУСК ===================== */

  function boot() {
    var s = C.Auth.current();
    if (!s) { renderLogin(); return; }

    renderShell();

    Router.routes = {};
    if (s.role === 'site') {
      global.VIEWS_SITE.register(Router, setPage);
      Router.start('site-dash');
      if (!Router.current || !Router.current.name) Router.go('site-dash');
    } else {
      global.VIEWS_ADMIN.register(Router, setPage);
      Router.start('admin-dash');
      if (!Router.current || !Router.current.name) Router.go('admin-dash');
    }
  }

  function checkEnvironment() {
    var problems = [];
    if (typeof DecompressionStream === 'undefined' || typeof CompressionStream === 'undefined') {
      problems.push('Браузер не поддерживает потоковое сжатие (CompressionStream). Загрузка файлов Excel и выгрузка отчётов работать не будут. Используйте актуальную версию Chrome, Edge, Яндекс.Браузера или Firefox.');
    }
    try {
      localStorage.setItem('__probe', '1'); localStorage.removeItem('__probe');
    } catch (e) {
      problems.push('Браузер блокирует локальное хранилище. Данные не сохранятся между сеансами. Отключите режим инкогнито или разрешите хранение данных для этой страницы.');
    }
    if (problems.length) {
      var box = h('div', {
        style: {
          position: 'fixed', left: '16px', right: '16px', bottom: '16px', zIndex: '500',
          background: '#fdeaea', border: '1px solid #f3c6c6', color: '#97231f',
          padding: '14px 18px', borderRadius: '10px', fontSize: '13px', lineHeight: '1.5'
        }
      }, problems.map(function (p) { return h('div', p); }));
      document.body.appendChild(box);
    }
  }

  global.APP = { boot: boot, renderLogin: renderLogin, setPage: setPage };

  document.addEventListener('DOMContentLoaded', function () {
    checkEnvironment();
    boot();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
