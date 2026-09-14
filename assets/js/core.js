/* core.js — модель данных, хранилище, авторизация, утилиты.
   Система учёта объёмов дорожных работ МУАД АК «АЛРОСА» (ПАО). */
(function (global) {
  'use strict';

  /* ===================== УТИЛИТЫ ===================== */

  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Ключ месяца 'YYYY-MM' */
  function monthKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
  function parseMonth(key) {
    var p = String(key).split('-');
    return { year: +p[0], month: +p[1] - 1 };
  }
  function monthTitle(key) {
    var m = parseMonth(key);
    return MONTHS[m.month] + ' ' + m.year;
  }
  function monthShort(key) {
    var m = parseMonth(key);
    return MONTHS[m.month].slice(0, 3).toLowerCase() + ' ' + String(m.year).slice(2);
  }
  function daysInMonth(key) {
    var m = parseMonth(key);
    return new Date(m.year, m.month + 1, 0).getDate();
  }
  function weekdayOf(key, day) {
    var m = parseMonth(key);
    return (new Date(m.year, m.month, day).getDay() + 6) % 7;  // 0 = понедельник
  }
  function isWeekend(key, day) { return weekdayOf(key, day) >= 5; }
  function shiftMonth(key, delta) {
    var m = parseMonth(key);
    var d = new Date(m.year, m.month + delta, 1);
    return monthKey(d);
  }
  function monthRange(from, to) {
    var out = [], cur = from;
    var guard = 0;
    while (cur <= to && guard++ < 240) { out.push(cur); cur = shiftMonth(cur, 1); }
    return out;
  }
  function todayKey() { return monthKey(new Date()); }
  function dateISO(key, day) {
    var m = parseMonth(key);
    return m.year + '-' + pad2(m.month + 1) + '-' + pad2(day);
  }
  function fmtDateRu(d) {
    d = d instanceof Date ? d : new Date(d);
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  function fmtDateTimeRu(d) {
    d = d instanceof Date ? d : new Date(d);
    return fmtDateRu(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* Число в русском формате: 12 345,67 */
  function fmtNum(v, digits) {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '—';
    var d = digits == null ? 2 : digits;
    var n = Number(v);
    if (d === 'auto') d = Math.abs(n) >= 1000 ? 0 : (Math.abs(n) >= 100 ? 1 : 2);
    var s = Math.abs(n).toFixed(d);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (n < 0 ? '−' : '') + parts.join(',');
  }
  function fmtPct(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    /* Кратное перевыполнение показываем ограничением, иначе число нечитаемо */
    if (v > 10) return '> 1 000%';
    return fmtNum(v * 100, digits == null ? 1 : digits) + '%';
  }
  function fmtSigned(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v > 0 ? '+' : '') + fmtNum(v, digits);
  }

  function round(v, d) {
    var p = Math.pow(10, d == null ? 3 : d);
    return Math.round((Number(v) || 0) * p) / p;
  }

  /* Нормализация текста для сопоставления */
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase().replace(/ё/g, 'е')
      .replace(/[«»"'`]/g, '')
      .replace(/[\s ]+/g, ' ')
      .replace(/[.,;:]+$/g, '')
      .trim();
  }
  function normKey(s) { return norm(s).replace(/[^0-9a-zа-я]+/g, ''); }

  function slug(s) {
    return normKey(s).slice(0, 60);
  }

  /* Разбор числа из ячейки: поддержка "1 234,56", "1234.56", числа */
  function parseNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v instanceof Date) return null;
    var s = String(v).replace(/[\s ']/g, '').replace(',', '.');
    if (!/^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /* Простое склонение: 1 участок / 2 участка / 5 участков */
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  /* ===================== SHA-256 (для паролей) ===================== */

  var SHA = (function () {
    var K = [];
    (function () {
      function frac(x) { return ((x - Math.floor(x)) * Math.pow(2, 32)) | 0; }
      var primes = [], n = 2;
      while (primes.length < 64) {
        var p = true;
        for (var i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; }
        if (p) primes.push(n);
        n++;
      }
      K = primes.map(function (pr) { return frac(Math.cbrt(pr)); });
    })();
    var H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

    return function sha256(msg) {
      var bytes = new TextEncoder().encode(msg);
      var len = bytes.length;
      var withPad = new Uint8Array((((len + 8) >> 6) + 1) * 64);
      withPad.set(bytes);
      withPad[len] = 0x80;
      var dv = new DataView(withPad.buffer);
      dv.setUint32(withPad.length - 4, len * 8, false);

      var H = H0.slice();
      var w = new Int32Array(64);
      for (var off = 0; off < withPad.length; off += 64) {
        for (var t = 0; t < 16; t++) w[t] = dv.getInt32(off + t * 4, false);
        for (t = 16; t < 64; t++) {
          var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
          var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
          w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
        }
        var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (t = 0; t < 64; t++) {
          var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
          var ch = (e & f) ^ (~e & g);
          var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
          var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
          var maj = (a & b) ^ (a & c) ^ (b & c);
          var t2 = (S0 + maj) | 0;
          h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0,
        (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
      }
      return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
    };
  })();

  var PWD_SALT = 'muad-alrosa-2026::';
  function hashPassword(pwd) { return SHA(PWD_SALT + String(pwd)); }

  /* ===================== СПРАВОЧНИКИ ===================== */

  var SITES_SEED = [
    {
      id: 'ldu', code: 'ЛДУ', name: 'Ленский дорожный участок', short: 'Ленский ДУ',
      chief: 'Эндерс Андрей Иванович', staff: 28, order: 1,
      roads: 'а/д «Мухтуя», км 0 – км 96 (96 км)',
      aliases: ['ЛДУ', 'ЛЕНСКИЙ', 'ЛЕНСК', 'ЛЕНСКИЙДУ', 'ЛЕНСКИЙДОРОЖНЫЙУЧАСТОК']
    },
    {
      id: 'du2', code: 'ДУ-2', name: 'Дорожный участок №2 (п. Дорожный)', short: 'ДУ №2',
      chief: 'Кулак Виктор Владимирович', staff: 40, order: 2,
      roads: 'а/д «Мухтуя» км 96 – км 138 (42 км); ФАД «Вилюй» км 1205 – км 1310 (105 км). Всего 147 км',
      aliases: ['ДУ2', 'ДУ-2', 'ДУ №2', 'УЧАСТОК2', 'ДОРОЖНЫЙУЧАСТОК2', 'ДОРОЖНЫЙ']
    },
    {
      id: 'mdu', code: 'МДУ', name: 'Мирнинский дорожный участок', short: 'Мирнинский ДУ',
      chief: 'Степанов Виталий Викторович', staff: 49, order: 3,
      roads: 'а/д «Анабар» км 0 – км 66 (66 км); ФАД «Вилюй» км 1151 – км 1205 (54 км); автозимник «Вилюй» км 1310 – км 1742 (432 км); техдороги Интер-ОФ №3 (28 км). Всего 570 км',
      aliases: ['МДУ', 'МИРНИНСКИЙ', 'МИРНЫЙ', 'МИРНИНСКИЙДУ']
    },
    {
      id: 'du6', code: 'ДУ-6', name: 'Чернышевский дорожный участок №6', short: 'ДУ №6',
      chief: 'Муратова Наталья Сергеевна', staff: 28, order: 4,
      roads: 'а/д «Анабар», км 66 – км 196 (130 км)',
      aliases: ['ДУ6', 'ДУ-6', 'ДУ №6', 'ЧЕРНЫШЕВСКИЙ', 'ЧЕРНЫШЕВСК']
    },
    {
      id: 'du8', code: 'ДУ-8', name: 'Дорожный участок №8 (п. Моркока)', short: 'ДУ №8',
      chief: 'Хайбулинов Рашит Халимолдоевич', staff: 41, order: 5,
      roads: 'а/д «Анабар» км 196 – км 398 (202 км); автозимник 269-Накын-Нюрба (280 км)',
      aliases: ['ДУ8', 'ДУ-8', 'ДУ №8', 'МОРКОКА', 'МОРКОВКА', 'УЧАСТОК8']
    },
    {
      id: 'udu', code: 'УДУ', name: 'Удачнинский дорожный участок', short: 'Удачнинский ДУ',
      chief: 'Шумков Максим Владимирович', staff: 48, order: 6,
      roads: 'а/д «Анабар» км 398 – км 530 (132 км); заезд в п. Айхал (8 км); а/д на В.-Мунское м-ние (150 км)',
      aliases: ['УДУ', 'УДАЧНИНСКИЙ', 'УДАЧНЫЙ', 'АЙХАЛ']
    },
    {
      id: 'ukdu', code: 'УКДУ', name: 'Усть-Кутский дорожный участок', short: 'Усть-Кутский ДУ',
      chief: 'Тимошенко Михаил Иванович', staff: 18, order: 7,
      roads: 'а/д А-331 «Вилюй» км 719 – км 730 (11 км); автозимник «Вилюй» км 1742 – км 2146 (404 км)',
      aliases: ['УКДУ', 'УСТЬКУТСКИЙ', 'УСТЬКУТ', 'УСТЬ-КУТ']
    }
  ];

  /* Справочник видов работ: нормализованное имя -> каноническое имя и единица */
  var WORKS_SEED = [
    { name: 'Очистка дороги от снега', unit: '10 000 м2', group: 'Зимнее содержание' },
    { name: 'Очистка обочин от снега', unit: '10 км', group: 'Зимнее содержание' },
    { name: 'Очистка отверстий труб от снега', unit: '10 м', group: 'Зимнее содержание' },
    { name: 'Распределение песко-соляной смеси', unit: '10 000 м2', group: 'Зимнее содержание' },
    { name: 'Доставка противогололёдных материалов к месту распределения', unit: '10 км', group: 'Зимнее содержание' },
    { name: 'Планировка площадей бульдозерами', unit: '1000 м2', group: 'Зимнее содержание' },
    { name: 'Планировка проезжей части гравийных дорог', unit: '1000 м2', group: 'Летнее содержание' },
    { name: 'Профилирование гравийных дорог средним автогрейдером', unit: '1000 м2', group: 'Летнее содержание' },
    { name: 'Планировка автогрейдером: гравийных обочин', unit: '1 км', group: 'Летнее содержание' },
    { name: 'Планировка обочин механизированным способом', unit: '1 км', group: 'Летнее содержание' },
    { name: 'Планировка обочин механизированным способом (на переходном покрытии)', unit: '1 км', group: 'Летнее содержание' },
    { name: 'Восстановление профиля с добавлением нового материала', unit: '1000 м2', group: 'Ремонт' },
    { name: 'Восстановление профиля гравийных дорог без добавления нового материала', unit: '1000 м2', group: 'Ремонт' },
    { name: 'Ремонт укрепления обочин ПГС', unit: '100 м2', group: 'Ремонт' },
    { name: 'Ямочный ремонт гравийных покрытий', unit: '100 м2', group: 'Ремонт' }
  ];

  /* Нормализация единиц измерения к единому виду */
  function normUnit(u) {
    var s = norm(u).replace(/\s+/g, ' ')
      .replace(/м²/g, 'м2').replace(/м³/g, 'м3')
      .replace(/кв\.?\s?м/g, 'м2').replace(/куб\.?\s?м/g, 'м3')
      .replace(/пог\.?\s?м/g, 'м')
      .replace(/^ед\.?\s?изм\.?$/, '');
    s = s.replace(/(\d)\s+(\d{3})/g, '$1$2');   // «10 000 м2» -> «10000 м2»
    s = s.replace(/^(\d+)([а-я])/, '$1 $2');    // «1000м2» -> «1000 м2»
    return s.trim();
  }
  function prettyUnit(u) {
    var n = normUnit(u);
    var map = {
      '10000 м2': '10 000 м²', '1000 м2': '1 000 м²', '100 м2': '100 м²', 'м2': 'м²',
      '10 км': '10 км', '1 км': '1 км', 'км': 'км', '10 м': '10 м', 'м': 'м',
      'м3': 'м³', '1000 м3': '1 000 м³', 'маш ч': 'маш.-ч', 'т': 'т', 'шт': 'шт'
    };
    return map[n] || (u ? String(u).trim() : '—');
  }

  /* ===================== ХРАНИЛИЩЕ ===================== */

  var STORAGE_KEY = 'muad.volumes.db.v1';
  var DB_VERSION = 2;

  function emptyDb() {
    return {
      version: DB_VERSION,
      createdAt: new Date().toISOString(),
      settings: {
        org: 'АК «АЛРОСА» (ПАО)',
        dept: 'Мирнинское управление автомобильных дорог',
        deptShort: 'МУАД',
        reportAuthor: 'Производственно-технический отдел',
        adminHash: hashPassword('muad-admin'),
        adminPwdChanged: false,
        viewerHash: hashPassword('muad-view'),
        viewerEnabled: true,
        lockClosedMonths: true,
        warnOverPlan: true,
        weekStartsMonday: true
      },
      sites: SITES_SEED.map(function (s) {
        return Object.assign({}, s, { passHash: hashPassword(s.id + '-2026'), pwdChanged: false, active: true });
      }),
      works: WORKS_SEED.map(function (w) {
        return { id: slug(w.name), name: w.name, unit: normUnit(w.unit), group: w.group };
      }),
      plans: {},      // 'siteId|YYYY-MM' -> plan
      facts: {},      // 'siteId|YYYY-MM' -> fact
      closures: {},   // 'siteId|YYYY-MM' -> closure
      reports: [],    // журнал сформированных отчётов
      audit: []
    };
  }

  var _db = null;

  function load() {
    if (_db) return _db;
    try {
      var raw = global.localStorage && localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        _db = migrate(parsed);
        return _db;
      }
    } catch (e) {
      console.warn('Не удалось прочитать локальное хранилище:', e);
    }
    _db = emptyDb();
    save();
    return _db;
  }

  function migrate(db) {
    if (!db.version) db.version = 1;
    var base = emptyDb();

    /* Версия 2: исправлено написание посёлка в наименовании ДУ №8 */
    if (db.version < 2 && db.sites) {
      db.sites.forEach(function (s) {
        if (s.name) s.name = s.name.replace('Морковка', 'Моркока');
        if (s.aliases && s.aliases.indexOf('МОРКОКА') < 0) s.aliases = s.aliases.concat(['МОРКОКА']);
      });
    }
    db.version = DB_VERSION;
    db.settings = Object.assign({}, base.settings, db.settings || {});
    db.plans = db.plans || {};
    db.facts = db.facts || {};
    db.closures = db.closures || {};
    db.reports = db.reports || [];
    db.audit = db.audit || [];
    db.works = db.works && db.works.length ? db.works : base.works;
    if (!db.sites || !db.sites.length) db.sites = base.sites;
    return db;
  }

  var _saveTimer = null;
  function save(immediate) {
    if (!_db) return;
    var doSave = function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_db));
      } catch (e) {
        if (String(e).indexOf('Quota') >= 0 || e.name === 'QuotaExceededError') {
          alert('Локальное хранилище браузера переполнено. Выгрузите резервную копию и очистите старые периоды.');
        }
        console.error('Ошибка сохранения:', e);
      }
    };
    if (immediate) { clearTimeout(_saveTimer); doSave(); return; }
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(doSave, 120);
  }

  function resetAll() {
    _db = emptyDb();
    save(true);
  }

  function replaceDb(obj) {
    _db = migrate(obj);
    save(true);
  }

  /* ===================== ЖУРНАЛ ДЕЙСТВИЙ ===================== */

  function audit(action, details, user) {
    var db = load();
    db.audit.unshift({
      ts: new Date().toISOString(),
      user: user || (Auth.current() ? Auth.current().title : 'система'),
      role: Auth.current() ? Auth.current().role : 'system',
      action: action,
      details: details || ''
    });
    if (db.audit.length > 4000) db.audit.length = 4000;
    save();
  }

  /* ===================== АВТОРИЗАЦИЯ ===================== */

  var SESSION_KEY = 'muad.volumes.session';
  var _session = null;

  var Auth = {
    current: function () {
      if (_session) return _session;
      try {
        var raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) _session = JSON.parse(raw);
      } catch (e) { /* игнорируем */ }
      return _session;
    },
    login: function (login, password) {
      var db = load();
      var h = hashPassword(password);
      if (login === 'admin' || normKey(login) === 'администратор') {
        if (h !== db.settings.adminHash) return { ok: false, error: 'Неверный пароль администратора' };
        _session = { role: 'admin', title: 'Администратор', siteId: null, at: Date.now() };
      } else if (login === 'viewer' || normKey(login) === 'руководство') {
        if (!db.settings.viewerEnabled) return { ok: false, error: 'Доступ для руководства отключён' };
        if (h !== db.settings.viewerHash) return { ok: false, error: 'Неверный пароль' };
        _session = { role: 'viewer', title: 'Руководство (просмотр)', siteId: null, at: Date.now() };
      } else {
        var site = Data.findSite(login);
        if (!site) return { ok: false, error: 'Участок не найден' };
        if (site.active === false) return { ok: false, error: 'Участок деактивирован' };
        if (h !== site.passHash) return { ok: false, error: 'Неверный пароль участка' };
        _session = { role: 'site', title: site.name, siteId: site.id, at: Date.now() };
      }
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(_session)); } catch (e) { /* игнорируем */ }
      audit('Вход в систему', _session.title);
      return { ok: true, session: _session };
    },
    logout: function () {
      if (_session) audit('Выход из системы', _session.title);
      _session = null;
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* игнорируем */ }
    },
    isAdmin: function () { var s = Auth.current(); return !!s && s.role === 'admin'; },
    isSite: function () { var s = Auth.current(); return !!s && s.role === 'site'; },
    isViewer: function () { var s = Auth.current(); return !!s && s.role === 'viewer'; },
    canEdit: function () { var s = Auth.current(); return !!s && s.role !== 'viewer'; },
    setPassword: function (target, password) {
      var db = load();
      if (target === 'admin') { db.settings.adminHash = hashPassword(password); db.settings.adminPwdChanged = true; }
      else if (target === 'viewer') { db.settings.viewerHash = hashPassword(password); }
      else {
        var site = Data.site(target);
        if (!site) return false;
        site.passHash = hashPassword(password);
        site.pwdChanged = true;
      }
      save(true);
      audit('Смена пароля', 'объект доступа: ' + target);
      return true;
    }
  };

  /* ===================== ДОСТУП К ДАННЫМ ===================== */

  var Data = {
    db: load,
    save: save,
    audit: audit,
    resetAll: resetAll,
    replaceDb: replaceDb,
    storageKey: STORAGE_KEY,

    sites: function (onlyActive) {
      var list = load().sites.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
      return onlyActive === false ? list : list.filter(function (s) { return s.active !== false; });
    },
    site: function (id) {
      return load().sites.filter(function (s) { return s.id === id; })[0] || null;
    },
    siteName: function (id) {
      var s = Data.site(id);
      return s ? s.name : id;
    },
    siteShort: function (id) {
      var s = Data.site(id);
      return s ? (s.short || s.code) : id;
    },
    /* Поиск участка по любому написанию: код, имя, псевдоним, имя файла/листа */
    findSite: function (text) {
      if (!text) return null;
      var sites = load().sites;
      var q = normKey(text);
      if (!q) return null;
      var best = null, bestScore = 0;
      sites.forEach(function (s) {
        var cands = [s.id, s.code, s.name, s.short].concat(s.aliases || []);
        cands.forEach(function (c) {
          var n = normKey(c);
          if (!n) return;
          var score = 0;
          if (q === n) score = 100;
          else if (q.indexOf(n) >= 0 && n.length >= 3) score = 60 + n.length;
          else if (n.indexOf(q) >= 0 && q.length >= 3) score = 40 + q.length;
          if (score > bestScore) { bestScore = score; best = s; }
        });
      });
      return bestScore >= 40 ? best : null;
    },

    works: function () { return load().works.slice(); },
    findWork: function (name) {
      var n = normKey(name);
      return load().works.filter(function (w) { return normKey(w.name) === n; })[0] || null;
    },
    /* Регистрирует вид работ в справочнике, если его там нет */
    ensureWork: function (name, unit) {
      var db = load();
      var found = Data.findWork(name);
      if (found) {
        if (!found.unit && unit) found.unit = normUnit(unit);
        return found;
      }
      var w = { id: slug(name) || uid('w'), name: String(name).trim(), unit: normUnit(unit), group: 'Прочие работы' };
      db.works.push(w);
      save();
      return w;
    },

    key: function (siteId, month) { return siteId + '|' + month; },

    plan: function (siteId, month) { return load().plans[siteId + '|' + month] || null; },
    setPlan: function (siteId, month, plan) {
      var db = load();
      db.plans[siteId + '|' + month] = plan;
      save(true);
    },
    deletePlan: function (siteId, month) {
      var db = load();
      delete db.plans[siteId + '|' + month];
      save(true);
    },

    fact: function (siteId, month) {
      var db = load();
      var k = siteId + '|' + month;
      if (!db.facts[k]) db.facts[k] = { siteId: siteId, month: month, rows: {}, notes: {}, extra: [], updatedAt: null, updatedBy: null };
      return db.facts[k];
    },
    factRaw: function (siteId, month) { return load().facts[siteId + '|' + month] || null; },

    closure: function (siteId, month) {
      var c = load().closures[siteId + '|' + month];
      return c || { siteId: siteId, month: month, status: 'open' };
    },
    setClosure: function (siteId, month, closure) {
      var db = load();
      db.closures[siteId + '|' + month] = closure;
      save(true);
    },
    isClosed: function (siteId, month) { return Data.closure(siteId, month).status === 'closed'; },

    /* Месяцы, по которым есть план или факт (по убыванию) */
    monthsWithData: function (siteId) {
      var db = load(), set = {};
      Object.keys(db.plans).forEach(function (k) {
        var p = k.split('|');
        if (!siteId || p[0] === siteId) set[p[1]] = 1;
      });
      Object.keys(db.facts).forEach(function (k) {
        var p = k.split('|');
        if (!siteId || p[0] === siteId) set[p[1]] = 1;
      });
      set[todayKey()] = 1;
      return Object.keys(set).sort().reverse();
    },

    /* Все месяцы периода, доступные для отчётов */
    allMonths: function () { return Data.monthsWithData(null); }
  };

  /* ===================== РАСЧЁТЫ ===================== */

  /* Ключ строки: объект|работа|единица — устойчив к повторному импорту плана */
  function rowKey(object, work, unit) {
    return slug(object || 'без объекта') + '~' + slug(work) + '~' + normKey(normUnit(unit));
  }

  /* Свод участка за месяц: строки с планом, фактом, отклонением */
  function siteMonth(siteId, month) {
    var plan = Data.plan(siteId, month);
    var fact = Data.factRaw(siteId, month);
    var dim = daysInMonth(month);
    var rows = [];
    var seen = {};

    (plan ? plan.rows : []).forEach(function (pr) {
      var factDays = (fact && fact.rows[pr.id]) || {};
      var planTotal = sumDays(pr.days, dim, pr.total);
      var factTotal = sumDays(factDays, dim, null);
      seen[pr.id] = 1;
      rows.push(makeRow(pr.id, pr.object, pr.work, pr.unit, pr.days || {}, factDays, planTotal, factTotal, dim, false));
    });

    /* Внеплановые работы, внесённые участком */
    if (fact) {
      Object.keys(fact.rows).forEach(function (id) {
        if (seen[id]) return;
        var meta = (fact.extra || []).filter(function (e) { return e.id === id; })[0];
        if (!meta) return;
        var factDays = fact.rows[id] || {};
        rows.push(makeRow(id, meta.object, meta.work, meta.unit, {}, factDays, 0, sumDays(factDays, dim, null), dim, true));
      });
    }

    var totals = rows.reduce(function (acc, r) {
      acc.plan += r.planTotal; acc.fact += r.factTotal; return acc;
    }, { plan: 0, fact: 0 });

    return {
      siteId: siteId, month: month, days: dim, rows: rows,
      hasPlan: !!plan, plan: plan,
      closure: Data.closure(siteId, month),
      updatedAt: fact && fact.updatedAt,
      updatedBy: fact && fact.updatedBy,
      notes: (fact && fact.notes) || {},
      totals: totals,
      filledDays: filledDays(rows, dim)
    };
  }

  function makeRow(id, object, work, unit, planDays, factDays, planTotal, factTotal, dim, unplanned) {
    var dev = factTotal - planTotal;
    return {
      id: id, object: object || '', work: work, unit: unit,
      planDays: planDays, factDays: factDays,
      planTotal: round(planTotal), factTotal: round(factTotal),
      deviation: round(dev),
      done: planTotal > 0 ? factTotal / planTotal : (factTotal > 0 ? null : 0),
      unplanned: !!unplanned
    };
  }

  function sumDays(days, dim, fallbackTotal) {
    if (!days) return fallbackTotal || 0;
    var s = 0, any = false;
    for (var d = 1; d <= dim; d++) {
      var v = days[d] != null ? days[d] : days[String(d)];
      if (v != null && v !== '') { s += Number(v) || 0; any = true; }
    }
    if (!any && fallbackTotal != null) return Number(fallbackTotal) || 0;
    return s;
  }

  /* Дни, за которые внесён хотя бы один объём */
  function filledDays(rows, dim) {
    var set = {};
    rows.forEach(function (r) {
      for (var d = 1; d <= dim; d++) {
        var v = r.factDays[d] != null ? r.factDays[d] : r.factDays[String(d)];
        if (v != null && v !== '' && Number(v) !== 0) set[d] = 1;
      }
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  /* Дни, по которым есть план, но нет факта (для контроля перед закрытием) */
  function missingDays(siteId, month) {
    var sm = siteMonth(siteId, month);
    var dim = sm.days;
    /* Данные вносятся за прошедший день, поэтому текущий день
       ещё не считается пропущенным. */
    var today = new Date();
    var m = parseMonth(month);
    var isCurrentMonth = today.getFullYear() === m.year && today.getMonth() === m.month;
    var lastDay = isCurrentMonth ? today.getDate() - 1 : dim;
    var planned = {};
    sm.rows.forEach(function (r) {
      for (var d = 1; d <= dim; d++) {
        var v = r.planDays[d] != null ? r.planDays[d] : r.planDays[String(d)];
        if (v != null && Number(v) > 0) planned[d] = 1;
      }
    });
    var filled = {};
    sm.filledDays.forEach(function (d) { filled[d] = 1; });
    var miss = [];
    for (var d = 1; d <= lastDay; d++) {
      if (planned[d] && !filled[d]) miss.push(d);
    }
    return { missing: miss, lastDay: lastDay, anyPlanned: Object.keys(planned).length > 0 };
  }

  /* Агрегация по нескольким участкам и месяцам */
  function aggregate(siteIds, months) {
    var bySite = {}, byWork = {}, byMonth = {}, totals = { plan: 0, fact: 0 };
    var rowsAll = [];

    siteIds.forEach(function (sid) {
      bySite[sid] = { siteId: sid, plan: 0, fact: 0, months: {}, closedMonths: 0, totalMonths: months.length, rows: [] };
    });
    months.forEach(function (mk) { byMonth[mk] = { month: mk, plan: 0, fact: 0 }; });

    siteIds.forEach(function (sid) {
      months.forEach(function (mk) {
        var sm = siteMonth(sid, mk);
        bySite[sid].months[mk] = { plan: sm.totals.plan, fact: sm.totals.fact, closed: sm.closure.status === 'closed', hasPlan: sm.hasPlan };
        if (sm.closure.status === 'closed') bySite[sid].closedMonths++;
        bySite[sid].plan += sm.totals.plan;
        bySite[sid].fact += sm.totals.fact;
        byMonth[mk].plan += sm.totals.plan;
        byMonth[mk].fact += sm.totals.fact;
        totals.plan += sm.totals.plan;
        totals.fact += sm.totals.fact;

        sm.rows.forEach(function (r) {
          var wk = slug(r.work) + '~' + normKey(r.unit);
          if (!byWork[wk]) byWork[wk] = { work: r.work, unit: r.unit, plan: 0, fact: 0, sites: {} };
          byWork[wk].plan += r.planTotal;
          byWork[wk].fact += r.factTotal;
          byWork[wk].sites[sid] = (byWork[wk].sites[sid] || 0) + r.factTotal;

          var srk = slug(r.object) + '~' + wk;
          var acc = bySite[sid].rows.filter(function (x) { return x.key === srk; })[0];
          if (!acc) {
            acc = { key: srk, object: r.object, work: r.work, unit: r.unit, plan: 0, fact: 0 };
            bySite[sid].rows.push(acc);
          }
          acc.plan += r.planTotal;
          acc.fact += r.factTotal;
          rowsAll.push({ siteId: sid, month: mk, row: r });
        });
      });
    });

    Object.keys(bySite).forEach(function (sid) {
      var b = bySite[sid];
      b.done = b.plan > 0 ? b.fact / b.plan : null;
      b.deviation = round(b.fact - b.plan);
      b.rows.forEach(function (r) {
        r.plan = round(r.plan); r.fact = round(r.fact);
        r.deviation = round(r.fact - r.plan);
        r.done = r.plan > 0 ? r.fact / r.plan : null;
      });
      b.rows.sort(function (a, b2) { return b2.plan - a.plan; });
    });
    var worksList = Object.keys(byWork).map(function (k) {
      var w = byWork[k];
      w.plan = round(w.plan); w.fact = round(w.fact);
      w.deviation = round(w.fact - w.plan);
      w.done = w.plan > 0 ? w.fact / w.plan : null;
      return w;
    }).sort(function (a, b) { return b.plan - a.plan; });

    var monthsList = months.map(function (mk) {
      var m = byMonth[mk];
      m.plan = round(m.plan); m.fact = round(m.fact);
      m.done = m.plan > 0 ? m.fact / m.plan : null;
      return m;
    });

    var closedAll = siteIds.every(function (sid) {
      return months.every(function (mk) { return Data.closure(sid, mk).status === 'closed'; });
    });

    return {
      siteIds: siteIds, months: months,
      bySite: bySite, sites: siteIds.map(function (s) { return bySite[s]; }),
      works: worksList, byMonth: monthsList,
      totals: { plan: round(totals.plan), fact: round(totals.fact), deviation: round(totals.fact - totals.plan), done: totals.plan > 0 ? totals.fact / totals.plan : null },
      closedAll: closedAll,
      rowsAll: rowsAll
    };
  }

  /* Динамика по дням месяца (нарастающий итог, план vs факт) */
  function dailyDynamics(siteIds, month) {
    var dim = daysInMonth(month);
    var plan = new Array(dim + 1).fill(0), fact = new Array(dim + 1).fill(0);
    siteIds.forEach(function (sid) {
      var sm = siteMonth(sid, month);
      sm.rows.forEach(function (r) {
        for (var d = 1; d <= dim; d++) {
          plan[d] += Number(r.planDays[d] != null ? r.planDays[d] : r.planDays[String(d)]) || 0;
          fact[d] += Number(r.factDays[d] != null ? r.factDays[d] : r.factDays[String(d)]) || 0;
        }
      });
    });
    var out = [], cp = 0, cf = 0;
    for (var d = 1; d <= dim; d++) {
      cp += plan[d]; cf += fact[d];
      out.push({ day: d, plan: round(plan[d]), fact: round(fact[d]), cumPlan: round(cp), cumFact: round(cf) });
    }
    return out;
  }

  var Calc = {
    rowKey: rowKey, siteMonth: siteMonth, aggregate: aggregate,
    missingDays: missingDays, dailyDynamics: dailyDynamics, sumDays: sumDays
  };

  /* ===================== ЭКСПОРТ МОДУЛЯ ===================== */

  var CORE = {
    MONTHS: MONTHS, MONTHS_GEN: MONTHS_GEN, WEEKDAYS: WEEKDAYS,
    monthKey: monthKey, parseMonth: parseMonth, monthTitle: monthTitle, monthShort: monthShort,
    daysInMonth: daysInMonth, weekdayOf: weekdayOf, isWeekend: isWeekend,
    shiftMonth: shiftMonth, monthRange: monthRange, todayKey: todayKey, dateISO: dateISO,
    fmtDateRu: fmtDateRu, fmtDateTimeRu: fmtDateTimeRu, pad2: pad2,
    fmtNum: fmtNum, fmtPct: fmtPct, fmtSigned: fmtSigned, round: round,
    norm: norm, normKey: normKey, slug: slug, parseNum: parseNum, uid: uid, plural: plural,
    normUnit: normUnit, prettyUnit: prettyUnit,
    sha256: SHA, hashPassword: hashPassword,
    Data: Data, Auth: Auth, Calc: Calc,
    SITES_SEED: SITES_SEED, WORKS_SEED: WORKS_SEED
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  else global.CORE = CORE;
})(typeof globalThis !== 'undefined' ? globalThis : this);
