/* views-site.js — рабочие экраны ответственного за участок. */
(function (global) {
  'use strict';

  var C = global.CORE, UI = global.UI, R = global.REPORTS;
  var h = UI.h;
  var setPage;

  function me() { return C.Auth.current(); }
  function siteId() { return me().siteId; }
  function readOnly() { return !C.Auth.canEdit(); }

  /* ---------- общие элементы ---------- */

  function monthNav(month, onChange, extra) {
    var months = C.Data.monthsWithData(siteId());
    return h('div.toolbar', [
      h('button.btn.btn-icon', {
        type: 'button', title: 'Предыдущий месяц',
        onclick: function () { onChange(C.shiftMonth(month, -1)); }
      }, '‹'),
      UI.monthSelect(month, months, onChange, { style: { minWidth: '170px' } }),
      h('button.btn.btn-icon', {
        type: 'button', title: 'Следующий месяц',
        onclick: function () { onChange(C.shiftMonth(month, 1)); }
      }, '›'),
      month !== C.todayKey() ? h('button.btn.btn-sm', {
        type: 'button', onclick: function () { onChange(C.todayKey()); }
      }, 'Текущий месяц') : null,
      extra
    ]);
  }

  function closureBadge(sm) {
    if (!sm.hasPlan) return h('span.badge.badge-none', 'План не загружен');
    return sm.closure.status === 'closed'
      ? h('span.badge.badge-closed', 'Месяц закрыт')
      : h('span.badge.badge-open', 'Месяц открыт');
  }

  function lockNotice(sm, month) {
    if (sm.closure.status !== 'closed') return null;
    return UI.notice('success', [
      h('b', 'Месяц закрыт ' + (sm.closure.closedAt ? C.fmtDateTimeRu(sm.closure.closedAt) : '') + '. '),
      'Редактирование данных недоступно. Если требуется внести исправления — ',
      h('a', {
        href: '#', onclick: function (e) { e.preventDefault(); requestReopen(month); }
      }, 'запросите переоткрытие периода'),
      ' у администратора.'
    ]);
  }

  function noPlanNotice(month) {
    return UI.notice('warn', [
      h('b', 'План на ' + C.monthTitle(month).toLowerCase() + ' не загружен. '),
      'Обратитесь к администратору — план по участкам загружается централизованно. ',
      'Вносить фактические объёмы можно и без плана: используйте добавление внеплановых видов работ.'
    ]);
  }

  function requestReopen(month) {
    UI.prompt({
      title: 'Запрос на переоткрытие периода',
      sub: C.monthTitle(month),
      label: 'Причина переоткрытия',
      placeholder: 'Например: уточнён объём по очистке дороги за 28 число',
      okText: 'Отправить запрос'
    }).then(function (reason) {
      if (!reason) return;
      var cl = C.Data.closure(siteId(), month);
      cl.requests = cl.requests || [];
      cl.requests.push({ ts: new Date().toISOString(), by: me().title, reason: reason, status: 'new' });
      C.Data.setClosure(siteId(), month, cl);
      C.Data.audit('Запрос переоткрытия периода', C.monthTitle(month) + ': ' + reason);
      UI.toast('Запрос передан администратору', 'ok');
    });
  }

  /* Запись фактических объёмов */
  function applyChanges(month, changes) {
    var f = C.Data.fact(siteId(), month);
    var n = 0;
    Object.keys(changes).forEach(function (rowId) {
      Object.keys(changes[rowId]).forEach(function (day) {
        var v = changes[rowId][day];
        if (!f.rows[rowId]) f.rows[rowId] = {};
        if (v === null || v === '' || v === undefined) delete f.rows[rowId][day];
        else f.rows[rowId][day] = C.round(v, 3);
        n++;
      });
      if (f.rows[rowId] && !Object.keys(f.rows[rowId]).length) delete f.rows[rowId];
    });
    f.updatedAt = new Date().toISOString();
    f.updatedBy = me().title;
    C.Data.save(true);
    return n;
  }

  function addUnplannedRow(month, onDone) {
    var works = C.Data.works();
    var selWork = h('select', works.map(function (w) {
      return h('option', { value: w.id }, w.name + ' · ' + C.prettyUnit(w.unit));
    }));
    var objInput = h('input', { type: 'text', placeholder: 'Например: Основной контракт «Анабар»' });
    var m = UI.modal({
      title: 'Добавить вид работ',
      sub: 'Работа будет отмечена как внеплановая для ' + C.monthTitle(month).toLowerCase(),
      body: h('div', [
        h('div.field', [h('label', 'Вид работ'), selWork]),
        h('div.field', [h('label', 'Объект / контракт'), objInput,
        h('div.help', 'Необязательно. Указывается для группировки в своде.')]),
        UI.notice('info', 'Внеплановые работы попадают в свод отдельной строкой и учитываются в отчётах управления.')
      ]),
      foot: [
        h('button.btn', { type: 'button', onclick: function () { m.close(); } }, 'Отмена'),
        h('button.btn.btn-primary', {
          type: 'button',
          onclick: function () {
            var w = works.filter(function (x) { return x.id === selWork.value; })[0];
            if (!w) return;
            var obj = objInput.value.trim();
            var id = C.Calc.rowKey(obj, w.name, w.unit);
            var f = C.Data.fact(siteId(), month);
            f.extra = f.extra || [];
            if (!f.extra.filter(function (e) { return e.id === id; }).length) {
              f.extra.push({ id: id, object: obj, work: w.name, unit: w.unit, addedAt: new Date().toISOString(), addedBy: me().title });
            }
            if (!f.rows[id]) f.rows[id] = {};
            C.Data.save(true);
            C.Data.audit('Добавлена внеплановая работа', w.name + ' · ' + C.monthTitle(month));
            m.close();
            UI.toast('Вид работ добавлен', 'ok');
            onDone();
          }
        }, 'Добавить')
      ]
    });
  }

  /* ===================== ОБЗОР ===================== */

  function viewDash(params) {
    var month = params.month || C.todayKey();
    var sm = C.Calc.siteMonth(siteId(), month);
    var site = C.Data.site(siteId());
    var content = setPage('Обзор участка', site.name, [
      h('button.btn', { type: 'button', onclick: function () { UI.Router.go('site-entry', { month: month }); } },
        [UI.icon('edit'), 'Внести объёмы'])
    ]);

    var miss = C.Calc.missingDays(siteId(), month);
    var dim = sm.days;

    content.appendChild(h('div.row.between.wrap.mb-3', [
      monthNav(month, function (m) { UI.Router.go('site-dash', { month: m }); }),
      h('div.row', [closureBadge(sm)])
    ]));

    if (!sm.hasPlan) content.appendChild(h('div.mb-3', noPlanNotice(month)));
    var lock = lockNotice(sm, month);
    if (lock) content.appendChild(h('div.mb-3', lock));
    if (sm.hasPlan && sm.closure.status !== 'closed' && miss.missing.length) {
      content.appendChild(h('div.mb-3', UI.notice('warn', [
        h('b', 'Не внесены данные за ' + miss.missing.length + ' ' +
          C.plural(miss.missing.length, 'день', 'дня', 'дней') + ': '),
        miss.missing.slice(0, 16).join(', ') + (miss.missing.length > 16 ? ' …' : ''),
        '. ',
        h('a', {
          href: '#', onclick: function (e) {
            e.preventDefault();
            UI.Router.go('site-entry', { month: month, day: miss.missing[0] });
          }
        }, 'Заполнить')
      ])));
    }

    content.appendChild(h('div.grid.grid-4.mb-3', [
      UI.kpi({
        label: 'План на месяц', value: C.fmtNum(sm.totals.plan, 0), unit: 'усл. ед.',
        sub: sm.rows.length + ' ' + C.plural(sm.rows.length, 'позиция', 'позиции', 'позиций') + ' в плане', tone: 'navy'
      }),
      UI.kpi({
        label: 'Внесено фактически', value: C.fmtNum(sm.totals.fact, 0), unit: 'усл. ед.',
        sub: 'Отклонение: ' + C.fmtSigned(sm.totals.fact - sm.totals.plan, 0)
      }),
      UI.kpi({
        label: 'Выполнение плана',
        value: C.fmtPct(sm.totals.plan ? sm.totals.fact / sm.totals.plan : null),
        sub: sm.updatedAt ? 'Обновлено ' + C.fmtDateTimeRu(sm.updatedAt) : 'Данные не вносились',
        tone: sm.totals.plan ? (sm.totals.fact / sm.totals.plan >= 0.98 ? 'green' :
          sm.totals.fact / sm.totals.plan >= 0.85 ? 'amber' : 'red') : 'navy'
      }),
      UI.kpi({
        label: 'Дней заполнено', value: sm.filledDays.length + ' / ' + dim,
        sub: miss.missing.length ? 'Пропущено дней: ' + miss.missing.length : 'Пропусков нет',
        tone: miss.missing.length ? 'amber' : 'green'
      })
    ]));

    /* Выполнение по видам работ */
    var top = sm.rows.slice().sort(function (a, b) { return b.planTotal - a.planTotal; }).slice(0, 10);
    content.appendChild(h('div.grid.grid-2', [
      h('div.card', [
        h('div.card-head', h('div', [h('h2', 'Выполнение по видам работ'),
        h('div.sub', 'Топ-10 позиций по плановому объёму')])),
        h('div.card-body', top.length ? top.map(function (r) {
          return h('div.bar-row', [
            h('div.lbl', { title: r.work }, r.work),
            UI.progress(r.done),
            h('div.val' + (UI.doneClass(r.done) ? '.' + UI.doneClass(r.done) : ''), C.fmtPct(r.done))
          ]);
        }) : h('div.muted', 'Нет данных за выбранный месяц.'))
      ]),
      h('div.card', [
        h('div.card-head', h('div', [h('h2', 'Календарь месяца'),
        h('div.sub', 'Заполненные и пропущенные дни')])),
        h('div.card-body', calendarGrid(month, sm, miss))
      ])
    ]));

    content.appendChild(h('div.card.mt-3', [
      h('div.card-head', [
        h('div', [h('h2', 'Сведения об участке')]),
        h('div.spacer'),
        h('button.btn.btn-sm', {
          type: 'button', onclick: function () { UI.Router.go('site-summary', { month: month }); }
        }, 'Полный свод за месяц')
      ]),
      h('div.card-body', h('div.grid.grid-3', [
        infoBlock('Ответственный', site.chief),
        infoBlock('Штатная численность', site.staff + ' человек'),
        infoBlock('Обслуживаемые дороги', site.roads)
      ]))
    ]));
  }

  function infoBlock(label, value) {
    return h('div', [
      h('div.small.muted', label),
      h('div.mt-1', { style: { lineHeight: '1.5' } }, value)
    ]);
  }

  function calendarGrid(month, sm, miss) {
    var dim = sm.days;
    var filled = {};
    sm.filledDays.forEach(function (d) { filled[d] = 1; });
    var missing = {};
    miss.missing.forEach(function (d) { missing[d] = 1; });
    var cells = [];
    var firstW = C.weekdayOf(month, 1);
    for (var i = 0; i < firstW; i++) cells.push(h('div'));
    for (var d = 1; d <= dim; d++) {
      var cls = filled[d] ? 'var(--green)' : missing[d] ? 'var(--amber)' : 'var(--border)';
      var bgc = filled[d] ? 'var(--green-soft)' : missing[d] ? 'var(--amber-soft)' : 'var(--surface-2)';
      cells.push(h('div', {
        title: 'День ' + d + (filled[d] ? ': данные внесены' : missing[d] ? ': данные не внесены' : ''),
        style: {
          textAlign: 'center', padding: '7px 0', borderRadius: '6px', fontSize: '12.5px',
          border: '1px solid ' + cls, background: bgc, color: 'var(--text-2)',
          fontVariantNumeric: 'tabular-nums'
        }
      }, String(d)));
    }
    return h('div', [
      h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', marginBottom: '6px' }
      }, C.WEEKDAYS.map(function (w) {
        return h('div.tiny.muted.center', w);
      })),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' } }, cells),
      h('div.row.mt-3.small.muted', [
        legendDot('var(--green)', 'внесено'),
        legendDot('var(--amber)', 'пропущено'),
        legendDot('var(--border-strong)', 'нет плана')
      ])
    ]);
  }

  function legendDot(color, label) {
    return h('div.row', { style: { gap: '5px' } }, [
      h('i', { style: { width: '9px', height: '9px', borderRadius: '3px', background: color, display: 'block' } }),
      h('span', label)
    ]);
  }

  /* ===================== ВНЕСЕНИЕ ОБЪЁМОВ ===================== */

  function viewEntry(params) {
    var month = params.month || C.todayKey();
    var mode = params.mode === 'week' ? 'week' : 'day';
    var sm = C.Calc.siteMonth(siteId(), month);
    var dim = sm.days;
    var today = new Date();
    var defDay = (C.monthKey(today) === month) ? today.getDate() : 1;
    var day = Math.min(Math.max(parseInt(params.day, 10) || defDay, 1), dim);

    var content = setPage('Внесение объёмов', C.Data.siteName(siteId()) + ' · ' + C.monthTitle(month));
    var locked = sm.closure.status === 'closed' || readOnly();

    content.appendChild(h('div.row.between.wrap.mb-3', [
      h('div.toolbar', [
        monthNav(month, function (m) { UI.Router.go('site-entry', { month: m, mode: mode }); }),
        h('div.seg', [
          h('button', {
            type: 'button', class: mode === 'day' ? 'active' : '',
            onclick: function () { UI.Router.go('site-entry', { month: month, mode: 'day', day: day }); }
          }, 'За день'),
          h('button', {
            type: 'button', class: mode === 'week' ? 'active' : '',
            onclick: function () { UI.Router.go('site-entry', { month: month, mode: 'week', day: day }); }
          }, 'За неделю')
        ])
      ]),
      h('div.row', [closureBadge(sm)])
    ]));

    var lock = lockNotice(sm, month);
    if (lock) { content.appendChild(lock); return; }
    if (!sm.rows.length) {
      content.appendChild(noPlanNotice(month));
      content.appendChild(h('div.mt-3', h('button.btn.btn-primary', {
        type: 'button', onclick: function () { addUnplannedRow(month, function () { viewEntry(params); }); }
      }, [UI.icon('plus'), 'Добавить вид работ'])));
      return;
    }

    var days = mode === 'day' ? [day] : weekDays(month, day);
    var changes = {};
    var dirty = false;

    var saveBtn = h('button.btn.btn-primary', {
      type: 'button', disabled: true,
      onclick: function () {
        var n = applyChanges(month, changes);
        C.Data.audit('Внесены объёмы', C.monthTitle(month) + ', ' +
          (mode === 'day' ? 'день ' + day : 'дни ' + days[0] + '–' + days[days.length - 1]) +
          ', ячеек: ' + n);
        UI.toast('Данные сохранены', 'ok');
        UI.Router.go('site-entry', { month: month, mode: mode, day: day });
      }
    }, [UI.icon('save'), 'Сохранить']);

    function markDirty() {
      dirty = true;
      saveBtn.disabled = false;
    }

    var dayPicker = mode === 'day'
      ? h('div.toolbar', [
        h('button.btn.btn-icon', {
          type: 'button', disabled: day <= 1,
          onclick: function () { UI.Router.go('site-entry', { month: month, mode: mode, day: day - 1 }); }
        }, '‹'),
        h('select', {
          onchange: function (e) { UI.Router.go('site-entry', { month: month, mode: mode, day: e.target.value }); },
          style: { minWidth: '190px' }
        }, dayOptions(month, dim, day, sm)),
        h('button.btn.btn-icon', {
          type: 'button', disabled: day >= dim,
          onclick: function () { UI.Router.go('site-entry', { month: month, mode: mode, day: day + 1 }); }
        }, '›')
      ])
      : h('div.toolbar', [
        h('button.btn.btn-sm', {
          type: 'button', disabled: days[0] <= 1,
          onclick: function () { UI.Router.go('site-entry', { month: month, mode: mode, day: Math.max(1, days[0] - 7) }); }
        }, '‹ Предыдущая неделя'),
        h('div.strong', 'Дни ' + days[0] + ' – ' + days[days.length - 1]),
        h('button.btn.btn-sm', {
          type: 'button', disabled: days[days.length - 1] >= dim,
          onclick: function () { UI.Router.go('site-entry', { month: month, mode: mode, day: Math.min(dim, days[days.length - 1] + 1) }); }
        }, 'Следующая неделя ›')
      ]);

    var table = buildEntryTable(month, sm, days, changes, markDirty);

    content.appendChild(h('div.card', [
      h('div.card-head', [
        dayPicker,
        h('div.spacer'),
        h('button.btn.btn-sm', {
          type: 'button', onclick: function () { addUnplannedRow(month, function () { viewEntry(params); }); }
        }, [UI.icon('plus'), 'Вид работ']),
        saveBtn
      ]),
      h('div.card-body.tight', h('div.table-wrap.tall', table)),
      h('div.card-foot.row', [
        h('div.small.muted', 'Вводите объёмы в единицах измерения, указанных в строке. ' +
          'Пустая ячейка — работа не выполнялась. Изменённые значения подсвечиваются до сохранения.'),
        h('div.spacer')
      ])
    ]));

    window.onbeforeunload = function () { return dirty ? 'Есть несохранённые изменения' : null; };
  }

  function dayOptions(month, dim, day, sm) {
    var filled = {};
    sm.filledDays.forEach(function (d) { filled[d] = 1; });
    var opts = [];
    for (var d = 1; d <= dim; d++) {
      opts.push(h('option', { value: d, selected: d === day },
        C.pad2(d) + '.' + C.pad2(C.parseMonth(month).month + 1) + ' · ' + C.WEEKDAYS[C.weekdayOf(month, d)] +
        (filled[d] ? ' · внесено' : '')));
    }
    return opts;
  }

  function weekDays(month, day) {
    var dim = C.daysInMonth(month);
    var w = C.weekdayOf(month, day);
    var start = Math.max(1, day - w);
    var out = [];
    for (var d = start; d < start + 7 && d <= dim; d++) out.push(d);
    return out;
  }

  function buildEntryTable(month, sm, days, changes, markDirty) {
    var thead = h('thead', h('tr', [
      h('th.sticky-col.col-name', 'Вид работ'),
      h('th', 'Ед. изм.'),
      h('th.n', 'План (период)'),
      h('th.n', 'Факт с начала месяца')
    ].concat(days.map(function (d) {
      var wd = C.weekdayOf(month, d);
      return h('th.day-head' + (wd >= 5 ? '.weekend' : ''), [
        String(d), h('small', C.WEEKDAYS[wd])
      ]);
    })).concat([h('th.n', 'Итого за период')])));

    var tbody = h('tbody');
    var curObj = null;
    var colCount = 5 + days.length;

    sm.rows.forEach(function (r) {
      if (r.object !== curObj) {
        curObj = r.object;
        tbody.appendChild(h('tr.row-group', h('td', { colspan: colCount },
          curObj || 'Без привязки к объекту')));
      }
      var planPeriod = days.reduce(function (a, d) {
        return a + (Number(r.planDays[d] != null ? r.planDays[d] : r.planDays[String(d)]) || 0);
      }, 0);
      var sumCell = h('td.n.strong', '—');

      var inputs = days.map(function (d) {
        var cur = r.factDays[d] != null ? r.factDays[d] : r.factDays[String(d)];
        var planDay = Number(r.planDays[d] != null ? r.planDays[d] : r.planDays[String(d)]) || 0;
        var inp = h('input', {
          type: 'text', inputmode: 'decimal',
          value: cur != null && cur !== '' ? String(cur).replace('.', ',') : '',
          placeholder: planDay ? C.fmtNum(planDay, planDay >= 100 ? 0 : 1) : '',
          title: planDay ? 'План на ' + d + ' число: ' + C.fmtNum(planDay) + ' ' + C.prettyUnit(r.unit) : 'План на этот день не задан',
          oninput: function () {
            var raw = inp.value.trim();
            var val = raw === '' ? null : C.parseNum(raw);
            if (raw !== '' && val === null) { inp.style.borderColor = 'var(--red)'; return; }
            if (val !== null && val < 0) { inp.style.borderColor = 'var(--red)'; return; }
            inp.style.borderColor = '';
            inp.classList.add('changed');
            if (!changes[r.id]) changes[r.id] = {};
            changes[r.id][d] = val;
            markDirty();
            recalc();
          }
        });
        return { el: inp, day: d, planDay: planDay };
      });

      function recalc() {
        var s = 0, any = false;
        inputs.forEach(function (o) {
          var v = C.parseNum(o.el.value);
          if (v != null) { s += v; any = true; }
        });
        sumCell.textContent = any ? C.fmtNum(s, 'auto') : '—';
        var over = planPeriod > 0 && s > planPeriod * 1.2;
        sumCell.className = 'td n strong' + (over ? ' val-warn' : '');
        sumCell.title = over ? 'Факт превышает план периода более чем на 20%' : '';
      }

      var tr = h('tr', [
        h('td.sticky-col.col-name', [
          h('div', r.work),
          r.unplanned ? h('span.badge.badge-violet.no-dot.tiny', 'внеплановая') : null
        ]),
        h('td.c.small', C.prettyUnit(r.unit)),
        h('td.n', planPeriod ? C.fmtNum(planPeriod, 'auto') : '—'),
        h('td.n.muted', C.fmtNum(r.factTotal, 'auto'))
      ].concat(inputs.map(function (o) {
        return h('td.day-cell' + (C.isWeekend(month, o.day) ? '.weekend' : '') + (o.planDay ? '.plan-day' : ''), o.el);
      })).concat([sumCell]));
      tbody.appendChild(tr);
      recalc();
    });

    return h('table.tbl.compact', [thead, tbody]);
  }

  /* ===================== МЕСЯЧНАЯ ТАБЛИЦА ===================== */

  function viewMonthTable(params) {
    var month = params.month || C.todayKey();
    var sm = C.Calc.siteMonth(siteId(), month);
    var dim = sm.days;
    var editing = params.edit === '1';
    var changes = {};

    var content = setPage('Месячная таблица', C.Data.siteName(siteId()) + ' · ' + C.monthTitle(month));
    var locked = sm.closure.status === 'closed' || readOnly();

    var editBtn = h('button.btn.btn-primary', {
      type: 'button', disabled: locked,
      onclick: function () { UI.Router.go('site-month', { month: month, edit: '1' }); }
    }, [UI.icon('edit'), 'Редактировать']);

    var saveBtn = h('button.btn.btn-success', {
      type: 'button',
      onclick: function () {
        var n = applyChanges(month, changes);
        C.Data.audit('Редактирование месячной таблицы', C.monthTitle(month) + ', изменено ячеек: ' + n);
        UI.toast('Изменения сохранены', 'ok');
        UI.Router.go('site-month', { month: month });
      }
    }, [UI.icon('check'), 'Сохранить изменения']);

    var cancelBtn = h('button.btn', {
      type: 'button',
      onclick: function () {
        if (Object.keys(changes).length) {
          UI.confirm({
            title: 'Отменить изменения?',
            text: 'Внесённые, но не сохранённые значения будут потеряны.',
            okText: 'Отменить изменения', danger: true
          }).then(function (ok) { if (ok) UI.Router.go('site-month', { month: month }); });
        } else UI.Router.go('site-month', { month: month });
      }
    }, 'Отмена');

    content.appendChild(h('div.row.between.wrap.mb-3', [
      monthNav(month, function (m) { UI.Router.go('site-month', { month: m }); }),
      h('div.row', [closureBadge(sm)])
    ]));

    var lock = lockNotice(sm, month);
    if (lock) content.appendChild(h('div.mb-3', lock));
    if (!sm.rows.length) { content.appendChild(noPlanNotice(month)); return; }

    if (editing) {
      content.appendChild(h('div.mb-3', UI.notice('info',
        'Режим редактирования: измените необходимые ячейки и нажмите «Сохранить изменения». ' +
        'Отредактированные значения подсвечены до сохранения.')));
    }

    content.appendChild(h('div.card', [
      h('div.card-head', [
        h('div', [
          h('h2', editing ? 'Редактирование фактических объёмов' : 'Фактические объёмы по дням'),
          h('div.sub', sm.updatedAt ? 'Последнее изменение: ' + C.fmtDateTimeRu(sm.updatedAt) + ' · ' + (sm.updatedBy || '') : 'Данные ещё не вносились')
        ]),
        h('div.spacer'),
        editing ? h('div.row', [cancelBtn, saveBtn]) : h('div.row', [
          h('button.btn.btn-sm', {
            type: 'button', onclick: function () { exportMonth(month); }
          }, [UI.icon('download'), 'Excel']),
          editBtn
        ])
      ]),
      h('div.card-body.tight', h('div.table-wrap.tall', monthTable(month, sm, editing && !locked, changes)))
    ]));
  }

  function monthTable(month, sm, editable, changes) {
    var dim = sm.days;
    var headCells = [
      h('th.sticky-col.col-name', 'Вид работ'),
      h('th', 'Ед. изм.'),
      h('th.n', 'План'),
      h('th.n', 'Факт'),
      h('th.n', '%')
    ];
    var today = new Date();
    var isCurrent = C.monthKey(today) === month;
    for (var d = 1; d <= dim; d++) {
      var wd = C.weekdayOf(month, d);
      headCells.push(h('th.day-head' + (wd >= 5 ? '.weekend' : '') + (isCurrent && today.getDate() === d ? '.today' : ''),
        [String(d), h('small', C.WEEKDAYS[wd])]));
    }
    var thead = h('thead', h('tr', headCells));
    var tbody = h('tbody');
    var curObj = null;
    var colCount = 5 + dim;

    sm.rows.forEach(function (r) {
      if (r.object !== curObj) {
        curObj = r.object;
        tbody.appendChild(h('tr.row-group', h('td', { colspan: colCount }, curObj || 'Без привязки к объекту')));
      }
      var factCell = h('td.n', C.fmtNum(r.factTotal, 'auto'));
      var pctCell = h('td.n', UI.pctCell(r.done));
      var cells = [
        h('td.sticky-col.col-name', r.work),
        h('td.c.small', C.prettyUnit(r.unit)),
        h('td.n', C.fmtNum(r.planTotal, 'auto')),
        factCell, pctCell
      ];
      var inputs = [];
      for (var d2 = 1; d2 <= dim; d2++) {
        (function (day) {
          var cur = r.factDays[day] != null ? r.factDays[day] : r.factDays[String(day)];
          var planDay = Number(r.planDays[day] != null ? r.planDays[day] : r.planDays[String(day)]) || 0;
          var cell;
          if (editable) {
            var inp = h('input', {
              type: 'text', inputmode: 'decimal',
              value: cur != null && cur !== '' ? String(cur).replace('.', ',') : '',
              placeholder: planDay ? C.fmtNum(planDay, 0) : '',
              title: planDay ? 'План: ' + C.fmtNum(planDay) : '',
              oninput: function () {
                var raw = inp.value.trim();
                var val = raw === '' ? null : C.parseNum(raw);
                if (raw !== '' && (val === null || val < 0)) { inp.style.borderColor = 'var(--red)'; return; }
                inp.style.borderColor = '';
                inp.classList.add('changed');
                if (!changes[r.id]) changes[r.id] = {};
                changes[r.id][day] = val;
                recalc();
              }
            });
            inputs.push(inp);
            cell = h('td.day-cell' + (C.isWeekend(month, day) ? '.weekend' : ''), inp);
          } else {
            cell = h('td.day-cell' + (C.isWeekend(month, day) ? '.weekend' : ''),
              h('div', { style: { padding: '5px 4px', textAlign: 'right', fontSize: '12.5px' } },
                cur != null && cur !== '' ? C.fmtNum(cur, 'auto') : ''));
          }
          cells.push(cell);
        })(d2);
      }

      function recalc() {
        var s = 0;
        inputs.forEach(function (i) { var v = C.parseNum(i.value); if (v != null) s += v; });
        factCell.textContent = C.fmtNum(s, 'auto');
        var done = r.planTotal ? s / r.planTotal : null;
        UI.clear(pctCell).appendChild(UI.pctCell(done));
      }

      tbody.appendChild(h('tr' + (r.unplanned ? '.row-unplanned' : ''), cells));
    });

    /* Итоговая строка */
    var totals = [h('td.sticky-col', 'ИТОГО'), h('td'),
    h('td.n', C.fmtNum(sm.totals.plan, 0)), h('td.n', C.fmtNum(sm.totals.fact, 0)),
    h('td.n', UI.pctCell(sm.totals.plan ? sm.totals.fact / sm.totals.plan : null))];
    for (var d3 = 1; d3 <= dim; d3++) {
      var s = 0;
      sm.rows.forEach(function (r) {
        var v = r.factDays[d3] != null ? r.factDays[d3] : r.factDays[String(d3)];
        s += Number(v) || 0;
      });
      totals.push(h('td.day-cell', h('div', {
        style: { padding: '5px 4px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }
      }, s ? C.fmtNum(s, 0) : '')));
    }
    tbody.appendChild(h('tr.row-total', totals));

    return h('table.tbl.compact', [thead, tbody]);
  }

  /* ===================== СВОД ЗА МЕСЯЦ ===================== */

  function viewSummary(params) {
    var month = params.month || C.todayKey();
    var sm = C.Calc.siteMonth(siteId(), month);
    var content = setPage('Свод за месяц', C.Data.siteName(siteId()) + ' · ' + C.monthTitle(month), [
      h('button.btn.btn-sm', { type: 'button', onclick: function () { window.print(); } }, [UI.icon('print'), 'Печать']),
      h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: function () { exportMonth(month); } },
        [UI.icon('download'), 'Выгрузить в Excel'])
    ]);

    content.appendChild(h('div.row.between.wrap.mb-3', [
      monthNav(month, function (m) { UI.Router.go('site-summary', { month: m }); }),
      h('div.row', [closureBadge(sm)])
    ]));

    if (!sm.rows.length) { content.appendChild(noPlanNotice(month)); return; }

    var done = sm.totals.plan ? sm.totals.fact / sm.totals.plan : null;
    content.appendChild(h('div.grid.grid-4.mb-3', [
      UI.kpi({ label: 'План', value: C.fmtNum(sm.totals.plan, 0), unit: 'усл. ед.', tone: 'navy' }),
      UI.kpi({ label: 'Факт', value: C.fmtNum(sm.totals.fact, 0), unit: 'усл. ед.' }),
      UI.kpi({
        label: 'Отклонение', value: C.fmtSigned(sm.totals.fact - sm.totals.plan, 0), unit: 'усл. ед.',
        tone: sm.totals.fact >= sm.totals.plan ? 'green' : 'red'
      }),
      UI.kpi({
        label: 'Выполнение', value: C.fmtPct(done),
        tone: done >= 0.98 ? 'green' : done >= 0.85 ? 'amber' : 'red'
      })
    ]));

    var rows = [];
    var curObj = null;
    sm.rows.forEach(function (r) {
      if (r.object !== curObj) {
        curObj = r.object;
        rows.push(h('tr.row-group', h('td', { colspan: 7 }, curObj || 'Без привязки к объекту')));
      }
      rows.push(h('tr' + (r.unplanned ? '.row-unplanned' : ''), [
        h('td.col-name', r.work),
        h('td.c.small', C.prettyUnit(r.unit)),
        h('td.n', C.fmtNum(r.planTotal, 'auto')),
        h('td.n', C.fmtNum(r.factTotal, 'auto')),
        h('td.n', UI.devCell(r.deviation)),
        h('td.n', UI.pctCell(r.done)),
        h('td', { style: { minWidth: '120px' } }, UI.progress(r.done))
      ]));
    });
    rows.push(h('tr.row-total', [
      h('td', 'ИТОГО'), h('td.c.small', 'усл. ед.'),
      h('td.n', C.fmtNum(sm.totals.plan, 0)), h('td.n', C.fmtNum(sm.totals.fact, 0)),
      h('td.n', UI.devCell(sm.totals.fact - sm.totals.plan)),
      h('td.n', UI.pctCell(done)), h('td', UI.progress(done))
    ]));

    content.appendChild(h('div.card', [
      h('div.card-head', h('div', [h('h2', 'Выполнение по видам работ'),
      h('div.sub', 'План, факт и отклонение в натуральных единицах измерения')])),
      h('div.card-body.tight', h('div.table-wrap', h('table.tbl', [
        h('thead', h('tr', [
          h('th.col-name', 'Вид работ'), h('th.c', 'Ед. изм.'), h('th.n', 'План'), h('th.n', 'Факт'),
          h('th.n', 'Отклонение'), h('th.n', 'Выполнение'), h('th', '')
        ])),
        h('tbody', rows)
      ]))),
      h('div.card-foot.small.muted',
        'Строка «ИТОГО» приведена в условных единицах: позиции с разными единицами измерения суммируются справочно.')
    ]));

    /* Сравнение с предыдущими месяцами */
    var prev = [C.shiftMonth(month, -2), C.shiftMonth(month, -1), month];
    var agg = C.Calc.aggregate([siteId()], prev);
    content.appendChild(h('div.card.mt-3', [
      h('div.card-head', h('div', [h('h2', 'Динамика за три месяца')])),
      h('div.card-body', h('div.table-wrap', h('table.tbl', [
        h('thead', h('tr', [h('th', 'Месяц'), h('th.n', 'План'), h('th.n', 'Факт'),
        h('th.n', 'Отклонение'), h('th.n', 'Выполнение'), h('th.c', 'Статус')])),
        h('tbody', agg.byMonth.map(function (m) {
          var cl = C.Data.closure(siteId(), m.month);
          return h('tr', [
            h('td', C.monthTitle(m.month)),
            h('td.n', C.fmtNum(m.plan, 0)),
            h('td.n', C.fmtNum(m.fact, 0)),
            h('td.n', UI.devCell(m.fact - m.plan)),
            h('td.n', UI.pctCell(m.done)),
            h('td.c', UI.statusBadge(cl.status))
          ]);
        }))
      ])))
    ]));
  }

  function exportMonth(month) {
    R.exportSiteMonth(siteId(), month).then(function (blob) {
      var site = C.Data.site(siteId());
      UI.downloadBlob(blob, UI.safeFileName('Свод ' + site.code + ' ' + C.monthTitle(month)) + '.xlsx');
      C.Data.audit('Выгрузка свода в Excel', C.monthTitle(month));
      UI.toast('Файл выгружен', 'ok');
    }).catch(function (e) {
      console.error(e);
      UI.toast('Не удалось сформировать файл: ' + e.message, 'err');
    });
  }

  /* ===================== ЗАКРЫТИЕ МЕСЯЦА ===================== */

  function viewClose(params) {
    var month = params.month || C.todayKey();
    var sm = C.Calc.siteMonth(siteId(), month);
    var miss = C.Calc.missingDays(siteId(), month);
    var content = setPage('Закрытие месяца', C.Data.siteName(siteId()) + ' · ' + C.monthTitle(month));

    content.appendChild(h('div.row.between.wrap.mb-3', [
      monthNav(month, function (m) { UI.Router.go('site-close', { month: m }); }),
      h('div.row', [closureBadge(sm)])
    ]));

    if (sm.closure.status === 'closed') {
      content.appendChild(h('div.card', [
        h('div.card-head', h('div', [h('h2', 'Период закрыт')])),
        h('div.card-body', [
          UI.notice('success', [
            h('div', [h('b', 'Месяц ' + C.monthTitle(month) + ' закрыт.')]),
            h('div.mt-1', 'Закрыл: ' + (sm.closure.closedBy || '—') + ' · ' +
              (sm.closure.closedAt ? C.fmtDateTimeRu(sm.closure.closedAt) : '')),
            sm.closure.comment ? h('div.mt-1', 'Комментарий: ' + sm.closure.comment) : null
          ]),
          h('div.mt-3.row', [
            h('button.btn', { type: 'button', onclick: function () { requestReopen(month); } },
              [UI.icon('unlock'), 'Запросить переоткрытие']),
            h('button.btn.btn-primary', { type: 'button', onclick: function () { exportMonth(month); } },
              [UI.icon('download'), 'Выгрузить свод'])
          ]),
          (sm.closure.requests && sm.closure.requests.length) ? h('div.mt-3', [
            h('h3.mb-1', 'Запросы на переоткрытие'),
            h('div.table-wrap', h('table.tbl.compact', [
              h('thead', h('tr', [h('th', 'Дата'), h('th', 'Причина'), h('th', 'Статус')])),
              h('tbody', sm.closure.requests.slice().reverse().map(function (r) {
                return h('tr', [
                  h('td.small', C.fmtDateTimeRu(r.ts)),
                  h('td', r.reason),
                  h('td', h('span.badge.' + (r.status === 'new' ? 'badge-info' : 'badge-none'),
                    r.status === 'new' ? 'на рассмотрении' : 'обработан'))
                ]);
              }))
            ]))
          ]) : null
        ])
      ]));
      return;
    }

    /* Чек-лист готовности */
    var checks = [];
    checks.push({
      state: sm.hasPlan ? 'ok' : 'bad',
      title: 'План на месяц загружен',
      text: sm.hasPlan
        ? 'Позиций в плане: ' + sm.rows.filter(function (r) { return !r.unplanned; }).length +
        '. Источник: ' + (sm.plan.source || '—') + '.'
        : 'План отсутствует. Закрытие месяца без плана возможно, но свод будет неполным.'
    });
    checks.push({
      state: miss.missing.length === 0 ? 'ok' : 'warn',
      title: 'Данные внесены за все плановые дни',
      text: miss.missing.length === 0
        ? 'Пропущенных дней нет.'
        : 'Не заполнено ' + miss.missing.length + ' ' + C.plural(miss.missing.length, 'день', 'дня', 'дней') +
        ': ' + miss.missing.join(', ') + '.'
    });
    var zero = sm.rows.filter(function (r) { return r.planTotal > 0 && r.factTotal === 0; });
    checks.push({
      state: zero.length === 0 ? 'ok' : 'warn',
      title: 'По всем плановым позициям внесён факт',
      text: zero.length === 0 ? 'Все плановые виды работ имеют фактические объёмы.'
        : 'Нулевой факт по ' + zero.length + ' ' + C.plural(zero.length, 'позиции', 'позициям', 'позициям') + ': ' +
        zero.slice(0, 4).map(function (r) { return r.work; }).join('; ') + (zero.length > 4 ? ' и др.' : '') + '.'
    });
    var over = sm.rows.filter(function (r) { return r.planTotal > 0 && r.factTotal > r.planTotal * 1.2; });
    checks.push({
      state: over.length === 0 ? 'ok' : 'warn',
      title: 'Отсутствуют значительные превышения плана',
      text: over.length === 0 ? 'Превышений плана более чем на 20% не выявлено.'
        : 'Превышение более 20% по ' + over.length + ' ' + C.plural(over.length, 'позиции', 'позициям', 'позициям') +
        '. Проверьте корректность введённых данных.'
    });
    var low = sm.rows.filter(function (r) { return r.planTotal > 0 && r.done !== null && r.done < 0.85; });
    checks.push({
      state: low.length === 0 ? 'ok' : 'warn',
      title: 'Отсутствует существенное отставание',
      text: low.length === 0 ? 'Все позиции выполнены не менее чем на 85%.'
        : low.length + ' ' + C.plural(low.length, 'позиция', 'позиции', 'позиций') +
        ' с выполнением ниже 85%. При закрытии укажите причины в комментарии.'
    });

    var blocking = checks.filter(function (c) { return c.state === 'bad'; }).length;
    var warns = checks.filter(function (c) { return c.state === 'warn'; }).length;
    var comment = h('textarea', {
      placeholder: 'Причины отклонений, особые условия (погода, простои техники), пояснения к превышениям…'
    });

    content.appendChild(h('div.card', [
      h('div.card-head', h('div', [
        h('h2', 'Проверка перед закрытием'),
        h('div.sub', 'После закрытия данные месяца становятся недоступны для редактирования')
      ])),
      h('div.card-body', [
        h('div.check-list', checks.map(function (c) {
          return h('div.check-item.' + c.state, [
            h('div.st', c.state === 'ok' ? '✓' : c.state === 'warn' ? '!' : '×'),
            h('div', [h('b', c.title), h('div.d', c.text)])
          ]);
        })),
        h('div.field.mt-3', [
          h('label', 'Комментарий к закрытию месяца' + (warns ? ' (рекомендуется заполнить)' : '')),
          comment
        ])
      ]),
      h('div.card-foot.row', [
        h('div.small.muted', warns
          ? 'Есть замечания: ' + warns + '. Закрытие возможно — замечания будут зафиксированы в журнале.'
          : 'Замечаний нет. Месяц готов к закрытию.'),
        h('div.spacer'),
        h('button.btn.btn-success', {
          type: 'button', disabled: readOnly(),
          onclick: function () {
            UI.confirm({
              title: 'Закрыть ' + C.monthTitle(month) + '?',
              text: h('div', [
                h('p', 'После закрытия внесение и редактирование объёмов за этот месяц станет невозможным.'),
                h('p', 'Данные будут включены в окончательный отчёт управления.'),
                warns ? UI.notice('warn', 'Незакрытые замечания: ' + warns + '. Они будут сохранены в журнале.') : null
              ]),
              okText: 'Закрыть месяц'
            }).then(function (ok) {
              if (!ok) return;
              C.Data.setClosure(siteId(), month, {
                siteId: siteId(), month: month, status: 'closed',
                closedAt: new Date().toISOString(), closedBy: me().title,
                comment: comment.value.trim(),
                checks: checks.map(function (c) { return { state: c.state, title: c.title }; }),
                totals: sm.totals
              });
              C.Data.audit('Закрытие месяца', C.monthTitle(month) +
                ' · план ' + C.fmtNum(sm.totals.plan, 0) + ', факт ' + C.fmtNum(sm.totals.fact, 0) +
                (warns ? ' · замечаний: ' + warns : ''));
              UI.toast('Месяц ' + C.monthTitle(month) + ' закрыт', 'ok');
              UI.Router.go('site-close', { month: month });
            });
          }
        }, [UI.icon('lock'), 'Закрыть месяц'])
      ])
    ]));
  }

  /* ===================== ПЕРЕДАЧА ДАННЫХ ===================== */

  function viewData(params) {
    var month = params.month || C.todayKey();
    var content = setPage('Передача данных в управление', C.Data.siteName(siteId()));

    content.appendChild(h('div.mb-3', UI.notice('info',
      'Если рабочее место участка не подключено к общей базе, передайте данные файлом: ' +
      'выгрузите пакет и направьте его администратору. Администратор загрузит пакет в свою базу — ' +
      'данные объединятся автоматически.')));

    content.appendChild(h('div.card', [
      h('div.card-head', [monthNav(month, function (m) { UI.Router.go('site-data', { month: m }); })]),
      h('div.card-body', h('div.grid.grid-2', [
        h('div', [
          h('h3.mb-1', 'Пакет данных за месяц'),
          h('p.small.muted', 'Файл в формате JSON содержит фактические объёмы, статус закрытия и служебные отметки. ' +
            'Пригоден только для загрузки в эту же систему.'),
          h('button.btn.btn-primary', {
            type: 'button', onclick: function () { exportPackage(month); }
          }, [UI.icon('send'), 'Выгрузить пакет за ' + C.monthTitle(month).toLowerCase()])
        ]),
        h('div', [
          h('h3.mb-1', 'Свод в Excel'),
          h('p.small.muted', 'Читаемая форма для отправки по электронной почте или печати. ' +
            'Открывается в MS Excel и Р7-Офис.'),
          h('button.btn', { type: 'button', onclick: function () { exportMonth(month); } },
            [UI.icon('download'), 'Выгрузить свод в Excel'])
        ])
      ]))
    ]));
  }

  function exportPackage(month) {
    var sid = siteId();
    var pkg = {
      kind: 'muad-site-package', version: 1,
      siteId: sid, siteName: C.Data.siteName(sid), month: month,
      exportedAt: new Date().toISOString(), exportedBy: me().title,
      fact: C.Data.factRaw(sid, month) || { siteId: sid, month: month, rows: {}, notes: {}, extra: [] },
      closure: C.Data.closure(sid, month)
    };
    var blob = new Blob([JSON.stringify(pkg, null, 1)], { type: 'application/json' });
    var site = C.Data.site(sid);
    UI.downloadBlob(blob, UI.safeFileName('Пакет ' + site.code + ' ' + month) + '.json');
    C.Data.audit('Выгрузка пакета данных', C.monthTitle(month));
    UI.toast('Пакет выгружен', 'ok');
  }

  /* ===================== ПАРОЛЬ И ПРОФИЛЬ ===================== */

  function viewSettings() {
    var site = C.Data.site(siteId());
    var content = setPage('Пароль и профиль', site.name);

    var oldP = h('input', { type: 'password', autocomplete: 'current-password' });
    var newP = h('input', { type: 'password', autocomplete: 'new-password' });
    var newP2 = h('input', { type: 'password', autocomplete: 'new-password' });

    content.appendChild(h('div.grid.grid-2', [
      h('div.card', [
        h('div.card-head', h('div', [h('h2', 'Смена пароля'),
        h('div.sub', 'Пароль используется для входа ответственного за участок')])),
        h('div.card-body', [
          !site.pwdChanged ? UI.notice('warn', 'Используется пароль по умолчанию. Смените его.') : null,
          h('div.field.mt-2', [h('label', 'Текущий пароль'), oldP]),
          h('div.field', [h('label', 'Новый пароль'), newP,
          h('div.help', 'Не менее 6 символов.')]),
          h('div.field', [h('label', 'Повторите новый пароль'), newP2])
        ]),
        h('div.card-foot.row.end', h('button.btn.btn-primary', {
          type: 'button',
          onclick: function () {
            if (C.hashPassword(oldP.value) !== site.passHash) { UI.toast('Текущий пароль указан неверно', 'err'); return; }
            if (newP.value.length < 6) { UI.toast('Новый пароль слишком короткий', 'err'); return; }
            if (newP.value !== newP2.value) { UI.toast('Пароли не совпадают', 'err'); return; }
            C.Auth.setPassword(siteId(), newP.value);
            UI.toast('Пароль изменён', 'ok');
            oldP.value = newP.value = newP2.value = '';
            viewSettings();
          }
        }, 'Сохранить пароль'))
      ]),
      h('div.card', [
        h('div.card-head', h('div', [h('h2', 'Сведения об участке')])),
        h('div.card-body', h('div.stack', [
          infoBlock('Полное наименование', site.name),
          infoBlock('Код участка', site.code),
          infoBlock('Начальник участка', site.chief),
          infoBlock('Штатная численность', site.staff + ' человек'),
          infoBlock('Обслуживаемые дороги', site.roads)
        ])),
        h('div.card-foot.small.muted', 'Изменение сведений об участке выполняется администратором системы.')
      ])
    ]));
  }

  /* ===================== РЕГИСТРАЦИЯ МАРШРУТОВ ===================== */

  function register(Router, setPageFn) {
    setPage = setPageFn;
    Router
      .on('site-dash', viewDash)
      .on('site-entry', viewEntry)
      .on('site-month', viewMonthTable)
      .on('site-summary', viewSummary)
      .on('site-close', viewClose)
      .on('site-data', viewData)
      .on('site-settings', viewSettings);
  }

  global.VIEWS_SITE = { register: register, exportMonth: exportMonth };
})(typeof globalThis !== 'undefined' ? globalThis : this);
