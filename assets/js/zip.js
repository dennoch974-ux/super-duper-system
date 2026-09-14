/* zip.js — чтение и запись ZIP-контейнеров (xlsx/pptx) без внешних библиотек.
   Использует нативные CompressionStream/DecompressionStream ('deflate-raw'). */
(function (global) {
  'use strict';

  var te = new TextEncoder();
  var td = new TextDecoder('utf-8');

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function supported() {
    return typeof DecompressionStream !== 'undefined' && typeof CompressionStream !== 'undefined';
  }

  async function deflateRaw(bytes) {
    var cs = new CompressionStream('deflate-raw');
    var w = cs.writable.getWriter();
    w.write(bytes); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }

  async function inflateRaw(bytes) {
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  /* ---------- Чтение ---------- */
  /* Возвращает Map<путь, Uint8Array> */
  async function read(arrayBuffer) {
    var buf = new Uint8Array(arrayBuffer);
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    // Поиск End of Central Directory (сигнатура 0x06054b50) с конца
    var eocd = -1;
    for (var i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65535; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Файл не является ZIP-архивом (не найден EOCD).');

    var count = dv.getUint16(eocd + 10, true);
    var cdOffset = dv.getUint32(eocd + 16, true);
    var cdSize = dv.getUint32(eocd + 12, true);

    // ZIP64: признак 0xFFFFFFFF/0xFFFF
    if (cdOffset === 0xFFFFFFFF || count === 0xFFFF) {
      for (var z = eocd - 20; z >= 0; z--) {
        if (dv.getUint32(z, true) === 0x07064b50) {              // ZIP64 EOCD locator
          var z64 = Number(dv.getBigUint64(z + 8, true));
          if (dv.getUint32(z64, true) === 0x06064b50) {
            count = Number(dv.getBigUint64(z64 + 32, true));
            cdSize = Number(dv.getBigUint64(z64 + 40, true));
            cdOffset = Number(dv.getBigUint64(z64 + 48, true));
          }
          break;
        }
      }
    }

    var files = new Map();
    var p = cdOffset;
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var compSize = dv.getUint32(p + 20, true);
      var uncompSize = dv.getUint32(p + 24, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var localOff = dv.getUint32(p + 42, true);
      var name = td.decode(buf.subarray(p + 46, p + 46 + nameLen));

      // Разбор ZIP64-расширения при необходимости
      if (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF || localOff === 0xFFFFFFFF) {
        var ep = p + 46 + nameLen, epEnd = ep + extraLen;
        while (ep + 4 <= epEnd) {
          var hid = dv.getUint16(ep, true), hsz = dv.getUint16(ep + 2, true), q = ep + 4;
          if (hid === 0x0001) {
            if (uncompSize === 0xFFFFFFFF) { uncompSize = Number(dv.getBigUint64(q, true)); q += 8; }
            if (compSize === 0xFFFFFFFF) { compSize = Number(dv.getBigUint64(q, true)); q += 8; }
            if (localOff === 0xFFFFFFFF) { localOff = Number(dv.getBigUint64(q, true)); q += 8; }
            break;
          }
          ep += 4 + hsz;
        }
      }

      // Локальный заголовок — из него берём фактические длины имени/extra
      var lnameLen = dv.getUint16(localOff + 26, true);
      var lextraLen = dv.getUint16(localOff + 28, true);
      var dataStart = localOff + 30 + lnameLen + lextraLen;
      var raw = buf.subarray(dataStart, dataStart + compSize);

      files.set(name, { method: method, raw: raw, size: uncompSize });
      p += 46 + nameLen + extraLen + commentLen;
    }

    var out = new Map();
    for (var entry of files) {
      var nm = entry[0], f = entry[1];
      if (nm.endsWith('/')) continue;
      if (f.method === 0) out.set(nm, f.raw.slice());
      else if (f.method === 8) out.set(nm, await inflateRaw(f.raw));
      else throw new Error('Неподдерживаемый метод сжатия в архиве: ' + f.method);
    }
    return out;
  }

  function readText(files, name) {
    var b = files.get(name);
    if (!b) return null;
    // Срезаем BOM
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);
    return td.decode(b);
  }

  /* ---------- Запись ---------- */
  /* entries: [{name, data: string|Uint8Array}] -> Blob */
  async function write(entries, mime) {
    var locals = [];
    var central = [];
    var offset = 0;
    var now = new Date();
    var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var data = typeof e.data === 'string' ? te.encode(e.data) : e.data;
      var nameBytes = te.encode(e.name);
      var crc = crc32(data);
      var comp = data, method = 0;
      if (data.length > 128) {
        var packed = await deflateRaw(data);
        if (packed.length < data.length) { comp = packed; method = 8; }
      }

      var lh = new Uint8Array(30 + nameBytes.length);
      var ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034b50, true);
      ldv.setUint16(4, 20, true);           // version needed
      ldv.setUint16(6, 0x0800, true);       // UTF-8 имена
      ldv.setUint16(8, method, true);
      ldv.setUint16(10, dosTime, true);
      ldv.setUint16(12, dosDate, true);
      ldv.setUint32(14, crc, true);
      ldv.setUint32(18, comp.length, true);
      ldv.setUint32(22, data.length, true);
      ldv.setUint16(26, nameBytes.length, true);
      ldv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      locals.push(lh, comp);

      var ch = new Uint8Array(46 + nameBytes.length);
      var cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, method, true);
      cdv.setUint16(12, dosTime, true);
      cdv.setUint16(14, dosDate, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, comp.length, true);
      cdv.setUint32(24, data.length, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);
      central.push(ch);

      offset += lh.length + comp.length;
    }

    var cdSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var eocd = new Uint8Array(22);
    var edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, entries.length, true);
    edv.setUint16(10, entries.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);

    var parts = locals.concat(central, [eocd]);
    return new Blob(parts, { type: mime || 'application/zip' });
  }

  var ZIP = { read: read, write: write, readText: readText, crc32: crc32, supported: supported };
  if (typeof module !== 'undefined' && module.exports) module.exports = ZIP;
  else global.ZIP = ZIP;
})(typeof globalThis !== 'undefined' ? globalThis : this);
