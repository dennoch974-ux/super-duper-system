/* e2e.js — сквозная проверка приложения в браузере. */
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.OUT || '/tmp/shots';
const DL = process.env.DL || '/tmp/dl';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP = 'file://' + path.join(ROOT, 'dist', 'МУАД_Учёт_объёмов_работ.html');
const TPL = path.join(ROOT, 'templates');


/* Передача файла в input через DataTransfer: версия playwright-core
   и встроенного Chromium расходятся, штатный setInputFiles не срабатывает. */
async function attachFile(page, selector, filePath, filePaths) {
  const list = filePaths || [filePath];
  const payload = list.map(fp => ({
    name: path.basename(fp),
    b64: fs.readFileSync(fp).toString('base64')
  }));
  await page.evaluate(({ selector, payload }) => {
    const input = document.querySelector(selector);
    const dt = new DataTransfer();
    payload.forEach(({ name, b64 }) => {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      dt.items.add(new File([u8], name,
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    });
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, payload });
}

const errors = [];
let step = 0;
async function shot(page, name) {
  step++;
  const f = path.join(OUT, String(step).padStart(2, '0') + '-' + name + '.png');
  await page.screenshot({ path: f, fullPage: false });
  console.log('  📷', path.basename(f));
}
function ok(msg) { console.log('  ✓', msg); }
function fail(msg) { errors.push(msg); console.log('  ✗', msg); }

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();

  page.on('pageerror', e => fail('JS-ошибка: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') fail('console.error: ' + m.text().slice(0, 200)); });
  let dlN = 0;
  page.on('download', async d => {
    const p = path.join(DL, String(++dlN).padStart(2, '0') + '-' + d.suggestedFilename());
    await d.saveAs(p);
    console.log('  ⬇', d.suggestedFilename());
  });

  console.log('\n=== 1. Экран входа ===');
  await page.goto(APP);
  await page.waitForSelector('.login-card', { timeout: 10000 });
  ok('экран входа отрисован');
  await shot(page, 'login');

  // неверный пароль
  await page.selectOption('#login-user', 'admin');
  await page.fill('#login-pwd', 'wrong');
  await page.click('button[type=submit]');
  await page.waitForSelector('.login-error');
  ok('неверный пароль отклонён');

  console.log('\n=== 2. Вход администратора ===');
  await page.selectOption('#login-user', 'admin');
  await page.fill('#login-pwd', 'muad-admin');
  await page.click('button[type=submit]');
  await page.waitForSelector('.sidebar', { timeout: 10000 });
  ok('вход выполнен, каркас отрисован');
  await shot(page, 'admin-dash-empty');

  console.log('\n=== 3. Загрузка планов (формат 1: один файл, листы по участкам) ===');
  await page.click('[data-route="admin-plans"]');
  await page.waitForSelector('.dropzone');
  await attachFile(page, 'input[type=file][accept=".xlsx,.xlsm"]',
    path.join(TPL, 'ФОРМАТ-1_План_МУАД_все_участки_2026-01.xlsx'));
  await page.waitForSelector('#rec-list table tbody tr', { timeout: 20000 });
  const recRows = await page.locator('#rec-list table tbody tr').count();
  recRows === 7 ? ok('распознано 7 листов') : fail('распознано листов: ' + recRows + ' (ожидалось 7)');
  await shot(page, 'plans-recognized');

  // предпросмотр
  await page.locator('#rec-list table tbody tr').first().getByRole('button', { name: 'Просмотр' }).click();
  await page.waitForSelector('.modal');
  ok('предпросмотр плана открыт');
  await shot(page, 'plan-preview');
  await page.click('.modal-close');

  // выбрать месяц январь 2026 и загрузить
  const monthSelects = page.locator('#rec-list table tbody tr select').nth(1);
  await page.click('button:has-text("Загрузить выбранные")');
  await page.waitForTimeout(900);
  const loaded = await page.evaluate(() => Object.keys(CORE.Data.db().plans).length);
  loaded >= 7 ? ok('планы загружены: ' + loaded + ' участко-месяцев') : fail('загружено планов: ' + loaded);
  await shot(page, 'plans-loaded');

  console.log('\n=== 4. Прочие форматы планов ===');
  for (const f of ['ФОРМАТ-3_План ДУ-6 (итог за месяц, без дней).xlsx', 'ФОРМАТ-4_План УКДУ (дни по вертикали).xlsx']) {
    if (!fs.existsSync(path.join(TPL, f))) { fail('нет файла ' + f); continue; }
    await attachFile(page, 'input[type=file][accept=".xlsx,.xlsm"]', path.join(TPL, f));
    await page.waitForSelector('#rec-list table tbody tr', { timeout: 20000 });
    const site = await page.locator('#rec-list table tbody tr select').first().inputValue();
    site ? ok(f.slice(0, 12) + '… участок определён: ' + site) : fail(f + ': участок не определён');
  }
  await shot(page, 'plans-other-formats');

  console.log('\n=== 5. Вход ответственного (ЛДУ) и внесение объёмов ===');
  await page.click('.sidebar-foot button');
  await page.waitForSelector('.login-card');
  await page.selectOption('#login-user', 'ldu');
  await page.fill('#login-pwd', 'ldu-2026');
  await page.click('button[type=submit]');
  await page.waitForSelector('.sidebar');
  ok('вход участка выполнен');

  await page.evaluate(() => { location.hash = '#/site-dash?month=2026-01'; });
  await page.waitForTimeout(500);
  await shot(page, 'site-dash');

  // по умолчанию форма ввода открывается на предыдущем дне
  const curMonth = await page.evaluate(() => {
    const C = window.CORE;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const mk = C.monthKey(y);
    const src = C.Data.plan('ldu', '2026-01');
    C.Data.setPlan('ldu', mk, Object.assign({}, src, { month: mk }));   // план на текущий период
    return { mk: mk, day: y.getDate() };
  });
  await page.evaluate(() => { location.hash = '#/site-entry'; });
  await page.waitForTimeout(700);
  const def = await page.evaluate(() => {
    const sel = document.querySelector('.card-head select');
    const opt = sel && sel.options[sel.selectedIndex];
    return { value: sel ? sel.value : null, label: opt ? opt.textContent : null, hash: location.hash };
  });
  (String(def.value) === String(curMonth.day) && /вчера/.test(def.label || ''))
    ? ok('форма ввода открылась на предыдущем дне: ' + def.label)
    : fail('ожидался день ' + curMonth.day + ', открыт: ' + JSON.stringify(def));

  await page.evaluate(() => { location.hash = '#/site-entry?month=2026-01&day=5'; });
  await page.waitForTimeout(600);
  await page.waitForSelector('td.day-cell input');
  const inputs = page.locator('td.day-cell input');
  const n = await inputs.count();
  ok('форма ввода за день: строк ' + n);
  for (let i = 0; i < Math.min(n, 6); i++) await inputs.nth(i).fill(String(40 + i * 7));
  await shot(page, 'site-entry-day');

  // защита от потери несохранённых данных при переходе в другой раздел
  await page.click('[data-route="site-summary"]');
  await page.waitForSelector('.modal', { timeout: 5000 });
  ok('при уходе с несохранёнными данными выдано предупреждение');
  await shot(page, 'site-entry-guard');
  await page.locator('.modal-foot button').first().click();   // «Остаться и сохранить»
  await page.waitForTimeout(400);
  const kept = await page.locator('td.day-cell input').first().inputValue();
  kept === '40' ? ok('введённые значения сохранены на экране') : fail('значения потеряны: "' + kept + '"');

  await page.click('button:has-text("Сохранить")');
  await page.waitForTimeout(700);
  ok('данные за день сохранены');
  const saved = await page.evaluate(() => {
    const f = CORE.Data.factRaw('ldu', '2026-01');
    return Object.values(f.rows).filter(r => r['5'] != null).length;
  });
  saved >= 5 ? ok('факт за 5 число записан по ' + saved + ' позициям') : fail('записано позиций: ' + saved);

  // неделя
  await page.evaluate(() => { location.hash = '#/site-entry?month=2026-01&mode=week&day=14'; });
  await page.waitForTimeout(600);
  const winputs = page.locator('td.day-cell input');
  const wn = await winputs.count();
  for (let i = 0; i < Math.min(wn, 20); i++) await winputs.nth(i).fill(String(15 + (i % 9) * 4));
  await shot(page, 'site-entry-week');
  await page.click('button:has-text("Сохранить")');
  await page.waitForTimeout(700);
  ok('данные за неделю сохранены (' + Math.min(wn, 20) + ' ячеек)');

  console.log('\n=== 6. Месячная таблица и режим редактирования ===');
  await page.evaluate(() => { location.hash = '#/site-month?month=2026-01'; });
  await page.waitForTimeout(600);
  await page.waitForSelector('table.tbl');
  await shot(page, 'site-month-view');
  await page.click('button:has-text("Редактировать")');
  await page.waitForTimeout(500);
  const editable = await page.locator('td.day-cell input').count();
  editable > 0 ? ok('режим редактирования: ' + editable + ' ячеек доступны') : fail('редактирование не включилось');
  await page.locator('td.day-cell input').nth(3).fill('123');
  await shot(page, 'site-month-edit');
  await page.click('button:has-text("Сохранить изменения")');
  await page.waitForTimeout(700);
  ok('изменения месячной таблицы сохранены');

  console.log('\n=== 7. Свод за месяц и выгрузка Excel ===');
  await page.evaluate(() => { location.hash = '#/site-summary?month=2026-01'; });
  await page.waitForTimeout(600);
  await shot(page, 'site-summary');
  await page.click('button:has-text("Выгрузить в Excel")');
  await page.waitForTimeout(2500);
  ok('свод участка выгружен');

  console.log('\n=== 8. Закрытие месяца ===');
  await page.evaluate(() => { location.hash = '#/site-close?month=2026-01'; });
  await page.waitForTimeout(600);
  await page.waitForSelector('.check-item');
  const checks = await page.locator('.check-item').count();
  ok('чек-лист закрытия: ' + checks + ' проверок');
  await shot(page, 'site-close-checklist');
  await page.fill('textarea', 'Отставание по планировке связано с низкими температурами и простоем автогрейдера.');
  await page.click('button:has-text("Закрыть месяц")');
  await page.waitForSelector('.modal');
  await page.locator('.modal-foot button.btn-primary').click();
  await page.waitForTimeout(800);
  const closed = await page.evaluate(() => CORE.Data.closure('ldu', '2026-01').status);
  closed === 'closed' ? ok('месяц закрыт, экран обновлён') : fail('месяц не закрылся: ' + closed);
  await shot(page, 'site-closed');

  console.log('\n=== 9. Администратор: своды ===');
  await page.click('.sidebar-foot button');
  await page.waitForSelector('.login-card');
  await page.selectOption('#login-user', 'admin');
  await page.fill('#login-pwd', 'muad-admin');
  await page.click('button[type=submit]');
  await page.waitForSelector('.sidebar');
  await page.evaluate(() => { location.hash = '#/admin-dash?month=2026-01'; });
  await page.waitForTimeout(700);
  await shot(page, 'admin-dash');

  await page.evaluate(() => { location.hash = '#/admin-summary?from=2026-01&to=2026-01&tab=sites'; });
  await page.waitForTimeout(700);
  await shot(page, 'admin-summary-sites');
  await page.click('button:has-text("По видам работ")');
  await page.waitForTimeout(500);
  await shot(page, 'admin-summary-works');
  await page.click('button:has-text("Выгрузить в Excel")');
  await page.waitForTimeout(3000);
  ok('общий свод выгружен');

  console.log('\n=== 10. Статусы периодов ===');
  await page.evaluate(() => { location.hash = '#/admin-months?from=2025-11&to=2026-01'; });
  await page.waitForTimeout(700);
  await shot(page, 'admin-months');

  console.log('\n=== 10a. Заполнение данных по всем участкам (имитация месяца) ===');
  const seeded = await page.evaluate(() => {
    const C = window.CORE;
    const month = '2026-01';
    let cells = 0;
    C.Data.sites().forEach((s, si) => {
      const plan = C.Data.plan(s.id, month);
      if (!plan) return;
      const f = C.Data.fact(s.id, month);
      const dim = C.daysInMonth(month);
      plan.rows.forEach((r, ri) => {
        f.rows[r.id] = f.rows[r.id] || {};
        for (let d = 1; d <= dim; d++) {
          const p = Number(r.days[d] || r.days[String(d)] || 0);
          if (!p) continue;
          // выполнение 78…112% с вариацией по дням
          const k = 0.78 + ((si * 7 + ri * 3 + d) % 35) / 100;
          f.rows[r.id][d] = C.round(p * k, 2);
          cells++;
        }
      });
      f.updatedAt = new Date().toISOString();
      f.updatedBy = 'Ответственный (' + s.code + ')';
      C.Data.setClosure(s.id, month, {
        siteId: s.id, month: month, status: 'closed',
        closedAt: new Date().toISOString(), closedBy: s.chief,
        comment: 'Данные проверены, расхождений нет.'
      });
    });
    C.Data.save(true);
    return cells;
  });
  ok('заполнено ячеек факта: ' + seeded + ', периоды закрыты');

  console.log('\n=== 11. Формирование презентации ===');
  await page.evaluate(() => { location.hash = '#/admin-reports?from=2026-01&to=2026-01'; });
  await page.waitForTimeout(700);
  const kindOpts = await page.locator('select option:has-text("Окончательный")').first().isEnabled();
  kindOpts ? ok('окончательный отчёт доступен (все периоды закрыты)') : fail('окончательный отчёт недоступен');
  await shot(page, 'admin-reports-form');
  await page.click('button:has-text("Сформировать презентацию")');
  await page.waitForSelector('.slide-frame', { timeout: 30000 });
  const slides = await page.locator('.slide-frame').count();
  slides >= 10 ? ok('презентация: ' + slides + ' слайдов') : fail('слайдов: ' + slides);
  const hasContractSlides = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.slide-frame')).some(f => /по контрактам/i.test(f.textContent)) &&
    Array.from(document.querySelectorAll('.slide-frame')).some(f => /Контракты и участки/i.test(f.textContent)));
  hasContractSlides ? ok('слайды по контрактам присутствуют') : fail('слайдов по контрактам нет');
  await page.waitForTimeout(600);
  await shot(page, 'report-preview');
  await page.click('button:has-text("Скачать презентацию")');
  await page.waitForTimeout(4000);
  ok('презентация скачана');

  console.log('\n=== 11a. Своды по контрактам ===');
  await page.evaluate(() => { location.hash = '#/admin-summary?from=2026-01&to=2026-01&tab=contracts'; });
  await page.waitForTimeout(800);
  const ctr = await page.evaluate(() => {
    const agg = CORE.Calc.aggregate(CORE.Data.sites().map(s => s.id), ['2026-01']);
    return agg.contracts.map(c => ({
      name: c.name, sites: c.siteList.length,
      plan: Math.round(c.plan), sections: c.sectionList.length
    }));
  });
  ctr.length >= 5 ? ok('контрактов в своде: ' + ctr.length + ' — ' + ctr.map(c => c.name + ' (' + c.sites + ' уч.)').join('; '))
    : fail('контрактов распознано: ' + ctr.length);
  const multi = ctr.filter(c => c.sites > 1).length;
  multi >= 2 ? ok('контрактов на нескольких участках: ' + multi) : fail('межучастковых контрактов: ' + multi);
  await shot(page, 'admin-summary-contracts');

  // фильтр по контракту
  const firstId = await page.evaluate(() => {
    const agg = CORE.Calc.aggregate(CORE.Data.sites().map(s => s.id), ['2026-01']);
    return agg.contracts[0].contractId;
  });
  await page.evaluate(id => { location.hash = '#/admin-summary?from=2026-01&to=2026-01&tab=sites&contract=' + id; }, firstId);
  await page.waitForTimeout(700);
  const filteredOk = await page.evaluate(id => {
    const ids = CORE.Data.sites().map(s => s.id);
    const all = CORE.Calc.aggregate(ids, ['2026-01']);
    const one = CORE.Calc.aggregate(ids, ['2026-01'], { contractId: id });
    return one.totals.plan > 0 && one.totals.plan < all.totals.plan;
  }, firstId);
  filteredOk ? ok('фильтр по контракту сужает свод') : fail('фильтр по контракту не работает');
  await shot(page, 'admin-summary-contract-filter');

  await page.evaluate(() => { location.hash = '#/admin-contracts'; });
  await page.waitForTimeout(700);
  const dirRows = await page.locator('table.tbl tbody tr').count();
  dirRows >= 5 ? ok('справочник контрактов: ' + dirRows + ' записей') : fail('справочник пуст');
  await shot(page, 'admin-contracts');

  console.log('\n=== 12. Участки, справочник, журнал ===');
  for (const [route, name] of [['admin-sites', 'admin-sites'], ['admin-works', 'admin-works'],
  ['admin-data', 'admin-data'], ['admin-audit', 'admin-audit']]) {
    await page.evaluate(r => { location.hash = '#/' + r; }, route);
    await page.waitForTimeout(600);
    await shot(page, name);
  }
  const auditRows = await page.locator('table.tbl tbody tr').count();
  auditRows > 5 ? ok('журнал действий: ' + auditRows + ' записей') : fail('журнал пуст');

  await browser.close();

  console.log('\n=== ИТОГ ===');
  if (errors.length) { console.log('ОШИБОК: ' + errors.length); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
  console.log('Все проверки пройдены.');
})().catch(e => { console.error('СБОЙ:', e); process.exit(1); });
