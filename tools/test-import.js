/* Проверка распознавания файлов планов. */
require('./shim.js');
var fs = require('fs'), path = require('path');
var C = require('../assets/js/core.js');
var XL = require('../assets/js/xlsx.js');
var PI = require('../assets/js/planimport.js');

var dir = process.argv[2] || path.join(__dirname, '..', 'templates');
(async function () {
  var files = fs.readdirSync(dir).filter(function (f) { return /\.xlsx$/i.test(f) && !/^~\$/.test(f); });
  for (var i = 0; i < files.length; i++) {
    var name = files[i];
    var buf = fs.readFileSync(path.join(dir, name));
    var file = new File([buf], name);
    var recs = await PI.recognizeFile(file, XL);
    console.log('\n=== ' + name + ' → листов распознано: ' + recs.length);
    recs.forEach(function (r) {
      console.log('  лист «' + r.sheetName + '»: участок=' + (r.site ? r.site.code : 'НЕ ОПРЕДЕЛЁН') +
        ' (' + (r.siteSource || '-') + '), месяц=' + (r.month || '—') +
        ', формат=' + r.format + (r.transposed ? ' (транспонирован)' : '') +
        ', строк=' + r.rows.length + ', дней=' + r.dayCount +
        ', итого=' + C.fmtNum(r.total));
      if (r.rows[0]) console.log('     пример: [' + r.rows[0].object + '] ' + r.rows[0].work + ' · ' + r.rows[0].unit + ' · ' + C.fmtNum(r.rows[0].total));
      r.warnings.slice(0, 3).forEach(function (w) { console.log('     ! ' + w); });
    });
  }
})().catch(function (e) { console.error(e); process.exit(1); });
