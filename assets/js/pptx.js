/* pptx.js — формирование презентаций (.pptx) без внешних библиотек.
   Открывается в MS PowerPoint, Р7-Офис: Презентация, LibreOffice Impress.
   Система координат — пиксели слайда 1280 x 720 (16:9). */
(function (global) {
  'use strict';

  var ZIP = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./zip.js') : global.ZIP;

  var SLIDE_W = 1280, SLIDE_H = 720;
  var PX = 9525;                         // EMU в одном пикселе (96 dpi)
  var E = function (px) { return Math.round(px * PX); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }
  function clr(c) { return String(c || '000000').replace('#', '').toUpperCase(); }

  /* ---------- элементы текста ---------- */

  function runXml(r, base) {
    var sz = Math.round((r.size || base.size || 14) * 100);
    var props = '<a:rPr lang="ru-RU" sz="' + sz + '"' +
      (r.bold || base.bold ? ' b="1"' : '') +
      (r.italic || base.italic ? ' i="1"' : '') +
      (r.spacing != null ? ' spc="' + Math.round(r.spacing * 100) + '"' : (base.spacing != null ? ' spc="' + Math.round(base.spacing * 100) + '"' : '')) +
      ' dirty="0">' +
      '<a:solidFill><a:srgbClr val="' + clr(r.color || base.color || '1B2430') + '"/></a:solidFill>' +
      '<a:latin typeface="' + esc(r.font || base.font || 'Arial') + '"/>' +
      '<a:cs typeface="' + esc(r.font || base.font || 'Arial') + '"/>' +
      '</a:rPr>';
    return '<a:r>' + props + '<a:t>' + esc(r.text) + '</a:t></a:r>';
  }

  function paraXml(p, base) {
    var algn = { left: 'l', center: 'ctr', right: 'r', justify: 'just' }[p.align || base.align || 'left'];
    var pPr = '<a:pPr algn="' + algn + '"' + (p.indent ? ' marL="' + E(p.indent) + '" indent="' + E(-p.indent) + '"' : '') + '>' +
      (p.spaceBefore ? '<a:spcBef><a:spcPts val="' + Math.round(p.spaceBefore * 100) + '"/></a:spcBef>' : '') +
      (p.lineSpacing ? '<a:lnSpc><a:spcPct val="' + Math.round(p.lineSpacing * 1000) + '"/></a:lnSpc>' : '') +
      (p.bullet ? '<a:buFont typeface="Arial"/><a:buChar char="' + esc(p.bullet) + '"/>' : '<a:buNone/>') +
      '</a:pPr>';
    var runs = (p.runs || [{ text: p.text != null ? p.text : '' }]).map(function (r) { return runXml(r, base); }).join('');
    return '<a:p>' + pPr + runs + '</a:p>';
  }

  function bodyXml(opts) {
    var anchor = { top: 't', middle: 'ctr', bottom: 'b' }[opts.valign || 'top'];
    var pad = opts.pad != null ? opts.pad : 0;
    var paras = opts.paras && opts.paras.length ? opts.paras : [{ text: opts.text != null ? opts.text : '' }];
    return '<p:txBody><a:bodyPr wrap="square" anchor="' + anchor + '" ' +
      'lIns="' + E(pad) + '" tIns="' + E(pad / 2) + '" rIns="' + E(pad) + '" bIns="' + E(pad / 2) + '">' +
      (opts.shrink === false ? '<a:noAutofit/>' : '<a:normAutofit/>') +
      '</a:bodyPr><a:lstStyle/>' +
      paras.map(function (p) { return paraXml(p, opts); }).join('') +
      '</p:txBody>';
  }

  /* ---------- слайд ---------- */

  function Slide(deck, opts) {
    this.deck = deck;
    this.shapes = [];
    this.bg = (opts && opts.bg) || 'FFFFFF';
    this.notes = (opts && opts.notes) || '';
  }

  Slide.prototype.rect = function (o) {
    this.shapes.push({ kind: 'sp', geom: o.geom || (o.radius ? 'roundRect' : 'rect'), o: o });
    return this;
  };

  Slide.prototype.line = function (o) {
    this.shapes.push({
      kind: 'sp', geom: 'rect',
      o: { x: o.x, y: o.y, w: o.w || 1, h: o.h || 1, fill: o.color || 'D8DEE8' }
    });
    return this;
  };

  Slide.prototype.text = function (o) {
    this.shapes.push({ kind: 'sp', geom: 'rect', o: Object.assign({ fill: null }, o) });
    return this;
  };

  /* rows: [[cell,...]]; cell: строка или {text, bold, color, fill, align, size} */
  Slide.prototype.table = function (o) {
    this.shapes.push({ kind: 'tbl', o: o });
    return this;
  };

  /* Горизонтальная гистограмма выполнения */
  Slide.prototype.barChart = function (o) {
    var items = o.items || [];
    var rowH = o.rowH || 30, gap = o.gap || 8;
    var labelW = o.labelW || 190, valueW = o.valueW || 86;
    var trackX = o.x + labelW, trackW = o.w - labelW - valueW;
    var max = o.max || Math.max(1, Math.max.apply(null, items.map(function (i) { return i.value; })));
    var self = this;
    items.forEach(function (it, i) {
      var y = o.y + i * (rowH + gap);
      self.text({
        x: o.x, y: y, w: labelW - 10, h: rowH, text: it.label, size: o.labelSize || 11,
        color: o.labelColor || '3C4758', valign: 'middle', align: 'right', bold: !!it.bold
      });
      self.rect({ x: trackX, y: y + rowH / 2 - 9, w: trackW, h: 18, fill: o.trackFill || 'EEF1F6', radius: true });
      var frac = Math.max(0, Math.min(1, it.value / max));
      if (frac > 0.002) {
        self.rect({
          x: trackX, y: y + rowH / 2 - 9, w: Math.max(4, trackW * frac), h: 18,
          fill: it.color || o.barFill || '1F6FEB', radius: true
        });
      }
      if (o.target != null) {
        var tx = trackX + trackW * Math.max(0, Math.min(1, o.target / max));
        self.rect({ x: tx - 1, y: y + rowH / 2 - 13, w: 2, h: 26, fill: o.targetColor || 'C2410C' });
      }
      self.text({
        x: trackX + trackW + 8, y: y, w: valueW - 8, h: rowH, text: it.text != null ? it.text : String(it.value),
        size: o.valueSize || 11, bold: true, color: it.valueColor || o.valueColor || '14284B',
        valign: 'middle', align: 'left'
      });
    });
    return this;
  };

  /* Вертикальная столбчатая диаграмма (план/факт по периодам) */
  Slide.prototype.columnChart = function (o) {
    var items = o.items || [];
    var self = this;
    var n = items.length || 1;
    var slot = o.w / n;
    var barW = Math.min(o.barW || 26, slot * 0.34);
    var max = o.max || Math.max(1, Math.max.apply(null, items.map(function (i) { return Math.max(i.plan || 0, i.fact || 0); })));
    var baseY = o.y + o.h;
    // сетка
    var lines = o.grid == null ? 4 : o.grid;
    for (var g = 0; g <= lines; g++) {
      var gy = baseY - o.h * g / lines;
      self.rect({ x: o.x, y: gy, w: o.w, h: 1, fill: g === 0 ? 'C4CCD8' : 'EDF0F5' });
      if (o.axisLabels !== false) {
        self.text({
          x: o.x - 58, y: gy - 9, w: 52, h: 18, align: 'right', valign: 'middle',
          text: fmtShort(max * g / lines), size: 9, color: '8A94A6'
        });
      }
    }
    items.forEach(function (it, i) {
      var cx = o.x + slot * i + slot / 2;
      var ph = o.h * Math.max(0, Math.min(1, (it.plan || 0) / max));
      var fh = o.h * Math.max(0, Math.min(1, (it.fact || 0) / max));
      self.rect({ x: cx - barW - 2, y: baseY - ph, w: barW, h: Math.max(ph, 1), fill: o.planColor || 'AFC0D8' });
      self.rect({ x: cx + 2, y: baseY - fh, w: barW, h: Math.max(fh, 1), fill: it.factColor || o.factColor || '1F6FEB' });
      self.text({
        x: cx - slot / 2, y: baseY + 6, w: slot, h: 20, text: it.label, size: 9,
        color: '5A667A', align: 'center'
      });
    });
    return this;
  };

  function fmtShort(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.0', '') + ' млн';
    if (v >= 1e3) return (v / 1e3).toFixed(1).replace('.0', '') + ' тыс';
    return String(Math.round(v * 10) / 10).replace('.', ',');
  }

  /* ---------- сериализация слайда ---------- */

  function shapeXml(sh, id) {
    var o = sh.o;
    if (sh.kind === 'tbl') return tableXml(o, id);
    var fill = o.fill
      ? (o.alpha != null
        ? '<a:solidFill><a:srgbClr val="' + clr(o.fill) + '"><a:alpha val="' + Math.round(o.alpha * 100000) + '"/></a:srgbClr></a:solidFill>'
        : '<a:solidFill><a:srgbClr val="' + clr(o.fill) + '"/></a:solidFill>')
      : '<a:noFill/>';
    var line = o.line ? '<a:ln w="' + Math.round((o.lineWidth || 1) * 12700) + '"><a:solidFill><a:srgbClr val="' + clr(o.line) + '"/></a:solidFill></a:ln>'
      : '<a:ln><a:noFill/></a:ln>';
    var adj = (sh.geom === 'roundRect')
      ? '<a:avLst><a:gd name="adj" fmla="val ' + Math.round((o.radiusPct != null ? o.radiusPct : 0.18) * 100000) + '"/></a:avLst>'
      : '<a:avLst/>';
    var hasText = o.text != null || (o.paras && o.paras.length);
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Shape' + id + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="' + E(o.x) + '" y="' + E(o.y) + '"/><a:ext cx="' + E(Math.max(o.w, 1)) + '" cy="' + E(Math.max(o.h, 1)) + '"/></a:xfrm>' +
      '<a:prstGeom prst="' + sh.geom + '">' + adj + '</a:prstGeom>' + fill + line + '</p:spPr>' +
      (hasText ? bodyXml(o) : '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>') +
      '</p:sp>';
  }

  function tcXml(cell, o, isHeader) {
    var c = (typeof cell === 'object' && cell !== null) ? cell : { text: cell };
    var fill = c.fill || (isHeader ? (o.headerFill || '14284B') : (c.zebra ? (o.zebraFill || 'F5F7FA') : (o.cellFill || 'FFFFFF')));
    var color = c.color || (isHeader ? (o.headerColor || 'FFFFFF') : (o.textColor || '1B2430'));
    var size = c.size || (isHeader ? (o.headerSize || 10.5) : (o.fontSize || 10.5));
    var bold = c.bold != null ? c.bold : !!isHeader;
    var align = c.align || (isHeader ? (o.headerAlign || 'center') : 'left');
    var bw = Math.round((o.borderWidth || 0.75) * 12700);
    var bc = clr(o.border || 'D5DCE6');
    var ln = function (tag) {
      return '<a:ln' + tag + ' w="' + bw + '" cap="flat"><a:solidFill><a:srgbClr val="' + bc + '"/></a:solidFill></a:ln' + tag + '>';
    };
    return '<a:tc' + (c.gridSpan > 1 ? ' gridSpan="' + c.gridSpan + '"' : '') + (c.hMerge ? ' hMerge="1"' : '') + '>' +
      bodyXml({
        text: c.text, size: size, bold: bold, color: color, align: align,
        valign: c.valign || 'middle', pad: o.pad != null ? o.pad : 6, font: o.font, shrink: false
      }).replace(/^<p:txBody>/, '<a:txBody>').replace(/<\/p:txBody>$/, '</a:txBody>') +
      '<a:tcPr marL="' + E(o.pad != null ? o.pad : 6) + '" marR="' + E(o.pad != null ? o.pad : 6) + '" marT="' + E(3) + '" marB="' + E(3) + '" anchor="ctr">' +
      ln('L') + ln('R') + ln('T') + ln('B') +
      '<a:solidFill><a:srgbClr val="' + clr(fill) + '"/></a:solidFill></a:tcPr></a:tc>';
  }

  function tableXml(o, id) {
    var rows = o.rows || [];
    var nCols = Math.max.apply(null, rows.map(function (r) { return r.length; }).concat([1]));
    var widths = o.colWidths && o.colWidths.length === nCols
      ? o.colWidths
      : new Array(nCols).fill(o.w / nCols);
    var sum = widths.reduce(function (a, b) { return a + b; }, 0);
    widths = widths.map(function (w) { return w * o.w / sum; });
    var headerRows = o.headerRows != null ? o.headerRows : 1;
    var rowH = o.rowH || 26;

    var trs = rows.map(function (r, i) {
      var h = (o.rowHeights && o.rowHeights[i]) || (i < headerRows ? (o.headerH || rowH + 6) : rowH);
      var cells = '';
      for (var j = 0; j < nCols; j++) {
        var cell = r[j] != null ? r[j] : '';
        if (typeof cell === 'object' && cell !== null && !cell.zebra && i >= headerRows && o.zebra !== false && i % 2 === 1) cell = Object.assign({}, cell, { zebra: true });
        else if ((typeof cell !== 'object' || cell === null) && i >= headerRows && o.zebra !== false && i % 2 === 1) cell = { text: cell, zebra: true };
        cells += tcXml(cell, o, i < headerRows);
      }
      return '<a:tr h="' + E(h) + '">' + cells + '</a:tr>';
    }).join('');

    return '<p:graphicFrame><p:nvGraphicFramePr>' +
      '<p:cNvPr id="' + id + '" name="Table' + id + '"/>' +
      '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>' +
      '<p:xfrm><a:off x="' + E(o.x) + '" y="' + E(o.y) + '"/><a:ext cx="' + E(o.w) + '" cy="' + E(rows.length * rowH) + '"/></p:xfrm>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
      '<a:tbl><a:tblPr firstRow="' + (headerRows ? 1 : 0) + '" bandRow="0"/>' +
      '<a:tblGrid>' + widths.map(function (w) { return '<a:gridCol w="' + E(w) + '"/>'; }).join('') + '</a:tblGrid>' +
      trs + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
  }

  function slideXml(slide) {
    var id = 2;
    var shapes = slide.shapes.map(function (sh) { return shapeXml(sh, id++); }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="' + clr(slide.bg) + '"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
      '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      shapes + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }

  /* ---------- статические части пакета ---------- */

  var THEME = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="МУАД">' +
    '<a:themeElements><a:clrScheme name="МУАД">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="14284B"/></a:dk2><a:lt2><a:srgbClr val="EEF2F7"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="1F6FEB"/></a:accent1><a:accent2><a:srgbClr val="0E9F6E"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="D97706"/></a:accent3><a:accent4><a:srgbClr val="DC2626"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="6366F1"/></a:accent5><a:accent6><a:srgbClr val="0891B2"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="1F6FEB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>' +
    '</a:clrScheme>' +
    '<a:fontScheme name="МУАД">' +
    '<a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
    '</a:fontScheme>' +
    '<a:fmtScheme name="МУАД">' +
    '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
    '<a:lnStyleLst>' +
    '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
    '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
    '<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
    '</a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>' +
    '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
    '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

  var EMPTY_SPTREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';

  var TXSTYLES = '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="2800" b="1"><a:latin typeface="Arial"/></a:defRPr></a:lvl1pPr></p:titleStyle>' +
    '<p:bodyStyle><a:lvl1pPr><a:defRPr sz="1400"><a:latin typeface="Arial"/></a:defRPr></a:lvl1pPr></p:bodyStyle>' +
    '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1400"><a:latin typeface="Arial"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles>';

  var SLIDE_MASTER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
    EMPTY_SPTREE + '</p:cSld>' +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" ' +
    'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' + TXSTYLES + '</p:sldMaster>';

  var SLIDE_LAYOUT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">' +
    '<p:cSld name="Пустой слайд">' + EMPTY_SPTREE + '</p:cSld>' +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';

  /* ---------- сборка ---------- */

  function Deck(meta) {
    this.meta = meta || {};
    this.slides = [];
  }

  Deck.prototype.slide = function (opts) {
    var s = new Slide(this, opts);
    this.slides.push(s);
    return s;
  };

  Deck.prototype.build = async function () {
    var n = this.slides.length;
    if (!n) throw new Error('Презентация не содержит слайдов');
    var entries = [];

    entries.push({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
        '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>' +
        '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>' +
        this.slides.map(function (_, i) {
          return '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
        }).join('') +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>'
    });

    entries.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>'
    });

    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    entries.push({
      name: 'docProps/core.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + esc(this.meta.title || 'Отчёт') + '</dc:title>' +
        '<dc:subject>' + esc(this.meta.subject || '') + '</dc:subject>' +
        '<dc:creator>' + esc(this.meta.author || 'МУАД') + '</dc:creator>' +
        '<cp:lastModifiedBy>' + esc(this.meta.author || 'МУАД') + '</cp:lastModifiedBy>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
        '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
        '</cp:coreProperties>'
    });
    entries.push({
      name: 'docProps/app.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        '<Application>Система учёта объёмов работ МУАД</Application>' +
        '<Company>АК «АЛРОСА» (ПАО)</Company><Slides>' + n + '</Slides></Properties>'
    });

    entries.push({
      name: 'ppt/presentation.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">' +
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
        '<p:sldIdLst>' + this.slides.map(function (_, i) {
          return '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>';
        }).join('') + '</p:sldIdLst>' +
        '<p:sldSz cx="' + E(SLIDE_W) + '" cy="' + E(SLIDE_H) + '"/>' +
        '<p:notesSz cx="' + E(SLIDE_H) + '" cy="' + E(SLIDE_W) + '"/>' + TXSTYLES +
        '</p:presentation>'
    });

    entries.push({
      name: 'ppt/_rels/presentation.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
        this.slides.map(function (_, i) {
          return '<Relationship Id="rId' + (i + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (n + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>' +
        '<Relationship Id="rId' + (n + 3) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
        '<Relationship Id="rId' + (n + 4) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>' +
        '</Relationships>'
    });

    entries.push({
      name: 'ppt/presProps.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'
    });
    entries.push({
      name: 'ppt/tableStyles.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        'def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>'
    });
    entries.push({ name: 'ppt/theme/theme1.xml', data: THEME });
    entries.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: SLIDE_MASTER });
    entries.push({
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
        '</Relationships>'
    });
    entries.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: SLIDE_LAYOUT });
    entries.push({
      name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
        '</Relationships>'
    });

    this.slides.forEach(function (s, i) {
      entries.push({ name: 'ppt/slides/slide' + (i + 1) + '.xml', data: slideXml(s) });
      entries.push({
        name: 'ppt/slides/_rels/slide' + (i + 1) + '.xml.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
          '</Relationships>'
      });
    });

    return ZIP.write(entries, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  };

  var PPTX = {
    create: function (meta) { return new Deck(meta); },
    W: SLIDE_W, H: SLIDE_H, fmtShort: fmtShort
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PPTX;
  else global.PPTX = PPTX;
})(typeof globalThis !== 'undefined' ? globalThis : this);
