// tests/columnar-payload.test.js — Phase A1: products[] แบบคอลัมน์ (pv=3)
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน payload-variant.test.js / auth.test.js: **ไม่ copy โค้ดเข้า helpers.js** แต่ eval
// ฟังก์ชันจริงจากต้นทาง (packProductsColumnar_ จาก .gs · expandProductsColumnar จาก app.jsx)
// เพราะสองตัวนี้ต้อง "กลับกันได้เป๊ะ" — ถ้าสำเนา drift เทสต์จะเขียวทั้งที่ของจริงส่งข้อมูลเพี้ยน
//
// สิ่งที่คุมไว้:
//   1. round-trip pack→expand ได้ข้อมูลเทียบเท่า pv=2 ทุกฟิลด์ (deep-equal, ไม่ใช่แค่จำนวนแถว)
//   2. การแยก "คีย์ไม่มี" (null→คีย์หาย) กับ "mo:[] ที่ต้องคงอยู่" — จุดที่พังแล้วเงียบ
//   3. ฟิลด์ที่ pv=2 ส่ง null จริง (frontStoreCheckedQty/At/color) กางแล้วให้ผล ==null เท่าเดิม
//   4. plumbing: payloadEncodingForRequest_ รู้จัก pv=3 · cache key enc=3 (`_v3`) ไม่ชน enc=1 (`_v1`)
//   5. จุดเชื่อมต่อที่พังแล้วไม่มี error: enrichData เรียก expand ก่อน guard · build loop cache enc=3 ·
//      prefetch gate ด้วย dmj_pv3ok · fetchFromSheet ส่ง pv=3
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS   = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP  = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const HTML = readFileSync(join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// eval ฟังก์ชันจริงจากต้นทาง (pure ทั้งคู่ ไม่มี dependency ภายนอก)
const packProductsColumnar_ = (() => {
  const code = grab(GS, /function packProductsColumnar_\(products\) \{[\s\S]*?\n\}/);
  return new Function(code + '\nreturn packProductsColumnar_;')();
})();
const payloadCacheVariant_ = (() => {
  const code = grab(GS, /function payloadCacheVariant_\(variant, enc\) \{[\s\S]*?\n\}/);
  return new Function(code + '\nreturn payloadCacheVariant_;')();
})();
const payloadEncodingForRequest_ = (() => {
  const code = grab(GS, /function payloadEncodingForRequest_\(e\) \{[\s\S]*?\n\}/);
  return new Function(code + '\nreturn payloadEncodingForRequest_;')();
})();
const expandProductsColumnar = (() => {
  const code = grab(APP, /function expandProductsColumnar\(d\) \{[\s\S]*?\n\}/);
  return new Function(code + '\nreturn expandProductsColumnar;')();
})();

// ── ชุดข้อมูลตัวอย่างที่ครอบกรณี "พังแล้วเงียบ" ทั้งหมด ──
// ครอบคลุม: ฟิลด์ครบ · mo มีค่า/ว่าง/ไม่มี · null-present · คีย์เฉพาะบางตัว · 0 ที่ falsy · nested array
function sampleProducts() {
  return [
    { // สินค้าเต็มรูปแบบ
      sku: 'OL00001', name: 'มะกอกเขียว 148', imageUrl: 'https://img/x1.jpg',
      category: 'มะกอก', qtyStore: 5, qtyWH: 240, qty: 245, price: 120, cost: 96,
      soldQty: 41, soldRev: 4920, isOOS: false, isOversold: false, qtyStatus: 'ok',
      locations: [{ side: 'A', shelf: 3, lock: 7 }],
      mo: [[1, 5, 500], [4, 36, 4320]],
      frontStoreCheckedQty: 5, frontStoreCheckedAt: '2026-08-10 11:30',
    },
    { // มีแถวยอดขายแต่ขายไม่ได้เลย → mo:[] (ต้องคงอยู่ ไม่ใช่หาย)
      sku: 'R01025', name: 'กุหลาบแดง', imageUrl: '', category: 'ดอกไม้',
      qtyStore: 0, qtyWH: 0, qty: 0, price: 80, cost: 64, soldQty: 0, soldRev: 0,
      isOOS: true, isOversold: false, qtyStatus: 'ok', locations: [],
      mo: [], frontStoreCheckedQty: null, frontStoreCheckedAt: null,
    },
    { // ไม่มีแถวยอดขายเลย → ไม่มีคีย์ mo (ต้องหายจริง หลังกาง)
      sku: 'R10025', name: 'กุหลาบเหลือง', imageUrl: 'https://img/r10.jpg',
      category: 'ดอกไม้', qtyStore: 12, qtyWH: 0, qty: 12, price: 80, cost: 64,
      soldQty: 0, soldRev: 0, isOOS: false, isOversold: false, qtyStatus: 'ok',
      locations: [], frontStoreCheckedQty: null, frontStoreCheckedAt: null,
    },
    { // มีคีย์เฉพาะตัว (sysStore/diffStore/soldQtyUnscanned) — ทดสอบ union ของ cols
      sku: 'WL00002', name: 'ใบไม้ประดับ', imageUrl: 'https://img/wl.jpg',
      category: 'ใบไม้', qtyStore: 41, qtyWH: 240, qty: 281, price: 45, cost: 36,
      soldQty: 100, soldRev: 4500, isOOS: false, isOversold: false, qtyStatus: 'ok',
      locations: [{ side: 'B', shelf: 0, lock: 0, floor: true }],
      mo: [[0, 100, 4500]],
      sysStore: 40, sysWH: 238, diffStore: 1, diffWH: 2, soldQtyUnscanned: 3,
      frontStoreCheckedQty: 41, frontStoreCheckedAt: '2026-08-12 09:00',
    },
    { // color:null (present-null, ถูก enrichData เขียนทับภายหลัง) + monthly:[] เดิมจาก readProducts_
      sku: 'AC00003', name: 'อุปกรณ์จัด', imageUrl: '', category: 'อุปกรณ์สำนักงาน',
      qtyStore: 3, qtyWH: 0, qty: 3, price: 15, cost: 12, soldQty: 0, soldRev: 0,
      isOOS: false, isOversold: false, qtyStatus: 'ok', locations: [], color: null,
      monthly: [], frontStoreCheckedQty: null, frontStoreCheckedAt: null,
    },
  ];
}

// เทียบ "เชิงความหมาย": pv=2 กับ pv=3 ต้องให้ข้อมูลที่ view อ่านได้เท่ากัน
// view ทุกจุดในโค้ดนี้อ่าน field ด้วย ==null / !x / ?? / ?. → "คีย์=null" กับ "ไม่มีคีย์" เท่ากัน
// จึง normalize ทั้งสองฝั่งด้วยการตัดคีย์ที่ค่าเป็น null/undefined ทิ้งก่อนเทียบ deep-equal
function dropNullish(obj) {
  const out = {};
  Object.keys(obj).forEach(k => {
    if (obj[k] !== null && obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

describe('Phase A1 — packProductsColumnar_ ↔ expandProductsColumnar (round-trip)', () => {
  it('round-trip ได้ข้อมูลเทียบเท่า pv=2 ทุกสินค้า (deep-equal หลัง normalize null↔ไม่มีคีย์)', () => {
    const sample = sampleProducts();
    const packed = packProductsColumnar_(sample);
    const expanded = expandProductsColumnar({ products: packed }).products;
    expect(expanded).toHaveLength(sample.length);
    for (let i = 0; i < sample.length; i++) {
      expect(dropNullish(expanded[i])).toEqual(dropNullish(sample[i]));
    }
  });

  it('ฟิลด์สำคัญที่ UI ใช้จริงต้องตรงเป๊ะทุกตัว (sku/name/stock/price/image/category)', () => {
    const sample = sampleProducts();
    const expanded = expandProductsColumnar({ products: packProductsColumnar_(sample) }).products;
    const keys = ['sku', 'name', 'qtyStore', 'qtyWH', 'qty', 'price', 'imageUrl', 'category'];
    for (let i = 0; i < sample.length; i++) {
      keys.forEach(k => expect(expanded[i][k]).toStrictEqual(sample[i][k]));
    }
  });

  it('cols เป็น union ของคีย์ทั้งหมด (ไม่ตกคีย์เฉพาะของสินค้าบางตัว)', () => {
    const sample = sampleProducts();
    const packed = packProductsColumnar_(sample);
    const allKeys = new Set();
    sample.forEach(p => Object.keys(p).forEach(k => allKeys.add(k)));
    // ทุกคีย์ที่มีในสินค้าอย่างน้อยหนึ่งตัว ต้องอยู่ใน cols
    allKeys.forEach(k => expect(packed.cols).toContain(k));
    // sysStore/diffStore/soldQtyUnscanned มีแค่ WL00002 → ต้องยังอยู่ใน cols
    ['sysStore', 'diffStore', 'soldQtyUnscanned', 'color', 'monthly'].forEach(k =>
      expect(packed.cols).toContain(k));
    // ทุกแถวยาวเท่ากับจำนวน cols
    packed.rows.forEach(r => expect(r).toHaveLength(packed.cols.length));
  });

  it('mo:[] (ขายได้ 0) ต้องคงคีย์ · ไม่มี mo (ไม่มีข้อมูลขาย) ต้องหายจริง — จุดที่ OverviewView แยกสองกรณี', () => {
    const sample = sampleProducts();
    const expanded = expandProductsColumnar({ products: packProductsColumnar_(sample) }).products;
    // R01025 = mo:[] → คีย์ mo ต้องยังอยู่ และเป็น []
    expect(expanded[1].mo).toEqual([]);
    expect('mo' in expanded[1]).toBe(true);
    // R10025 = ไม่มี mo เลย → หลังกางต้องไม่มีคีย์ mo
    expect('mo' in expanded[2]).toBe(false);
    // OL00001 = mo มีค่า → คงค่าเดิม (nested array ครบ)
    expect(expanded[0].mo).toEqual([[1, 5, 500], [4, 36, 4320]]);
  });

  it('ฟิลด์ที่ pv=2 ส่ง null จริง (frontStoreCheckedQty/At/color) กางแล้ว "ไม่มีคีย์" — อ่านด้วย ==null เท่ากัน', () => {
    const sample = sampleProducts();
    const expanded = expandProductsColumnar({ products: packProductsColumnar_(sample) }).products;
    // R01025 มี frontStoreCheckedQty:null → หลังกาง = undefined (ไม่มีคีย์)
    expect(expanded[1].frontStoreCheckedQty).toBeUndefined();
    // แต่ผลการอ่านเชิงตรรกะเท่ากัน: null และ undefined ต่างก็ == null
    expect(sample[1].frontStoreCheckedQty == null).toBe(true);
    expect(expanded[1].frontStoreCheckedQty == null).toBe(true);
    // AC00003 color:null → หายเช่นกัน (enrichData เขียนทับด้วย detectColor ภายหลังอยู่แล้ว)
    expect(expanded[4].color).toBeUndefined();
  });

  it('0 ที่ falsy (qtyWH:0, soldQty:0) ต้องคงอยู่ ไม่ถูกตัดทิ้ง (ต่างจาก null)', () => {
    const sample = sampleProducts();
    const expanded = expandProductsColumnar({ products: packProductsColumnar_(sample) }).products;
    expect(expanded[1].qtyStore).toBe(0);
    expect(expanded[1].qtyWH).toBe(0);
    expect(expanded[1].qty).toBe(0);
    expect(expanded[1].soldQty).toBe(0);
    expect('qtyWH' in expanded[1]).toBe(true);
  });

  it('nested array/object (locations, mo) กางกลับเป็นค่าเดิมทั้งก้อน', () => {
    const sample = sampleProducts();
    const expanded = expandProductsColumnar({ products: packProductsColumnar_(sample) }).products;
    expect(expanded[0].locations).toEqual([{ side: 'A', shelf: 3, lock: 7 }]);
    expect(expanded[3].locations).toEqual([{ side: 'B', shelf: 0, lock: 0, floor: true }]);
  });

  it('expandProductsColumnar เป็น no-op ถ้า products เป็น array อยู่แล้ว (pv=2/pv=1/localStorage)', () => {
    const arr = sampleProducts();
    const d = { products: arr, monthLabels: ['01/2026'] };
    const out = expandProductsColumnar(d);
    expect(out.products).toBe(arr);   // อ้างอิงเดิม ไม่แตะ
  });

  it('ทน input แปลก: null / ไม่มี products / cols|rows ไม่ครบ → ไม่ throw', () => {
    expect(() => expandProductsColumnar(null)).not.toThrow();
    expect(() => expandProductsColumnar({})).not.toThrow();
    expect(() => expandProductsColumnar({ products: { cols: ['a'] } })).not.toThrow();      // ไม่มี rows
    expect(() => expandProductsColumnar({ products: { rows: [[1]] } })).not.toThrow();       // ไม่มี cols
    expect(packProductsColumnar_(null)).toEqual({ cols: [], rows: [] });
    expect(packProductsColumnar_([])).toEqual({ cols: [], rows: [] });
    // แถวที่เป็น null ใน products → ข้าม ไม่พัง
    expect(() => packProductsColumnar_([{ sku: 'A' }, null, { sku: 'B' }])).not.toThrow();
  });

  it('ขนาดเล็กลงจริงเมื่อสินค้าเยอะ (โมเดล) — คอลัมน์เล็กกว่า object form อย่างมีนัยสำคัญ', () => {
    // จำลอง 300 สินค้ารูปแบบเดียวกับของจริง (~19 คีย์) — วัดอัตราส่วนไบต์ 2 รูปแบบ
    const base = sampleProducts()[0];
    const many = [];
    for (let i = 0; i < 300; i++) {
      many.push(Object.assign({}, base, {
        sku: 'OL' + String(10000 + i), soldQty: i, soldRev: i * 100,
        mo: [[i % 5, i, i * 100]],
      }));
    }
    const objLen = JSON.stringify(many).length;
    const colLen = JSON.stringify(packProductsColumnar_(many)).length;
    // โมเดลนี้ไม่ใช่ payload จริง (ดู Final Report) แต่ยืนยันทิศทาง: คอลัมน์ต้องเล็กกว่า
    expect(colLen).toBeLessThan(objLen);
    // เก็บอัตราส่วนไว้ให้เห็นในผลรัน
    // (สินค้าจริงชื่อ/URL ยาวกว่านี้ → สัดส่วนที่ประหยัดจะต่างจากนี้ ต้องวัดของจริงหลัง deploy)
    if (process.env.SHOW_RATIO) {
      // eslint-disable-next-line no-console
      console.log('[columnar model] object=' + objLen + ' columnar=' + colLen
        + ' (' + Math.round((1 - colLen / objLen) * 100) + '% เล็กลง)');
    }
  });
});

describe('Phase A1 — plumbing (pv / cache key)', () => {
  it('payloadEncodingForRequest_ รู้จัก pv=3/2/1', () => {
    expect(payloadEncodingForRequest_({ parameter: { pv: '3' } })).toBe(3);
    expect(payloadEncodingForRequest_({ parameter: { pv: '2' } })).toBe(2);
    expect(payloadEncodingForRequest_({ parameter: {} })).toBe(1);
    expect(payloadEncodingForRequest_({})).toBe(1);
    expect(payloadEncodingForRequest_(null)).toBe(1);
  });

  it('cache key ของ enc=3 (`_v3`) ต้องไม่ชนกับ enc=1 (`_v1`) และ enc=2 (bare) — ทุก variant', () => {
    ['full', 'ops', 'lite'].forEach(v => {
      const k1 = payloadCacheVariant_(v, 1);
      const k2 = payloadCacheVariant_(v, 2);
      const k3 = payloadCacheVariant_(v, 3);
      expect(new Set([k1, k2, k3]).size).toBe(3);   // ไม่ชนกันเลย
      expect(k3.endsWith('_v3')).toBe(true);
      expect(k2).toBe(v);
      expect(k1.endsWith('_v1')).toBe(true);
    });
  });
});

describe('Phase A1 — จุดเชื่อมต่อ (meta: สแกนต้นทางจริง)', () => {
  it('enrichData เรียก expandProductsColumnar "ก่อน" guard Array.isArray (ไม่งั้น pv=3 ตกด่านแรก)', () => {
    // ตัดเฉพาะ body ของ enrichData แล้วเช็คลำดับ: expandProductsColumnar ต้องมาก่อน return ...isArray
    const fn = grab(APP, /function enrichData\(d\) \{[\s\S]*?expandMonthlyCompact\(d\);/);
    const iExpand = fn.indexOf('expandProductsColumnar(d)');
    const iGuard  = fn.indexOf('Array.isArray(d.products)');
    expect(iExpand).toBeGreaterThanOrEqual(0);
    expect(iGuard).toBeGreaterThan(iExpand);   // guard อยู่หลัง expand
  });

  it('build loop ใน doGet cache enc=3 ผ่าน shapeColumnarPayload_ + payloadCacheVariant_(v, 3)', () => {
    expect(GS).toMatch(/const cv3 = payloadCacheVariant_\(v, 3\);/);
    expect(GS).toMatch(/shapeColumnarPayload_\(shaped\)/);
    // ต้อง putCachedPayload_ และ putStalePayload_ ให้ enc=3 ด้วย (ได้ single-flight + SWR)
    expect(GS).toMatch(/putCachedPayload_\(s3, cv3\)/);
    expect(GS).toMatch(/putStalePayload_\(s3, cv3\)/);
  });

  it('keepWarm_ อุ่น enc=3 คู่กับ enc=2 (นอกเวลาใช้งาน pv=3 ไม่เย็น)', () => {
    const kw = grab(GS, /function keepWarm_\(\) \{[\s\S]*?releaseBuildLock_\(lock\);[\s\S]*?\}\n/);
    expect(kw).toMatch(/payloadCacheVariant_\(v, 3\)/);
    expect(kw).toMatch(/shapeColumnarPayload_\(shaped\)/);
  });

  it('fetchFromSheet (app.jsx) ส่ง pv=3', () => {
    expect(APP).toMatch(/&pv=3&role=/);
    expect(APP).not.toMatch(/&pv=2&role=/);   // ไม่เหลือ pv=2 ในเส้น fetch หลัก
  });

  it('prefetch ใน HTML gate ด้วย dmj_pv3ok (โหลดแรกหลัง deploy ส่ง pv=2 กันจอพัง)', () => {
    expect(HTML).toMatch(/dmj_pv3ok/);
    expect(HTML).toMatch(/var pv = '2';/);            // default ปลอดภัย
    expect(HTML).toMatch(/&pv=' \+ pv \+ '&role=/);   // ใช้ตัวแปร pv ไม่ hard-code
  });

  it('app.jsx ตั้งธง dmj_pv3ok (capability) ที่ module scope', () => {
    expect(APP).toMatch(/localStorage\.setItem\('dmj_pv3ok', '1'\)/);
  });

  it('service worker ถูก bump (แก้ .jsx ต้อง bump — lesson 15)', () => {
    const sw = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');
    const m = sw.match(/const CACHE_NAME = "dmj-v(\d+)";/);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(46);
  });

  it('loadtest.html default ยิง pv=3 (ไม่งั้น 15-concurrent วัดก้อนเก่า แล้วสรุปผิดทั้งรอบ)', () => {
    const lt = readFileSync(join(ROOT, 'tests/loadtest.html'), 'utf8');
    expect(lt).not.toMatch(/&pv=2'/);                       // ไม่เหลือ pv=2 hard-code
    expect(lt).toMatch(/pv === '2' \? '2' : '3'/);          // default = 3 (เลือก 2 ได้เพื่อยิงเทียบ)
    expect(lt).toMatch(/<option value="3" selected>/);      // dropdown ตั้งต้นที่ pv=3
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// invalidateCache_ ต้องล้าง fresh cache ของ "ทุก enc ที่ build เขียน" — รวม enc=3
// ที่มา: A1 รอบแรกเพิ่ม enc=3 ในลูป build แต่ลืมเติมใน invalidateCache_ → เครื่อง pv=3
// เห็นข้อมูลก่อนบันทึกค้างได้ 180 วิ + เส้น HIT ปั๊ม lastModified สด → ถือของเก่า+ts ใหม่
// → conflict detection ปล่อยผ่าน → เขียนทับงานคนอื่นเงียบ ๆ (พังโดยไม่มี error ให้เห็น
// และ "เทสต์ทั้ง suite เขียว" — เพราะไม่มีตัวไหนคุมจุดนี้เลย) · ชุดนี้อุดทั้งพฤติกรรมจริง
// และกันเคสอนาคต (เพิ่ม enc=4 ในลูป build แล้วลืม invalidate = แดงทันที)
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase A1 — invalidateCache_ ครอบ enc=3 (behavioral: รันของจริงกับ cache ปลอม)', () => {
  const INV_SRC = grab(GS, /function invalidateCache_\(skipTsUpdate\) \{[\s\S]*?\n\}/);

  // ประกอบ context จริงจาก .gs (ค่าคงที่ + helper คีย์) แล้วรัน invalidateCache_ กับ store ปลอม
  function runInvalidate(seedFn) {
    const code = [
      grab(GS, /const PAYLOAD_VARIANTS_ = \[[\s\S]*?\];/),
      grab(GS, /const _CACHE_KEY_COUNT = '[^']*';/),
      grab(GS, /const _CACHE_KEY_PART {2}= '[^']*';/),
      grab(GS, /const _CACHE_TS_SUFFIX = '[^']*';[^\n]*/),
      grab(GS, /const _STOCKLITE_KEY_COUNT = '[^']*';/),
      grab(GS, /const _STOCKLITE_KEY_PART\s+= '[^']*';/),
      grab(GS, /function _cacheKeyCount_\(variant\) \{[\s\S]*?\n\}/),
      grab(GS, /function _cacheKeyPart_\(variant\) \{[\s\S]*?\n\}/),
      grab(GS, /function payloadCacheVariant_\(variant, enc\) \{[\s\S]*?\n\}/),
      INV_SRC,
      'return { invalidateCache_, payloadCacheVariant_, _cacheKeyCount_, _cacheKeyPart_ };',
    ].join('\n');
    const store = {};       // คีย์ → ค่า (จำลอง CacheService)
    const removed = [];     // คีย์ที่ถูก removeAll
    const CacheService = {
      getScriptCache: () => ({
        get: (k) => (k in store ? store[k] : null),
        removeAll: (keys) => { keys.forEach((k) => { removed.push(k); delete store[k]; }); },
      }),
    };
    const PropertiesService = { getScriptProperties: () => ({ setProperty: () => {} }) };
    const api = new Function('CacheService', 'PropertiesService', code)(CacheService, PropertiesService);
    seedFn(store, api);
    api.invalidateCache_(true);   // skipTsUpdate — โฟกัสเฉพาะการล้าง cache
    return { store, removed, api };
  }

  // seed fresh (enc 1/2/3) + stale + stocklite ครบทุก variant เหมือนสภาพจริงหลัง build
  function seedAll(store, api) {
    ['full', 'ops', 'lite'].forEach((v) => {
      [1, 2, 3].forEach((enc) => {
        const cv = api.payloadCacheVariant_(v, enc);
        const kCount = api._cacheKeyCount_(cv);
        const kPart = api._cacheKeyPart_(cv);
        store[kCount] = '2';
        store[kCount + '_ts'] = '123';
        store[kPart + '0'] = 'x';
        store[kPart + '1'] = 'y';
        // ชั้นสำรอง (ห้ามถูกล้าง — คีย์ตรงกับ _staleKeyCount_/_staleKeyPart_ ใน .gs)
        store['dmj_stale_n_' + cv] = '1';
        store['dmj_stale_' + cv + '_0'] = 'stale';
      });
    });
    store['dmj_stocklite_n'] = '1';
    store['dmj_stocklite_0'] = 'z';
  }

  it('ล้าง fresh cache ครบทุก variant × ทุก enc รวม enc=3 (`*_v3`)', () => {
    const { removed, api } = runInvalidate(seedAll);
    ['full', 'ops', 'lite'].forEach((v) => {
      [1, 2, 3].forEach((enc) => {
        const cv = api.payloadCacheVariant_(v, enc);
        const kCount = api._cacheKeyCount_(cv);
        const kPart = api._cacheKeyPart_(cv);
        expect(removed, `ต้องล้างคีย์นับ chunk ของ ${cv}`).toContain(kCount);
        expect(removed).toContain(kCount + '_ts');
        expect(removed).toContain(kPart + '0');
        expect(removed).toContain(kPart + '1');
      });
    });
    // stocklite ล้างด้วย (พฤติกรรมเดิม Phase 7.4 — ต้องไม่หลุดไประหว่างแก้)
    expect(removed).toContain('dmj_stocklite_n');
    expect(removed).toContain('dmj_stocklite_0');
  });

  it('ชั้นสำรอง `dmj_stale_*` (รวม *_v3) ต้องไม่ถูกแตะเลย — ล้างเมื่อไหร่ = stampede กลับมา', () => {
    const { store, removed } = runInvalidate(seedAll);
    expect(removed.filter((k) => k.startsWith('dmj_stale_'))).toEqual([]);
    // และยังอยู่ครบใน store ทั้ง 9 ชุด (3 variant × 3 enc)
    const staleLeft = Object.keys(store).filter((k) => k.startsWith('dmj_stale_'));
    expect(staleLeft.length).toBe(18);   // count + part ต่อชุด × 9
  });

  it('meta: ทุก enc ที่ถูกใช้เป็น literal นอก invalidateCache_ (ลูป build/keepWarm) ต้องอยู่ในรายการล้าง — กัน enc=4 หลุดซ้ำ', () => {
    // enc ที่ "เขียน cache" = literal ตัวเลขใน payloadCacheVariant_(v, N) นอกตัว invalidateCache_
    // (เส้นอ่านใช้ตัวแปร enc ไม่ใช่ literal จึงไม่ติดมา) · ต้องเป็น subset ของ enc ที่ invalidate ล้าง
    const litRe = /payloadCacheVariant_\([^,()]+,\s*(\d+)\)/g;
    const encsInInvalidate = new Set();
    let m;
    while ((m = litRe.exec(INV_SRC))) encsInInvalidate.add(m[1]);
    const outside = GS.replace(INV_SRC, '');
    litRe.lastIndex = 0;
    const encsBuilt = new Set();
    while ((m = litRe.exec(outside))) encsBuilt.add(m[1]);
    expect(encsBuilt.size).toBeGreaterThan(0);   // กัน regex เสื่อมแล้วเทสต์เขียวลวง
    encsBuilt.forEach((enc) => {
      expect(encsInInvalidate.has(enc),
        `enc=${enc} ถูกเขียนเข้า cache (build/keepWarm) แต่ invalidateCache_ ไม่ได้ล้าง — ` +
        `role ที่ใช้ pv=${enc} จะเห็นข้อมูลเก่าค้างหลังมีคนบันทึก`).toBe(true);
    });
    expect(encsInInvalidate.has('3')).toBe(true);   // ยึดเคสที่เพิ่งพลาดไว้ตรง ๆ
  });
});
