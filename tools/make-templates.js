/* Формирование примеров файлов планов по участкам МУАД. */
require('./shim.js');
var fs = require('fs'), path = require('path');
var C = require('../assets/js/core.js');
var T = require('../assets/js/templates.js');
var XL = require('../assets/js/xlsx.js');

var annual = JSON.parse(fs.readFileSync(path.join(__dirname, 'site-annual-plan.json'), 'utf8'));
var MONTH = process.argv[2] || '2026-01';
var OUT = path.join(__dirname, '..', 'templates');

function rowsFor(siteId) {
  return T.monthlyRowsFromAnnual(annual[siteId].rows, MONTH, 'workdays');
}

async function save(blob, name) {
  fs.writeFileSync(path.join(OUT, name), Buffer.from(await blob.arrayBuffer()));
  console.log('  ✓', name, (fs.statSync(path.join(OUT, name)).size / 1024).toFixed(0) + ' КБ');
}

(async function () {
  var sites = C.Data.sites();
  console.log('Месяц:', C.monthTitle(MONTH));

  // 1. Один файл — все участки, лист на участок (дни по горизонтали)
  var items = sites.map(function (s) { return { site: s, month: MONTH, rows: rowsFor(s.id) }; });
  await save(await T.build(items, { format: 'daily' }),
    'ФОРМАТ-1_План_МУАД_все_участки_' + MONTH + '.xlsx');

  // 2. Отдельный файл на участок, произвольное имя
  var ldu = sites.filter(function (s) { return s.id === 'ldu'; })[0];
  await save(await T.build([{ site: ldu, month: MONTH, rows: rowsFor('ldu') }], { format: 'daily' }),
    'ФОРМАТ-2_План ЛДУ январь 2026 (отдельный файл).xlsx');
  var mdu = sites.filter(function (s) { return s.id === 'mdu'; })[0];
  await save(await T.build([{ site: mdu, month: MONTH, rows: rowsFor('mdu') }], { format: 'daily' }),
    'ФОРМАТ-2_plan_mirninsky_01-2026.xlsx');

  // 3. Свёрнутый формат — объём за месяц без разбивки по дням
  var du6 = sites.filter(function (s) { return s.id === 'du6'; })[0];
  await save(await T.build([{ site: du6, month: MONTH, rows: rowsFor('du6') }], { format: 'monthly' }),
    'ФОРМАТ-3_План ДУ-6 (итог за месяц, без дней).xlsx');

  // 4. Транспонированный формат — дни по вертикали
  var ukdu = sites.filter(function (s) { return s.id === 'ukdu'; })[0];
  await save(await T.build([{ site: ukdu, month: MONTH, rows: rowsFor('ukdu') }], { format: 'transposed' }),
    'ФОРМАТ-4_План УКДУ (дни по вертикали).xlsx');

  console.log('Готово.');
})().catch(function (e) { console.error(e); process.exit(1); });
