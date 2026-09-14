/* views-admin.js — экраны администратора и руководства. */
(function (global) {
  'use strict';

  var C = global.CORE, UI = global.UI, R = global.REPORTS, PI = global.PLANIMPORT,
    XL = global.XLSXLite, T = global.TEMPLATES;
  var h = UI.h;
  var setPage;

  function isAdmin() { return C.Auth.isAdmin(); }
  function allSiteIds() { return C.Data.sites().map(function (s) { return s.id; }); }

  /* ---------- выбор периода ---------- */

  function periodPicker(from, to, onChange) {
    var months = C.Data.allMonths().slice().sort();
    if (months.indexOf(from) < 0) months.unshift(from);
    if (months.indexOf(to) < 0) months.push(to);
    months = months.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();

    var selFrom = UI.monthSelect(from, months, function (v) { onChange(v, to); }, { style: { minWidth: '150px' } });
    var selTo = UI.monthSelect(to, months, function (v) { onChange(from, v); }, { style: { minWidth: '150px' } });
    return h('div.toolbar', [
      h('span.small.muted', 'Период с'), selFrom,
      h('span.small.muted', 'по'), selTo,
      h('button.btn.btn-sm', {
        type: 'button', onclick: function () { var t = C.todayKey(); onChange(t, t); }
      }, 'Текущий месяц'),
      h('button.btn.btn-sm', {
        type: 'button',
        onclick: function () {
          var t = C.todayKey();
          onChange(C.parseMonth(t).year + '-01', t);
        }
      }, 'С начала года')
    ]);
  }

  function siteFilter(selected, onChange) {
    var sites = C.Data.sites();
    var sel = h('select', {
      onchange: function () { onChange(sel.value); }, style: { minWidth: '230px' }
    }, [h('option', { value: 'all', selected: selected === 'all' }, 'Все участки (' + sites.length + ')')]
      .concat(sites.map(function (s) {
        return h('option', { value: s.id, selected: s.id === selected }, s.name);
      })));
    return sel;
  }

  function resolveSites(filter) {
    return filter && filter !== 'all' ? [filter] : allSiteIds();
  }

  /* ===================== ОБЗОР ПО УПРАВЛЕНИЮ ===================== */

  function viewDash(params) {
    var month = params.month || C.todayKey();
    var sites = C.Data.sites();
    var agg = C.Calc.aggregate(sites.map(function (s) { return s.id; }), [month]);
    var content = setPage('Обзор по управлению', C.Data.db().settings.dept + ' · ' + C.monthTitle(month), [
      h('button.btn.btn-sm', {
        type: 'button', onclick: function () { UI.Router.go('admin-reports', { from: month, to: month }); }
      }, [UI.icon('slides'), 'Сформировать отчёт'])
    ]);

    var closed = sites.filter(function (s) { return C.Data.closure(s.id, month).status === 'closed'; }).length;
    var noPlan = sites.filter(function (s) { return !C.Data.plan(s.id, month); }).length;

    content.appendChild(h('div.row.between.wrap.mb-3', [
      h('div.toolbar', [
        h('button.btn.btn-icon', { type: 'button', onclick: function () { UI.Router.go('admin-dash', { month: C.shiftMonth(month, -1) }); } }, '‹'),
        UI.monthSelect(month, C.Data.allMonths(), function (m) { UI.Router.go('admin-dash', { month: m }); }, { style: { minWidth: '170px' } }),
        h('button.btn.btn-icon', { type: 'button', onclick: function () { UI.Router.go('admin-dash', { month: C.shiftMonth(month, 1) }); } }, '›')
      ]),
      h('div.row', [
        closed === sites.length
          ? h('span.badge.badge-closed', 'Период закрыт всеми участками')
          : h('span.badge.badge-open', 'Закрыто ' + closed + ' из ' + sites.length)
      ])
    ]));

    if (noPlan) {
      content.appendChild(h('div.mb-3', UI.notice('warn', [
        h('b', 'Планы не загружены по ' + noPlan + ' ' + C.plural(noPlan, 'участку', 'участкам', 'участкам') + '. '),
        h('a', {
          href: '#', onclick: function (e) { e.preventDefault(); UI.Router.go('admin-plans', { month: month }); }
        }, 'Перейти к загрузке планов')
      ])));
    }

    var reopenReq = [];
    sites.forEach(function (s) {
      var cl = C.Data.closure(s.id, month);
      (cl.requests || []).forEach(function (r) {
        if (r.status === 'new') reopenReq.push({ site: s, req: r });
      });
    });
    if (reopenReq.length) {
      content.appendChild(h('div.mb-3', UI.notice('info', [
        h('b', 'Запросы на переоткрытие периода: ' + reopenReq.length + '. '),
        h('a', {
          href: '#', onclick: function (e) { e.preventDefault(); UI.Router.go('admin-months'); }
        }, 'Рассмотреть')
      ])));
    }

    content.appendChild(h('div.grid.grid-4.mb-3', [
      UI.kpi({ label: 'План месяца', value: C.fmtNum(agg.totals.plan, 0), unit: 'усл. ед.', tone: 'navy' }),
      UI.kpi({
        label: 'Факт месяца', value: C.fmtNum(agg.totals.fact, 0), unit: 'усл. ед.',
        sub: 'Отклонение: ' + C.fmtSigned(agg.totals.deviation, 0)
      }),
      UI.kpi({
        label: 'Выполнение плана', value: C.fmtPct(agg.totals.done),
        tone: agg.totals.done >= 0.98 ? 'green' : agg.totals.done >= 0.85 ? 'amber' : 'red',
        sub: 'Позиций в своде: ' + agg.works.length
      }),
      UI.kpi({
        label: 'Закрыто участков', value: closed + ' / ' + sites.length,
        tone: closed === sites.length ? 'green' : 'amber',
        sub: closed === sites.length ? 'Можно формировать окончательный отчёт' : 'Отчёт будет предварительным'
      })
    ]));

    var rows = agg.sites.map(function (b) {
      var site = C.Data.site(b.siteId);
      var sm = C.Calc.siteMonth(b.siteId, month);
      var cl = C.Data.closure(b.siteId, month);
      return h('tr', [
        h('td', [h('div.strong', site.name), h('div.tiny.muted', site.chief)]),
        h('td.n', C.fmtNum(b.plan, 0)),
        h('td.n', C.fmtNum(b.fact, 0)),
        h('td.n', UI.devCell(b.deviation)),
        h('td.n', UI.pctCell(b.done)),
        h('td', { style: { minWidth: '130px' } }, UI.progress(b.done)),
        h('td.c.small', sm.filledDays.length + ' / ' + sm.days),
        h('td.c', UI.statusBadge(!sm.hasPlan ? 'noplan' : cl.status)),
        h('td.small.muted', sm.updatedAt ? C.fmtDateTimeRu(sm.updatedAt) : '—'),
        h('td', h('button.btn.btn-sm', {
          type: 'button',
          onclick: function () { UI.Router.go('admin-summary', { from: month, to: month, site: b.siteId }); }
        }, 'Свод'))
      ]);
    });

    content.appendChild(h('div.card', [
      h('div.card-head', [
        h('div', [h('h2', 'Выполнение по участкам'), h('div.sub', C.monthTitle(month))]),
        h('div.spacer'),
        h('button.btn.btn-sm', {
          type: 'button',
          onclick: function () { exportSummaryFile(allSiteIds(), [month]); }
        }, [UI.icon('download'), 'Выгрузить свод'])
      ]),
      h('div.card-body.tight', h('div.table-wrap', h('table.tbl', [
        h('thead', h('tr', [
          h('th', 'Участок'), h('th.n', 'План'), h('th.n', 'Факт'), h('th.n', 'Отклонение'),
          h('th.n', 'Выполнение'), h('th', ''), h('th.c', 'Дней'), h('th.c', 'Статус'),
          h('th', 'Обновлено'), h('th', '')
        ])),
        h('tbody', rows.concat([
          h('tr.row-total', [
            h('td', 'ИТОГО по управлению'),
            h('td.n', C.fmtNum(agg.totals.plan, 0)),
            h('td.n', C.fmtNum(agg.totals.fact, 0)),
            h('td.n', UI.devCell(agg.totals.deviation)),
            h('td.n', UI.pctCell(agg.totals.done)),
            h('td', UI.progress(agg.totals.done)),
            h('td'), h('td'), h('td'), h('td')
          ])
        ]))
      ])))
    ]));

    var top = agg.works.slice(0, 12);
    content.appendChild(h('div.card.mt-3', [
      h('div.card-head', h('div', [h('h2', 'Выполнение по видам работ'),
      h('div.sub', 'Натуральные единицы измерения, свод по всем участкам')])),
      h('div.card-body.tight', h('div.table-wrap', h('table.tbl.compact', [
        h('thead', h('tr', [h('th.col-name', 'Вид работ'), h('th.c', 'Ед. изм.'), h('th.n', 'План'),
        h('th.n', 'Факт'), h('th.n', 'Отклонение'), h('th.n', 'Выполнение'), h('th', '')])),
        h('tbody', top.map(function (w) {
          return h('tr', [
            h('td.col-name', w.work),
            h('td.c.small', C.prettyUnit(w.unit)),
            h('td.n', C.fmtNum(w.plan, 'auto')),
            h('td.n', C.fmtNum(w.fact, 'auto')),
            h('td.n', UI.devCell(w.deviation)),
            h('td.n', UI.pctCell(w.done)),
            h('td', { style: { minWidth: '120px' } }, UI.progress(w.done))
          ]);
        }))
      ])))
    ]));
  }

  /* ===================== ЗАГРУЗКА ПЛАНОВ ===================== */

  var pendingRecs = [];

  function viewPlans(params) {
    var month = params.month || C.todayKey();
    var content = setPage('Планы по участкам', 'Загрузка и актуализация месячных планов', [
      h('button.btn.btn-sm', { type: 'button', onclick: function () { downloadTemplate(month); } },
        [UI.icon('download'), 'Скачать шаблон'])
    ]);

    if (!isAdmin()) { content.appendChild(UI.notice('warn', 'Раздел доступен только администратору.')); return; }

    var monthSel = UI.monthSelect(month, futureMonths(), function (m) {
      UI.Router.go('admin-plans', { month: m });
    }, { style: { minWidth: '170px' } });

    var fileInput = h('input', {
      type: 'file', accept: '.xlsx,.xlsm', multiple: true, style: { display: 'none' },
      onchange: function (e) { handleFiles(e.target.files, month); e.target.value = ''; }
    });

    var drop = h('div.dropzone', {
      onclick: function () { fileInput.click(); },
      ondragover: function (e) { e.preventDefault(); drop.classList.add('over'); },
      ondragleave: function () { drop.classList.remove('over'); },
      ondrop: function (e) {
        e.preventDefault(); drop.classList.remove('over');
        handleFiles(e.dataTransfer.files, month);
      }
    }, [
      UI.icon('upload'),
      h('b', 'Перетащите файлы планов или нажмите для выбора'),
      h('span', 'Форматы .xlsx: один файл с листами по участкам либо отдельные файлы. ' +
        'Названия файлов и листов — произвольные, участок определяется автоматически.')
    ]);

    content.appendChild(h('div.card.mb-3', [
      h('div.card-head', [
        h('div', [h('h2', 'Загрузка планов'), h('div.sub', 'Планы будут отнесены к выбранному месяцу')]),
        h('div.spacer'),
        h('span.small.muted', 'Отнести к месяцу:'), monthSel
      ]),
      h('div.card-body', [drop, fileInput, h('div#rec-list.mt-3')])
    ]));

    renderLoadedPlans(content, month);
  }

  function futureMonths() {
    var t = C.todayKey();
    var out = [];
    for (var i = -14; i <= 6; i++) out.push(C.shiftMonth(t, i));
    return out;
  }

  function handleFiles(fileList, month) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var host = document.getElementById('rec-list');
    UI.clear(host).appendChild(h('div.muted', 'Распознавание файлов…'));
    pendingRecs = [];

    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        return PI.recognizeFile(f, XL).then(function (recs) {
          recs.forEach(function (r) {
            r.targetMonth = r.month || month;
            r.targetSite = r.site ? r.site.id : '';
            r.selected = !!(r.site && r.rows.length);
            pendingRecs.push(r);
          });
        }).catch(function (e) {
          console.error(e);
          pendingRecs.push({ id: C.uid('err'), fileName: f.name, sheetName: '—', error: e.message, rows: [], warnings: [] });
        });
      });
    });

    chain.then(function () { renderRecs(month); });
  }

  function renderRecs(month) {
    var host = UI.clear(document.getElementById('rec-list'));
    if (!pendingRecs.length) return;

    var ok = pendingRecs.filter(function (r) { return !r.error && r.rows.length; });
    var bad = pendingRecs.filter(function (r) { return r.error || !r.rows.length; });

    host.appendChild(h('div.row.between.mb-2', [
      h('h3', 'Распознано листов: ' + pendingRecs.length +
        (bad.length ? ' (с ошибками: ' + bad.length + ')' : '')),
      h('div.row', [
        h('button.btn.btn-sm', {
          type: 'button', onclick: function () { pendingRecs = []; renderRecs(month); }
        }, 'Очистить'),
        h('button.btn.btn-primary', {
          type: 'button', onclick: function () { applyRecs(month); }
        }, [UI.icon('check'), 'Загрузить выбранные'])
      ])
    ]));

    var table = h('table.tbl.compact', [
      h('thead', h('tr', [
        h('th', { style: { width: '34px' } }, ''),
        h('th', 'Файл / лист'),
        h('th', 'Участок'),
        h('th', 'Месяц'),
        h('th.c', 'Формат'),
        h('th.n', 'Строк'),
        h('th.n', 'Итого'),
        h('th', 'Замечания'),
        h('th', '')
      ])),
      h('tbody', pendingRecs.map(function (r) { return recRow(r, month); }))
    ]);
    host.appendChild(h('div.table-wrap', table));
  }

  function recRow(r, month) {
    if (r.error) {
      return h('tr', [
        h('td'),
        h('td', [h('div.strong', r.fileName), h('div.tiny.muted', 'не удалось прочитать')]),
        h('td', { colspan: 6 }, h('span.val-bad', r.error)),
        h('td')
      ]);
    }
    var cb = h('input', {
      type: 'checkbox', checked: r.selected,
      onchange: function () { r.selected = cb.checked; }
    });
    var siteSel = h('select', {
      onchange: function () { r.targetSite = siteSel.value; r.selected = !!siteSel.value; cb.checked = r.selected; }
    }, [h('option', { value: '' }, '— выберите участок —')].concat(
      C.Data.sites().map(function (s) {
        return h('option', { value: s.id, selected: s.id === r.targetSite }, s.name);
      })));
    var monthSel = UI.monthSelect(r.targetMonth || month, futureMonths(), function (v) { r.targetMonth = v; });

    var exists = r.targetSite && C.Data.plan(r.targetSite, r.targetMonth || month);

    return h('tr', [
      h('td.c', cb),
      h('td', [
        h('div.strong', r.sheetName),
        h('div.tiny.muted', r.fileName),
        r.siteSource ? h('div.tiny.muted', 'участок определён: ' + r.siteSource) : null
      ]),
      h('td', siteSel),
      h('td', monthSel),
      h('td.c.small', [
        r.format === 'daily' ? 'по дням' : 'итог за месяц',
        r.transposed ? h('div.tiny.muted', 'транспонирован') : null
      ]),
      h('td.n', String(r.rows.length)),
      h('td.n', C.fmtNum(r.total, 0)),
      h('td.small', [
        exists ? h('div', h('span.badge.badge-info.no-dot', 'план уже загружен — будет заменён')) : null,
        r.warnings.length ? h('div.muted', r.warnings.length + ' ' +
          C.plural(r.warnings.length, 'замечание', 'замечания', 'замечаний')) : h('div.muted', 'без замечаний')
      ]),
      h('td', h('button.btn.btn-sm', {
        type: 'button', onclick: function () { previewRec(r); }
      }, 'Просмотр'))
    ]);
  }

  function previewRec(r) {
    var dim = C.daysInMonth(r.targetMonth || C.todayKey());
    var head = [h('th.col-name', 'Вид работ'), h('th.c', 'Ед. изм.'), h('th.n', 'Итого')];
    if (r.format === 'daily') for (var d = 1; d <= dim; d++) head.push(h('th.day-head', String(d)));

    var curObj = null, body = [];
    r.rows.forEach(function (row) {
      if (row.object !== curObj) {
        curObj = row.object;
        body.push(h('tr.row-group', h('td', { colspan: 3 + (r.format === 'daily' ? dim : 0) },
          curObj || 'Без привязки к объекту')));
      }
      var cells = [
        h('td.col-name', row.work),
        h('td.c.small', C.prettyUnit(row.unit)),
        h('td.n.strong', C.fmtNum(row.total, 'auto'))
      ];
      if (r.format === 'daily') {
        for (var dd = 1; dd <= dim; dd++) {
          cells.push(h('td.day-cell', h('div', {
            style: { padding: '4px', textAlign: 'right', fontSize: '12px' }
          }, row.days[dd] ? C.fmtNum(row.days[dd], 'auto') : '')));
        }
      }
      body.push(h('tr', cells));
    });

    UI.modal({
      title: 'Предпросмотр плана',
      sub: r.fileName + ' · лист «' + r.sheetName + '» · ' +
        (r.site ? r.site.name : 'участок не определён') + ' · ' + C.monthTitle(r.targetMonth),
      width: 'xwide',
      body: h('div', [
        h('div.row.wrap.mb-2.small.muted', [
          h('span', 'Шапка в строке ' + r.headerRow),
          h('span', '· колонка наименования: ' + XL.colName(r.nameCol)),
          h('span', r.unitCol != null ? '· колонка единиц: ' + XL.colName(r.unitCol) : '· колонка единиц не найдена'),
          h('span', '· распознано дней: ' + r.dayCount),
          r.skipped ? h('span', '· пропущено служебных строк: ' + r.skipped) : null
        ]),
        r.warnings.length ? h('div.mb-2', r.warnings.map(function (w) { return UI.notice('warn', w); })) : null,
        h('div.table-wrap.tall', h('table.tbl.compact', [h('thead', h('tr', head)), h('tbody', body)]))
      ]),
      foot: [h('button.btn.btn-primary', { type: 'button', onclick: function () { UI.$('.modal-close').click(); } }, 'Закрыть')]
    });
  }

  function applyRecs(month) {
    var sel = pendingRecs.filter(function (r) { return r.selected && r.targetSite && r.rows.length; });
    if (!sel.length) { UI.toast('Не выбрано ни одного листа для загрузки', 'warn'); return; }

    var conflicts = sel.filter(function (r) { return C.Data.plan(r.targetSite, r.targetMonth || month); });
    var proceed = conflicts.length
      ? UI.confirm({
        title: 'Заменить существующие планы?',
        text: h('div', [
          h('p', 'Планы уже загружены для ' + conflicts.length + ' ' +
            C.plural(conflicts.length, 'участка', 'участков', 'участков') + ':'),
          h('ul', conflicts.map(function (r) {
            return h('li', C.Data.siteName(r.targetSite) + ' · ' + C.monthTitle(r.targetMonth || month));
          })),
          UI.notice('info', 'Внесённые участками фактические объёмы сохранятся: они привязаны к видам работ, а не к версии плана.')
        ]),
        okText: 'Заменить планы'
      })
      : Promise.resolve(true);

    proceed.then(function (ok) {
      if (!ok) return;
      var n = 0;
      sel.forEach(function (r) {
        var mk = r.targetMonth || month;
        var prev = C.Data.plan(r.targetSite, mk);
        var plan = PI.buildPlan(r.targetSite, mk, r, {
          user: C.Auth.current().title,
          revision: prev ? (prev.revision || 1) + 1 : 1,
          source: r.fileName + ' / ' + r.sheetName
        });
        C.Data.setPlan(r.targetSite, mk, plan);
        C.Data.audit(prev ? 'Замена плана' : 'Загрузка плана',
          C.Data.siteName(r.targetSite) + ' · ' + C.monthTitle(mk) +
          ' · позиций: ' + plan.rows.length + ' · итого: ' + C.fmtNum(plan.total, 0) +
          ' · источник: ' + plan.source);
        n++;
      });
      pendingRecs = [];
      UI.toast('Загружено планов: ' + n, 'ok');
      UI.Router.go('admin-plans', { month: month });
    });
  }

  function renderLoadedPlans(content, month) {
    var sites = C.Data.sites();
    var rows = sites.map(function (s) {
      var plan = C.Data.plan(s.id, month);
      var sm = C.Calc.siteMonth(s.id, month);
      return h('tr', [
        h('td', [h('div.strong', s.name), h('div.tiny.muted', s.code)]),
        h('td.c', plan ? h('span.badge.badge-closed.no-dot', 'загружен') : h('span.badge.badge-none.no-dot', 'нет плана')),
        h('td.n', plan ? String(plan.rows.length) : '—'),
        h('td.n', plan ? C.fmtNum(plan.total, 0) : '—'),
        h('td.c.small', plan ? (plan.format === 'daily' ? 'по дням' : 'итог за месяц') : '—'),
        h('td.small.muted', plan ? (plan.source || '—') : '—'),
        h('td.small.muted', plan ? C.fmtDateTimeRu(plan.importedAt) + (plan.revision > 1 ? ' · ред. ' + plan.revision : '') : '—'),
        h('td.n', C.fmtNum(sm.totals.fact, 0)),
        h('td.row', [
          plan ? h('button.btn.btn-sm', {
            type: 'button', onclick: function () { showPlan(s.id, month); }
          }, 'Открыть') : null,
          plan ? h('button.btn.btn-sm.btn-ghost', {
            type: 'button', title: 'Удалить план',
            onclick: function () {
              UI.confirm({
                title: 'Удалить план?',
                text: 'План ' + s.name + ' за ' + C.monthTitle(month) +
                  ' будет удалён. Внесённые фактические объёмы сохранятся.',
                okText: 'Удалить', danger: true
              }).then(function (ok) {
                if (!ok) return;
                C.Data.deletePlan(s.id, month);
                C.Data.audit('Удаление плана', s.name + ' · ' + C.monthTitle(month));
                UI.toast('План удалён', 'ok');
                viewPlans({ month: month });
              });
            }
          }, UI.icon('trash')) : null
        ])
      ]);
    });

    content.appendChild(h('div.card', [
      h('div.card-head', h('div', [
        h('h2', 'Загруженные планы · ' + C.monthTitle(month)),
        h('div.sub', 'План можно заменить в любой день — фактические данные участков сохраняются')
      ])),
      h('div.card-body.tight', h('div.table-wrap', h('table.tbl', [
        h('thead', h('tr', [
          h('th', 'Участок'), h('th.c', 'Статус'), h('th.n', 'Позиций'), h('th.n', 'План, усл. ед.'),
          h('th.c', 'Формат'), h('th', 'Источник'), h('th', 'Загружен'), h('th.n', 'Факт'), h('th', '')
        ])),
        h('tbody', rows)
      ])))
    ]));
  }

  function showPlan(sid, month) {
    var plan = C.Data.plan(sid, month);
    if (!plan) return;
    var dim = C.daysInMonth(month);
    var head = [h('th.col-name', 'Вид работ'), h('th.c', 'Ед. изм.'), h('th.n', 'Итого')];
    for (var d = 1; d <= dim; d++) head.push(h('th.day-head', String(d)));
    var curObj = null, body = [];
    plan.rows.forEach(function (row) {
      if (row.object !== curObj) {
        curObj = row.object;
        body.push(h('tr.row-group', h('td', { colspan: 3 + dim }, curObj || 'Без привязки к объекту')));
      }
      var cells = [h('td.col-name', row.work), h('td.c.small', C.prettyUnit(row.unit)),
      h('td.n.strong', C.fmtNum(row.total, 'auto'))];
      for (var dd = 1; dd <= dim; dd++) {
        cells.push(h('td.day-cell', h('div', { style: { padding: '4px', textAlign: 'right', fontSize: '12px' } },
          row.days[dd] ? C.fmtNum(row.days[dd], 'auto') : '')));
      }
      body.push(h('tr', cells));
    });
    UI.modal({
      title: 'План · ' + C.Data.siteName(sid),
      sub: C.monthTitle(month) + ' · источник: ' + (plan.source || '—') + ' · загружен ' + C.fmtDateTimeRu(plan.importedAt),
      width: 'xwide',
      body: h('div.table-wrap.tall', h('table.tbl.compact', [h('thead', h('tr', head)), h('tbody', body)]))
    });
  }

  function downloadTemplate(month) {
    var sites = C.Data.sites();
    var items = sites.map(function (s) {
      var plan = C.Data.plan(s.id, month);
      var rows;
      if (plan) {
        rows = plan.rows.map(function (r) { return { object: r.object, work: r.work, unit: r.unit, total: r.total, days: r.days }; });
      } else {
        rows = C.Data.works().slice(0, 8).map(function (w) {
          return { object: 'Основной контракт', work: w.name, unit: w.unit, total: 0, days: {} };
        });
      }
      return { site: s, month: month, rows: rows };
    });
    T.build(items, { format: 'daily' }).then(function (blob) {
      UI.downloadBlob(blob, UI.safeFileName('Шаблон плана МУАД ' + C.monthTitle(month)) + '.xlsx');
      UI.toast('Шаблон выгружен', 'ok');
    });
  }

  /* ===================== СТАТУСЫ ПЕРИОДОВ ===================== */

  function viewMonths(params) {
    var to = params.to || C.todayKey();
    var from = params.from || C.shiftMonth(to, -5);
    var months = C.monthRange(from, to);
    var sites = C.Data.sites();
    var content = setPage('Статусы периодов', 'Закрытие месяцев по участкам');

    content.appendChild(h('div.mb-3', periodPicker(from, to, function (f, t) {
      UI.Router.go('admin-months', { from: f, to: t });
    })));

    var reqs = [];
    sites.forEach(function (s) {
      months.forEach(function (mk) {
        var cl = C.Data.closure(s.id, mk);
        (cl.requests || []).forEach(function (r, i) {
          if (r.status === 'new') reqs.push({ site: s, month: mk, req: r, idx: i });
        });
      });
    });

    if (reqs.length) {
      content.appendChild(h('div.card.mb-3', [
        h('div.card-head', h('div', [h('h2', 'Запросы на переоткрытие периода'),
        h('div.sub', 'Поступили от ответственных за участки')])),
        h('div.card-body.tight', h('div.table-wrap', h('table.tbl', [
          h('thead', h('tr', [h('th', 'Участок'), h('th', 'Месяц'), h('th', 'Дата'), h('th', 'Причина'), h('th', '')])),
          h('tbody', reqs.map(function (it) {
            return h('tr', [
              h('td.strong', it.site.name),
              h('td', C.monthTitle(it.month)),
              h('td.small.muted', C.fmtDateTimeRu(it.req.ts)),
              h('td', it.req.reason),
              h('td.row', [
                h('button.btn.btn-sm.btn-primary', {
                  type: 'button',
                  onclick: function () { reopen(it.site.id, it.month, it.idx, from, to); }
                }, 'Переоткрыть'),
                h('button.btn.btn-sm', {
                  type: 'button',
                  onclick: function () {
                    var cl = C.Data.closure(it.site.id, it.month);
                    cl.requests[it.idx].status = 'rejected';
                    C.Data.setClosure(it.site.id, it.month, cl);
                    C.Data.audit('Отклонён запрос переоткрытия', it.site.name + ' · ' + C.monthTitle(it.month));
                    UI.toast('Запрос отклонён', 'ok');
                    viewMonths({ from: from, to: to });
                  }
                }, 'Отклонить')
              ])
            ]);
          }))
        ])))
      ]));
    }

    var head = [h('th', 'Участок')].concat(months.map(function (m) {
      return h('th.c', { style: { minWidth: '110px' } }, C.monthTitle(m));
    }));

    var rows = sites.map(function (s) {
      var cells = [h('td', [h('div.strong', s.name), h('div.tiny.muted', s.chief)])];
      months.forEach(function (mk) {
        var sm = C.Calc.siteMonth(s.id, mk);
        var cl = C.Data.closure(s.id, mk);
        var closed = cl.status === 'closed';
        cells.push(h('td.c', h('div', [
          UI.statusBadge(!sm.hasPlan && !sm.totals.fact ? 'noplan' : cl.status),
          h('div.tiny.muted.mt-1', C.fmtPct(sm.totals.plan ? sm.totals.fact / sm.totals.plan : null)),
          isAdmin() ? h('button.btn.btn-sm.btn-ghost.mt-1', {
            type: 'button', title: closed ? 'Переоткрыть период' : 'Закрыть период за участок',
            onclick: function () {
              if (closed) reopen(s.id, mk, null, from, to);
              else closeForSite(s.id, mk, from, to);
            }
          }, closed ? 'открыть' : 'закрыть') : null
        ])));
      });
      return h('tr', cells);
    });

    content.appendChild(h('div.card', [
      h('div.card-head', h('div', [h('h2', 'Матрица закрытия периодов')])),
      h('div.card-body.tight', h('div.table-wrap', h('table.tbl', [
        h('thead', h('tr', head)), h('tbody', rows)
      ])))
    ]));
  }

  function reopen(sid, month, reqIdx, from, to) {
    UI.prompt({
      title: 'Переоткрыть период',
      sub: C.Data.siteName(sid) + ' · ' + C.monthTitle(month),
      label: 'Основание для переоткрытия',
      placeholder: 'Например: по запросу участка, уточнение объёмов',
      okText: 'Переоткрыть'
    }).then(function (reason) {
      if (reason === null) return;
      var cl = C.Data.closure(sid, month);
      cl.status = 'open';
      cl.reopenedAt = new Date().toISOString();
      cl.reopenedBy = C.Auth.current().title;
      cl.reopenReason = reason;
      if (reqIdx != null && cl.requests && cl.requests[reqIdx]) cl.requests[reqIdx].status = 'approved';
      C.Data.setClosure(sid, month, cl);
      C.Data.audit('Переоткрытие периода', C.Data.siteName(sid) + ' · ' + C.monthTitle(month) + ': ' + reason);
      UI.toast('Период переоткрыт', 'ok');
      viewMonths({ from: from, to: to });
    });
  }

  function closeForSite(sid, month, from, to) {
    var sm = C.Calc.siteMonth(sid, month);
    UI.confirm({
      title: 'Закрыть период за участок?',
      sub: C.Data.siteName(sid) + ' · ' + C.monthTitle(month),
      text: h('div', [
        h('p', 'Закрытие выполняется администратором от имени участка. ' +
          'Ответственный не сможет редактировать данные за этот месяц.'),
        h('p.small.muted', 'План: ' + C.fmtNum(sm.totals.plan, 0) + ', факт: ' + C.fmtNum(sm.totals.fact, 0) +
          ' усл. ед., выполнение ' + C.fmtPct(sm.totals.plan ? sm.totals.fact / sm.totals.plan : null))
      ]),
      okText: 'Закрыть период'
    }).then(function (ok) {
      if (!ok) return;
      C.Data.setClosure(sid, month, {
        siteId: sid, month: month, status: 'closed',
        closedAt: new Date().toISOString(), closedBy: C.Auth.current().title + ' (администратор)',
        comment: 'Закрыто администратором', totals: sm.totals
      });
      C.Data.audit('Закрытие месяца администратором', C.Data.siteName(sid) + ' · ' + C.monthTitle(month));
      UI.toast('Период закрыт', 'ok');
      viewMonths({ from: from, to: to });
    });
  }

  /* ===================== СВОДЫ ===================== */

  function viewSummary(params) {
    var to = params.to || C.todayKey();
    var from = params.from || to;
    var filter = params.site || 'all';
    var tab = params.tab || 'sites';
    var months = C.monthRange(from, to);
    var siteIds = resolveSites(filter);
    var agg = C.Calc.aggregate(siteIds, months);

    var content = setPage('Своды и выгрузки', R.periodLabel(months), [
      h('button.btn.btn-sm', { type: 'button', onclick: function () { window.print(); } }, [UI.icon('print'), 'Печать']),
      h('button.btn.btn-primary.btn-sm', {
        type: 'button', onclick: function () { exportSummaryFile(siteIds, months); }
      }, [UI.icon('download'), 'Выгрузить в Excel'])
    ]);

    content.appendChild(h('div.row.between.wrap.mb-3', [
      periodPicker(from, to, function (f, t) { UI.Router.go('admin-summary', { from: f, to: t, site: filter, tab: tab }); }),
      h('div.toolbar', [
        siteFilter(filter, function (v) { UI.Router.go('admin-summary', { from: from, to: to, site: v, tab: tab }); })
      ])
    ]));

    content.appendChild(h('div.grid.grid-4.mb-3', [
      UI.kpi({ label: 'План за период', value: C.fmtNum(agg.totals.plan, 0), unit: 'усл. ед.', tone: 'navy' }),
      UI.kpi({ label: 'Факт за период', value: C.fmtNum(agg.totals.fact, 0), unit: 'усл. ед.' }),
      UI.kpi({
        label: 'Отклонение', value: C.fmtSigned(agg.totals.deviation, 0), unit: 'усл. ед.',
        tone: agg.totals.deviation >= 0 ? 'green' : 'red'
      }),
      UI.kpi({
        label: 'Выполнение плана', value: C.fmtPct(agg.totals.done),
        tone: agg.totals.done >= 0.98 ? 'green' : agg.totals.done >= 0.85 ? 'amber' : 'red',
        sub: agg.closedAll ? 'Период закрыт полностью' : 'Есть незакрытые периоды'
      })
    ]));

    content.appendChild(h('div.toolbar.mb-3', h('div.seg', [
      ['sites', 'По участкам'], ['works', 'По видам работ'], ['months', 'Помесячно'], ['detail', 'Детализация']
    ].map(function (t) {
      return h('button', {
        type: 'button', class: tab === t[0] ? 'active' : '',
        onclick: function () { UI.Router.go('admin-summary', { from: from, to: to, site: filter, tab: t[0] }); }
      }, t[1]);
    }))));

    if (tab === 'sites') content.appendChild(tabSites(agg));
    else if (tab === 'works') content.appendChild(tabWorks(agg));
    else if (tab === 'months') content.appendChild(tabMonths(agg));
    else content.appendChild(tabDetail(agg));
  }

  function tabSites(agg) {
    return h('div.card', [
      h('div.card-head', h('div', [h('h2', 'Выполнение по участкам')])),
      h('div.card-body.tight', h('div.table-wrap', h('table.tbl', [
        h('thead', h('tr', [h('th', 'Участок'), h('th', 'Ответственный'), h('th.n', 'План'), h('th.n', 'Факт'),
        h('th.n', 'Отклонение'), h('th.n', 'Выполнение'), h('th', ''), h('th.c', 'Закрыто месяцев')])),
        h('tbody', agg.sites.map(function (b) {
          var site = C.Data.site(b.siteId);
          return h('tr', [
            h('td.strong', site.name),
            h('td.small.muted', site.chief),
            h('td.n', C.fmtNum(b.plan, 0)),
            h('td.n', C.fmtNum(b.fact, 0)),
            h('td.n', UI.devCell(b.deviation)),
            h('td.n', UI.pctCell(b.done)),
            h('td', { style: { minWidth: '140px' } }, UI.progress(b.done)),
            h('td.c', h('span.badge.' + (b.closedMonths === b.totalMonths ? 'badge-closed' : 'badge-open'),
              b.closedMonths + ' / ' + b.totalMonths))
          ]);
        }).concat([
          h('tr.row-total', [
            h('td', 'ИТОГО'), h('td'),
            h('td.n', C.fmtNum(agg.totals.plan, 0)), h('td.n', C.fmtNum(agg.totals.fact, 0)),
            h('td.n', UI.devCell(agg.totals.deviation)), h('td.n', UI.pctCell(agg.totals.done)),
            h('td', UI.progress(agg.totals.done)), h('td')
          ])
        ]))
      ]))),
      h('div.card-foot.small.muted', 'Итоговые объёмы приведены в условных единицах: ' +
        'позиции с различными единицами измерения суммируются справочно.')
    ]);
  }

  function tabWorks(agg) {
    return h('div.card', [
      h('div.card-head', h('div', [h('h2', 'Выполнение по видам работ'),
      h('div.sub', 'Натуральные единицы измерения')])),
      h('div.card-body.tight', h('div.table-wrap.tall', h('table.tbl.compact', [
        h('thead', h('tr', [h('th.col-name', 'Вид работ'), h('th.c', 'Ед. изм.'), h('th.n', 'План'),
        h('th.n', 'Факт'), h('th.n', 'Отклонение'), h('th.n', 'Выполнение'), h('th', '')]
          .concat(agg.siteIds.length > 1 ? agg.siteIds.map(function (sid) {
            return h('th.n', { title: C.Data.siteName(sid) }, C.Data.siteShort(sid));
          }) : []))),
        h('tbody', agg.works.map(function (w) {
          return h('tr', [
            h('td.col-name', w.work),
            h('td.c.small', C.prettyUnit(w.unit)),
            h('td.n', C.fmtNum(w.plan, 'auto')),
            h('td.n', C.fmtNum(w.fact, 'auto')),
            h('td.n', UI.devCell(w.deviation)),
            h('td.n', UI.pctCell(w.done)),
            h('td', { style: { minWidth: '110px' } }, UI.progress(w.done))
          ].concat(agg.siteIds.length > 1 ? agg.siteIds.map(function (sid) {
            return h('td.n.small', w.sites[sid] ? C.fmtNum(w.sites[sid], 'auto') : '—');
          }) : []));
        }))
      ])))
    ]);
  }

  function tabMonths(agg) {
    return h('div.card', [
      h('div.card-head', h('div', [h('h2', 'Помесячная динамика')])),
      h('div.card-body.tight', h('div.table-wrap', h('table.tbl', [
        h('thead', h('tr', [h('th', 'Участок')].concat(agg.months.map(function (m) {
          return h('th.c', { colspan: 3 }, C.monthTitle(m));
        })))),
        h('thead', h('tr', [h('th', '')].concat(agg.months.reduce(function (a, m) {
          return a.concat([h('th.n.sub-head', 'план'), h('th.n.sub-head', 'факт'), h('th.n.sub-head', '%')]);
        }, [])))),
        h('tbody', agg.sites.map(function (b) {
          return h('tr', [h('td.strong', C.Data.siteName(b.siteId))].concat(
            agg.months.reduce(function (acc, mk) {
              var m = b.months[mk];
              return acc.concat([
                h('td.n', C.fmtNum(m.plan, 0)),
                h('td.n', C.fmtNum(m.fact, 0)),
                h('td.n', UI.pctCell(m.plan ? m.fact / m.plan : null))
              ]);
            }, [])));
        }).concat([
          h('tr.row-total', [h('td', 'ИТОГО')].concat(agg.byMonth.reduce(function (acc, m) {
            return acc.concat([
              h('td.n', C.fmtNum(m.plan, 0)), h('td.n', C.fmtNum(m.fact, 0)), h('td.n', UI.pctCell(m.done))
            ]);
          }, [])))
        ]))
      ])))
    ]);
  }

  function tabDetail(agg) {
    return h('div', agg.sites.map(function (b) {
      var site = C.Data.site(b.siteId);
      return h('div.card.mb-3', [
        h('div.card-head', [
          h('div', [h('h2', site.name), h('div.sub', site.chief + ' · ' + site.roads)]),
          h('div.spacer'),
          h('div.row', [
            h('span.small.muted', 'Выполнение:'), UI.pctCell(b.done)
          ])
        ]),
        h('div.card-body.tight', h('div.table-wrap', h('table.tbl.compact', [
          h('thead', h('tr', [h('th', 'Объект / контракт'), h('th.col-name', 'Вид работ'), h('th.c', 'Ед. изм.'),
          h('th.n', 'План'), h('th.n', 'Факт'), h('th.n', 'Отклонение'), h('th.n', 'Выполнение')])),
          h('tbody', b.rows.map(function (r) {
            return h('tr', [
              h('td.small.muted', r.object || '—'),
              h('td.col-name', r.work),
              h('td.c.small', C.prettyUnit(r.unit)),
              h('td.n', C.fmtNum(r.plan, 'auto')),
              h('td.n', C.fmtNum(r.fact, 'auto')),
              h('td.n', UI.devCell(r.deviation)),
              h('td.n', UI.pctCell(r.done))
            ]);
          }).concat([
            h('tr.row-total', [h('td'), h('td', 'ИТОГО'), h('td.c.small', 'усл. ед.'),
            h('td.n', C.fmtNum(b.plan, 0)), h('td.n', C.fmtNum(b.fact, 0)),
            h('td.n', UI.devCell(b.deviation)), h('td.n', UI.pctCell(b.done))])
          ]))
        ])))
      ]);
    }));
  }

  function exportSummaryFile(siteIds, months) {
    var m = UI.spinnerOverlay('Формирование файла Excel…');
    R.exportSummary(siteIds, months).then(function (blob) {
      m.close();
      UI.downloadBlob(blob, UI.safeFileName('Свод МУАД ' + R.periodLabel(months)) + '.xlsx');
      C.Data.audit('Выгрузка свода в Excel', R.periodLabel(months) + ' · участков: ' + siteIds.length);
      UI.toast('Файл выгружен', 'ok');
    }).catch(function (e) {
      m.close(); console.error(e);
      UI.toast('Ошибка выгрузки: ' + e.message, 'err');
    });
  }

  /* ===================== ОТЧЁТЫ И ПРЕЗЕНТАЦИИ ===================== */

  function viewReports(params) {
    var to = params.to || C.todayKey();
    var from = params.from || to;
    var filter = params.site || 'all';
    var months = C.monthRange(from, to);
    var siteIds = resolveSites(filter);
    var agg = C.Calc.aggregate(siteIds, months);
    var canFinal = agg.closedAll;
    var kind = params.kind || (canFinal ? 'final' : 'draft');
    if (kind === 'final' && !canFinal) kind = 'draft';

    var content = setPage('Отчёты и презентации', R.periodLabel(months));

    content.appendChild(h('div.card.mb-3', [
      h('div.card-head', h('div', [h('h2', 'Параметры отчёта'),
      h('div.sub', 'Отчёт формируется в виде презентации (.pptx) — открывается в Р7-Офис и MS PowerPoint')])),
      h('div.card-body', [
        h('div.grid.grid-3', [
          h('div.field', [h('label', 'Период'),
          periodPicker(from, to, function (f, t) { UI.Router.go('admin-reports', { from: f, to: t, site: filter, kind: kind }); })]),
          h('div.field', [h('label', 'Участки'),
          siteFilter(filter, function (v) { UI.Router.go('admin-reports', { from: from, to: to, site: v, kind: kind }); })]),
          h('div.field', [h('label', 'Вид отчёта'),
          h('select', {
            onchange: function (e) { UI.Router.go('admin-reports', { from: from, to: to, site: filter, kind: e.target.value }); }
          }, [
            h('option', { value: 'draft', selected: kind === 'draft' }, 'Предварительный'),
            h('option', { value: 'final', selected: kind === 'final', disabled: !canFinal },
              'Окончательный' + (canFinal ? '' : ' — доступен после закрытия всех периодов'))
          ])])
        ]),
        canFinal
          ? UI.notice('success', 'Все выбранные периоды закрыты участками — можно формировать окончательный отчёт.')
          : UI.notice('warn', [
            h('b', 'Не все периоды закрыты участками. '),
            'Отчёт будет помечен как предварительный. ',
            h('a', {
              href: '#', onclick: function (e) { e.preventDefault(); UI.Router.go('admin-months', { from: from, to: to }); }
            }, 'Посмотреть статусы')
          ])
      ]),
      h('div.card-foot.row', [
        h('div.small.muted', 'В презентацию войдут: титул, ключевые показатели, свод по участкам, динамика, ' +
          'разрез по видам работ, слайды по каждому участку, зоны внимания и статус закрытия.'),
        h('div.spacer'),
        h('button.btn', {
          type: 'button', onclick: function () { exportSummaryFile(siteIds, months); }
        }, [UI.icon('download'), 'Приложение Excel']),
        h('button.btn.btn-primary', {
          type: 'button', onclick: function () { makeReport(siteIds, months, kind); }
        }, [UI.icon('slides'), 'Сформировать презентацию'])
      ])
    ]));

    content.appendChild(h('div#report-preview'));
    renderReportLog(content);
  }

  function makeReport(siteIds, months, kind) {
    var m = UI.spinnerOverlay('Формирование презентации…');
    setTimeout(function () {
      try {
        var deck = R.buildReport({ siteIds: siteIds, months: months, kind: kind });
        m.close();
        var host = UI.clear(document.getElementById('report-preview'));
        host.appendChild(h('div.card', [
          h('div.card-head', [
            h('div', [h('h2', 'Предпросмотр отчёта'),
            h('div.sub', deck.slides.length + ' ' + C.plural(deck.slides.length, 'слайд', 'слайда', 'слайдов') +
              ' · ' + deck.meta.kindLabel.toLowerCase())]),
            h('div.spacer'),
            h('button.btn.btn-primary', {
              type: 'button',
              onclick: function () { savePptx(deck); }
            }, [UI.icon('download'), 'Скачать презентацию (.pptx)'])
          ]),
          h('div.card-body', R.toHtml(deck))
        ]));
        host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        m.close(); console.error(e);
        UI.toast('Ошибка формирования отчёта: ' + e.message, 'err');
      }
    }, 30);
  }

  function savePptx(deck) {
    var m = UI.spinnerOverlay('Сохранение презентации…');
    R.toPptx(deck).then(function (blob) {
      m.close();
      var name = 'Отчёт МУАД ' + deck.meta.periodLabel +
        (deck.meta.kind === 'final' ? ' (окончательный)' : ' (предварительный)');
      UI.downloadBlob(blob, UI.safeFileName(name) + '.pptx');
      var db = C.Data.db();
      db.reports.unshift({
        ts: new Date().toISOString(), by: C.Auth.current().title,
        period: deck.meta.periodLabel, kind: deck.meta.kind,
        sites: deck.meta.siteIds.length, slides: deck.slides.length,
        plan: deck.meta.agg.totals.plan, fact: deck.meta.agg.totals.fact
      });
      if (db.reports.length > 200) db.reports.length = 200;
      C.Data.save(true);
      C.Data.audit('Сформирован отчёт-презентация',
        deck.meta.periodLabel + ' · ' + deck.meta.kindLabel + ' · слайдов: ' + deck.slides.length);
      UI.toast('Презентация сохранена', 'ok');
    }).catch(function (e) {
      m.close(); console.error(e);
      UI.toast('Ошибка сохранения: ' + e.message, 'err');
    });
  }

  function renderReportLog(content) {
    var reports = C.Data.db().reports || [];
    if (!reports.length) return;
    content.appendChild(h('div.card.mt-3', [
      h('div.card-head', h('div', [h('h2', 'Журнал сформированных отчётов')])),
      h('div.card-body.tight', h('div.table-wrap', h('table.tbl.compact', [
        h('thead', h('tr', [h('th', 'Дата'), h('th', 'Период'), h('th.c', 'Вид'), h('th.n', 'Участков'),
        h('th.n', 'Слайдов'), h('th.n', 'План'), h('th.n', 'Факт'), h('th', 'Сформировал')])),
        h('tbody', reports.slice(0, 20).map(function (r) {
          return h('tr', [
            h('td.small', C.fmtDateTimeRu(r.ts)),
            h('td', r.period),
            h('td.c', h('span.badge.' + (r.kind === 'final' ? 'badge-closed' : 'badge-open') + '.no-dot',
              r.kind === 'final' ? 'окончательный' : 'предварительный')),
            h('td.n', String(r.sites)), h('td.n', String(r.slides)),
            h('td.n', C.fmtNum(r.plan, 0)), h('td.n', C.fmtNum(r.fact, 0)),
            h('td.small.muted', r.by)
          ]);
        }))
      ])))
    ]));
  }

  /* ===================== УЧАСТКИ И ДОСТУПЫ ===================== */

  function viewSites() {
    var content = setPage('Участки и доступы', 'Справочник участков, ответственные, пароли', [
      h('button.btn.btn-sm', { type: 'button', onclick: function () { editSite(null); } }, [UI.icon('plus'), 'Добавить участок'])
    ]);
    if (!isAdmin()) { content.appendChild(UI.notice('warn', 'Раздел доступен только администратору.')); return; }

    var sites = C.Data.sites(false);
    content.appendChild(h('div.card', [
      h('div.card-head', h('div', [h('h2', 'Дорожные участки'),
      h('div.sub', 'Логин для входа — наименование участка, выбирается из списка на экране входа')])),
      h('div.card-body.tight', h('div.table-wrap', h('table.tbl', [
        h('thead', h('tr', [h('th', 'Код'), h('th', 'Наименование'), h('th', 'Начальник участка'),
        h('th.n', 'Штат'), h('th', 'Дороги'), h('th.c', 'Пароль'), h('th.c', 'Статус'), h('th', '')])),
        h('tbody', sites.map(function (s) {
          return h('tr', [
            h('td.strong', s.code),
            h('td', s.name),
            h('td.small', s.chief),
            h('td.n', String(s.staff || '—')),
            h('td.small.muted', { style: { maxWidth: '320px' } }, s.roads),
            h('td.c', s.pwdChanged
              ? h('span.badge.badge-closed.no-dot', 'изменён')
              : h('span.badge.badge-open.no-dot', 'по умолчанию')),
            h('td.c', s.active === false
              ? h('span.badge.badge-none.no-dot', 'отключён')
              : h('span.badge.badge-closed.no-dot', 'активен')),
            h('td.row', [
              h('button.btn.btn-sm', { type: 'button', onclick: function () { editSite(s.id); } }, 'Изменить'),
              h('button.btn.btn-sm', { type: 'button', onclick: function () { resetPassword(s.id); } }, 'Пароль')
            ])
          ]);
        }))
      ])))
    ]));

    var db = C.Data.db();
    content.appendChild(h('div.card.mt-3', [
      h('div.card-head', h('div', [h('h2', 'Доступ администратора и руководства')])),
      h('div.card-body', h('div.grid.grid-2', [
        h('div', [
          h('h3.mb-1', 'Администратор системы'),
          h('p.small.muted', 'Полный доступ: планы, своды, отчёты, настройки.'),
          !db.settings.adminPwdChanged ? UI.notice('warn', 'Используется пароль по умолчанию muad-admin.') : null,
          h('button.btn.mt-2', { type: 'button', onclick: function () { resetPassword('admin'); } },
            [UI.icon('shield'), 'Сменить пароль администратора'])
        ]),
        h('div', [
          h('h3.mb-1', 'Руководство (только просмотр)'),
          h('p.small.muted', 'Доступ к сводам и отчётам без права изменения данных.'),
          h('div.row.mt-2', [
            h('button.btn', { type: 'button', onclick: function () { resetPassword('viewer'); } }, 'Сменить пароль'),
            h('button.btn', {
              type: 'button',
              onclick: function () {
                db.settings.viewerEnabled = !db.settings.viewerEnabled;
                C.Data.save(true);
                C.Data.audit('Изменение доступа руководства', db.settings.viewerEnabled ? 'включён' : 'отключён');
                viewSites();
              }
            }, db.settings.viewerEnabled ? 'Отключить доступ' : 'Включить доступ')
          ])
        ])
      ]))
    ]));
  }

  function resetPassword(target) {
    var title = target === 'admin' ? 'администратора' : target === 'viewer' ? 'руководства' : C.Data.siteName(target);
    UI.prompt({
      title: 'Новый пароль',
      sub: 'Для ' + title,
      label: 'Пароль (не менее 6 символов)',
      okText: 'Установить пароль',
      help: 'Сообщите новый пароль ответственному лицу. Система не хранит пароль в открытом виде.'
    }).then(function (pwd) {
      if (pwd === null) return;
      if (String(pwd).length < 6) { UI.toast('Пароль слишком короткий', 'err'); return; }
      C.Auth.setPassword(target, pwd);
      UI.toast('Пароль установлен', 'ok');
      if (UI.Router.current.name === 'admin-sites') viewSites();
    });
  }

  function editSite(id) {
    var site = id ? C.Data.site(id) : null;
    var f = {
      code: h('input', { type: 'text', value: site ? site.code : '' }),
      name: h('input', { type: 'text', value: site ? site.name : '' }),
      short: h('input', { type: 'text', value: site ? (site.short || '') : '' }),
      chief: h('input', { type: 'text', value: site ? site.chief : '' }),
      staff: h('input', { type: 'number', value: site ? site.staff : '', min: '0' }),
      roads: h('textarea', site ? site.roads : ''),
      aliases: h('input', { type: 'text', value: site && site.aliases ? site.aliases.join(', ') : '' }),
      active: h('select', [
        h('option', { value: '1', selected: !site || site.active !== false }, 'Активен'),
        h('option', { value: '0', selected: site && site.active === false }, 'Отключён')
      ])
    };
    var m = UI.modal({
      title: site ? 'Изменение участка' : 'Новый участок',
      sub: site ? site.name : 'Добавление участка в справочник',
      width: 'wide',
      body: h('div.grid.grid-2', [
        h('div.field', [h('label', 'Код участка'), f.code, h('div.help', 'Например, ЛДУ, ДУ-2')]),
        h('div.field', [h('label', 'Краткое наименование'), f.short]),
        h('div.field', { style: { gridColumn: '1 / -1' } }, [h('label', 'Полное наименование'), f.name]),
        h('div.field', [h('label', 'Начальник участка'), f.chief]),
        h('div.field', [h('label', 'Штатная численность'), f.staff]),
        h('div.field', { style: { gridColumn: '1 / -1' } }, [h('label', 'Обслуживаемые дороги'), f.roads]),
        h('div.field', { style: { gridColumn: '1 / -1' } }, [
          h('label', 'Псевдонимы для распознавания файлов'), f.aliases,
          h('div.help', 'Через запятую. Используются при автоматическом определении участка по имени файла или листа.')
        ]),
        h('div.field', [h('label', 'Статус'), f.active])
      ]),
      foot: [
        h('button.btn', { type: 'button', onclick: function () { m.close(); } }, 'Отмена'),
        h('button.btn.btn-primary', {
          type: 'button',
          onclick: function () {
            if (!f.name.value.trim() || !f.code.value.trim()) { UI.toast('Заполните код и наименование', 'err'); return; }
            var db = C.Data.db();
            var obj = site || {
              id: C.slug(f.code.value) || C.uid('site'),
              order: db.sites.length + 1,
              passHash: C.hashPassword(C.slug(f.code.value) + '-2026'), pwdChanged: false
            };
            obj.code = f.code.value.trim();
            obj.name = f.name.value.trim();
            obj.short = f.short.value.trim() || obj.code;
            obj.chief = f.chief.value.trim();
            obj.staff = parseInt(f.staff.value, 10) || 0;
            obj.roads = f.roads.value.trim();
            obj.aliases = f.aliases.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
            obj.active = f.active.value === '1';
            if (!site) db.sites.push(obj);
            C.Data.save(true);
            C.Data.audit(site ? 'Изменение участка' : 'Добавление участка', obj.name);
            m.close();
            UI.toast('Сохранено', 'ok');
            viewSites();
          }
        }, 'Сохранить')
      ]
    });
  }

  /* ===================== СПРАВОЧНИК РАБОТ ===================== */

  function viewWorks() {
    var content = setPage('Справочник видов работ', 'Единый перечень для всех участков', [
      h('button.btn.btn-sm', { type: 'button', onclick: function () { editWork(null); } }, [UI.icon('plus'), 'Добавить работу'])
    ]);
    var works = C.Data.works();
    var groups = {};
    works.forEach(function (w) { (groups[w.group || 'Прочие работы'] = groups[w.group || 'Прочие работы'] || []).push(w); });

    content.appendChild(h('div.mb-3', UI.notice('info',
      'Виды работ добавляются автоматически при загрузке планов. ' +
      'Единый справочник обеспечивает корректное сведение данных разных участков в общий отчёт.')));

    Object.keys(groups).forEach(function (g) {
      content.appendChild(h('div.card.mb-3', [
        h('div.card-head', h('div', [h('h2', g), h('div.sub', groups[g].length + ' ' +
          C.plural(groups[g].length, 'вид работ', 'вида работ', 'видов работ'))])),
        h('div.card-body.tight', h('div.table-wrap', h('table.tbl.compact', [
          h('thead', h('tr', [h('th.col-name', 'Наименование'), h('th.c', 'Ед. изм.'),
          h('th.n', 'Участков в плане'), h('th', '')])),
          h('tbody', groups[g].map(function (w) {
            var used = countUsage(w);
            return h('tr', [
              h('td.col-name', w.name),
              h('td.c.small', C.prettyUnit(w.unit)),
              h('td.n', String(used)),
              h('td.right', isAdmin() ? h('button.btn.btn-sm', {
                type: 'button', onclick: function () { editWork(w.id); }
              }, 'Изменить') : null)
            ]);
          }))
        ])))
      ]));
    });
  }

  function countUsage(work) {
    var db = C.Data.db(), set = {};
    Object.keys(db.plans).forEach(function (k) {
      var p = db.plans[k];
      if (p.rows.some(function (r) { return C.normKey(r.work) === C.normKey(work.name); })) set[k.split('|')[0]] = 1;
    });
    return Object.keys(set).length;
  }

  function editWork(id) {
    var db = C.Data.db();
    var w = id ? db.works.filter(function (x) { return x.id === id; })[0] : null;
    var f = {
      name: h('input', { type: 'text', value: w ? w.name : '' }),
      unit: h('input', { type: 'text', value: w ? w.unit : '', placeholder: 'например: 1000 м2, 10 км' }),
      group: h('select', ['Зимнее содержание', 'Летнее содержание', 'Ремонт', 'Прочие работы'].map(function (g) {
        return h('option', { value: g, selected: w && w.group === g }, g);
      }))
    };
    var m = UI.modal({
      title: w ? 'Изменение вида работ' : 'Новый вид работ',
      body: h('div', [
        h('div.field', [h('label', 'Наименование'), f.name]),
        h('div.field', [h('label', 'Единица измерения'), f.unit,
        h('div.help', 'Записывается как в плане: 10 000 м2, 1000 м2, 10 км, 1 км, 100 м2.')]),
        h('div.field', [h('label', 'Группа работ'), f.group])
      ]),
      foot: [
        h('button.btn', { type: 'button', onclick: function () { m.close(); } }, 'Отмена'),
        h('button.btn.btn-primary', {
          type: 'button',
          onclick: function () {
            if (!f.name.value.trim()) { UI.toast('Укажите наименование', 'err'); return; }
            if (w) {
              w.name = f.name.value.trim();
              w.unit = C.normUnit(f.unit.value);
              w.group = f.group.value;
            } else {
              db.works.push({
                id: C.slug(f.name.value) || C.uid('w'), name: f.name.value.trim(),
                unit: C.normUnit(f.unit.value), group: f.group.value
              });
            }
            C.Data.save(true);
            C.Data.audit(w ? 'Изменение справочника работ' : 'Добавление вида работ', f.name.value.trim());
            m.close(); UI.toast('Сохранено', 'ok'); viewWorks();
          }
        }, 'Сохранить')
      ]
    });
  }

  /* ===================== ДАННЫЕ И КОПИИ ===================== */

  function viewData() {
    var content = setPage('Данные и резервные копии', 'Обмен данными с участками, архивирование');
    if (!isAdmin()) { content.appendChild(UI.notice('warn', 'Раздел доступен только администратору.')); return; }

    var db = C.Data.db();
    var size = 0;
    try { size = (localStorage.getItem(C.Data.storageKey) || '').length; } catch (e) { /* игнорируем */ }

    var pkgInput = h('input', {
      type: 'file', accept: '.json', multiple: true, style: { display: 'none' },
      onchange: function (e) { loadPackages(e.target.files); e.target.value = ''; }
    });
    var backupInput = h('input', {
      type: 'file', accept: '.json', style: { display: 'none' },
      onchange: function (e) { restoreBackup(e.target.files[0]); e.target.value = ''; }
    });

    content.appendChild(h('div.grid.grid-3.mb-3', [
      UI.kpi({ label: 'Участков', value: String(db.sites.length), tone: 'navy' }),
      UI.kpi({ label: 'Загружено планов', value: String(Object.keys(db.plans).length), sub: 'участко-месяцев' }),
      UI.kpi({ label: 'Объём базы', value: C.fmtNum(size / 1024, 0), unit: 'КБ', sub: 'в локальном хранилище браузера' })
    ]));

    content.appendChild(h('div.grid.grid-2', [
      h('div.card', [
        h('div.card-head', h('div', [h('h2', 'Приём данных от участков'),
        h('div.sub', 'Загрузка пакетов, выгруженных на рабочих местах участков')])),
        h('div.card-body', [
          h('p.small.muted', 'Пакет содержит фактические объёмы и статус закрытия одного участка за один месяц. ' +
            'При загрузке данные объединяются с базой: сведения по другим участкам и месяцам не затрагиваются.'),
          h('button.btn.btn-primary', { type: 'button', onclick: function () { pkgInput.click(); } },
            [UI.icon('upload'), 'Загрузить пакеты участков']),
          pkgInput
        ])
      ]),
      h('div.card', [
        h('div.card-head', h('div', [h('h2', 'Резервная копия базы'),
        h('div.sub', 'Полная выгрузка и восстановление')])),
        h('div.card-body', [
          h('p.small.muted', 'Данные хранятся в браузере этого рабочего места. ' +
            'Регулярно выгружайте резервную копию — при очистке данных браузера информация будет утрачена.'),
          h('div.row', [
            h('button.btn.btn-primary', { type: 'button', onclick: backupDb }, [UI.icon('download'), 'Выгрузить копию']),
            h('button.btn', { type: 'button', onclick: function () { backupInput.click(); } },
              [UI.icon('upload'), 'Восстановить из копии']),
            backupInput
          ])
        ])
      ])
    ]));

    content.appendChild(h('div.card.mt-3', [
      h('div.card-head', h('div', [h('h2', 'Обслуживание'), h('div.sub', 'Операции необратимы — предварительно выгрузите копию')])),
      h('div.card-body.row.wrap', [
        h('button.btn', {
          type: 'button',
          onclick: function () {
            UI.prompt({
              title: 'Удалить данные за месяц',
              label: 'Месяц в формате ГГГГ-ММ',
              value: C.shiftMonth(C.todayKey(), -12),
              okText: 'Удалить'
            }).then(function (mk) {
              if (!mk || !/^\d{4}-\d{2}$/.test(mk)) return;
              var d = C.Data.db(), n = 0;
              Object.keys(d.plans).forEach(function (k) { if (k.split('|')[1] === mk) { delete d.plans[k]; n++; } });
              Object.keys(d.facts).forEach(function (k) { if (k.split('|')[1] === mk) { delete d.facts[k]; n++; } });
              Object.keys(d.closures).forEach(function (k) { if (k.split('|')[1] === mk) { delete d.closures[k]; n++; } });
              C.Data.save(true);
              C.Data.audit('Удаление данных за период', C.monthTitle(mk) + ', записей: ' + n);
              UI.toast('Удалено записей: ' + n, 'ok');
              viewData();
            });
          }
        }, [UI.icon('trash'), 'Удалить данные за месяц']),
        h('button.btn.btn-danger', {
          type: 'button',
          onclick: function () {
            UI.confirm({
              title: 'Очистить всю базу?',
              text: h('div', [
                h('p', 'Будут удалены все планы, фактические данные, статусы закрытия и журнал. ' +
                  'Справочники участков и работ вернутся к исходному состоянию, пароли сбросятся.'),
                UI.notice('danger', 'Действие необратимо. Убедитесь, что резервная копия выгружена.')
              ]),
              okText: 'Очистить базу', danger: true
            }).then(function (ok) {
              if (!ok) return;
              C.Data.resetAll();
              C.Auth.logout();
              location.reload();
            });
          }
        }, [UI.icon('alert'), 'Очистить базу'])
      ])
    ]));
  }

  function backupDb() {
    var db = C.Data.db();
    var blob = new Blob([JSON.stringify(db)], { type: 'application/json' });
    UI.downloadBlob(blob, UI.safeFileName('Резервная копия МУАД ' + C.fmtDateRu(new Date())) + '.json');
    C.Data.audit('Выгрузка резервной копии', '');
    UI.toast('Резервная копия выгружена', 'ok');
  }

  function restoreBackup(file) {
    if (!file) return;
    file.text().then(function (txt) {
      var obj;
      try { obj = JSON.parse(txt); } catch (e) { UI.toast('Файл повреждён', 'err'); return; }
      if (!obj || !obj.sites || !obj.settings) { UI.toast('Это не резервная копия системы', 'err'); return; }
      UI.confirm({
        title: 'Восстановить базу из копии?',
        text: 'Текущие данные будут полностью заменены содержимым файла «' + file.name + '».',
        okText: 'Восстановить', danger: true
      }).then(function (ok) {
        if (!ok) return;
        C.Data.replaceDb(obj);
        UI.toast('База восстановлена', 'ok');
        location.reload();
      });
    });
  }

  function loadPackages(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var results = [];
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        return f.text().then(function (txt) {
          var pkg;
          try { pkg = JSON.parse(txt); } catch (e) { results.push({ file: f.name, error: 'файл повреждён' }); return; }
          if (!pkg || pkg.kind !== 'muad-site-package') { results.push({ file: f.name, error: 'не является пакетом участка' }); return; }
          var site = C.Data.site(pkg.siteId);
          if (!site) { results.push({ file: f.name, error: 'участок «' + pkg.siteName + '» не найден в справочнике' }); return; }
          results.push({ file: f.name, pkg: pkg, site: site });
        });
      });
    });

    chain.then(function () {
      var good = results.filter(function (r) { return r.pkg; });
      var bad = results.filter(function (r) { return r.error; });
      if (!good.length) {
        UI.toast('Не удалось загрузить ни одного пакета: ' + (bad[0] ? bad[0].error : ''), 'err');
        return;
      }
      UI.confirm({
        title: 'Загрузить пакеты?',
        text: h('div', [
          h('p', 'Будут обновлены данные:'),
          h('ul', good.map(function (r) {
            var cnt = Object.keys(r.pkg.fact.rows || {}).length;
            return h('li', r.site.name + ' · ' + C.monthTitle(r.pkg.month) + ' · позиций: ' + cnt +
              (r.pkg.closure && r.pkg.closure.status === 'closed' ? ' · период закрыт' : ''));
          })),
          bad.length ? UI.notice('warn', 'Пропущено файлов: ' + bad.length + ' (' +
            bad.map(function (b) { return b.file + ' — ' + b.error; }).join('; ') + ')') : null
        ]),
        okText: 'Загрузить'
      }).then(function (ok) {
        if (!ok) return;
        var db = C.Data.db();
        good.forEach(function (r) {
          var k = r.pkg.siteId + '|' + r.pkg.month;
          db.facts[k] = r.pkg.fact;
          if (r.pkg.closure && r.pkg.closure.status) db.closures[k] = r.pkg.closure;
          C.Data.audit('Загружен пакет участка',
            r.site.name + ' · ' + C.monthTitle(r.pkg.month) + ' · выгружен ' + C.fmtDateTimeRu(r.pkg.exportedAt));
        });
        C.Data.save(true);
        UI.toast('Загружено пакетов: ' + good.length, 'ok');
        viewData();
      });
    });
  }

  /* ===================== ЖУРНАЛ ===================== */

  function viewAudit(params) {
    var content = setPage('Журнал действий', 'История изменений в системе');
    var db = C.Data.db();
    var q = (params.q || '').toLowerCase();
    var list = db.audit.filter(function (a) {
      if (!q) return true;
      return (a.action + ' ' + a.details + ' ' + a.user).toLowerCase().indexOf(q) >= 0;
    });

    var search = h('input', {
      type: 'text', value: params.q || '', placeholder: 'Поиск по действию, участку, пользователю…',
      style: { maxWidth: '380px' },
      oninput: UI.debounce(function (e) { UI.Router.go('admin-audit', { q: e.target.value }); }, 400)
    });

    content.appendChild(h('div.card', [
      h('div.card-head', [
        h('div', [h('h2', 'Журнал'), h('div.sub', 'Записей: ' + list.length + ' из ' + db.audit.length)]),
        h('div.spacer'), search,
        h('button.btn.btn-sm', {
          type: 'button', onclick: function () { exportAudit(list); }
        }, [UI.icon('download'), 'Выгрузить'])
      ]),
      h('div.card-body.tight', h('div.table-wrap.tall', h('table.tbl.compact', [
        h('thead', h('tr', [h('th', { style: { width: '150px' } }, 'Дата и время'),
        h('th', { style: { width: '220px' } }, 'Пользователь'), h('th', 'Действие'), h('th', 'Подробности')])),
        h('tbody', list.slice(0, 600).map(function (a) {
          return h('tr', [
            h('td.small.nowrap', C.fmtDateTimeRu(a.ts)),
            h('td.small', [h('span', a.user), h('div.tiny.muted', roleName(a.role))]),
            h('td.strong.small', a.action),
            h('td.small.muted', a.details)
          ]);
        }))
      ])))
    ]));
  }

  function roleName(r) {
    return r === 'admin' ? 'администратор' : r === 'site' ? 'ответственный' : r === 'viewer' ? 'просмотр' : 'система';
  }

  function exportAudit(list) {
    var rows = [[{ v: 'Журнал действий · ' + C.Data.db().settings.dept, s: 'title' }], []];
    rows.push([{ v: 'Дата и время', s: 'h' }, { v: 'Пользователь', s: 'h' }, { v: 'Роль', s: 'h' },
    { v: 'Действие', s: 'hleft' }, { v: 'Подробности', s: 'hleft' }]);
    list.forEach(function (a) {
      rows.push([{ v: C.fmtDateTimeRu(a.ts), s: 'txtc' }, { v: a.user, s: 'txt' },
      { v: roleName(a.role), s: 'txtc' }, { v: a.action, s: 'txt' }, { v: a.details, s: 'txt' }]);
    });
    XL.write({
      title: 'Журнал действий', author: C.Data.db().settings.dept,
      sheets: [{ name: 'Журнал', rows: rows, cols: [{ w: 18 }, { w: 30 }, { w: 16 }, { w: 34 }, { w: 80 }], freeze: { row: 3, col: 0 } }]
    }).then(function (blob) {
      UI.downloadBlob(blob, UI.safeFileName('Журнал действий ' + C.fmtDateRu(new Date())) + '.xlsx');
      UI.toast('Журнал выгружен', 'ok');
    });
  }

  /* ===================== РЕГИСТРАЦИЯ ===================== */

  function register(Router, setPageFn) {
    setPage = setPageFn;
    Router
      .on('admin-dash', viewDash)
      .on('admin-plans', viewPlans)
      .on('admin-months', viewMonths)
      .on('admin-summary', viewSummary)
      .on('admin-reports', viewReports)
      .on('admin-sites', viewSites)
      .on('admin-works', viewWorks)
      .on('admin-data', viewData)
      .on('admin-audit', viewAudit);
  }

  global.VIEWS_ADMIN = { register: register };
})(typeof globalThis !== 'undefined' ? globalThis : this);
