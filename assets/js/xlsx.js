/* xlsx.js — чтение и запись книг Excel (.xlsx) без внешних библиотек.
   Совместимо с MS Excel, Р7-Офис, LibreOffice, «МойОфис». */
(function (global) {
  'use strict';

  var ZIP = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./zip.js') : global.ZIP;

  /* ================= общие утилиты ================= */

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function unesc(s) {
    return String(s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&amp;/g, '&');
  }

  function colName(n) { // 0 -> A
    var s = '';
    n = n + 1;
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }

  function colIndex(ref) { // 'BC12' -> 54
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  /* Серийная дата Excel -> JS Date (система 1900) */
  function serialToDate(n) {
    var ms = Math.round((n - 25569) * 86400000);
    return new Date(ms);
  }
  function dateToSerial(d) {
    return d.getTime() / 86400000 + 25569;
  }

  /* ================= ЧТЕНИЕ ================= */

  function attr(tag, name) {
    var m = tag.match(new RegExp('\\s' + name + '="([^"]*)"'));
    return m ? m[1] : null;
  }

  function parseSharedStrings(xml) {
    var out = [];
    if (!xml) return out;
    var re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g, m;
    while ((m = re.exec(xml))) {
      var inner = m[1] || '';
      var txt = '', tm, tre = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      while ((tm = tre.exec(inner))) txt += unesc(tm[1]);
      out.push(txt);
    }
    return out;
  }

  var BUILTIN_DATE_FMT = { 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1, 45: 1, 46: 1, 47: 1 };

  function parseStyles(xml) {
    var dateStyles = {};
    if (!xml) return dateStyles;
    var custom = {};
    var re = /<numFmt\b[^>]*\/>/g, m;
    while ((m = re.exec(xml))) {
      var id = attr(m[0], 'numFmtId'), code = attr(m[0], 'formatCode') || '';
      code = unesc(code).replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
      if (/[dmyhs]/i.test(code) && !/[#0]/.test(code.replace(/[^\d#0]/g, ''))) custom[id] = 1;
      else if (/(yy|dd|mmm)/i.test(code)) custom[id] = 1;
    }
    var xfsBlock = xml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/);
    if (!xfsBlock) return dateStyles;
    var xre = /<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g, i = 0, xm;
    while ((xm = xre.exec(xfsBlock[0]))) {
      var nf = attr(xm[0], 'numFmtId');
      if (nf && (BUILTIN_DATE_FMT[+nf] || custom[nf])) dateStyles[i] = 1;
      i++;
    }
    return dateStyles;
  }

  function parseSheet(xml, shared, dateStyles) {
    var grid = [];
    if (!xml) return grid;
    var body = xml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/);
    if (!body) return grid;
    var rowRe = /<row\b([^>]*)(?:\/>|>([\s\S]*?)<\/row>)/g, rm;
    while ((rm = rowRe.exec(body[1]))) {
      var rAttr = rm[1] || '', content = rm[2] || '';
      var rIdx = parseInt(attr('<row ' + rAttr + '>', 'r') || '0', 10);
      var row = [];
      var cRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g, cm;
      var autoCol = 0;
      while ((cm = cRe.exec(content))) {
        var cAttr = '<c ' + (cm[1] || '') + '>', inner = cm[2] || '';
        var ref = attr(cAttr, 'r');
        var ci = ref ? colIndex(ref) : autoCol;
        autoCol = ci + 1;
        var t = attr(cAttr, 't');
        var s = attr(cAttr, 's');
        var val = null;
        if (t === 'inlineStr') {
          var acc = '', im, ire = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
          while ((im = ire.exec(inner))) acc += unesc(im[1]);
          val = acc;
        } else {
          var vm = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
          if (vm) {
            var raw = unesc(vm[1]);
            if (t === 's') val = shared[+raw] != null ? shared[+raw] : '';
            else if (t === 'str') val = raw;
            else if (t === 'b') val = raw === '1';
            else if (t === 'e') val = null;
            else {
              var num = parseFloat(raw);
              if (isNaN(num)) val = raw;
              else if (s != null && dateStyles[+s] && num > 1 && num < 80000) val = serialToDate(num);
              else val = num;
            }
          }
        }
        row[ci] = val;
      }
      grid[(rIdx || grid.length + 1) - 1] = row;
    }
    for (var i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
    return grid;
  }

  /* read(arrayBuffer) -> {sheets:[{name, grid}]} */
  async function read(arrayBuffer) {
    var files = await ZIP.read(arrayBuffer);
    var wb = ZIP.readText(files, 'xl/workbook.xml');
    if (!wb) throw new Error('Это не книга Excel (.xlsx): отсутствует xl/workbook.xml');
    var relsXml = ZIP.readText(files, 'xl/_rels/workbook.xml.rels') || '';
    var rels = {};
    var rre = /<Relationship\b[^>]*\/>/g, rm;
    while ((rm = rre.exec(relsXml))) {
      var id = attr(rm[0], 'Id'), target = attr(rm[0], 'Target') || '';
      if (target.charAt(0) === '/') target = target.slice(1);
      else if (target.indexOf('xl/') !== 0) target = 'xl/' + target.replace(/^\.\//, '');
      rels[id] = target;
    }
    var shared = parseSharedStrings(ZIP.readText(files, 'xl/sharedStrings.xml'));
    var dateStyles = parseStyles(ZIP.readText(files, 'xl/styles.xml'));

    var sheets = [];
    var sre = /<sheet\b[^>]*\/>/g, sm, order = 0;
    while ((sm = sre.exec(wb))) {
      var name = unesc(attr(sm[0], 'name') || ('Лист' + (++order)));
      var rid = attr(sm[0], 'r:id') || attr(sm[0], 'id');
      var state = attr(sm[0], 'state');
      var path = rels[rid];
      if (!path || !files.has(path)) {
        // запасной путь: по порядку
        var guess = 'xl/worksheets/sheet' + (sheets.length + 1) + '.xml';
        path = files.has(guess) ? guess : null;
      }
      if (!path) continue;
      sheets.push({
        name: name,
        hidden: state === 'hidden' || state === 'veryHidden',
        grid: parseSheet(ZIP.readText(files, path), shared, dateStyles)
      });
    }
    return { sheets: sheets };
  }

  /* ================= ЗАПИСЬ ================= */

  var STYLE_INDEX = {
    def: 0, h: 1, txt: 2, num: 3, int: 4, pct: 5, group: 6, total: 7, totaltxt: 8,
    title: 9, note: 10, section: 11, good: 12, bad: 13, warn: 14, date: 15,
    hleft: 16, txtc: 17, pctb: 18, totalint: 19, sub: 20
  };

  var STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="4">' +
    '<numFmt numFmtId="164" formatCode="#,##0.00"/>' +
    '<numFmt numFmtId="165" formatCode="0.0%"/>' +
    '<numFmt numFmtId="166" formatCode="#,##0"/><numFmt numFmtId="167" formatCode="DD.MM.YYYY"/>' +
    '</numFmts>' +
    '<fonts count="6">' +
    '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><charset val="204"/></font>' +
    '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><charset val="204"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><charset val="204"/></font>' +
    '<font><b/><sz val="16"/><color rgb="FF14284B"/><name val="Calibri"/><family val="2"/><charset val="204"/></font>' +
    '<font><i/><sz val="9"/><color rgb="FF6B7686"/><name val="Calibri"/><family val="2"/><charset val="204"/></font>' +
    '<font><b/><sz val="12"/><color rgb="FF14284B"/><name val="Calibri"/><family val="2"/><charset val="204"/></font>' +
    '</fonts>' +
    '<fills count="8">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF14284B"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE4EAF2"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3D6"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE2F3E7"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFBE3E5"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F6FA"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFC8D0DC"/></left><right style="thin"><color rgb="FFC8D0DC"/></right>' +
    '<top style="thin"><color rgb="FFC8D0DC"/></top><bottom style="thin"><color rgb="FFC8D0DC"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="21">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                                                         /* 0 def */
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + /* 1 h */
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +  /* 2 txt */
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + /* 3 num */
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + /* 4 int */
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + /* 5 pct */
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + /* 6 group */
    '<xf numFmtId="164" fontId="1" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + /* 7 total */
    '<xf numFmtId="0" fontId="1" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + /* 8 totaltxt */
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                            /* 9 title */
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                            /* 10 note */
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                            /* 11 section */
    '<xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + /* 12 good */
    '<xf numFmtId="164" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + /* 13 bad */
    '<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + /* 14 warn */
    '<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + /* 15 date */
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>' + /* 16 hleft */
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + /* 17 txtc */
    '<xf numFmtId="165" fontId="1" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + /* 18 pctb */
    '<xf numFmtId="166" fontId="1" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + /* 19 totalint */
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                            /* 20 sub */
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function cellXml(ref, cell) {
    if (cell === null || cell === undefined || cell === '') return '';
    var v, s;
    if (typeof cell === 'object' && !(cell instanceof Date)) { v = cell.v; s = cell.s; }
    else { v = cell; s = null; }
    var si = s != null && STYLE_INDEX[s] != null ? STYLE_INDEX[s] : 0;
    var sAttr = si ? ' s="' + si + '"' : '';
    if (v === null || v === undefined || v === '') return si ? '<c r="' + ref + '"' + sAttr + '/>' : '';
    if (v instanceof Date) return '<c r="' + ref + '"' + sAttr + '><v>' + dateToSerial(v) + '</v></c>';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + sAttr + '><v>' + (Math.round(v * 1e6) / 1e6) + '</v></c>';
    if (typeof v === 'boolean') return '<c r="' + ref + '"' + sAttr + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
    return '<c r="' + ref + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function sheetXml(sheet) {
    var rows = sheet.rows || [];
    var maxCol = 0;
    rows.forEach(function (r) { if (r && r.length > maxCol) maxCol = r.length; });
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || [];
      var cells = '';
      for (var j = 0; j < r.length; j++) cells += cellXml(colName(j) + (i + 1), r[j]);
      var hAttr = (sheet.rowHeights && sheet.rowHeights[i]) ? ' ht="' + sheet.rowHeights[i] + '" customHeight="1"' : '';
      if (cells || hAttr) out.push('<row r="' + (i + 1) + '"' + hAttr + '>' + cells + '</row>');
    }
    var cols = '';
    if (sheet.cols && sheet.cols.length) {
      cols = '<cols>' + sheet.cols.map(function (c, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 12) + '" customWidth="1"/>';
      }).join('') + '</cols>';
    }
    var pane = '';
    if (sheet.freeze) {
      var fc = sheet.freeze.col || 0, fr = sheet.freeze.row || 0;
      pane = '<pane' + (fc ? ' xSplit="' + fc + '"' : '') + (fr ? ' ySplit="' + fr + '"' : '') +
        ' topLeftCell="' + colName(fc) + (fr + 1) + '" activePane="bottomRight" state="frozen"/>' +
        '<selection pane="bottomRight" activeCell="' + colName(fc) + (fr + 1) + '" sqref="' + colName(fc) + (fr + 1) + '"/>';
    }
    var merges = '';
    if (sheet.merges && sheet.merges.length) {
      merges = '<mergeCells count="' + sheet.merges.length + '">' +
        sheet.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>';
    }
    var dim = 'A1:' + colName(Math.max(maxCol - 1, 0)) + Math.max(rows.length, 1);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="' + dim + '"/>' +
      '<sheetViews><sheetView' + (sheet.active ? ' tabSelected="1"' : '') + ' workbookViewId="0" zoomScale="90" zoomScaleNormal="90">' + pane + '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' + cols +
      '<sheetData>' + out.join('') + '</sheetData>' + merges +
      '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  function safeSheetName(name, used) {
    var n = String(name || 'Лист').replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31) || 'Лист';
    var base = n, i = 2;
    while (used[n.toLowerCase()]) { n = (base.slice(0, 28) + '(' + i + ')'); i++; }
    used[n.toLowerCase()] = 1;
    return n;
  }

  /* write({sheets:[{name, rows, cols, freeze, merges}], title, author}) -> Blob */
  async function write(book) {
    var used = {};
    var sheets = (book.sheets || []).map(function (s, i) {
      return { name: safeSheetName(s.name, used), src: s, idx: i + 1, active: i === 0 };
    });
    if (!sheets.length) throw new Error('Нет листов для выгрузки');

    var entries = [];
    entries.push({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (s) {
          return '<Override PartName="/xl/worksheets/sheet' + s.idx + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>'
    });
    entries.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
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
        '<dc:title>' + esc(book.title || 'Отчёт') + '</dc:title>' +
        '<dc:creator>' + esc(book.author || 'МУАД') + '</dc:creator>' +
        '<cp:lastModifiedBy>' + esc(book.author || 'МУАД') + '</cp:lastModifiedBy>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
        '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
        '</cp:coreProperties>'
    });
    entries.push({
      name: 'docProps/app.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        '<Application>Система учёта объёмов работ МУАД</Application><Company>АК «АЛРОСА» (ПАО)</Company>' +
        '</Properties>'
    });
    entries.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="25600" windowHeight="16000"/></bookViews>' +
        '<sheets>' + sheets.map(function (s) {
          return '<sheet name="' + esc(s.name) + '" sheetId="' + s.idx + '" r:id="rId' + s.idx + '"/>';
        }).join('') + '</sheets></workbook>'
    });
    entries.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s) {
          return '<Relationship Id="rId' + s.idx + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + s.idx + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'
    });
    entries.push({ name: 'xl/styles.xml', data: STYLES_XML });
    sheets.forEach(function (s) {
      var src = s.src; src.active = s.active;
      entries.push({ name: 'xl/worksheets/sheet' + s.idx + '.xml', data: sheetXml(src) });
    });

    return ZIP.write(entries, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  var XLSX = {
    read: read, write: write, colName: colName, colIndex: colIndex,
    serialToDate: serialToDate, esc: esc, STYLE_INDEX: STYLE_INDEX
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = XLSX;
  else global.XLSXLite = XLSX;
})(typeof globalThis !== 'undefined' ? globalThis : this);
