/* Минимальный shim браузерных API для запуска модулей приложения в Node
   (используется только инструментами сборки и тестами). */
var store = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
  clear: function () { store = {}; }
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.alert = function (m) { console.log('[alert]', m); };
module.exports = { store: store };
