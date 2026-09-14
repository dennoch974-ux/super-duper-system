/* planimport.js — распознавание файлов месячных планов участков.
   Основной формат: по горизонтали — дни месяца, по вертикали — виды работ.
   Дополнительно распознаются: транспонированный формат (дни по вертикали)
   и «свёрнутый» формат (одна колонка с объёмом за месяц). */
(function (global) {
  'use strict';

  var C = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./core.js') : global.CORE;

  var SKIP_ROW_RE = /^\s*(итого|всего|в том числе|итог|справочно|примечание|итоги)(?![а-яёa-z])/i;
  var TOTAL_HEAD_RE = /(итого|всего|кол-?во|количество|объ[её]м|план\b|за месяц|месяц)/i;
  var UNIT_HEAD_RE = /(ед\.?\s*изм|единица|ед\.)/i;
  var NAME_HEAD_RE = /(вид\s*работ|наименование|работы|показател)/i;
  var UNIT_VALUE_RE = /(м2|м²|м3|м³|\bкм\b|\bм\b|шт|маш|т\b|га|%|ед)/i;

  function cellText(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return C.fmtDateRu(v);
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function isDayValue(v, monthHint) {
    if (v instanceof Date) {
      return { day: v.getDate(), month: C.monthKey(v) };
    }
    var n = C.parseNum(v);
    if (n != null && n >= 1 && n <= 31 && Math.abs(n - Math.round(n)) < 1e-9) return { day: Math.round(n), month: null };
    var s = cellText(v);
    // «01.02», «1 фев», «02.2026»
    var m = s.match(/^(\d{1,2})[.\-\/]\d{1,2}(?:[.\-\/]\d{2,4})?$/);
    if (m) return { day: +m[1], month: null };
    m = s.match(/^(\d{1,2})\s*[а-яa-z]{3,}$/i);
    if (m && +m[1] >= 1 && +m[1] <= 31) return { day: +m[1], month: null };
    return null;
  }

  /* Поиск строки-шапки с днями месяца */
  function findDayHeader(grid, limit) {
    var best = null;
    var maxScan = Math.min(grid.length, limit || 40);
    for (var r = 0; r < maxScan; r++) {
      var row = grid[r] || [];
      var days = {}, seq = [], monthHits = {};
      for (var c = 0; c < row.length; c++) {
        var d = isDayValue(row[c]);
        if (d) {
          days[c] = d.day;
          seq.push(d.day);
          if (d.month) monthHits[d.month] = (monthHits[d.month] || 0) + 1;
        }
      }
      if (seq.length < 5) continue;
      // последовательность должна возрастать и начинаться близко к 1
      var inc = 0;
      for (var i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1] + 1) inc++;
      var score = seq.length + inc * 2 - (seq[0] > 2 ? 6 : 0);
      if (!best || score > best.score) {
        var month = Object.keys(monthHits).sort(function (a, b) { return monthHits[b] - monthHits[a]; })[0] || null;
        best = { row: r, days: days, score: score, count: seq.length, month: month };
      }
    }
    return best && best.count >= 5 ? best : null;
  }

  function transpose(grid) {
    var maxC = 0;
    grid.forEach(function (r) { if (r && r.length > maxC) maxC = r.length; });
    var out = [];
    for (var c = 0; c < maxC; c++) {
      var row = [];
      for (var r = 0; r < grid.length; r++) row.push(grid[r] ? grid[r][c] : null);
      out.push(row);
    }
    return out;
  }

  /* Определение колонок «наименование» и «единица измерения» */
  function detectColumns(grid, headerRow, firstDayCol) {
    var limitCol = firstDayCol != null ? firstDayCol : 8;
    var stats = [];
    for (var c = 0; c < limitCol; c++) {
      var textCount = 0, unitCount = 0, longText = 0, numCount = 0;
      for (var r = headerRow + 1; r < Math.min(grid.length, headerRow + 80); r++) {
        var v = (grid[r] || [])[c];
        var t = cellText(v);
        if (!t) continue;
        if (C.parseNum(v) != null) { numCount++; continue; }
        textCount++;
        if (t.length > 12) longText++;
        if (UNIT_VALUE_RE.test(t) && t.length <= 14) unitCount++;
      }
      var head = cellText((grid[headerRow] || [])[c]);
      stats.push({ col: c, textCount: textCount, unitCount: unitCount, longText: longText, numCount: numCount, head: head });
    }
    var nameCol = null, unitCol = null;
    stats.forEach(function (s) {
      if (NAME_HEAD_RE.test(s.head)) nameCol = nameCol == null ? s.col : nameCol;
      if (UNIT_HEAD_RE.test(s.head)) unitCol = unitCol == null ? s.col : unitCol;
    });
    if (nameCol == null) {
      var byLong = stats.slice().sort(function (a, b) { return b.longText - a.longText || a.col - b.col; })[0];
      nameCol = byLong && byLong.longText > 0 ? byLong.col : 0;
    }
    if (unitCol == null) {
      var cands = stats.filter(function (s) { return s.col !== nameCol && s.unitCount > 0; })
        .sort(function (a, b) { return b.unitCount - a.unitCount || a.col - b.col; });
      unitCol = cands.length ? cands[0].col : null;
    }
    return { nameCol: nameCol, unitCol: unitCol, stats: stats };
  }

  /* Поиск колонки с итоговым объёмом (для формата без разбивки по дням) */
  function detectTotalCol(grid, headerRow, nameCol, unitCol, lastDayCol) {
    var head = grid[headerRow] || [];
    var best = null;
    for (var c = 0; c < Math.max(head.length, 12); c++) {
      if (c === nameCol || c === unitCol) continue;
      if (lastDayCol != null && c <= lastDayCol) continue;
      var t = cellText(head[c]);
      if (TOTAL_HEAD_RE.test(t)) { best = c; break; }
    }
    if (best == null && lastDayCol == null) {
      // первая числовая колонка правее наименования
      var counts = [];
      for (var c2 = 0; c2 < 14; c2++) {
        if (c2 === nameCol || c2 === unitCol) continue;
        var n = 0;
        for (var r = headerRow + 1; r < Math.min(grid.length, headerRow + 80); r++) {
          if (C.parseNum((grid[r] || [])[c2]) != null) n++;
        }
        counts.push({ col: c2, n: n });
      }
      counts.sort(function (a, b) { return b.n - a.n || a.col - b.col; });
      if (counts.length && counts[0].n >= 3) best = counts[0].col;
    }
    return best;
  }

  /* Определение участка по названию листа / файла / содержимому */
  function detectSite(sheetName, fileName, grid) {
    var s = C.Data.findSite(sheetName);
    if (s) return { site: s, source: 'лист «' + sheetName + '»' };
    s = C.Data.findSite(String(fileName || '').replace(/\.(xlsx|xlsm|xls)$/i, ''));
    if (s) return { site: s, source: 'имя файла' };
    for (var r = 0; r < Math.min(grid.length, 10); r++) {
      var line = (grid[r] || []).map(cellText).join(' ');
      if (!line) continue;
      s = C.Data.findSite(line);
      if (s) return { site: s, source: 'строка ' + (r + 1) + ' листа' };
    }
    return { site: null, source: null };
  }

  /* Определение месяца из содержимого (заголовки вида «План на январь 2026») */
  function detectMonth(grid, headerMonth) {
    if (headerMonth) return headerMonth;
    var names = C.MONTHS.map(function (m) { return m.toLowerCase(); });
    var gen = C.MONTHS_GEN;
    for (var r = 0; r < Math.min(grid.length, 14); r++) {
      var line = C.norm((grid[r] || []).map(cellText).join(' '));
      if (!line) continue;
      for (var i = 0; i < 12; i++) {
        var re = new RegExp('(?:^|[^а-я])(' + names[i] + '|' + gen[i] + ')(?:[^а-я]|$)');
        if (re.test(line)) {
          var ym = line.match(/(20\d{2})/);
          var year = ym ? +ym[1] : new Date().getFullYear();
          return year + '-' + C.pad2(i + 1);
        }
      }
    }
    return null;
  }

  /* Основная процедура распознавания одного листа */
  function recognizeSheet(sheet, fileName) {
    var grid = sheet.grid || [];
    var warnings = [];
    var transposed = false;

    var header = findDayHeader(grid);
    var tGrid = transpose(grid);
    var tHeader = findDayHeader(tGrid);
    if (tHeader && (!header || tHeader.score > header.score + 2)) {
      grid = tGrid; header = tHeader; transposed = true;
      warnings.push('Таблица распознана в транспонированном виде: дни расположены по вертикали.');
    }

    var dayCols = header ? header.days : {};
    var dayColKeys = Object.keys(dayCols).map(Number).sort(function (a, b) { return a - b; });
    var firstDayCol = dayColKeys.length ? dayColKeys[0] : null;
    var lastDayCol = dayColKeys.length ? dayColKeys[dayColKeys.length - 1] : null;
    var headerRow = header ? header.row : findFallbackHeader(grid);

    var cols = detectColumns(grid, headerRow, firstDayCol);
    var totalCol = detectTotalCol(grid, headerRow, cols.nameCol, cols.unitCol, lastDayCol);
    var format = dayColKeys.length ? 'daily' : 'monthly';
    if (format === 'monthly') warnings.push('Разбивка по дням не найдена — план принят как суммарный за месяц.');

    var rows = [], currentObject = '';
    var skipped = 0;

    for (var r = headerRow + 1; r < grid.length; r++) {
      var line = grid[r] || [];
      var name = cellText(line[cols.nameCol]);
      if (!name) {
        // наименование может быть сдвинуто (объединённые ячейки)
        for (var c = 0; c < Math.min(line.length, (firstDayCol != null ? firstDayCol : 6)); c++) {
          var alt = cellText(line[c]);
          if (alt && C.parseNum(line[c]) == null && alt.length > 3) { name = alt; break; }
        }
      }
      if (!name) continue;
      if (SKIP_ROW_RE.test(name)) { skipped++; continue; }

      var unit = cols.unitCol != null ? cellText(line[cols.unitCol]) : '';
      if (!unit) {
        var inBr = name.match(/^(.*?)\s*[（(]\s*([^()]{1,18})\s*[)）]\s*$/);
        if (inBr && UNIT_VALUE_RE.test(inBr[2]) && C.parseNum(inBr[2]) == null) {
          unit = inBr[2];
          name = inBr[1].trim();
        }
      }
      var days = {}, sum = 0, anyDay = false;
      dayColKeys.forEach(function (c) {
        var n = C.parseNum(line[c]);
        if (n != null && n !== 0) { days[dayCols[c]] = C.round(n); sum += n; anyDay = true; }
      });
      var total = totalCol != null ? C.parseNum(line[totalCol]) : null;

      var hasNumbers = anyDay || (total != null && total !== 0);
      if (!hasNumbers && !unit) {
        // строка без чисел и без единицы — это заголовок объекта/контракта
        currentObject = name;
        continue;
      }
      if (!hasNumbers) { skipped++; continue; }

      rows.push({
        object: currentObject,
        work: name,
        unit: C.normUnit(unit),
        days: days,
        total: C.round(anyDay ? sum : (total || 0)),
        declaredTotal: total != null ? C.round(total) : null,
        sourceRow: r + 1
      });
    }

    if (format === 'daily') {
      rows.forEach(function (row) {
        if (row.declaredTotal != null && Math.abs(row.declaredTotal - row.total) > Math.max(0.5, row.total * 0.005)) {
          warnings.push('Строка ' + row.sourceRow + ' («' + row.work.slice(0, 40) + '»): сумма по дням ' +
            C.fmtNum(row.total) + ' не совпадает с итогом в файле ' + C.fmtNum(row.declaredTotal) + '.');
        }
      });
    }

    var det = detectSite(sheet.name, fileName, grid);
    var month = detectMonth(grid, header && header.month);

    if (!rows.length) warnings.push('В листе не найдено ни одной строки с объёмами.');
    var withUnit = rows.filter(function (r) { return !!r.unit; }).length;
    if (cols.unitCol == null && withUnit < rows.length) {
      warnings.push('Колонка «ед. изм.» найдена не для всех строк — недостающие единицы будут взяты из справочника работ.');
    }

    return {
      sheetName: sheet.name,
      fileName: fileName,
      site: det.site, siteSource: det.source,
      month: month,
      format: format,
      transposed: transposed,
      headerRow: headerRow + 1,
      nameCol: cols.nameCol, unitCol: cols.unitCol, totalCol: totalCol,
      dayCount: dayColKeys.length,
      rows: rows,
      skipped: skipped,
      warnings: warnings,
      total: C.round(rows.reduce(function (s, r) { return s + r.total; }, 0))
    };
  }

  function findFallbackHeader(grid) {
    for (var r = 0; r < Math.min(grid.length, 30); r++) {
      var line = (grid[r] || []).map(cellText).join(' ');
      if (NAME_HEAD_RE.test(line) || UNIT_HEAD_RE.test(line)) return r;
    }
    return 0;
  }

  /* Распознавание книги целиком */
  async function recognizeFile(file, XLSXLib) {
    var buf = await file.arrayBuffer();
    var wb = await XLSXLib.read(buf);
    var out = [];
    wb.sheets.forEach(function (sh) {
      if (sh.hidden) return;
      var nonEmpty = (sh.grid || []).some(function (r) {
        return (r || []).some(function (v) { return v !== null && v !== undefined && String(v).trim() !== ''; });
      });
      if (!nonEmpty) return;
      var rec = recognizeSheet(sh, file.name);
      rec.id = C.uid('rec');
      out.push(rec);
    });
    return out;
  }

  /* Сборка объекта плана для сохранения */
  function buildPlan(siteId, month, rec, meta) {
    var dim = C.daysInMonth(month);
    var rows = rec.rows.map(function (r) {
      var work = C.Data.ensureWork(r.work, r.unit);
      var unit = r.unit || work.unit;
      var days = {};
      var total = 0;
      if (rec.format === 'daily') {
        Object.keys(r.days).forEach(function (d) {
          if (+d >= 1 && +d <= dim) { days[d] = r.days[d]; total += r.days[d]; }
        });
      } else {
        total = r.total;
      }
      return {
        id: C.Calc.rowKey(r.object, r.work, unit),
        object: r.object || '',
        work: work.name,
        unit: unit,
        days: days,
        total: C.round(rec.format === 'daily' ? total : r.total),
        distributed: rec.format !== 'daily'
      };
    });

    // Объединяем дубликаты строк (одинаковые объект+работа+единица)
    var merged = {}, order = [];
    rows.forEach(function (r) {
      if (!merged[r.id]) { merged[r.id] = r; order.push(r.id); return; }
      var m = merged[r.id];
      Object.keys(r.days).forEach(function (d) { m.days[d] = C.round((m.days[d] || 0) + r.days[d]); });
      m.total = C.round(m.total + r.total);
    });

    return {
      siteId: siteId,
      month: month,
      format: rec.format,
      rows: order.map(function (id) { return merged[id]; }),
      total: C.round(order.reduce(function (s, id) { return s + merged[id].total; }, 0)),
      source: (meta && meta.source) || (rec.fileName + ' / ' + rec.sheetName),
      importedAt: new Date().toISOString(),
      importedBy: (meta && meta.user) || 'Администратор',
      warnings: rec.warnings.slice(0, 20),
      revision: (meta && meta.revision) || 1
    };
  }

  var PLANIMPORT = {
    recognizeFile: recognizeFile,
    recognizeSheet: recognizeSheet,
    buildPlan: buildPlan,
    detectSite: detectSite,
    transpose: transpose
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PLANIMPORT;
  else global.PLANIMPORT = PLANIMPORT;
})(typeof globalThis !== 'undefined' ? globalThis : this);
