/* reports.js — формирование сводов, презентаций (PPTX) и выгрузок в Excel.
   Слайд описывается набором примитивов (прямоугольник, текст, таблица)
   в системе координат 1280×720 и отрисовывается одинаково
   в предпросмотре на экране и в файле презентации. */
(function (global) {
  'use strict';

  var C = global.CORE, XL = global.XLSXLite, PPTX = global.PPTX, UI = global.UI;

  var P = {
    navy: '0B1B33', navy2: '14284B', navy3: '1D3A66',
    accent: '1F6FEB', accentSoft: 'E8F0FE',
    green: '0E8A5F', amber: 'C77C12', red: 'CD2B31', violet: '6A4FD8',
    text: '16202E', text2: '475469', muted: '76829A',
    light: 'F4F6FA', line: 'D5DCE6', white: 'FFFFFF'
  };

  var W = 1280, H = 720, M = 64;   // ширина, высота, поле

  function toneOf(done) {
    if (done === null || done === undefined) return P.muted;
    if (done >= 0.98) return P.green;
    if (done >= 0.85) return P.amber;
    return P.red;
  }

  /* ===================== ПРИМИТИВЫ И ДИАГРАММЫ ===================== */

  function rect(o) { return Object.assign({ type: 'rect' }, o); }
  function text(o) { return Object.assign({ type: 'text' }, o); }
  function table(o) { return Object.assign({ type: 'table' }, o); }

  /* Горизонтальные полосы выполнения */
  function bars(o) {
    var out = [];
    var rowH = o.rowH || 30, gap = o.gap || 9;
    var labelW = o.labelW || 180, valueW = o.valueW || 92;
    var trackX = o.x + labelW + 10, trackW = o.w - labelW - valueW - 10;
    var max = o.max || Math.max(1, Math.max.apply(null, o.items.map(function (i) { return i.value || 0; })));
    o.items.forEach(function (it, i) {
      var y = o.y + i * (rowH + gap);
      out.push(text({
        x: o.x, y: y, w: labelW, h: rowH, text: it.label, size: o.labelSize || 11.5,
        color: P.text2, align: 'right', valign: 'middle'
      }));
      out.push(rect({ x: trackX, y: y + (rowH - 16) / 2, w: trackW, h: 16, fill: 'EDF1F7', radius: true }));
      var frac = Math.max(0, Math.min(1, (it.value || 0) / max));
      if (frac > 0.003) {
        out.push(rect({
          x: trackX, y: y + (rowH - 16) / 2, w: Math.max(5, trackW * frac), h: 16,
          fill: it.color || P.accent, radius: true
        }));
      }
      if (o.target) {
        var tx = trackX + trackW * Math.max(0, Math.min(1, o.target / max));
        out.push(rect({ x: tx - 1, y: y + (rowH - 24) / 2, w: 2, h: 24, fill: P.navy3, alpha: 0.55 }));
      }
      out.push(text({
        x: trackX + trackW + 10, y: y, w: valueW - 10, h: rowH,
        text: it.text != null ? it.text : C.fmtNum(it.value, 0),
        size: o.valueSize || 12, bold: true, color: it.valueColor || P.navy2, valign: 'middle'
      }));
    });
    return out;
  }

  /* Столбчатая диаграмма план/факт */
  function columns(o) {
    var out = [];
    var items = o.items || [];
    var n = items.length || 1;
    var slot = o.w / n;
    var barW = Math.min(o.barW || 24, slot * 0.32);
    var max = o.max || Math.max(1, Math.max.apply(null, items.map(function (i) {
      return Math.max(i.plan || 0, i.fact || 0);
    })));
    var baseY = o.y + o.h;
    var lines = o.grid == null ? 4 : o.grid;
    for (var g = 0; g <= lines; g++) {
      var gy = baseY - o.h * g / lines;
      out.push(rect({ x: o.x, y: gy, w: o.w, h: 1, fill: g === 0 ? 'C4CCD8' : 'EDF1F7' }));
      out.push(text({
        x: o.x - 62, y: gy - 9, w: 56, h: 18, align: 'right', valign: 'middle',
        text: PPTX.fmtShort(max * g / lines), size: 9, color: P.muted
      }));
    }
    items.forEach(function (it, i) {
      var cx = o.x + slot * i + slot / 2;
      var ph = o.h * Math.max(0, Math.min(1, (it.plan || 0) / max));
      var fh = o.h * Math.max(0, Math.min(1, (it.fact || 0) / max));
      out.push(rect({ x: cx - barW - 2, y: baseY - ph, w: barW, h: Math.max(ph, 1.5), fill: 'AFC0D8' }));
      out.push(rect({ x: cx + 2, y: baseY - fh, w: barW, h: Math.max(fh, 1.5), fill: it.color || P.accent }));
      out.push(text({ x: cx - slot / 2, y: baseY + 7, w: slot, h: 18, text: it.label, size: 9.5, color: P.text2, align: 'center' }));
    });
    if (o.legend !== false) {
      /* Легенда повторяет фактическую раскраску столбцов факта */
      var lx = o.x;
      var entries = o.toneLegend
        ? [['AFC0D8', 'План'], [P.green, 'Факт ≥ 98%'], [P.amber, 'Факт 85–98%'], [P.red, 'Факт < 85%']]
        : [['AFC0D8', 'План'], [o.factColor || P.accent, 'Факт']];
      entries.forEach(function (e) {
        out.push(rect({ x: lx, y: o.y - 26, w: 11, h: 11, fill: e[0] }));
        var w = 16 + e[1].length * 5.6;
        out.push(text({ x: lx + 17, y: o.y - 30, w: w, h: 18, text: e[1], size: 10, color: P.text2, valign: 'middle' }));
        lx += 17 + w + 12;
      });
    }
    return out;
  }

  /* Линия накопительного выполнения по дням (ломаная из отрезков) */
  function sparkline(o) {
    var out = [];
    var pts = o.points || [];
    if (pts.length < 2) return out;
    var max = o.max || Math.max.apply(null, pts.map(function (p) { return Math.max(p.a || 0, p.b || 0); })) || 1;
    var stepX = o.w / (pts.length - 1);
    function seg(key, color, width) {
      for (var i = 1; i < pts.length; i++) {
        var x1 = o.x + stepX * (i - 1), y1 = o.y + o.h - o.h * ((pts[i - 1][key] || 0) / max);
        var x2 = o.x + stepX * i, y2 = o.y + o.h - o.h * ((pts[i][key] || 0) / max);
        var dx = x2 - x1, dy = y2 - y1;
        var len = Math.sqrt(dx * dx + dy * dy);
        var steps = Math.max(1, Math.ceil(len / 5));
        for (var s = 0; s < steps; s++) {
          out.push(rect({
            x: x1 + dx * s / steps, y: y1 + dy * s / steps - width / 2,
            w: Math.max(dx / steps, 1.6), h: width, fill: color
          }));
        }
      }
    }
    out.push(rect({ x: o.x, y: o.y + o.h, w: o.w, h: 1, fill: 'C4CCD8' }));
    seg('a', 'AFC0D8', 2.4);
    seg('b', P.accent, 3);
    return out;
  }

  /* ===================== КАРКАС СЛАЙДА ===================== */

  function Deck(meta) {
    this.meta = meta;
    this.slides = [];
  }
  Deck.prototype.add = function (bg) {
    var s = { bg: bg || P.white, el: [] };
    this.slides.push(s);
    return s;
  };

  function pageFrame(deck, s, title, subtitle) {
    s.el.push(rect({ x: 0, y: 0, w: W, h: 4, fill: P.accent }));
    s.el.push(text({ x: M, y: 32, w: W - M * 2 - 300, h: 38, text: title, size: 24, bold: true, color: P.navy2 }));
    if (subtitle) s.el.push(text({ x: M, y: 68, w: W - M * 2 - 300, h: 22, text: subtitle, size: 12.5, color: P.muted }));
    s.el.push(text({
      x: W - M - 320, y: 34, w: 320, h: 20, align: 'right', text: deck.meta.periodLabel,
      size: 12, color: P.text2, bold: true
    }));
    s.el.push(text({
      x: W - M - 320, y: 54, w: 320, h: 18, align: 'right', text: deck.meta.kindLabel,
      size: 10.5, color: deck.meta.kind === 'final' ? P.green : P.amber
    }));
    s.el.push(rect({ x: M, y: H - 40, w: W - M * 2, h: 1, fill: 'E4E9F1' }));
    s.el.push(text({
      x: M, y: H - 33, w: 700, h: 18, size: 9.5, color: P.muted,
      text: deck.meta.org + ' · ' + deck.meta.dept
    }));
    s.el.push(text({
      x: W - M - 200, y: H - 33, w: 200, h: 18, align: 'right', size: 9.5, color: P.muted,
      text: 'Слайд ' + deck.slides.length
    }));
  }

  function kpiTile(x, y, w, hh, label, value, unit, sub, tone) {
    return [
      rect({ x: x, y: y, w: w, h: hh, fill: P.white, line: 'E1E7F0', radius: false }),
      rect({ x: x, y: y, w: 3.5, h: hh, fill: tone || P.accent }),
      text({ x: x + 18, y: y + 14, w: w - 30, h: 16, text: label, size: 10, color: P.muted, bold: true, spacing: 0.6 }),
      text({ x: x + 18, y: y + 34, w: w - 30, h: 34, text: value, size: 25, bold: true, color: P.navy2 }),
      unit ? text({ x: x + 18, y: y + 66, w: w - 30, h: 16, text: unit, size: 10.5, color: P.muted }) : null,
      sub ? text({ x: x + 18, y: y + hh - 28, w: w - 30, h: 18, text: sub, size: 10.5, color: P.text2 }) : null
    ].filter(Boolean);
  }

  /* ===================== СБОРКА ОТЧЁТА ===================== */

  function periodLabel(months) {
    if (!months.length) return '';
    if (months.length === 1) return C.monthTitle(months[0]);
    return C.monthTitle(months[0]) + ' — ' + C.monthTitle(months[months.length - 1]);
  }

  /* opts: {siteIds, months, kind:'draft'|'final', includeSiteSlides, maxWorkRows} */
  function buildReport(opts) {
    var db = C.Data.db();
    var months = opts.months.slice().sort();
    var siteIds = opts.siteIds.slice();
    var agg = C.Calc.aggregate(siteIds, months);
    var kind = opts.kind || (agg.closedAll ? 'final' : 'draft');

    var meta = {
      org: db.settings.org,
      dept: db.settings.dept,
      deptShort: db.settings.deptShort,
      months: months, siteIds: siteIds,
      periodLabel: periodLabel(months),
      kind: kind,
      kindLabel: kind === 'final' ? 'Окончательный отчёт' : 'Предварительный отчёт',
      generatedAt: new Date(),
      author: db.settings.reportAuthor,
      single: siteIds.length === 1,
      agg: agg
    };
    var deck = new Deck(meta);

    slideTitle(deck, agg);
    slideKpi(deck, agg);
    slideSites(deck, agg);
    if (months.length > 1) slideMonths(deck, agg);
    else slideDaily(deck, agg);
    slideWorks(deck, agg, opts.maxWorkRows || 12);
    if (opts.includeSiteSlides !== false) {
      siteIds.forEach(function (sid) { slideSiteDetail(deck, agg, sid); });
    }
    slideAttention(deck, agg);
    slideClosure(deck, agg);

    return deck;
  }

  function slideTitle(deck, agg) {
    var m = deck.meta;
    var s = deck.add(P.navy);
    s.el.push(rect({ x: 0, y: 0, w: W, h: H, fill: P.navy }));
    s.el.push(rect({ x: 0, y: 0, w: W, h: 240, fill: P.navy3, alpha: 0.32 }));
    // декоративный ромб
    s.el.push(rect({ geom: 'diamond', x: W - 300, y: 150, w: 420, h: 420, fill: P.accent, alpha: 0.11 }));
    s.el.push(rect({ geom: 'diamond', x: W - 230, y: 240, w: 250, h: 250, fill: P.accent, alpha: 0.16 }));

    s.el.push(text({ x: M, y: 78, w: 700, h: 22, text: m.org, size: 13, color: '9FB6D6', spacing: 1.4 }));
    s.el.push(text({ x: M, y: 102, w: 700, h: 22, text: m.dept, size: 13, color: '7F9BC2' }));
    s.el.push(rect({ x: M, y: 210, w: 62, h: 5, fill: P.accent }));
    s.el.push(text({
      x: M, y: 244, w: 760, h: 150, size: 40, bold: true, color: P.white,
      text: 'Выполнение объёмов дорожных работ'
    }));
    s.el.push(text({ x: M, y: 400, w: 700, h: 34, text: m.periodLabel, size: 22, color: 'C8D8EE' }));
    s.el.push(rect({
      x: M, y: 452, w: 300, h: 34, radius: true,
      fill: m.kind === 'final' ? '0E8A5F' : 'C77C12'
    }));
    s.el.push(text({
      x: M, y: 452, w: 300, h: 34, align: 'center', valign: 'middle',
      text: m.kindLabel.toUpperCase(), size: 11.5, bold: true, color: P.white, spacing: 1.2
    }));

    var scope = m.single ? C.Data.siteName(m.siteIds[0])
      : 'По ' + m.siteIds.length + ' ' + C.plural(m.siteIds.length, 'участку', 'участкам', 'участкам');
    s.el.push(text({ x: M, y: 512, w: 760, h: 24, text: scope, size: 14, color: '9FB6D6' }));

    s.el.push(rect({ x: M, y: H - 118, w: 420, h: 1, fill: 'FFFFFF', alpha: 0.18 }));
    s.el.push(text({
      x: M, y: H - 104, w: 560, h: 20, size: 11, color: '8FA6C6',
      text: 'Сформирован: ' + C.fmtDateTimeRu(m.generatedAt)
    }));
    s.el.push(text({ x: M, y: H - 82, w: 560, h: 20, size: 11, color: '8FA6C6', text: m.author }));
  }

  function slideKpi(deck, agg) {
    var s = deck.add();
    pageFrame(deck, s, 'Ключевые показатели', 'Сводные данные за период по выбранным участкам');
    var y = 128, w = (W - M * 2 - 3 * 18) / 4, hh = 128;

    var closed = 0, total = 0;
    agg.siteIds.forEach(function (sid) {
      agg.months.forEach(function (mk) {
        total++;
        if (C.Data.closure(sid, mk).status === 'closed') closed++;
      });
    });
    var below = agg.works.filter(function (w2) { return w2.done !== null && w2.done < 0.85; }).length;

    s.el = s.el.concat(
      kpiTile(M, y, w, hh, 'ПЛАН ЗА ПЕРИОД', C.fmtNum(agg.totals.plan, 0), 'усл. ед. объёма', null, P.navy3),
      kpiTile(M + (w + 18), y, w, hh, 'ФАКТ ЗА ПЕРИОД', C.fmtNum(agg.totals.fact, 0), 'усл. ед. объёма',
        'Отклонение: ' + C.fmtSigned(agg.totals.deviation, 0), P.accent),
      kpiTile(M + (w + 18) * 2, y, w, hh, 'ВЫПОЛНЕНИЕ ПЛАНА', C.fmtPct(agg.totals.done), null,
        agg.totals.done >= 1 ? 'План перевыполнен' : 'До плана: ' + C.fmtNum(Math.max(0, agg.totals.plan - agg.totals.fact), 0),
        toneOf(agg.totals.done)),
      kpiTile(M + (w + 18) * 3, y, w, hh, 'ЗАКРЫТО ПЕРИОДОВ', closed + ' / ' + total, 'участко-месяцев',
        below ? below + ' ' + C.plural(below, 'позиция', 'позиции', 'позиций') + ' ниже 85%' : 'Отставаний нет',
        closed === total ? P.green : P.amber)
    );

    var items = agg.sites.slice().sort(function (a, b) { return (b.done || 0) - (a.done || 0); }).slice(0, 7)
      .map(function (b) {
        return {
          label: C.Data.siteShort(b.siteId),
          value: (b.done || 0) * 100,
          text: C.fmtPct(b.done),
          color: toneOf(b.done),
          valueColor: toneOf(b.done)
        };
      });
    s.el.push(text({ x: M, y: 292, w: 500, h: 24, text: 'Выполнение плана по участкам', size: 14, bold: true, color: P.navy2 }));
    s.el = s.el.concat(bars({
      x: M, y: 326, w: 600, items: items, max: Math.max(110, Math.max.apply(null, items.map(function (i) { return i.value; }))),
      target: 100
    }));

    s.el.push(text({ x: 730, y: 292, w: 500, h: 24, text: 'Структура плана по видам работ', size: 14, bold: true, color: P.navy2 }));
    var top = agg.works.slice(0, 6);
    var rest = agg.works.slice(6).reduce(function (a, w2) { return a + w2.plan; }, 0);
    var pieItems = top.map(function (w2) {
      return { label: shortWork(w2.work, 26), value: w2.plan, text: C.fmtPct(agg.totals.plan ? w2.plan / agg.totals.plan : 0, 0) };
    });
    if (rest > 0) pieItems.push({ label: 'Прочие виды работ', value: rest, text: C.fmtPct(rest / agg.totals.plan, 0) });
    s.el = s.el.concat(bars({
      x: 730, y: 326, w: 486, labelW: 220, valueW: 62, rowH: 26, gap: 7,
      items: pieItems.map(function (i) { return Object.assign({ color: P.navy3 }, i); })
    }));

    s.el.push(text({
      x: M, y: H - 62, w: W - M * 2, h: 16, size: 9, color: P.muted,
      text: '* Суммарные объёмы приведены в условных единицах: позиции с различными единицами измерения суммируются справочно. Процент выполнения по каждому виду работ рассчитан в натуральных единицах.'
    }));
  }

  function slideSites(deck, agg) {
    var s = deck.add();
    pageFrame(deck, s, 'Выполнение по участкам', 'План, факт и отклонение за ' + deck.meta.periodLabel.toLowerCase());

    var rows = [[
      'Участок', 'План', 'Факт', 'Отклонение', 'Выполнение', 'Позиций', 'Статус'
    ]];
    agg.sites.forEach(function (b) {
      var closedN = b.closedMonths, totalN = b.totalMonths;
      rows.push([
        { text: C.Data.siteName(b.siteId), align: 'left' },
        { text: C.fmtNum(b.plan, 0), align: 'right' },
        { text: C.fmtNum(b.fact, 0), align: 'right' },
        { text: C.fmtSigned(b.deviation, 0), align: 'right', color: b.deviation >= 0 ? P.green : P.red },
        { text: C.fmtPct(b.done), align: 'right', bold: true, color: toneOf(b.done) },
        { text: String(b.rows.length), align: 'center' },
        {
          text: closedN === totalN ? 'закрыт' : closedN + ' из ' + totalN, align: 'center',
          color: closedN === totalN ? P.green : P.amber
        }
      ]);
    });
    rows.push([
      { text: 'ИТОГО', align: 'left', bold: true, fill: 'EEF2F7' },
      { text: C.fmtNum(agg.totals.plan, 0), align: 'right', bold: true, fill: 'EEF2F7' },
      { text: C.fmtNum(agg.totals.fact, 0), align: 'right', bold: true, fill: 'EEF2F7' },
      { text: C.fmtSigned(agg.totals.deviation, 0), align: 'right', bold: true, fill: 'EEF2F7' },
      { text: C.fmtPct(agg.totals.done), align: 'right', bold: true, fill: 'EEF2F7', color: toneOf(agg.totals.done) },
      { text: '', fill: 'EEF2F7' }, { text: '', fill: 'EEF2F7' }
    ]);

    var rowH = rows.length > 8 ? 25 : 30;
    s.el.push(table({
      x: M, y: 124, w: W - M * 2, rowH: rowH, headerH: 34,
      colWidths: [3.4, 1.25, 1.25, 1.25, 1.2, 0.85, 1.05], rows: rows
    }));

    var chartY = 124 + 34 + rows.length * rowH + 64;
    if (chartY < H - 150) {
      /* Заголовок выше легенды диаграммы, которая рисуется на уровне chartY − 26. */
      s.el.push(text({ x: M, y: chartY - 58, w: 600, h: 22, text: 'План и факт по участкам', size: 13, bold: true, color: P.navy2 }));
      s.el = s.el.concat(columns({
        x: M + 66, y: chartY, w: W - M * 2 - 90, h: Math.min(150, H - 90 - chartY),
        toneLegend: true,
        items: agg.sites.map(function (b) {
          return { label: C.Data.siteShort(b.siteId), plan: b.plan, fact: b.fact, color: toneOf(b.done) };
        })
      }));
    }
  }

  function slideMonths(deck, agg) {
    var s = deck.add();
    pageFrame(deck, s, 'Динамика по месяцам', 'Помесячное выполнение плана за период');

    s.el = s.el.concat(columns({
      x: M + 70, y: 150, w: W - M * 2 - 90, h: 240, toneLegend: true,
      items: agg.byMonth.map(function (m) {
        return { label: C.monthShort(m.month), plan: m.plan, fact: m.fact, color: toneOf(m.done) };
      })
    }));

    var rows = [['Месяц', 'План', 'Факт', 'Отклонение', 'Выполнение', 'Закрыто участков']];
    agg.byMonth.forEach(function (m) {
      var closed = agg.siteIds.filter(function (sid) { return C.Data.closure(sid, m.month).status === 'closed'; }).length;
      rows.push([
        { text: C.monthTitle(m.month), align: 'left' },
        { text: C.fmtNum(m.plan, 0), align: 'right' },
        { text: C.fmtNum(m.fact, 0), align: 'right' },
        { text: C.fmtSigned(m.fact - m.plan, 0), align: 'right', color: m.fact >= m.plan ? P.green : P.red },
        { text: C.fmtPct(m.done), align: 'right', bold: true, color: toneOf(m.done) },
        { text: closed + ' из ' + agg.siteIds.length, align: 'center', color: closed === agg.siteIds.length ? P.green : P.amber }
      ]);
    });
    var rowH = Math.max(20, Math.min(28, (H - 520) / Math.max(rows.length, 1)));
    s.el.push(table({
      x: M, y: 452, w: W - M * 2, rowH: rowH, headerH: 30,
      colWidths: [2.2, 1.2, 1.2, 1.2, 1.2, 1.4], rows: rows.slice(0, 9)
    }));
  }

  function slideDaily(deck, agg) {
    var month = agg.months[0];
    var dyn = C.Calc.dailyDynamics(agg.siteIds, month);
    if (!dyn.length) return;
    var s = deck.add();
    pageFrame(deck, s, 'Динамика внутри месяца', 'Нарастающий итог выполнения, ' + C.monthTitle(month));

    var maxV = Math.max.apply(null, dyn.map(function (d) { return Math.max(d.cumPlan, d.cumFact); })) || 1;
    s.el.push(rect({ x: M, y: 130, w: W - M * 2, h: 300, fill: 'FBFCFE', line: 'E8EDF4' }));
    s.el = s.el.concat(sparkline({
      x: M + 54, y: 160, w: W - M * 2 - 90, h: 240, max: maxV,
      points: dyn.map(function (d) { return { a: d.cumPlan, b: d.cumFact }; })
    }));
    [0, 0.5, 1].forEach(function (f) {
      s.el.push(text({
        x: M + 4, y: 160 + 240 * (1 - f) - 8, w: 46, h: 16, align: 'right',
        text: PPTX.fmtShort(maxV * f), size: 9, color: P.muted
      }));
    });
    var step = dyn.length > 20 ? 3 : 1;
    dyn.forEach(function (d, i) {
      if (i % step) return;
      s.el.push(text({
        x: M + 54 + (W - M * 2 - 90) * (i / Math.max(dyn.length - 1, 1)) - 14, y: 404, w: 28, h: 16,
        text: String(d.day), size: 8.5, color: P.muted, align: 'center'
      }));
    });
    s.el.push(rect({ x: M + 54, y: 442, w: 22, h: 3, fill: 'AFC0D8' }));
    s.el.push(text({ x: M + 84, y: 434, w: 160, h: 18, text: 'План нарастающим итогом', size: 10.5, color: P.text2, valign: 'middle' }));
    s.el.push(rect({ x: M + 260, y: 442, w: 22, h: 3, fill: P.accent }));
    s.el.push(text({ x: M + 290, y: 434, w: 160, h: 18, text: 'Факт нарастающим итогом', size: 10.5, color: P.text2, valign: 'middle' }));

    var last = dyn[dyn.length - 1];
    var filled = dyn.filter(function (d) { return d.fact > 0; }).length;
    var w2 = (W - M * 2 - 36) / 3;
    s.el = s.el.concat(
      kpiTile(M, 486, w2, 110, 'ДНЕЙ С ВНЕСЁННЫМИ ДАННЫМИ', filled + ' / ' + dyn.length, null, null, filled === dyn.length ? P.green : P.amber),
      kpiTile(M + w2 + 18, 486, w2, 110, 'ФАКТ НА КОНЕЦ ПЕРИОДА', C.fmtNum(last.cumFact, 0), 'усл. ед.', null, P.accent),
      kpiTile(M + (w2 + 18) * 2, 486, w2, 110, 'ОТКЛОНЕНИЕ ОТ ПЛАНА', C.fmtSigned(last.cumFact - last.cumPlan, 0), 'усл. ед.', null,
        last.cumFact >= last.cumPlan ? P.green : P.red)
    );
  }

  function shortWork(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
  }

  function slideWorks(deck, agg, maxRows) {
    var list = agg.works.slice(0, maxRows);
    var s = deck.add();
    pageFrame(deck, s, 'Выполнение по видам работ', 'Натуральные единицы измерения, свод по выбранным участкам');
    var rows = [['Вид работ', 'Ед. изм.', 'План', 'Факт', 'Отклонение', 'Выполнение']];
    list.forEach(function (w2) {
      rows.push([
        { text: shortWork(w2.work, 58), align: 'left' },
        { text: C.prettyUnit(w2.unit), align: 'center' },
        { text: C.fmtNum(w2.plan, 'auto'), align: 'right' },
        { text: C.fmtNum(w2.fact, 'auto'), align: 'right' },
        { text: C.fmtSigned(w2.deviation, 'auto'), align: 'right', color: w2.deviation >= 0 ? P.green : P.red },
        { text: C.fmtPct(w2.done), align: 'right', bold: true, color: toneOf(w2.done) }
      ]);
    });
    var rowH = Math.max(19, Math.min(28, 470 / Math.max(rows.length, 1)));
    s.el.push(table({
      x: M, y: 124, w: W - M * 2, rowH: rowH, headerH: 32,
      colWidths: [4.3, 0.95, 1.15, 1.15, 1.15, 1.1], rows: rows, fontSize: rowH < 22 ? 9.5 : 10.5
    }));
    if (agg.works.length > maxRows) {
      s.el.push(text({
        x: M, y: 124 + 32 + rows.length * rowH + 10, w: W - M * 2, h: 18, size: 10, color: P.muted,
        text: 'Показаны ' + maxRows + ' видов работ с наибольшим плановым объёмом из ' + agg.works.length + '. Полный перечень — в приложении Excel.'
      }));
    }
  }

  function slideSiteDetail(deck, agg, siteId) {
    var b = agg.bySite[siteId];
    var site = C.Data.site(siteId);
    var rowsAll = b.rows.filter(function (r) { return r.plan > 0 || r.fact > 0; });
    var perSlide = 13;
    var pages = Math.max(1, Math.ceil(rowsAll.length / perSlide));

    for (var p = 0; p < pages; p++) {
      var chunk = rowsAll.slice(p * perSlide, (p + 1) * perSlide);
      var s = deck.add();
      pageFrame(deck, s,
        (site ? site.name : siteId) + (pages > 1 ? ' (' + (p + 1) + '/' + pages + ')' : ''),
        (site ? site.chief + ' · ' + site.roads : ''));

      if (p === 0) {
        var w2 = (W - M * 2 - 54) / 4;
        var closedN = b.closedMonths;
        s.el = s.el.concat(
          kpiTile(M, 116, w2, 104, 'ПЛАН', C.fmtNum(b.plan, 0), 'усл. ед.', null, P.navy3),
          kpiTile(M + w2 + 18, 116, w2, 104, 'ФАКТ', C.fmtNum(b.fact, 0), 'усл. ед.', null, P.accent),
          kpiTile(M + (w2 + 18) * 2, 116, w2, 104, 'ВЫПОЛНЕНИЕ', C.fmtPct(b.done), null, null, toneOf(b.done)),
          kpiTile(M + (w2 + 18) * 3, 116, w2, 104, 'СТАТУС ПЕРИОДА', closedN + ' / ' + b.totalMonths, 'месяцев закрыто', null,
            closedN === b.totalMonths ? P.green : P.amber)
        );
      }
      var top = p === 0 ? 244 : 124;
      var rows = [['Объект / контракт', 'Вид работ', 'Ед. изм.', 'План', 'Факт', 'Выполнение']];
      chunk.forEach(function (r) {
        rows.push([
          { text: shortWork(r.object || '—', 30), align: 'left', color: P.text2 },
          { text: shortWork(r.work, 46), align: 'left' },
          { text: C.prettyUnit(r.unit), align: 'center' },
          { text: C.fmtNum(r.plan, 'auto'), align: 'right' },
          { text: C.fmtNum(r.fact, 'auto'), align: 'right' },
          { text: C.fmtPct(r.done), align: 'right', bold: true, color: toneOf(r.done) }
        ]);
      });
      var avail = H - top - 70;
      var rowH = Math.max(18, Math.min(27, avail / Math.max(rows.length, 1)));
      s.el.push(table({
        x: M, y: top, w: W - M * 2, rowH: rowH, headerH: 30,
        colWidths: [2.3, 3.6, 0.9, 1.1, 1.1, 1.1], rows: rows, fontSize: rowH < 22 ? 9.5 : 10.5
      }));
    }
  }

  function slideAttention(deck, agg) {
    var s = deck.add();
    pageFrame(deck, s, 'Зоны внимания и выводы', 'Автоматический анализ отклонений за период');

    var lag = [];
    agg.sites.forEach(function (b) {
      b.rows.forEach(function (r) {
        if (r.plan > 0 && (r.done === null || r.done < 0.85)) {
          lag.push({ site: b.siteId, row: r, gap: r.plan - r.fact });
        }
      });
    });
    lag.sort(function (a, b2) { return b2.gap - a.gap; });

    var over = [];
    agg.sites.forEach(function (b) {
      b.rows.forEach(function (r) { if (r.plan > 0 && r.done > 1.15) over.push({ site: b.siteId, row: r }); });
    });

    var leftW = (W - M * 2 - 24) * 0.58;
    s.el.push(rect({ x: M, y: 118, w: leftW, h: 40, fill: 'FBEAEA' }));
    s.el.push(text({ x: M + 14, y: 118, w: leftW - 28, h: 40, valign: 'middle', size: 13, bold: true, color: '97231F',
      text: 'Отставание от плана (ниже 85%)' }));

    var lagShown = Math.min(lag.length, 8);
    var lagBottom = 172 + 28 + (lagShown + 1) * 24;
    if (lag.length) {
      var rows = [['Участок', 'Вид работ', 'План', 'Факт', '%']];
      lag.slice(0, lagShown).forEach(function (it) {
        rows.push([
          { text: C.Data.siteShort(it.site), align: 'left' },
          { text: shortWork(it.row.work, 32), align: 'left' },
          { text: C.fmtNum(it.row.plan, 'auto'), align: 'right' },
          { text: C.fmtNum(it.row.fact, 'auto'), align: 'right' },
          { text: C.fmtPct(it.row.done), align: 'right', bold: true, color: P.red }
        ]);
      });
      s.el.push(table({
        x: M, y: 172, w: leftW, rowH: 24, headerH: 28,
        colWidths: [1.3, 3.4, 1.1, 1.1, 0.9], rows: rows, fontSize: 10
      }));
    } else {
      s.el.push(text({ x: M + 14, y: 180, w: leftW - 28, h: 30, size: 12, color: P.green, text: 'Позиций с существенным отставанием не выявлено.' }));
    }

    var rx = M + leftW + 24, rw = W - M * 2 - leftW - 24;
    s.el.push(rect({ x: rx, y: 118, w: rw, h: 40, fill: 'E4F4EC' }));
    s.el.push(text({ x: rx + 14, y: 118, w: rw - 28, h: 40, valign: 'middle', size: 13, bold: true, color: '0A5C40',
      text: 'Перевыполнение (свыше 115%)' }));
    var oy = 172;
    if (over.length) {
      over.slice(0, 8).forEach(function (it) {
        s.el.push(text({ x: rx + 6, y: oy, w: rw - 90, h: 18, size: 10.5, color: P.text,
          text: C.Data.siteShort(it.site) + ' · ' + shortWork(it.row.work, 34) }));
        s.el.push(text({ x: rx + rw - 84, y: oy, w: 78, h: 18, size: 10.5, bold: true, color: P.green,
          align: 'right', text: C.fmtPct(it.row.done) }));
        s.el.push(rect({ x: rx + 6, y: oy + 22, w: rw - 12, h: 1, fill: 'E8EDF4' }));
        oy += 28;
      });
    } else {
      s.el.push(text({ x: rx + 6, y: oy, w: rw - 12, h: 20, size: 11, color: P.muted, text: 'Существенного перевыполнения не зафиксировано.' }));
    }

    var concl = [];
    concl.push('Выполнение плана за период — ' + C.fmtPct(agg.totals.done) +
      ' (план ' + C.fmtNum(agg.totals.plan, 0) + ', факт ' + C.fmtNum(agg.totals.fact, 0) + ' усл. ед.).');
    var leaders = agg.sites.slice().sort(function (a, b2) { return (b2.done || 0) - (a.done || 0); });
    if (leaders.length > 1 && leaders[0].done != null) {
      concl.push('Наибольшее выполнение — ' + C.Data.siteName(leaders[0].siteId) + ' (' + C.fmtPct(leaders[0].done) + '), ' +
        'наименьшее — ' + C.Data.siteName(leaders[leaders.length - 1].siteId) + ' (' + C.fmtPct(leaders[leaders.length - 1].done) + ').');
    }
    if (lag.length) concl.push('Требуют внимания ' + lag.length + ' ' + C.plural(lag.length, 'позиция', 'позиции', 'позиций') + ' с выполнением ниже 85%.');
    concl.push(deck.meta.kind === 'final'
      ? 'Отчёт сформирован после закрытия периода всеми участками и является окончательным.'
      : 'Отчёт является предварительным: закрытие периода выполнено не всеми участками.');

    if (lag.length > lagShown) {
      s.el.push(text({
        x: M, y: lagBottom + 4, w: leftW, h: 18, size: 9.5, color: P.muted,
        text: 'Показаны 8 позиций с наибольшим отставанием из ' + lag.length + '. Полный перечень — в приложении Excel.'
      }));
    }
    var cy = Math.max(oy + 24, lagBottom + 30, 430);
    s.el.push(rect({ x: M, y: cy, w: W - M * 2, h: H - cy - 62, fill: 'F6F8FC', line: 'E3E9F2' }));
    s.el.push(text({ x: M + 18, y: cy + 14, w: 400, h: 20, text: 'Выводы', size: 13, bold: true, color: P.navy2 }));
    concl.slice(0, 4).forEach(function (t, i) {
      s.el.push(text({ x: M + 18, y: cy + 42 + i * 26, w: W - M * 2 - 36, h: 24, size: 11.5, color: P.text2, text: '•  ' + t }));
    });
  }

  function slideClosure(deck, agg) {
    var s = deck.add();
    pageFrame(deck, s, 'Статус закрытия периода', 'Подтверждение данных ответственными за участки');

    var rows = [['Участок', 'Ответственный'].concat(agg.months.map(function (m) { return C.monthShort(m); }))];
    agg.siteIds.forEach(function (sid) {
      var site = C.Data.site(sid);
      var line = [
        { text: site ? site.name : sid, align: 'left' },
        { text: site ? site.chief : '—', align: 'left', color: P.text2 }
      ];
      agg.months.forEach(function (mk) {
        var c = C.Data.closure(sid, mk);
        line.push({
          text: c.status === 'closed' ? 'закрыт' : 'открыт', align: 'center',
          color: c.status === 'closed' ? P.green : P.amber,
          fill: c.status === 'closed' ? 'F1F9F5' : 'FDF7EC'
        });
      });
      rows.push(line);
    });
    var mw = agg.months.length;
    var widths = [2.8, 2.4].concat(new Array(mw).fill(Math.max(0.7, Math.min(1.2, 6 / Math.max(mw, 1)))));
    s.el.push(table({
      x: M, y: 124, w: W - M * 2, rowH: 27, headerH: 32, colWidths: widths, rows: rows,
      fontSize: mw > 6 ? 9.5 : 10.5
    }));

    var y = 124 + 32 + rows.length * 27 + 40;
    s.el.push(rect({ x: M, y: y, w: W - M * 2, h: 3, fill: deck.meta.kind === 'final' ? P.green : P.amber }));
    s.el.push(text({
      x: M, y: y + 20, w: W - M * 2, h: 28, size: 15, bold: true,
      color: deck.meta.kind === 'final' ? P.green : P.amber,
      text: deck.meta.kind === 'final'
        ? 'Период закрыт всеми участками. Отчёт окончательный.'
        : 'Период закрыт не всеми участками. Отчёт предварительный.'
    }));

    var sy = Math.min(y + 80, H - 150);
    s.el.push(text({ x: M, y: sy, w: 420, h: 20, size: 11.5, color: P.text2, text: 'Отчёт подготовил:' }));
    s.el.push(rect({ x: M, y: sy + 52, w: 250, h: 1, fill: '9AA7BC' }));
    s.el.push(text({ x: M, y: sy + 58, w: 250, h: 18, size: 10, color: P.muted, text: deck.meta.author }));
    s.el.push(text({ x: M + 420, y: sy, w: 420, h: 20, size: 11.5, color: P.text2, text: 'Утверждаю:' }));
    s.el.push(rect({ x: M + 420, y: sy + 52, w: 250, h: 1, fill: '9AA7BC' }));
    s.el.push(text({ x: M + 420, y: sy + 58, w: 250, h: 18, size: 10, color: P.muted, text: 'Начальник ' + deck.meta.deptShort }));
  }

  /* ===================== ВЫВОД В PPTX ===================== */

  async function toPptx(deck) {
    var p = PPTX.create({
      title: 'Выполнение объёмов работ · ' + deck.meta.periodLabel,
      subject: deck.meta.kindLabel,
      author: deck.meta.org + ' · ' + deck.meta.dept
    });
    deck.slides.forEach(function (s) {
      var sl = p.slide({ bg: s.bg });
      s.el.forEach(function (e) {
        if (e.type === 'rect') sl.rect(e);
        else if (e.type === 'text') sl.text(e);
        else if (e.type === 'table') sl.table(e);
      });
    });
    return p.build();
  }

  /* ===================== ПРЕДПРОСМОТР НА ЭКРАНЕ ===================== */

  function toHtml(deck) {
    var h = UI.h;
    var host = h('div.slide-preview');
    deck.slides.forEach(function (s, i) {
      var frame = h('div.slide-frame', { style: { background: '#' + s.bg } });
      var inner = h('div', {
        style: {
          position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px',
          transformOrigin: '0 0'
        }
      });
      s.el.forEach(function (e) { inner.appendChild(elToHtml(e)); });
      frame.appendChild(inner);
      host.appendChild(h('div', [frame, h('div.slide-num', 'Слайд ' + (i + 1) + ' из ' + deck.slides.length)]));

      var fit = function () {
        var k = frame.clientWidth / W;
        inner.style.transform = 'scale(' + k + ')';
      };
      requestAnimationFrame(fit);
      window.addEventListener('resize', UI.debounce(fit, 120));
    });
    return host;
  }

  function elToHtml(e) {
    var h = UI.h;
    var base = {
      left: e.x + 'px', top: e.y + 'px', width: Math.max(e.w || 0, 0) + 'px', height: Math.max(e.h || 0, 0) + 'px'
    };
    if (e.type === 'rect') {
      return h('div', {
        style: Object.assign({}, base, {
          background: e.fill ? '#' + e.fill : 'transparent',
          opacity: e.alpha != null ? String(e.alpha) : '1',
          border: e.line ? '1px solid #' + e.line : 'none',
          borderRadius: e.radius ? '999px' : '0',
          transform: e.geom === 'diamond' ? 'rotate(45deg)' : 'none'
        })
      });
    }
    if (e.type === 'text') {
      return h('div', {
        style: Object.assign({}, base, {
          display: 'flex',
          alignItems: e.valign === 'middle' ? 'center' : e.valign === 'bottom' ? 'flex-end' : 'flex-start',
          justifyContent: e.align === 'center' ? 'center' : e.align === 'right' ? 'flex-end' : 'flex-start',
          color: '#' + (e.color || P.text),
          fontSize: (e.size || 14) * 1.333 + 'px',
          fontWeight: e.bold ? '700' : '400',
          letterSpacing: e.spacing ? e.spacing + 'px' : 'normal',
          lineHeight: '1.25',
          textAlign: e.align || 'left',
          fontFamily: 'Arial, sans-serif',
          whiteSpace: 'pre-wrap', overflow: 'hidden'
        })
      }, e.text);
    }
    if (e.type === 'table') {
      var widths = e.colWidths || [];
      var sum = widths.reduce(function (a, b) { return a + b; }, 0) || 1;
      var tbl = h('table', {
        style: {
          left: e.x + 'px', top: e.y + 'px', width: e.w + 'px',
          borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'Arial, sans-serif'
        }
      });
      (e.rows || []).forEach(function (r, ri) {
        var isHead = ri < (e.headerRows == null ? 1 : e.headerRows);
        var tr = h('tr');
        r.forEach(function (cell, ci) {
          var c = (typeof cell === 'object' && cell) ? cell : { text: cell };
          var w = widths[ci] ? (widths[ci] / sum * e.w) : (e.w / r.length);
          tr.appendChild(h(isHead ? 'th' : 'td', {
            style: {
              position: 'static', width: w + 'px',
              height: (isHead ? (e.headerH || e.rowH + 6) : e.rowH) + 'px',
              background: '#' + (c.fill || (isHead ? P.navy2 : P.white)),
              color: '#' + (c.color || (isHead ? P.white : P.text)),
              fontSize: ((isHead ? (e.headerSize || 10.5) : (c.size || e.fontSize || 10.5)) * 1.333) + 'px',
              fontWeight: (c.bold != null ? c.bold : isHead) ? '700' : '400',
              textAlign: c.align || (isHead ? 'center' : 'left'),
              border: '0.75px solid #' + (e.border || 'D5DCE6'),
              padding: '2px ' + (e.pad || 6) + 'px',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
            }
          }, c.text));
        });
        tbl.appendChild(tr);
      });
      return tbl;
    }
    return h('div');
  }

  /* ===================== ВЫГРУЗКИ В EXCEL ===================== */

  /* Свод по участку за месяц: план/факт по дням + итоги */
  function siteMonthSheets(siteId, month) {
    var sm = C.Calc.siteMonth(siteId, month);
    var site = C.Data.site(siteId);
    var dim = sm.days;
    var sheets = [];

    /* Лист 1 — свод */
    var rows = [];
    rows.push([{ v: (site ? site.name : siteId) + ' · ' + C.monthTitle(month), s: 'title' }]);
    rows.push([{ v: 'Свод выполнения объёмов работ', s: 'section' }]);
    rows.push([{ v: 'Ответственный:', s: 'sub' }, { v: site ? site.chief : '' }]);
    rows.push([{ v: 'Статус периода:', s: 'sub' }, { v: sm.closure.status === 'closed' ? 'закрыт ' + (sm.closure.closedAt ? C.fmtDateTimeRu(sm.closure.closedAt) : '') : 'открыт (данные могут уточняться)' }]);
    rows.push([{ v: 'Сформирован:', s: 'sub' }, { v: C.fmtDateTimeRu(new Date()) }]);
    rows.push([]);
    rows.push([
      { v: 'Объект / контракт', s: 'h' }, { v: 'Вид работ', s: 'hleft' }, { v: 'Ед. изм.', s: 'h' },
      { v: 'План', s: 'h' }, { v: 'Факт', s: 'h' }, { v: 'Отклонение', s: 'h' }, { v: 'Выполнение', s: 'h' }
    ]);
    var curObj = null;
    sm.rows.forEach(function (r) {
      if (r.object !== curObj) {
        curObj = r.object;
        rows.push([{ v: curObj || 'Без объекта', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' },
        { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }]);
      }
      rows.push([
        { v: r.object, s: 'txt' }, { v: r.work + (r.unplanned ? ' (внеплановая)' : ''), s: 'txt' },
        { v: C.prettyUnit(r.unit), s: 'txtc' },
        { v: r.planTotal, s: 'num' }, { v: r.factTotal, s: 'num' },
        { v: r.deviation, s: r.deviation >= 0 ? 'good' : 'bad' },
        { v: r.done, s: 'pct' }
      ]);
    });
    rows.push([
      { v: 'ИТОГО', s: 'totaltxt' }, { v: '', s: 'totaltxt' }, { v: 'усл. ед.', s: 'totaltxt' },
      { v: C.round(sm.totals.plan, 2), s: 'total' }, { v: C.round(sm.totals.fact, 2), s: 'total' },
      { v: C.round(sm.totals.fact - sm.totals.plan, 2), s: 'total' },
      { v: sm.totals.plan ? sm.totals.fact / sm.totals.plan : null, s: 'pctb' }
    ]);
    rows.push([]);
    rows.push([{ v: 'Суммарная строка приведена в условных единицах: позиции с разными единицами измерения суммируются справочно.', s: 'note' }]);
    sheets.push({
      name: 'Свод ' + (site ? site.code : siteId),
      rows: rows, cols: [{ w: 26 }, { w: 50 }, { w: 12 }, { w: 14 }, { w: 14 }, { w: 14 }, { w: 13 }],
      freeze: { row: 7, col: 2 }
    });

    /* Лист 2 — факт по дням */
    var d1 = [];
    d1.push([{ v: 'Факт по дням · ' + (site ? site.name : siteId) + ' · ' + C.monthTitle(month), s: 'title' }]);
    d1.push([]);
    var head = [{ v: 'Объект', s: 'h' }, { v: 'Вид работ', s: 'hleft' }, { v: 'Ед. изм.', s: 'h' }];
    for (var d = 1; d <= dim; d++) head.push({ v: d, s: 'h' });
    head.push({ v: 'Итого факт', s: 'h' });
    head.push({ v: 'План', s: 'h' });
    d1.push(head);
    sm.rows.forEach(function (r) {
      var line = [{ v: r.object, s: 'txt' }, { v: r.work, s: 'txt' }, { v: C.prettyUnit(r.unit), s: 'txtc' }];
      for (var dd = 1; dd <= dim; dd++) {
        var v = r.factDays[dd] != null ? r.factDays[dd] : r.factDays[String(dd)];
        line.push({ v: v != null && v !== '' ? Number(v) : '', s: 'num' });
      }
      line.push({ v: r.factTotal, s: 'total' });
      line.push({ v: r.planTotal, s: 'num' });
      d1.push(line);
    });
    var dcols = [{ w: 22 }, { w: 44 }, { w: 11 }];
    for (var i = 0; i < dim; i++) dcols.push({ w: 8 });
    dcols.push({ w: 13 }); dcols.push({ w: 13 });
    sheets.push({ name: 'Факт по дням', rows: d1, cols: dcols, freeze: { row: 3, col: 3 } });

    /* Лист 3 — план по дням */
    if (sm.hasPlan) {
      var p1 = [];
      p1.push([{ v: 'План по дням · ' + (site ? site.name : siteId) + ' · ' + C.monthTitle(month), s: 'title' }]);
      p1.push([{ v: 'Источник: ' + (sm.plan.source || '—') + ', загружен ' + C.fmtDateTimeRu(sm.plan.importedAt), s: 'note' }]);
      p1.push([]);
      p1.push(head.slice(0, 3 + dim).concat([{ v: 'Итого план', s: 'h' }]));
      sm.rows.forEach(function (r) {
        var line = [{ v: r.object, s: 'txt' }, { v: r.work, s: 'txt' }, { v: C.prettyUnit(r.unit), s: 'txtc' }];
        for (var dd = 1; dd <= dim; dd++) {
          var v = r.planDays[dd] != null ? r.planDays[dd] : r.planDays[String(dd)];
          line.push({ v: v != null && v !== '' ? Number(v) : '', s: 'num' });
        }
        line.push({ v: r.planTotal, s: 'total' });
        p1.push(line);
      });
      sheets.push({ name: 'План по дням', rows: p1, cols: dcols, freeze: { row: 4, col: 3 } });
    }
    return sheets;
  }

  function exportSiteMonth(siteId, month) {
    var site = C.Data.site(siteId);
    return XL.write({
      title: 'Свод ' + (site ? site.name : siteId) + ' ' + C.monthTitle(month),
      author: C.Data.db().settings.dept,
      sheets: siteMonthSheets(siteId, month)
    });
  }

  /* Общий свод за период */
  function exportSummary(siteIds, months) {
    var agg = C.Calc.aggregate(siteIds, months);
    var sheets = [];

    var rows = [];
    rows.push([{ v: 'Свод выполнения объёмов работ · ' + periodLabel(months), s: 'title' }]);
    rows.push([{ v: C.Data.db().settings.org + ' · ' + C.Data.db().settings.dept, s: 'section' }]);
    rows.push([{ v: 'Сформирован: ' + C.fmtDateTimeRu(new Date()), s: 'note' }]);
    rows.push([]);
    rows.push([
      { v: 'Участок', s: 'hleft' }, { v: 'Ответственный', s: 'hleft' }, { v: 'План', s: 'h' },
      { v: 'Факт', s: 'h' }, { v: 'Отклонение', s: 'h' }, { v: 'Выполнение', s: 'h' },
      { v: 'Позиций', s: 'h' }, { v: 'Закрыто месяцев', s: 'h' }
    ]);
    agg.sites.forEach(function (b) {
      var site = C.Data.site(b.siteId);
      rows.push([
        { v: site ? site.name : b.siteId, s: 'txt' }, { v: site ? site.chief : '', s: 'txt' },
        { v: b.plan, s: 'num' }, { v: b.fact, s: 'num' },
        { v: b.deviation, s: b.deviation >= 0 ? 'good' : 'bad' },
        { v: b.done, s: 'pct' }, { v: b.rows.length, s: 'int' },
        { v: b.closedMonths + ' / ' + b.totalMonths, s: 'txtc' }
      ]);
    });
    rows.push([
      { v: 'ИТОГО', s: 'totaltxt' }, { v: '', s: 'totaltxt' },
      { v: agg.totals.plan, s: 'total' }, { v: agg.totals.fact, s: 'total' },
      { v: agg.totals.deviation, s: 'total' }, { v: agg.totals.done, s: 'pctb' },
      { v: '', s: 'totaltxt' }, { v: '', s: 'totaltxt' }
    ]);
    rows.push([]);
    rows.push([{ v: 'Объёмы в строке «ИТОГО» приведены в условных единицах (позиции с разными единицами измерения суммируются справочно).', s: 'note' }]);
    sheets.push({
      name: 'Свод по участкам', rows: rows,
      cols: [{ w: 38 }, { w: 32 }, { w: 15 }, { w: 15 }, { w: 15 }, { w: 13 }, { w: 10 }, { w: 16 }],
      freeze: { row: 5, col: 1 }
    });

    /* По видам работ */
    var wrows = [];
    wrows.push([{ v: 'Выполнение по видам работ · ' + periodLabel(months), s: 'title' }]);
    wrows.push([]);
    var whead = [{ v: 'Вид работ', s: 'hleft' }, { v: 'Ед. изм.', s: 'h' }, { v: 'План', s: 'h' }, { v: 'Факт', s: 'h' },
    { v: 'Отклонение', s: 'h' }, { v: 'Выполнение', s: 'h' }];
    siteIds.forEach(function (sid) { whead.push({ v: C.Data.siteShort(sid) + ', факт', s: 'h' }); });
    wrows.push(whead);
    agg.works.forEach(function (w2) {
      var line = [
        { v: w2.work, s: 'txt' }, { v: C.prettyUnit(w2.unit), s: 'txtc' },
        { v: w2.plan, s: 'num' }, { v: w2.fact, s: 'num' },
        { v: w2.deviation, s: w2.deviation >= 0 ? 'good' : 'bad' }, { v: w2.done, s: 'pct' }
      ];
      siteIds.forEach(function (sid) { line.push({ v: C.round(w2.sites[sid] || 0, 2), s: 'num' }); });
      wrows.push(line);
    });
    var wcols = [{ w: 56 }, { w: 12 }, { w: 15 }, { w: 15 }, { w: 14 }, { w: 13 }];
    siteIds.forEach(function () { wcols.push({ w: 14 }); });
    sheets.push({ name: 'По видам работ', rows: wrows, cols: wcols, freeze: { row: 3, col: 2 } });

    /* Помесячно */
    if (months.length > 1) {
      var mrows = [];
      mrows.push([{ v: 'Помесячная динамика', s: 'title' }]);
      mrows.push([]);
      var mhead = [{ v: 'Участок', s: 'hleft' }];
      months.forEach(function (mk) {
        mhead.push({ v: C.monthTitle(mk) + ', план', s: 'h' });
        mhead.push({ v: C.monthTitle(mk) + ', факт', s: 'h' });
        mhead.push({ v: C.monthTitle(mk) + ', %', s: 'h' });
      });
      mrows.push(mhead);
      agg.sites.forEach(function (b) {
        var line = [{ v: C.Data.siteName(b.siteId), s: 'txt' }];
        months.forEach(function (mk) {
          var m = b.months[mk];
          line.push({ v: C.round(m.plan, 2), s: 'num' });
          line.push({ v: C.round(m.fact, 2), s: 'num' });
          line.push({ v: m.plan ? m.fact / m.plan : null, s: 'pct' });
        });
        mrows.push(line);
      });
      var mline = [{ v: 'ИТОГО', s: 'totaltxt' }];
      agg.byMonth.forEach(function (m) {
        mline.push({ v: m.plan, s: 'total' });
        mline.push({ v: m.fact, s: 'total' });
        mline.push({ v: m.done, s: 'pctb' });
      });
      mrows.push(mline);
      var mcols = [{ w: 38 }];
      months.forEach(function () { mcols.push({ w: 14 }, { w: 14 }, { w: 10 }); });
      sheets.push({ name: 'Помесячно', rows: mrows, cols: mcols, freeze: { row: 3, col: 1 } });
    }

    /* Детализация по участкам */
    siteIds.forEach(function (sid) {
      var b = agg.bySite[sid];
      var site = C.Data.site(sid);
      var drows = [];
      drows.push([{ v: (site ? site.name : sid) + ' · ' + periodLabel(months), s: 'title' }]);
      drows.push([{ v: site ? (site.chief + ' · ' + site.roads) : '', s: 'note' }]);
      drows.push([]);
      drows.push([{ v: 'Объект / контракт', s: 'hleft' }, { v: 'Вид работ', s: 'hleft' }, { v: 'Ед. изм.', s: 'h' },
      { v: 'План', s: 'h' }, { v: 'Факт', s: 'h' }, { v: 'Отклонение', s: 'h' }, { v: 'Выполнение', s: 'h' }]);
      b.rows.forEach(function (r) {
        drows.push([
          { v: r.object, s: 'txt' }, { v: r.work, s: 'txt' }, { v: C.prettyUnit(r.unit), s: 'txtc' },
          { v: r.plan, s: 'num' }, { v: r.fact, s: 'num' },
          { v: r.deviation, s: r.deviation >= 0 ? 'good' : 'bad' }, { v: r.done, s: 'pct' }
        ]);
      });
      drows.push([{ v: 'ИТОГО', s: 'totaltxt' }, { v: '', s: 'totaltxt' }, { v: 'усл. ед.', s: 'totaltxt' },
      { v: b.plan, s: 'total' }, { v: b.fact, s: 'total' }, { v: b.deviation, s: 'total' }, { v: b.done, s: 'pctb' }]);
      sheets.push({
        name: site ? site.code : sid, rows: drows,
        cols: [{ w: 28 }, { w: 50 }, { w: 12 }, { w: 14 }, { w: 14 }, { w: 14 }, { w: 13 }],
        freeze: { row: 4, col: 2 }
      });
    });

    return XL.write({
      title: 'Свод выполнения объёмов работ',
      author: C.Data.db().settings.dept,
      sheets: sheets
    });
  }

  global.REPORTS = {
    buildReport: buildReport, toPptx: toPptx, toHtml: toHtml,
    exportSiteMonth: exportSiteMonth, exportSummary: exportSummary,
    siteMonthSheets: siteMonthSheets, periodLabel: periodLabel,
    palette: P, toneOf: toneOf
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
