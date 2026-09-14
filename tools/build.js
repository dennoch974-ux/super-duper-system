/* build.js — сборка приложения в один автономный HTML-файл.
   Запуск: node tools/build.js */
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var html = read('index.html');

// Встраиваем CSS
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, function (_, href) {
  return '<style>\n' + read(href) + '\n</style>';
});

// Встраиваем скрипты в порядке подключения
html = html.replace(/<script src="([^"]+)"><\/script>\s*/g, function (_, src) {
  return '<script>\n' + read(src) + '\n</script>\n';
});

html = html.replace('</title>', '</title>\n<!-- Автономная сборка: все стили и скрипты встроены. ' +
  'Файл работает без интернета и без установки. Сформирован ' + new Date().toISOString().slice(0, 10) + ' -->');

var outDir = path.join(ROOT, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
var out = path.join(outDir, 'МУАД_Учёт_объёмов_работ.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Собрано:', path.relative(ROOT, out), (fs.statSync(out).size / 1024).toFixed(0) + ' КБ');

// Проверка: не осталось внешних ссылок
var ext = html.match(/(src|href)="(?!data:|#)[^"]+"/g) || [];
if (ext.length) console.log('Внешние ссылки:', ext.join(', '));
else console.log('Внешних зависимостей нет.');
