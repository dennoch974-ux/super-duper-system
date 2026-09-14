/* templates.js — формирование шаблонов файлов месячного плана участка.
   Тот же код используется приложением (кнопка «Скачать шаблон») и
   при подготовке примеров форматов. */
(function (global) {
  'use strict';

  var isNode = (typeof require !== 'undefined' && typeof module !== 'undefined');
  var C = isNode ? require('./core.js') : global.CORE;
  var XL = isNode ? require('./xlsx.js') : global.XLSXLite;

  /* Сезонный профиль: доля годового объёма, приходящаяся на месяц */
  var SEASON = {
    'Зимнее содержание': [0.145, 0.130, 0.115, 0.060, 0.010, 0, 0, 0, 0.010, 0.070, 0.130, 0.150],
    'Летнее содержание': [0.010, 0.010, 0.015, 0.060, 0.130, 0.160, 0.170, 0.165, 0.140, 0.090, 0.030, 0.010],
    'Ремонт': [0, 0, 0.010, 0.040, 0.140, 0.190, 0.220, 0.200, 0.140, 0.050, 0.010, 0],
    'Прочие работы': [0.083, 0.083, 0.083, 0.084, 0.083, 0.083, 0.084, 0.083, 0.083, 0.084, 0.083, 0.084]
  };

  function workGroup(name) {
    var w = C.Data ? C.Data.findWork(name) : null;
    if (w && w.group) return w.group;
    var n = C.norm(name);
    if (/снег|голол|песко|соля|бульдозер|зимник/.test(n)) return 'Зимнее содержание';
    if (/планировк|профилиров|обочин/.test(n)) return 'Летнее содержание';
    if (/ремонт|восстановлен|укреплен/.test(n)) return 'Ремонт';
    return 'Прочие работы';
  }

  function monthShare(workName, month) {
    var mi = C.parseMonth(month).month;
    var prof = SEASON[workGroup(workName)] || SEASON['Прочие работы'];
    var sum = prof.reduce(function (a, b) { return a + b; }, 0) || 1;
    return prof[mi] / sum;
  }

  /* Распределение месячного объёма по дням.
     profile: 'even' — равномерно, 'workdays' — с упором на будни. */
  function distribute(total, month, profile) {
    var dim = C.daysInMonth(month);
    var weights = [];
    for (var d = 1; d <= dim; d++) {
      var w = 1;
      if (profile === 'workdays') w = C.isWeekend(month, d) ? 0.45 : 1.15;
      weights.push(w);
    }
    var sw = weights.reduce(function (a, b) { return a + b; }, 0);
    var days = {}, acc = 0;
    for (var i = 0; i < dim; i++) {
      var v = C.round(total * weights[i] / sw, 2);
      days[i + 1] = v;
      acc += v;
    }
    // компенсируем погрешность округления в последний день
    var diff = C.round(total - acc, 2);
    if (Math.abs(diff) > 0.004) days[dim] = C.round((days[dim] || 0) + diff, 2);
    return days;
  }

  /* Строки плана на месяц из годовых объёмов */
  function monthlyRowsFromAnnual(annualRows, month, profile) {
    return annualRows.map(function (r) {
      var share = monthShare(r.work, month);
      var total = C.round(r.year * share, 2);
      return {
        object: r.object, work: r.work, unit: C.normUnit(r.unit),
        total: total,
        days: total > 0 ? distribute(total, month, profile || 'workdays') : {}
      };
    }).filter(function (r) { return r.total > 0; });
  }

  var HEAD = '14284B';

  /* ---- Формат 1: дни по горизонтали (основной) ---- */
  function sheetDaily(site, month, rows, opts) {
    var dim = C.daysInMonth(month);
    var out = [];
    var lastCol = 2 + dim;                       // индекс колонки «Итого»
    out.push([{ v: (opts && opts.org) || 'АК «АЛРОСА» (ПАО) · Мирнинское управление автомобильных дорог', s: 'title' }]);
    out.push([{ v: 'План производства работ на месяц', s: 'section' }]);
    out.push([{ v: 'Участок:', s: 'sub' }, { v: site.name + ' (' + site.code + ')' }]);
    out.push([{ v: 'Месяц:', s: 'sub' }, { v: C.monthTitle(month) }]);
    out.push([]);

    var head = [{ v: 'Вид работ', s: 'hleft' }, { v: 'Ед. изм.', s: 'h' }];
    for (var d = 1; d <= dim; d++) head.push({ v: d, s: 'h' });
    head.push({ v: 'Итого за месяц', s: 'h' });
    out.push(head);

    var curObj = null, totalAll = 0;
    rows.forEach(function (r) {
      if (r.object !== curObj) {
        curObj = r.object;
        var g = [{ v: curObj || 'Основной контракт', s: 'group' }];
        for (var i = 1; i <= dim + 1; i++) g.push({ v: '', s: 'group' });
        out.push(g);
      }
      var line = [{ v: r.work, s: 'txt' }, { v: C.prettyUnit(r.unit), s: 'txtc' }];
      for (var d2 = 1; d2 <= dim; d2++) {
        var v = r.days[d2];
        line.push({ v: v != null && v !== 0 ? v : '', s: 'num' });
      }
      line.push({ v: r.total, s: 'total' });
      totalAll += r.total;
      out.push(line);
    });

    var tot = [{ v: 'ИТОГО по участку', s: 'totaltxt' }, { v: '', s: 'totaltxt' }];
    for (var d3 = 1; d3 <= dim; d3++) {
      var s = 0;
      rows.forEach(function (r) { s += r.days[d3] || 0; });
      tot.push({ v: C.round(s, 2) || '', s: 'total' });
    }
    tot.push({ v: C.round(totalAll, 2), s: 'total' });
    out.push(tot);

    out.push([]);
    out.push([{ v: 'Правила заполнения: строки — виды работ, колонки — дни месяца. Строки без числовых значений считаются заголовками объектов (контрактов).', s: 'note' }]);
    out.push([{ v: 'Пустая ячейка или 0 означают, что работа в этот день не планируется. Колонка «Итого за месяц» проверяется автоматически при загрузке.', s: 'note' }]);

    var cols = [{ w: 52 }, { w: 12 }];
    for (var i2 = 0; i2 < dim; i2++) cols.push({ w: 8.5 });
    cols.push({ w: 15 });

    return {
      name: site.code, rows: out, cols: cols, freeze: { row: 6, col: 2 },
      merges: ['A1:' + XL.colName(Math.min(lastCol, 12)) + '1', 'A2:' + XL.colName(Math.min(lastCol, 12)) + '2']
    };
  }

  /* ---- Формат 2: суммарный объём за месяц (без разбивки по дням) ---- */
  function sheetMonthly(site, month, rows) {
    var out = [];
    out.push([{ v: 'АК «АЛРОСА» (ПАО) · МУАД', s: 'title' }]);
    out.push([{ v: 'План производства работ (суммарно за месяц)', s: 'section' }]);
    out.push([{ v: 'Участок:', s: 'sub' }, { v: site.name + ' (' + site.code + ')' }]);
    out.push([{ v: 'Месяц:', s: 'sub' }, { v: C.monthTitle(month) }]);
    out.push([]);
    out.push([{ v: 'Вид работ', s: 'hleft' }, { v: 'Ед. изм.', s: 'h' }, { v: 'Объём за месяц', s: 'h' }]);
    var curObj = null, sum = 0;
    rows.forEach(function (r) {
      if (r.object !== curObj) {
        curObj = r.object;
        out.push([{ v: curObj || 'Основной контракт', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }]);
      }
      out.push([{ v: r.work, s: 'txt' }, { v: C.prettyUnit(r.unit), s: 'txtc' }, { v: r.total, s: 'num' }]);
      sum += r.total;
    });
    out.push([{ v: 'ИТОГО по участку', s: 'totaltxt' }, { v: '', s: 'totaltxt' }, { v: C.round(sum, 2), s: 'total' }]);
    out.push([]);
    out.push([{ v: 'При загрузке такого файла объём месяца распределяется системой по дням автоматически (равномерно), при необходимости ответственный корректирует факт по дням.', s: 'note' }]);
    return { name: site.code, rows: out, cols: [{ w: 56 }, { w: 14 }, { w: 18 }], freeze: { row: 6, col: 0 } };
  }

  /* ---- Формат 3: транспонированный (дни по вертикали) ---- */
  function sheetTransposed(site, month, rows) {
    var dim = C.daysInMonth(month);
    var out = [];
    out.push([{ v: 'План работ · ' + site.name + ' · ' + C.monthTitle(month), s: 'title' }]);
    out.push([]);
    var head = [{ v: 'День', s: 'h' }];
    rows.forEach(function (r) { head.push({ v: r.work + ' (' + C.prettyUnit(r.unit) + ')', s: 'h' }); });
    out.push(head);
    for (var d = 1; d <= dim; d++) {
      var line = [{ v: d, s: 'txtc' }];
      rows.forEach(function (r) { line.push({ v: r.days[d] || '', s: 'num' }); });
      out.push(line);
    }
    var tot = [{ v: 'Итого', s: 'totaltxt' }];
    rows.forEach(function (r) { tot.push({ v: r.total, s: 'total' }); });
    out.push(tot);
    var cols = [{ w: 8 }];
    rows.forEach(function () { cols.push({ w: 22 }); });
    return { name: site.code, rows: out, cols: cols, freeze: { row: 3, col: 1 } };
  }

  function buildSheet(site, month, rows, format) {
    if (format === 'monthly') return sheetMonthly(site, month, rows);
    if (format === 'transposed') return sheetTransposed(site, month, rows);
    return sheetDaily(site, month, rows);
  }

  /* Шаблон для одного или нескольких участков -> Blob */
  function build(items, opts) {
    var sheets = items.map(function (it) {
      return buildSheet(it.site, it.month, it.rows, (opts && opts.format) || 'daily');
    });
    return XL.write({
      title: 'План работ МУАД',
      author: 'МУАД АК «АЛРОСА» (ПАО)',
      sheets: sheets
    });
  }

  var TEMPLATES = {
    build: build, buildSheet: buildSheet,
    distribute: distribute, monthShare: monthShare,
    monthlyRowsFromAnnual: monthlyRowsFromAnnual, workGroup: workGroup, SEASON: SEASON
  };
  if (isNode) module.exports = TEMPLATES;
  else global.TEMPLATES = TEMPLATES;
})(typeof globalThis !== 'undefined' ? globalThis : this);
