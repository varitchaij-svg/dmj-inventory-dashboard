// ────────────────────────────────────────────────────────────────────────────
// Phase A — granular cache invalidation ("แก้อะไร ต้องล้างอะไร")
//
// ที่มา: การเขียนที่ **ไม่แตะชีตที่ payload ประกอบมาจาก** เดิมยังล้าง payload cache
// ทั้ง 9 คีย์ (3 variant × 3 encoding) + ก้อน stocklite และ bump `dmj_last_write_ts`
// → คนเปิดแอปคนถัดไปต้องรอ `buildFullData_` ใหม่ (วัดจริง 7.6-18 วิ) และทุกเครื่องที่ถาม
// `action=ver` เห็นว่า "เปลี่ยนแล้ว" แล้วโหลด payload ทั้งก้อนซ้ำ ทั้งที่ข้อมูลเหมือนเดิมทุกไบต์
// ร้านออกใบเสนอราคา/แก้ทะเบียนสินค้าทั้งวัน = cache แทบไม่มีวันอุ่น
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

// ── CacheService/PropertiesService ปลอม — จับได้ว่าคีย์ไหนถูกล้าง/เขียนบ้าง ──
function makeEnv(seed) {
  const store = new Map(Object.entries(seed || {}));
  const removed = [];
  const props = new Map();
  const CacheService = {
    getScriptCache: () => ({
      get: (k) => (store.has(k) ? store.get(k) : null),
      getAll: (ks) => { const o = {}; ks.forEach(k => { if (store.has(k)) o[k] = store.get(k); }); return o; },
      put: (k, v) => store.set(k, v),
      putAll: (o) => Object.keys(o).forEach(k => store.set(k, o[k])),
      remove: (k) => { removed.push(k); store.delete(k); },
      removeAll: (ks) => { ks.forEach(k => { removed.push(k); store.delete(k); }); },
    }),
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => props.set(k, String(v)),
    }),
  };
  return { store, removed, props, CacheService, PropertiesService };
}

// รวมค่าคงที่ + ฟังก์ชันคีย์ + ตัวล้าง cache จริงจาก .gs มา eval
const CACHE_SRC = [
  grab(GS, /const _CACHE_TTL_SEC {3}= \d+;.*/),
  grab(GS, /const _CACHE_CHUNK_LEN = \d+;.*/),
  grab(GS, /const _CACHE_KEY_COUNT = '[^']*';.*/),
  grab(GS, /const _CACHE_KEY_PART {2}= '[^']*';.*/),
  grab(GS, /const _CACHE_TS_SUFFIX = '[^']*';.*/),
  grab(GS, /const _STALE_TTL_SEC {3}= \d+;.*/),
  grab(GS, /const _STALE_KEY_COUNT = '[^']*';.*/),
  grab(GS, /const _STALE_KEY_PART {2}= '[^']*';.*/),
  grab(GS, /const _STOCKLITE_KEY_COUNT = '[^']*';.*/),
  grab(GS, /const _STOCKLITE_KEY_PART {2}= '[^']*';.*/),
  grab(GS, /const PAYLOAD_VARIANTS_ = \[[^\]]*\];/),
  grab(GS, /function _cacheKeyCount_\(variant\) \{[\s\S]*?\n\}/),
  grab(GS, /function _cacheKeyPart_\(variant\) \{[\s\S]*?\n\}/),
  grab(GS, /function payloadCacheVariant_\(variant, enc\) \{[\s\S]*?\n\}/),
  grab(GS, /function _staleKeyCount_\(variant\)[^\n]*/),
  grab(GS, /function _staleKeyPart_\(variant\)[^\n]*/),
  grab(GS, /var PAYLOAD_SOURCE_SHEETS_ = \[[\s\S]*?\];/),
  grab(GS, /function invalidateQuoteCaches_\(\) \{[\s\S]*?\n\}/),
  grab(GS, /function invalidateCache_\(skipTsUpdate\) \{[\s\S]*?\n\}/),
].join('\n');

function loadCache(env) {
  // eslint-disable-next-line no-new-func
  const f = new Function('CacheService', 'PropertiesService',
    CACHE_SRC + '\nreturn { invalidateCache_, invalidateQuoteCaches_, PAYLOAD_SOURCE_SHEETS_, PAYLOAD_VARIANTS_, payloadCacheVariant_, _cacheKeyCount_, _cacheKeyPart_, _staleKeyCount_ };');
  return f(env.CacheService, env.PropertiesService);
}

// payload cache ที่อุ่นไว้ครบ 3 variant × 3 encoding (1 chunk ต่อคีย์) + ชั้นสำรอง + stocklite
function seedWarmCaches(api) {
  const seed = {};
  api.PAYLOAD_VARIANTS_.forEach(v => {
    [1, 2, 3].forEach(enc => {
      const cv = api.payloadCacheVariant_(v, enc);
      seed[api._cacheKeyCount_(cv)] = '1';
      seed[api._cacheKeyCount_(cv) + '_ts'] = '111';
      seed[api._cacheKeyPart_(cv) + '0'] = '{"products":[]}';
      seed[api._staleKeyCount_(cv)] = '1';
      seed[api._staleKeyCount_(cv) + '_ts'] = '111';
    });
  });
  seed['dmj_stocklite_n'] = '1';
  seed['dmj_stocklite_0'] = '{"items":[]}';
  seed['pending_quotes_v1'] = 'X';
  seed['quote_summary_v1'] = 'Y';
  return seed;
}

// helper: สร้าง env + api ที่ seed cache อุ่นไว้แล้ว (ต้องทำ 2 จังหวะเพราะคีย์มาจาก api)
function warmEnv() {
  const probe = loadCache(makeEnv({}));
  const env = makeEnv(seedWarmCaches(probe));
  return { env, api: loadCache(env) };
}

describe('A. invalidateCache_ — ขอบเขตเดิมต้องไม่เปลี่ยน (regression)', () => {
  it('ล้าง payload cache ครบทุก variant × ทุก encoding', () => {
    const { env, api } = warmEnv();
    api.invalidateCache_();
    api.PAYLOAD_VARIANTS_.forEach(v => {
      [1, 2, 3].forEach(enc => {
        const cv = api.payloadCacheVariant_(v, enc);
        expect(env.store.has(api._cacheKeyCount_(cv)), `${cv} ต้องถูกล้าง`).toBe(false);
        expect(env.store.has(api._cacheKeyPart_(cv) + '0'), `${cv} chunk ต้องถูกล้าง`).toBe(false);
      });
    });
  });

  it('ล้างก้อน stocklite (stock overlay) ด้วย — เพื่อนบันทึกแล้วต้องเห็นทันที', () => {
    const { env, api } = warmEnv();
    api.invalidateCache_();
    expect(env.store.has('dmj_stocklite_n')).toBe(false);
    expect(env.store.has('dmj_stocklite_0')).toBe(false);
  });

  it('**ห้ามแตะชั้นสำรอง (stale)** — ล้างด้วยเมื่อไหร่ = กลับไป stampede ทันที', () => {
    const { env, api } = warmEnv();
    api.invalidateCache_();
    api.PAYLOAD_VARIANTS_.forEach(v => {
      [1, 2, 3].forEach(enc => {
        const cv = api.payloadCacheVariant_(v, enc);
        expect(env.store.has(api._staleKeyCount_(cv)), `stale ${cv} ต้องยังอยู่`).toBe(true);
      });
    });
  });

  it('bump dmj_last_write_ts เมื่อไม่ส่ง skipTsUpdate · ไม่ bump เมื่อส่ง true', () => {
    const a = warmEnv();
    a.api.invalidateCache_();
    expect(Number(a.env.props.get('dmj_last_write_ts'))).toBeGreaterThan(0);
    const b = warmEnv();
    b.api.invalidateCache_(true);
    expect(b.env.props.get('dmj_last_write_ts')).toBeUndefined();
  });
});

describe('B. invalidateQuoteCaches_ — ล้างเฉพาะโดเมนใบเสนอราคา', () => {
  it('ล้าง pending_quotes_v1 + quote_summary_v1', () => {
    const { env, api } = warmEnv();
    api.invalidateQuoteCaches_();
    expect(env.store.has('pending_quotes_v1')).toBe(false);
    expect(env.store.has('quote_summary_v1')).toBe(false);
  });

  it('**ไม่แตะ payload cache เลย** — ออกใบเสนอราคาต้องไม่ทำให้คนถัดไปรอ build ใหม่', () => {
    const { env, api } = warmEnv();
    api.invalidateQuoteCaches_();
    api.PAYLOAD_VARIANTS_.forEach(v => {
      [1, 2, 3].forEach(enc => {
        const cv = api.payloadCacheVariant_(v, enc);
        expect(env.store.has(api._cacheKeyCount_(cv)), `${cv} ต้องยังอุ่นอยู่`).toBe(true);
        expect(env.store.has(api._cacheKeyPart_(cv) + '0')).toBe(true);
      });
    });
  });

  it('ไม่แตะก้อน stocklite (ไม่ได้เปลี่ยนจำนวนสต็อก)', () => {
    const { env, api } = warmEnv();
    api.invalidateQuoteCaches_();
    expect(env.store.has('dmj_stocklite_n')).toBe(true);
  });

  it('**ไม่ bump dmj_last_write_ts** — ไม่งั้นทุกเครื่องโหลด payload ซ้ำทั้งที่ข้อมูลเท่าเดิม', () => {
    const { env, api } = warmEnv();
    api.invalidateQuoteCaches_();
    expect(env.props.get('dmj_last_write_ts')).toBeUndefined();
  });

  it('cache พังก็ไม่ throw (ตัวเรียกคือเส้นทางออกบิล/ใบเสนอราคาจริง)', () => {
    const env = makeEnv({});
    env.CacheService.getScriptCache = () => { throw new Error('cache down'); };
    const api = loadCache(env);
    expect(() => api.invalidateQuoteCaches_()).not.toThrow();
  });
});

describe('C. PAYLOAD_SOURCE_SHEETS_ ต้องตรงกับที่ buildFullData_ อ่านจริง (drift guard)', () => {
  // ไล่จาก read function ทุกตัวที่ buildFullData_ เรียก แล้วเก็บชื่อชีตที่มันแตะ
  const BUILD = grab(GS, /function buildFullData_\(\) \{[\s\S]*?\n\}\n/);
  const fnRanges = [];
  GS.split('\n').forEach((ln, i) => {
    const m = ln.match(/^function ([A-Za-z0-9_]+)/);
    if (m) fnRanges.push({ name: m[1], start: i });
  });
  const LINES = GS.split('\n');
  fnRanges.forEach((f, i) => { f.end = i + 1 < fnRanges.length ? fnRanges[i + 1].start : LINES.length; });
  const byName = Object.fromEntries(fnRanges.map(f => [f.name, f]));
  function sheetsOf(name, depth, seen) {
    const f = byName[name];
    if (!f || depth < 0) return new Set();
    seen = seen || new Set();
    if (seen.has(name)) return new Set();
    seen.add(name);
    const body = LINES.slice(f.start, f.end).join('\n');
    const out = new Set(body.match(/SHEET_[A-Z_0-9]+/g) || []);
    if (depth > 0) {
      (body.match(/\b(?:read|get)[A-Za-z0-9_]*_\(/g) || []).forEach(c => {
        sheetsOf(c.slice(0, -1), depth - 1, seen).forEach(x => out.add(x));
      });
    }
    return out;
  }
  const readFns = [...new Set((BUILD.match(/\b(?:read|batchRead)[A-Za-z0-9_]*_\(/g) || []).map(x => x.slice(0, -1)))];

  it('ทุกชีตที่ payload อ่านจริง ต้องอยู่ในตาราง', () => {
    const api = loadCache(makeEnv({}));
    const actual = new Set();
    readFns.forEach(fn => sheetsOf(fn, 2).forEach(s => actual.add(s)));
    actual.delete('SHEET_ID');           // ไม่ใช่ชีต — เป็น id ของสเปรดชีต
    actual.delete('SHEET_SHIP_ARCHIVE'); // ปลายทาง archive (เขียนอย่างเดียว ไม่ถูกอ่านเข้า payload)
    const missing = [...actual].filter(s => api.PAYLOAD_SOURCE_SHEETS_.indexOf(s) < 0);
    expect(missing, 'ชีตที่ payload อ่านแต่ยังไม่อยู่ในตาราง — เติมใน PAYLOAD_SOURCE_SHEETS_').toEqual([]);
  });

  it('ตารางไม่มีชีตที่ payload ไม่ได้อ่าน (กันจัดประเภทเกินจริง)', () => {
    const api = loadCache(makeEnv({}));
    const actual = new Set();
    readFns.forEach(fn => sheetsOf(fn, 2).forEach(s => actual.add(s)));
    const extra = api.PAYLOAD_SOURCE_SHEETS_.filter(s => !actual.has(s));
    expect(extra, 'ตารางอ้างชีตที่ payload ไม่ได้อ่าน').toEqual([]);
  });

  it('ชีตของโดเมนที่ย้ายออก ต้องไม่อยู่ในตาราง', () => {
    const api = loadCache(makeEnv({}));
    ['SHEET_QUOTE_SALE', 'SHEET_INVOICE_NUM', 'SHEET_QUOTE_DRAFTS',
     'SHEET_PREFIX_REGISTRY', 'SHEET_FAMILY_REGISTRY', 'SHEET_VARIANT_REGISTRY',
     'SHEET_FORM_REGISTRY', 'SHEET_SALE_BILLS', 'SHEET_AUDIT'].forEach(s => {
      expect(api.PAYLOAD_SOURCE_SHEETS_.indexOf(s), s + ' ไม่ควรอยู่ในตาราง').toBe(-1);
    });
  });
});

describe('D. จุดเชื่อมต่อ — ใครยังต้องล้าง payload cache / ใครต้องไม่ล้าง', () => {
  function bodyOf(name) {
    const i = GS.indexOf('function ' + name);
    if (i < 0) throw new Error('ไม่พบฟังก์ชัน ' + name);
    const j = GS.indexOf('\nfunction ', i + 1);
    return GS.slice(i, j < 0 ? GS.length : j);
  }

  // เขียนชีตที่อยู่ใน payload → ต้องล้าง cache เหมือนเดิม (ห้ามหลุด)
  const MUST_INVALIDATE = [
    'transferStock', 'transferStockBatch', 'deductStock', 'updateOrderState',
    'confirmStockCount', 'updateFrontStore', 'confirmShipmentReceive', 'updateLockData',
    'createSaleBill', 'closeMtoJob', 'addNewProduct', 'handleOrder_', 'syncZortBoth',
    'saveThresholds_',   // `thresholds` อยู่ใน payload (มาจาก Script Property ไม่ใช่ชีต)
  ];
  MUST_INVALIDATE.forEach(fn => {
    it(`${fn} ยังล้าง payload cache (เขียนข้อมูลที่อยู่ใน payload)`, () => {
      expect(bodyOf(fn)).toMatch(/invalidateCache_\(/);
    });
  });

  // ไม่แตะชีตใน payload เลย → ต้องไม่ล้าง (นี่คือตัวแก้ของ Phase A)
  const MUST_NOT_INVALIDATE = [
    'createQuotation', 'editQuotation', 'approveQuotation', 'issueFullTaxInvoice',
    'savePrefixRegistryHandler_', 'saveFamilyRegistryHandler_', 'saveVariantRegistryHandler_',
    'reserveFormHandler_',
  ];
  MUST_NOT_INVALIDATE.forEach(fn => {
    it(`${fn} ไม่ล้าง payload cache แล้ว (ไม่แตะชีตใน payload)`, () => {
      expect(bodyOf(fn)).not.toMatch(/invalidateCache_\(/);
    });
  });

  it('ตัวจัดการใบเสนอราคาใช้ invalidateQuoteCaches_ แทนการลบคีย์เอง 2 บรรทัด', () => {
    ['createQuotation', 'editQuotation', 'approveQuotation'].forEach(fn => {
      expect(bodyOf(fn), fn).toMatch(/invalidateQuoteCaches_\(\)/);
    });
    // ไม่เหลือการลบคีย์ใบเสนอราคาแบบเขียนมือกระจายอยู่ (ลืมตัวใดตัวหนึ่ง = รายการค้างไม่อัปเดต)
    expect(GS.match(/getScriptCache\(\)\.remove\('(pending_quotes_v1|quote_summary_v1)'\)/g) || [])
      .toHaveLength(0);
  });

  it('createSaleBill ห้ามถูกย้ายมาเป็น "ไม่กระทบ payload" — มันหักสต็อกหน้าร้านจริง', () => {
    expect(bodyOf('createSaleBill')).toMatch(/deductFrontStoreForSale_/);
  });
});

describe('E. doPost — dispatch ที่ไม่กระทบ payload ต้องอยู่เหนือ invalidateCache_(true)', () => {
  const DOPOST = grab(GS, /function doPost\(e\)[\s\S]*?\n    invalidateCache_\(true\);/);
  const NON_PAYLOAD_DISPATCH = [
    'data.voidQuotation', 'data.approveQuotation', 'data.setQuoteSale', 'data.getInvoiceNumber',
    'data.issueFullTaxInvoice', 'data.createQuotation', 'data.saveQuotationDraft',
    'data.editQuotation', 'data.deleteQuotationDraft',
    "data.action === 'markNotiRead'", "data.action === 'setProductOwner'",
    "data.action === 'reserveForm'",
  ];
  NON_PAYLOAD_DISPATCH.forEach(d => {
    it(`${d} อยู่เหนือ invalidateCache_(true)`, () => {
      expect(DOPOST).toContain(d);
    });
  });

  it('dispatch ที่แก้สต็อกจริงยังอยู่ "ใต้" invalidateCache_(true)', () => {
    ['data.transferStockBatch', 'data.zeroStock', 'data.createSaleBill'].forEach(d => {
      expect(DOPOST, d + ' ต้องไม่ถูกย้ายขึ้นมา').not.toContain(d);
      expect(GS, d + ' ต้องยังมีอยู่').toContain(d);
    });
  });
});

describe('F. Phase 1 race guard ต้องยังอยู่ (ห้ามถูกกลืนไปกับ Phase A)', () => {
  const DOGET = grab(GS, /function doGet\(e\) \{[\s\S]*?\n\}\n/);
  const KEEPWARM = grab(GS, /function keepWarm_\(\) \{[\s\S]*?\n\}\n/);

  it('doGet ยังเทียบ ts ก่อน/หลัง build แล้วไม่เขียน cache ชั้นสดถ้ามีคนบันทึกระหว่างทาง', () => {
    expect(DOGET).toMatch(/_tsBefore\s*=\s*getSheetLastModified_\(\)/);
    expect(DOGET).toMatch(/_staleBuild\s*=\s*!!\(_tsBefore && _tsAfter && _tsAfter > _tsBefore\)/);
    expect(DOGET).toMatch(/if \(!_staleBuild\) putCachedPayload_/);
  });

  it('keepWarm_ มี guard ตัวเดียวกัน', () => {
    expect(KEEPWARM).toMatch(/_tsBefore/);
    expect(KEEPWARM).toMatch(/if \(!_staleBuild\) putCachedPayload_/);
  });

  it('ชั้นสำรองยังถูกเขียนเสมอ (ไม่ผูกกับ _staleBuild)', () => {
    expect(DOGET).toMatch(/putStalePayload_\(s2, cv2\);/);
    expect(DOGET).not.toMatch(/if \(!_staleBuild\) putStalePayload_/);
  });
});
