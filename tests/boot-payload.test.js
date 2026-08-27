// ────────────────────────────────────────────────────────────────────────────
// Phase B — `action=boot`: ก้อนเปิดแอปที่ไม่ผูกกับ buildFullData_
//
// หลักฐานที่มา: `buildFullData_` วัดจริงได้ 7.6 วิ (container อุ่น) ถึง 18.0 วิ (เย็น)
// และ ContentService บัฟเฟอร์ → ไบต์แรกถึง browser ต่อเมื่อ doGet คืนค่าแล้ว
// ⇒ ทุก cache miss ผู้ใช้คนนั้นจ่ายเวลานั้นเองเต็ม ๆ
//
// ยึดกติกาเดิมของ repo: **eval ฟังก์ชันจริงจากต้นทาง ไม่ copy** (เหมือน auth.test.js)
// ────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// ── รันของจริง: bootHandler_ + buildBootData_ + cache primitives จาก .gs ──
const SRC = [
  grab(GS, /const _CACHE_CHUNK_LEN = \d+;.*/),
  grab(GS, /const _CACHE_TS_SUFFIX = '[^']*';.*/),
  grab(GS, /var BOOT_CONTRACT_VERSION_ = \d+;.*/),
  grab(GS, /var _BOOT_KEY_COUNT {2}= '[^']*';.*/),
  grab(GS, /var _BOOT_KEY_PART {3}= '[^']*';.*/),
  grab(GS, /var _BOOT_STALE_KEY_COUNT = '[^']*';.*/),
  grab(GS, /var _BOOT_STALE_KEY_PART {2}= '[^']*';.*/),
  grab(GS, /var _BOOT_TTL_SEC {4}= \d+;.*/),
  grab(GS, /var _BOOT_STALE_TTL_SEC = \d+;.*/),
  grab(GS, /var BOOT_SOURCE_SHEETS_ = \[[\s\S]*?\];/),
  grab(GS, /function _readChunked_\(kCount, kPart\) \{[\s\S]*?\n\}/),
  grab(GS, /function _writeChunked_\(str, kCount, kPart, ttlSec\) \{[\s\S]*?\n\}/),
  grab(GS, /function markStalePayload_\(s, ts\) \{[\s\S]*?\n\}/),
  grab(GS, /function packProductsColumnar_\(products\) \{[\s\S]*?\n\}/),
  grab(GS, /function shapeColumnarPayload_\(shaped\) \{[\s\S]*?\n\}/),
  grab(GS, /function buildBootData_\(\) \{[\s\S]*?\n\}/),
  grab(GS, /function readBootPayload_\(\)[^\n]*/),
  grab(GS, /function readBootStalePayload_\(\)[^\n]*/),
  grab(GS, /function putBootPayload_\(str\)[^\n]*/),
  grab(GS, /function putBootStalePayload_\(s\)[^\n]*/),
  grab(GS, /function bootHandler_\(\) \{[\s\S]*?\n\}/),
].join('\n');

function makeRig(opts) {
  opts = opts || {};
  const store = new Map();
  const calls = { buildFullData_: 0, buildBootData_: 0, sheetsRead: [] };
  let ts = opts.ts || 1000;

  const CacheService = {
    getScriptCache: () => ({
      get: (k) => (store.has(k) ? store.get(k) : null),
      getAll: (ks) => { const o = {}; ks.forEach(k => { if (store.has(k)) o[k] = store.get(k); }); return o; },
      putAll: (o) => Object.keys(o).forEach(k => store.set(k, o[k])),
      remove: (k) => store.delete(k),
      removeAll: (ks) => ks.forEach(k => store.delete(k)),
    }),
  };
  const ContentService = {
    MimeType: { JSON: 'json' },
    createTextOutput: (t) => ({ _t: t, setMimeType() { return this; } }),
  };
  const Logger = { log() {} };

  const PRODUCTS = opts.products || [
    { sku: 'OL00001', name: 'มะกอก', imageUrl: 'u1', locations: [{ side: 'A', shelf: 3, lock: 7 }],
      category: 'ดอกไม้', tag: '', vendor: '', qtyStore: 0, qtyWH: 0, qty: 0, qtyStatus: 'ok',
      isOversold: false, isOOS: true, isMTO: false,
      price: 0, cost: 0, soldQty: 0, soldRev: 0, monthly: [], color: null },
    { sku: 'R01025', name: 'กุหลาบ', imageUrl: '', locations: [],
      category: 'ดอกไม้', tag: '', vendor: '', qtyStore: 0, qtyWH: 0, qty: 0, qtyStatus: 'ok',
      isOversold: false, isOOS: true, isMTO: false,
      price: 0, cost: 0, soldQty: 0, soldRev: 0, monthly: [], color: null },
  ];

  const env = {
    CacheService, ContentService, Logger,
    SHEET_PRODUCTS: 'อัพเดทจำนวนสินค้า', SHEET_PRODUCT_META: 'ข้อมูลสินค้า',
    SHEET_TRANSFERS: 'รายการโอนสินค้า', SHEET_LOCKS: 'ตำแหน่งจัดเก็บ', SHEET_ORDERS: 'ลำดับที่สั่งสินค้า',
    batchReadFormatted_: (names) => { names.forEach(n => calls.sheetsRead.push(n)); const o = {}; names.forEach(n => { o[n] = []; }); return o; },
    readStockSheetRows_: () => [],
    readProducts_: () => JSON.parse(JSON.stringify(PRODUCTS)),
    readQtyByLocation_: () => ({ OL00001: { qtyStore: 5, qtyWH: 20, price: 100 } }),
    wholesaleRatio_: () => 0.8,
    applyQtyLocToProduct_: (p, loc) => {
      if (!p || !loc) return p;
      p.qtyStore = loc.qtyStore; p.qtyWH = loc.qtyWH;
      if (loc.price > 0) p.price = loc.price;
      const t = loc.qtyStore + loc.qtyWH;
      p.qty = t; p.qtyStatus = t < 0 ? 'negative' : 'ok'; p.isOversold = t < 0; p.isOOS = t <= 0;
      return p;
    },
    lockKeyOf_: (l) => `${l.side}${l.shelf}/${l.lock}`,
    readStorage_: () => ({ lockMap: { 'A3/7': { qty: 25 } } }),
    readOrders_: () => [{ id: 'R3', sku: 'OL00001', status: 'รอ' }],
    readShipments_: () => [{ id: 'S2', sku: 'OL00001', receivedAt: '' }],
    readStockCheckRequests_: () => [{ reqId: 'Q1', fsStatus: 'pending', whStatus: 'done' },
                                    { reqId: 'Q2', fsStatus: 'done', whStatus: 'done' }],
    readThresholds_: () => ({ default: 12, overrides: {}, coverMonths: 2 }),
    getSheetLastModified_: () => ts,
    acquireBuildLock_: () => (opts.lockBusy ? null : { releaseLock() {} }),
    releaseBuildLock_: () => {},
    perfLogDoGet_: (kind, variant, tStart, bytes, extra) => { calls.lastLog = { kind, variant, bytes, extra }; },
    buildFullData_: () => { calls.buildFullData_++; return {}; },
    setTs: (v) => { ts = v; },
  };
  const keys = Object.keys(env);
  // eslint-disable-next-line no-new-func
  const f = new Function(...keys, SRC + '\nreturn { bootHandler_, buildBootData_, readBootPayload_, readBootStalePayload_, putBootPayload_, putBootStalePayload_, BOOT_SOURCE_SHEETS_, BOOT_CONTRACT_VERSION_ };');
  const api = f(...keys.map(k => env[k]));
  return { api, store, calls, env };
}

const parse = (res) => JSON.parse(res._t);

describe('A. buildBootData_ — เนื้อในของก้อนเปิดแอป', () => {
  it('มีของครบตามที่ shell ของแอปต้องใช้', () => {
    const { api } = makeRig();
    const d = api.buildBootData_();
    ['products', 'orders', 'shipments', 'storage', 'stockCheckRequests', 'thresholds', 'totals']
      .forEach(k => expect(d, 'ขาดคีย์ ' + k).toHaveProperty(k));
    expect(d._boot).toBe(1);
    expect(d.bv).toBe(api.BOOT_CONTRACT_VERSION_);
  });

  it('**ไม่มี** ก้อนหนักที่ตัดทิ้ง (ยอดขาย/ซื้อ/โอนย้อนหลัง/MTO)', () => {
    const { api } = makeRig();
    const d = api.buildBootData_();
    ['monthlyByCat', 'dailyByCat', 'dayLabels', 'monthLabels', 'purchases', 'transfers',
     'transferStats', 'mtoJobs', 'mtoGroups'].forEach(k => {
      expect(d[k], k + ' ต้องไม่อยู่ในก้อน boot').toBeUndefined();
    });
  });

  it('สินค้าไม่มีคีย์ที่มาจากยอดขาย — ส่ง 0 = ตัวเลขผิดที่ดูเหมือนข้อเท็จจริง', () => {
    const { api } = makeRig();
    const p = api.buildBootData_().products[0];
    ['soldQty', 'soldRev', 'monthly', 'mo', 'cost', 'profit'].forEach(k => {
      expect(p, 'products[].' + k + ' ต้องไม่ถูกส่ง').not.toHaveProperty(k);
    });
  });

  it('จำนวนสต็อกมาจากชีตสต็อก (แหล่งที่ ZORT sync เขียน) และคิด qty/isOOS ใหม่', () => {
    const { api } = makeRig();
    const p = api.buildBootData_().products[0];
    expect(p.qtyStore).toBe(5);
    expect(p.qtyWH).toBe(20);
    expect(p.qty).toBe(25);
    expect(p.isOOS).toBe(false);        // มีของจริง — บั๊ก WL ต้องไม่ซ้ำรอย
    expect(p.stockValue).toBe(25 * 100 * 0.8);   // มูลค่าคิดที่ราคาขายส่ง
  });

  it('คำขอเช็คสต็อกที่ปิดครบ 2 ฝั่งแล้วถูกกรองออก (เหมือน payload เต็ม)', () => {
    const { api } = makeRig();
    const ids = api.buildBootData_().stockCheckRequests.map(r => r.reqId);
    expect(ids).toEqual(['Q1']);
  });

  it('อ่านเฉพาะชีตที่จำเป็น — ไม่แตะชีตยอดขาย/ซื้อ/MTO', () => {
    const { api, calls } = makeRig();
    api.buildBootData_();
    ['ยอดขายรายเดือน', 'ยอดขายรายวัน', 'รายการซื้อสินค้า'].forEach(n => {
      expect(calls.sheetsRead).not.toContain(n);
    });
  });
});

describe('B. bootHandler_ — เส้นทาง HIT / MISS / STALE', () => {
  it('MISS → build ก้อนเบา แล้วเขียนทั้งชั้นสดและชั้นสำรอง', () => {
    const { api, store } = makeRig();
    const d = parse(api.bootHandler_());
    expect(d._boot).toBe(1);
    expect(store.has('dmj_boot_n')).toBe(true);
    expect(store.has('dmj_bootstale_n')).toBe(true);
  });

  it('**ไม่เรียก buildFullData_ เลย** ทั้ง HIT และ MISS', () => {
    const { api, calls } = makeRig();
    api.bootHandler_();     // MISS
    api.bootHandler_();     // HIT
    expect(calls.buildFullData_).toBe(0);
  });

  it('HIT → ไม่ build ซ้ำ และปั๊ม lastModified สด (conflict detection ทำงานได้)', () => {
    const { api, env } = makeRig({ ts: 1000 });
    api.bootHandler_();
    env.setTs(2000);
    const d = parse(api.bootHandler_());
    expect(d.lastModified).toBe(2000);
  });

  it('คว้าล็อกไม่ได้ + มีของสำรอง → คืนของสำรองทันที ไม่ต่อคิว', () => {
    const warm = makeRig();
    warm.api.bootHandler_();                       // สร้างของสำรองไว้
    const busy = makeRig({ lockBusy: true });
    busy.store.set('dmj_bootstale_n', warm.store.get('dmj_bootstale_n'));
    busy.store.set('dmj_bootstale_n_ts', warm.store.get('dmj_bootstale_n_ts'));
    for (let i = 0; i < Number(warm.store.get('dmj_bootstale_n')); i++) {
      busy.store.set('dmj_bootstale_' + i, warm.store.get('dmj_bootstale_' + i));
    }
    const d = parse(busy.api.bootHandler_());
    expect(d.stale).toBe(1);
    expect(busy.calls.lastLog.kind).toBe('BOOT-STALE');
  });

  it('⚠️ เส้นทางของสำรอง **ห้ามปั๊ม lastModified สด** (ปั๊มแล้ว = ทับงานคนอื่นเงียบ ๆ)', () => {
    const warm = makeRig({ ts: 1000 });
    warm.api.bootHandler_();
    const busy = makeRig({ lockBusy: true, ts: 9999 });
    ['dmj_bootstale_n', 'dmj_bootstale_n_ts'].forEach(k => busy.store.set(k, warm.store.get(k)));
    for (let i = 0; i < Number(warm.store.get('dmj_bootstale_n')); i++) {
      busy.store.set('dmj_bootstale_' + i, warm.store.get('dmj_bootstale_' + i));
    }
    expect(parse(busy.api.bootHandler_()).lastModified).toBe(1000);   // ไม่ใช่ 9999
  });

  it('คว้าล็อกไม่ได้ + ไม่มีของสำรอง → build เอง (ห้ามปล่อยให้ผู้ใช้ได้ของเปล่า)', () => {
    const { api } = makeRig({ lockBusy: true });
    expect(parse(api.bootHandler_()).products.rows.length).toBeGreaterThan(0);
  });

  it('มีคนบันทึกระหว่าง build → ไม่เขียนทับชั้นสด แต่ชั้นสำรองยังเขียน (guard เดียวกับ Phase 1)', () => {
    const rig = makeRig({ ts: 1000 });
    const realGet = rig.env.getSheetLastModified_;
    let n = 0;
    // ครั้งที่ 1 = ก่อน build (1000) · ครั้งที่ 2 = หลัง build (2000 = มีคนบันทึก)
    rig.env.getSheetLastModified_ = () => (++n === 1 ? 1000 : 2000);
    const rig2 = makeRig({ ts: 1000 });
    rig2.env.getSheetLastModified_ = rig.env.getSheetLastModified_;
    // สร้าง api ใหม่ให้ผูกกับ stub ที่แก้แล้ว
    const keys = Object.keys(rig2.env);
    // eslint-disable-next-line no-new-func
    const api = new Function(...keys, SRC + '\nreturn { bootHandler_ };')(...keys.map(k => rig2.env[k]));
    api.bootHandler_();
    expect(rig2.store.has('dmj_boot_n'), 'ชั้นสดต้องไม่ถูกเขียน').toBe(false);
    expect(rig2.store.has('dmj_bootstale_n'), 'ชั้นสำรองต้องถูกเขียน').toBe(true);
    expect(realGet()).toBe(1000);
  });

  it('products ถูกส่งแบบคอลัมน์ (ตัดชื่อคีย์ที่ซ้ำทุกแถวออก)', () => {
    const { api } = makeRig();
    const d = parse(api.bootHandler_());
    expect(Array.isArray(d.products)).toBe(false);
    expect(Array.isArray(d.products.cols)).toBe(true);
    expect(Array.isArray(d.products.rows)).toBe(true);
  });
});

describe('C. จุดเชื่อมต่อ (meta) — สิ่งที่พังแล้วไม่มี error ให้เห็น', () => {
  it('bootHandler_/buildBootData_ ไม่มีการเรียก buildFullData_ ในต้นทางเลย', () => {
    const bh = grab(GS, /function bootHandler_\(\) \{[\s\S]*?\n\}/);
    const bd = grab(GS, /function buildBootData_\(\) \{[\s\S]*?\n\}/);
    expect(bh).not.toMatch(/buildFullData_/);
    expect(bd).not.toMatch(/buildFullData_/);
  });

  it('doGet มี dispatch action=boot และอยู่ก่อนเส้นทาง payload เต็ม', () => {
    const DOGET = grab(GS, /function doGet\(e\) \{[\s\S]*?\n\}\n/);
    const iBoot = DOGET.indexOf("e.parameter.action === 'boot'");
    const iBuild = DOGET.indexOf('buildFullData_()');
    expect(iBoot).toBeGreaterThan(-1);
    expect(iBoot, 'boot ต้องตอบก่อนจะไปถึงเส้นทาง build ก้อนใหญ่').toBeLessThan(iBuild);
  });

  it('bootHandler_ ใช้ tryLock(0) เท่านั้น — ห้ามต่อคิวรอ build ก้อนใหญ่', () => {
    const bh = grab(GS, /function bootHandler_\(\) \{[\s\S]*?\n\}/);
    expect(bh).toMatch(/acquireBuildLock_\(0\)/);
    expect(bh, 'ห้ามใช้ _BUILD_LOCK_WAIT_MS (25 วิ) ในเส้นทางเปิดแอป').not.toMatch(/_BUILD_LOCK_WAIT_MS/);
  });

  it('BOOT_SOURCE_SHEETS_ เป็น subset ของ PAYLOAD_SOURCE_SHEETS_ เสมอ', () => {
    const { api } = makeRig();
    const payload = grab(GS, /var PAYLOAD_SOURCE_SHEETS_ = \[[\s\S]*?\];/);
    const outside = api.BOOT_SOURCE_SHEETS_.filter(x => payload.indexOf("'" + x + "'") < 0);
    expect(outside, 'boot อ่านชีตที่ payload ไม่ได้อ่าน = การเขียนบางอย่างจะล้าง payload แต่ไม่ล้าง boot').toEqual([]);
  });

  it('invalidateCache_ ล้างชั้นสดของ boot ด้วย แต่ไม่แตะชั้นสำรองของ boot', () => {
    const inv = grab(GS, /function invalidateCache_\(skipTsUpdate\) \{[\s\S]*?\n\}/);
    expect(inv).toMatch(/_BOOT_KEY_COUNT/);
    expect(inv).toMatch(/_BOOT_KEY_PART/);
    expect(inv, 'ชั้นสำรองของ boot ห้ามถูกล้าง (ไม่งั้นกลับไป stampede)').not.toMatch(/_BOOT_STALE_KEY/);
  });

  it('keepWarm_ อุ่นก้อน boot ด้วย และทำ **ก่อน** ก้อนใหญ่', () => {
    const kw = grab(GS, /function keepWarm_\(\) \{[\s\S]*?\n\}\n/);
    expect(kw).toMatch(/putBootPayload_/);
    expect(kw.indexOf('buildBootData_'), 'boot ต้องถูกอุ่นก่อน buildFullData_')
      .toBeLessThan(kw.indexOf('buildFullData_()'));
  });

  it('เส้นทาง payload เต็มยังอยู่ครบ (fallback สำหรับ client เก่า)', () => {
    const DOGET = grab(GS, /function doGet\(e\) \{[\s\S]*?\n\}\n/);
    expect(DOGET).toMatch(/buildFullData_\(\)/);
    expect(DOGET).toMatch(/payloadCacheVariant_/);
    expect(DOGET).toMatch(/readStalePayload_/);
  });
});
