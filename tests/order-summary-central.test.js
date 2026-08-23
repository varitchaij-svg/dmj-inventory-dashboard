// tests/order-summary-central.test.js — แยกกลุ่ม "ส่ง Central" ในหน้า "สรุปสินค้าออกจากคลัง" (ส.ค. 2026)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง: หน้า OrderSummaryView (สรุปสินค้าออกจากคลัง) พอมีรายการที่ติดป้าย toCentral
// (ฟีเจอร์ก่อนหน้า — ดู order-central.test.js) ให้แยกเป็นกลุ่มของตัวเอง เหมือน "หิ้วเอง"/"ขึ้นรถ"
//
// ระหว่างต่อปุ่ม "ส่งทั้งหมด" ของกลุ่มนี้ พบว่า transferStockBatch เดิม **hardcode ปลายทางเป็น
// หน้าร้านเราเอง** (บวก qtyStore + ยิง ZORT AddTransfer ไปหน้าร้าน) — ใช้ตัวเดิมกับของที่ส่งไป
// Central จริง ๆ จะทำให้ "เช็คหน้าร้าน" โชว์ของที่ไม่เคยมาถึงจริงเงียบ ๆ · ถามเจ้าของแล้วได้คำตอบ
// ผูกมัด 3 ข้อ (ส.ค. 2026):
//   1) หน้าร้าน (qtyStore) ต้องไม่ขยับ — หักคลัง (qtyWH) อย่างเดียว
//   2) ZORT ยังไม่มีรหัสคลัง Central ลงทะเบียน → ห้ามยิง AddTransfer เด็ดขาด
//   3) ถือว่า "ส่งเสร็จแล้ว" ทันที ไม่มีขั้นกดรับเหมือนของส่งหน้าร้านปกติ
// → แยกฟังก์ชันใหม่ transferStockBatchCentral/logTransferBatchCentral_ แทนที่จะแตะ
//   transferStockBatch เดิม (ฟังก์ชันเดิมกระทบเงิน/สต็อกจริงและผ่านการใช้งานมานาน)
//
// backend: eval **ทั้ง appsscript_complete.gs** เป็นสคริปต์เดียวกับของปลอมเฉพาะแพลตฟอร์ม GAS
// (หลักเดียวกับ tests/mto-pos-e2e.test.js) — ไม่ mock ตรรกะธุรกิจสักบรรทัด
// frontend: meta-test สแกนต้นทางจริงจาก views-analytics.jsx (component ใหญ่ eval ตรงไม่ได้)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

function gasFormatDate(date, tz, fmt) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const m = {};
  parts.forEach((p) => { m[p.type] = p.value; });
  if (m.hour === '24') m.hour = '00';
  return String(fmt)
    .replace(/yyyy/g, m.year).replace(/MM/g, m.month).replace(/dd/g, m.day)
    .replace(/HH/g, m.hour).replace(/mm/g, m.minute).replace(/ss/g, m.second);
}

// ─── ของปลอมสำหรับ "แพลตฟอร์ม GAS" เท่านั้น (หลักเดียวกับ mto-pos-e2e.test.js) ───
function makeGasEnv() {
  const sheets = {};
  function makeRange(rows, r, c, nR, nC) {
    nR = nR || 1; nC = nC || 1;
    return {
      getValue: () => (rows[r - 1] && rows[r - 1][c - 1] != null ? rows[r - 1][c - 1] : ''),
      getValues: () => {
        const out = [];
        for (let i = 0; i < nR; i++) {
          const line = [];
          for (let j = 0; j < nC; j++) line.push(rows[r - 1 + i] ? (rows[r - 1 + i][c - 1 + j] != null ? rows[r - 1 + i][c - 1 + j] : '') : '');
          out.push(line);
        }
        return out;
      },
      setValue: (v) => { if (!rows[r - 1]) rows[r - 1] = []; rows[r - 1][c - 1] = v; return makeRange(rows, r, c, nR, nC); },
      setValues: (vals) => {
        for (let i = 0; i < nR; i++) {
          if (!rows[r - 1 + i]) rows[r - 1 + i] = [];
          for (let j = 0; j < nC; j++) rows[r - 1 + i][c - 1 + j] = vals[i][j];
        }
        return makeRange(rows, r, c, nR, nC);
      },
      setNumberFormat: () => makeRange(rows, r, c, nR, nC),
      setFontWeight: () => makeRange(rows, r, c, nR, nC),
    };
  }
  function makeSheet(name) {
    const rows = sheets[name];
    return {
      appendRow: (arr) => { rows.push(arr.slice()); },
      getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()), getDisplayValues: () => rows.map((r) => r.slice()) }),
      getRange: (r, c, nR, nC) => makeRange(rows, r, c, nR, nC),
      getLastRow: () => rows.length,
      getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0),
      deleteRow: (r) => { rows.splice(r - 1, 1); },
    };
  }
  const ss = {
    getSheetByName: (name) => (sheets[name] ? makeSheet(name) : null),
    insertSheet: (name) => { sheets[name] = []; return makeSheet(name); },
    flush: () => {},
    toast: () => {},
  };
  const cacheStore = {};
  const CacheService = {
    getScriptCache: () => ({
      get: (k) => (Object.prototype.hasOwnProperty.call(cacheStore, k) ? cacheStore[k] : null),
      put: (k, v) => { cacheStore[k] = String(v); },
      putAll: (obj) => { Object.assign(cacheStore, obj); },
      remove: (k) => { delete cacheStore[k]; },
      removeAll: (ks) => { (ks || []).forEach((k) => delete cacheStore[k]); },
    }),
  };
  const props = {};
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; },
      setProperties: (o) => Object.assign(props, o),
      deleteProperty: (k) => { delete props[k]; },
      getProperties: () => ({ ...props }),
    }),
  };
  const LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {}, hasLock: () => true }),
    getUserLock: () => ({ tryLock: () => true, releaseLock: () => {}, hasLock: () => true }),
  };
  const zortCalls = [];
  const UrlFetchApp = {
    fetch: (url, opts) => {
      zortCalls.push({ url, method: (opts && opts.method) || 'get', payload: opts && opts.payload });
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ resCode: '200', number: 'DOC-DRYRUN-001' }) };
    },
  };
  const Logger = { log: () => {} };
  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }),
  };
  const Session = { getScriptTimeZone: () => 'Asia/Bangkok' };
  const Utilities = { formatDate: gasFormatDate, getUuid: () => 'test-uuid-0001', sleep: () => {} };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ss,
    openById: () => ss,
    getUi: () => ({ alert: () => {} }),
    flush: () => {},
  };

  return { ss, sheets, zortCalls, cacheStore, props, CacheService, PropertiesService, LockService, UrlFetchApp, Logger, ContentService, Session, Utilities, SpreadsheetApp };
}

function parseAction(out) {
  if (out && typeof out.getContent === 'function') return JSON.parse(out.getContent());
  return out;
}

function loadModule(env) {
  const globalNames = ['SpreadsheetApp', 'CacheService', 'PropertiesService', 'LockService', 'UrlFetchApp', 'Logger', 'ContentService', 'Session', 'Utilities'];
  const globalVals = globalNames.map((n) => env[n]);
  // eslint-disable-next-line no-new-func
  return new Function(...globalNames,
    SRC + '\nreturn { transferStockBatchCentral, transferStockBatch, SHEET_PRODUCTS, SHEET_TRANSFERS, COL_PROD_QTYWH, COL_PROD_QTYFS, COL_PROD_SKU, WH_NAME_CENTRAL, COL_SHIP_TID };'
  )(...globalVals);
}

function seedProducts(env, mod, rows) {
  // header + แถวสินค้า (คอลัมน์: A .. B=sku(2) .. C=name(3) .. G=qtyStore(7) .. H=qtyWH(8))
  const header = new Array(10).fill('');
  const body = rows.map((r) => {
    const arr = new Array(10).fill('');
    arr[mod.COL_PROD_SKU - 1] = r.sku;
    arr[2] = r.name || r.sku;
    arr[mod.COL_PROD_QTYFS - 1] = r.qtyStore || 0;
    arr[mod.COL_PROD_QTYWH - 1] = r.qtyWH || 0;
    return arr;
  });
  env.sheets[mod.SHEET_PRODUCTS] = [header, ...body];
}

describe('transferStockBatchCentral — e2e กับ appsscript_complete.gs ตัวจริง', () => {
  it('หักคลัง (qtyWH) เท่านั้น ไม่แตะหน้าร้าน (qtyStore)', () => {
    const env = makeGasEnv();
    const mod = loadModule(env);
    seedProducts(env, mod, [{ sku: 'R01025', qtyStore: 20, qtyWH: 50 }]);

    const out = parseAction(mod.transferStockBatchCentral(env.ss, [
      { sku: 'R01025', qty: 10, name: 'กุหลาบแดง', orderId: 'R1' },
    ], 'พนักงาน', 'TIDCENTRAL1'));

    expect(out.success).toBe(true);
    const sh = env.sheets[mod.SHEET_PRODUCTS];
    expect(sh[1][mod.COL_PROD_QTYWH - 1]).toBe(40);   // 50-10
    expect(sh[1][mod.COL_PROD_QTYFS - 1]).toBe(20);   // ไม่ขยับ
  });

  it('ไม่ยิง ZORT เลย (UrlFetchApp.fetch ไม่ถูกเรียก)', () => {
    const env = makeGasEnv();
    const mod = loadModule(env);
    seedProducts(env, mod, [{ sku: 'R01025', qtyStore: 20, qtyWH: 50 }]);

    mod.transferStockBatchCentral(env.ss, [
      { sku: 'R01025', qty: 5, name: 'กุหลาบแดง', orderId: 'R1' },
    ], 'พนักงาน', 'TIDCENTRAL2');

    expect(env.zortCalls.length).toBe(0);
  });

  it('บันทึกลงชีตโอนด้วยปลายทาง Central และมาร์คว่า "รับครบ" ทันที (ไม่มีขั้นกดรับ)', () => {
    const env = makeGasEnv();
    const mod = loadModule(env);
    seedProducts(env, mod, [{ sku: 'R01025', qtyStore: 20, qtyWH: 50 }]);

    mod.transferStockBatchCentral(env.ss, [
      { sku: 'R01025', qty: 5, name: 'กุหลาบแดง', orderId: 'R1' },
    ], 'พนักงาน', 'TIDCENTRAL3');

    const rows = env.sheets[mod.SHEET_TRANSFERS];
    expect(rows.length).toBe(2); // แถวหัวตาราง (insertSheet appendRow(SHIP_HEADERS)) + แถวที่เพิ่งเขียน
    const row = rows[1];
    expect(row[4]).toBe(mod.WH_NAME_CENTRAL);     // E = ไปคลัง/สาขา
    expect(row[10]).toBe(5);                      // K = จำนวนที่รับ = จำนวนที่โอน
    expect(row[11]).toBe('รับครบ');                // L = สถานะรับ
    expect(row[12]).toBeTruthy();                  // M = รับเมื่อ (เติมไว้ล่วงหน้า)
    expect(row[13]).toBe('พนักงาน');               // N = ผู้รับ = actor
    expect(row[15]).toBe('TIDCENTRAL3');           // P = tid
  });

  it('ส่งซ้ำด้วย tid เดิม → คืนผลเดิม ไม่หักคลังซ้ำ (idempotent เหมือน transferStockBatch)', () => {
    const env = makeGasEnv();
    const mod = loadModule(env);
    seedProducts(env, mod, [{ sku: 'R01025', qtyStore: 20, qtyWH: 50 }]);

    mod.transferStockBatchCentral(env.ss, [{ sku: 'R01025', qty: 10, orderId: 'R1' }], 'พนักงาน', 'TIDCENTRAL4');
    const out2 = parseAction(mod.transferStockBatchCentral(env.ss, [{ sku: 'R01025', qty: 10, orderId: 'R1' }], 'พนักงาน', 'TIDCENTRAL4'));

    expect(out2.success).toBe(true);
    expect(out2.data.replay).toBe(true);
    const sh = env.sheets[mod.SHEET_PRODUCTS];
    expect(sh[1][mod.COL_PROD_QTYWH - 1]).toBe(40); // หักแค่รอบเดียว (50-10) ไม่ใช่ 30
  });

  it('คลังไม่พอ → โอนได้เท่าที่มี (clamp) พร้อมรายงาน shortfall เหมือนของเดิม', () => {
    const env = makeGasEnv();
    const mod = loadModule(env);
    seedProducts(env, mod, [{ sku: 'R01025', qtyStore: 0, qtyWH: 3 }]);

    const out = parseAction(mod.transferStockBatchCentral(env.ss, [
      { sku: 'R01025', qty: 10, orderId: 'R1' },
    ], 'พนักงาน', 'TIDCENTRAL5'));

    expect(out.data.results[0].transferred).toBe(3);
    expect(out.data.shortfalls.length).toBe(1);
    const sh = env.sheets[mod.SHEET_PRODUCTS];
    expect(sh[1][mod.COL_PROD_QTYWH - 1]).toBe(0);
  });

  it('ใช้ cache key คนละชุดกับ transferStockBatch ปกติ (tfbc_/shpc_ ต่างจาก tfb_/shp2_)', () => {
    const fn = grab(SRC, /function transferStockBatchCentral\(ss, list, actor, tid\) \{[\s\S]*?\n\}\n/, 'transferStockBatchCentral');
    expect(fn).toMatch(/'tfbc_' \+ tid/);
    expect(fn).toMatch(/"shpc_" \+ orderId/);
    expect(fn).not.toMatch(/'tfb_' \+ tid/);
    expect(fn).not.toMatch(/"shp2_" \+ orderId/);
  });

  it('audit ใช้ชื่อ action "โอนสต็อก" ตัวเดียวกับ transferStockBatch (มีหมวดใน STAFF_PERF_CATEGORIES_ อยู่แล้ว ไม่ต้องเพิ่ม)', () => {
    const fn = grab(SRC, /function transferStockBatchCentral\(ss, list, actor, tid\) \{[\s\S]*?\n\}\n/, 'transferStockBatchCentral');
    expect(fn).toMatch(/writeAuditLogBatch_\(actor, "โอนสต็อก"/);
  });
});

describe('WH_NAME_CENTRAL — ค่าคนละตัวกับปลายทางที่มีอยู่แล้ว', () => {
  it('ไม่ชนกับ WH_NAME_SAI5/WH_NAME_FS', () => {
    const fn = grab(SRC, /const WH_NAME_CENTRAL = "[^"]+";/, 'WH_NAME_CENTRAL');
    expect(fn).toBe('const WH_NAME_CENTRAL = "Central";');
    expect(SRC).toMatch(/const WH_NAME_SAI5\s*=\s*"[^"]+";/);
  });
});

describe('meta — doPost/ตาราง permission ต้องรู้จัก transferStockBatchCentral', () => {
  it('POST_FLAG_ACTIONS_ มี transferStockBatchCentral', () => {
    const arr = grab(SRC, /var POST_FLAG_ACTIONS_ = \[[\s\S]*?\];/, 'POST_FLAG_ACTIONS_');
    expect(arr).toMatch(/"transferStockBatchCentral"/);
  });
  it('COMMON_ACTIONS_ มี transferStockBatchCentral (saler/storedevice/warehouse ใช้ได้ทันที)', () => {
    const arr = grab(SRC, /var COMMON_ACTIONS_ = \[[\s\S]*?\];/, 'COMMON_ACTIONS_');
    expect(arr).toMatch(/"transferStockBatchCentral"/);
  });
  it('doPost dispatch เรียก transferStockBatchCentral จริง (ไม่ใช่แค่ประกาศฟังก์ชันทิ้งไว้เฉย ๆ)', () => {
    expect(SRC).toMatch(/if \(data\.transferStockBatchCentral\) \{\s*\n\s*return transferStockBatchCentral\(ss, data\.list \|\| \[\], actor, data\.tid\);/);
  });
});

describe('frontend — OrderSummaryView แยกกลุ่ม Central (views-analytics.jsx)', () => {
  it('centralOrders/carryOrders/truckOrders กรองด้วย toCentral แบบไม่ซ้อนกัน (mutually exclusive)', () => {
    const central = grab(VANA, /const centralOrders = uM\(\(\) => doneOrders\.filter\(o => o\.toCentral\)[\s\S]*?\]\);/, 'centralOrders');
    const carry   = grab(VANA, /const carryOrders = uM\(\(\) => doneOrders\.filter\(o => !o\.toCentral && o\.carryMode === "carry"\)[\s\S]*?\]\);/, 'carryOrders');
    const truck   = grab(VANA, /const truckOrders = uM\(\(\) => doneOrders\.filter\(o => !o\.toCentral && o\.carryMode !== "carry"\)[\s\S]*?\]\);/, 'truckOrders');
    expect(central).toBeTruthy();
    expect(carry).toMatch(/!o\.toCentral/);
    expect(truck).toMatch(/!o\.toCentral/);
  });

  it('findAlreadyShipped รวม centralOrders เข้า pending ด้วย (ไม่งั้นเช็คของที่ส่งไปแล้วมองไม่เห็นกลุ่มนี้)', () => {
    expect(VANA).toMatch(/const pending = \[\.\.\.centralOrders, \.\.\.carryOrders, \.\.\.truckOrders\]/);
  });

  it('renderSection มี 3 จุดเรียกครบ (หิ้วเอง/ขึ้นรถ/ส่ง Central) พร้อม colorVariant', () => {
    expect(VANA).toMatch(/renderSection\("หิ้วเอง", "🚶", carryOrders, false, "carry"\)/);
    expect(VANA).toMatch(/renderSection\("ขึ้นรถ",\s*"🚛", truckOrders, true, "truck"\)/);
    expect(VANA).toMatch(/renderSection\("ส่ง Central", "🏢", centralOrders, false, "central"\)/);
  });

  it('doShipAll แยกยิง syncStockTransferBatchCentral เมื่อกลุ่มนี้เป็น Central (เช็คจาก ready[0])', () => {
    const fn = grab(VANA, /const isCentralBatch = !!\(ready\[0\] && ready\[0\]\.toCentral\);/, 'isCentralBatch');
    expect(fn).toBeTruthy();
    expect(VANA).toMatch(/batchRes = isCentralBatch\s*\n\s*\? await syncStockTransferBatchCentral\(transferItems, tid\)\s*\n\s*: await syncStockTransferBatch\(transferItems, tid\);/);
  });

  it('syncStockTransferBatchCentral ยิง action transferStockBatchCentral (คนละ action จาก transferStockBatch)', () => {
    const fn = grab(VANA, /async function syncStockTransferBatchCentral\(items, tid\) \{[\s\S]*?\n\}/, 'syncStockTransferBatchCentral');
    expect(fn).toMatch(/transferStockBatchCentral: true/);
    expect(fn).toMatch(/dmjTimeoutMs: 240000/);
    expect(fn).toMatch(/unreadable: true/);
  });
});
