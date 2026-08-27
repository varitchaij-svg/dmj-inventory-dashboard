// ────────────────────────────────────────────────────────────────────────────
// Startup resilience — ตาข่ายออฟไลน์ + กัน build เก่าทับ cache ชั้นสด
// หลักฐานที่มา: docs/REVIEW-ARCHITECTURE-FINAL-2026-08-26.md §16.5 (localStorage
// 22.9MB UTF-16 vs โควตา ~5MB) และ §17 (race: build เก่าทับ cache แล้ว conflict
// detection ถูก bypass ได้ถึง 180 วิ = เขียนทับงานคนอื่นเงียบ ๆ)
//
// ยึดกติกาเดิมของ repo: **eval ฟังก์ชันจริงจากต้นทาง ไม่ copy** (เหมือน auth.test.js)
// ────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS  = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}
const DOGET    = grab(GS, /function doGet\(e\)[\s\S]*?\n\}\n/);
const KEEPWARM = grab(GS, /function keepWarm_\(\)[\s\S]*?\n\}\n/);
const FETCH    = grab(APP, /const fetchFromSheet = usC\([\s\S]*?\n  \}, \[sheetUrl, role\]\);/);

// ── ฝั่งเครื่องผู้ใช้: localStorage ปลอมที่บังคับโควตาแบบ Safari (นับ UTF-16) ──
function makeStorageModule(quotaMB) {
  const store = new Map();
  const bytes = () => [...store.entries()].reduce((a, [k, v]) => a + (k.length + v.length) * 2, 0);
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    removeItem: (k) => store.delete(k),
    setItem: (k, v) => {
      const prev = store.get(k);
      store.set(k, String(v));
      if (bytes() > quotaMB * 1024 * 1024) {
        if (prev === undefined) store.delete(k); else store.set(k, prev);
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
    },
  };
  const code = [
    'const localStorage = arguments[0];',
    'const console = arguments[1];',
    grab(APP, /const LS_KEY {6}= "[^"]*";/),
    grab(APP, /const LS_SRC_KEY {2}= "[^"]*";.*/),
    grab(APP, /const LS_NOTE_KEY = "[^"]*";.*/),
    grab(APP, /function noteStorage_\(reason\) \{[\s\S]*?\n\}/),
    grab(APP, /function trimForStorage_\(o\) \{[\s\S]*?\n\}/),
    grab(APP, /function trySetLS_\(str, src\) \{[\s\S]*?\n\}/),
    grab(APP, /function saveToStorage\(d, source\) \{[\s\S]*?\n\}/),
    grab(APP, /function expandMonthlyCompact\(d\) \{[\s\S]*?\n\}/),
    grab(APP, /function expandProductsColumnar\(d\) \{[\s\S]*?\n\}/),
    grab(APP, /function loadFromStorage\(\) \{[\s\S]*?\n\}/),
    'return { saveToStorage, loadFromStorage, trimForStorage_, LS_KEY, LS_NOTE_KEY };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const api = new Function(code)(localStorage, { warn() {} });
  return { ...api, localStorage, bytes };
}

// ── ฝั่ง server: cache ปลอม + ฟังก์ชัน cache จริงจาก .gs ──
function makeCacheModule() {
  const store = new Map();
  let now = 1_000_000;
  let props = {};
  const alive = (k) => {
    const e = store.get(k);
    if (!e) return null;
    if (e.expAt <= now) { store.delete(k); return null; }
    return e.v;
  };
  const CacheService = {
    getScriptCache: () => ({
      get: (k) => alive(k),
      getAll: (keys) => { const o = {}; keys.forEach(k => { const v = alive(k); if (v != null) o[k] = v; }); return o; },
      putAll: (entries, ttl) => Object.keys(entries).forEach(k => store.set(k, { v: entries[k], expAt: now + ttl * 1000 })),
      removeAll: (keys) => keys.forEach(k => store.delete(k)),
      remove: (k) => store.delete(k),
    }),
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
    }),
  };
  const code = [
    'const CacheService = arguments[0];',
    'const PropertiesService = arguments[1];',
    'const Date = arguments[2];',
    'const Logger = { log(){} };',
    'const DriveApp = { getFileById: () => ({ getLastUpdated: () => ({ getTime: () => 0 }) }) };',
    grab(GS, /const _CACHE_TTL_SEC {3}= \d+;/),
    grab(GS, /const _CACHE_CHUNK_LEN = \d+;/),
    grab(GS, /const _CACHE_KEY_COUNT = '[^']*';/),
    grab(GS, /const _CACHE_KEY_PART {2}= '[^']*';/),
    grab(GS, /const _CACHE_TS_SUFFIX = '[^']*';/),
    grab(GS, /const _STALE_TTL_SEC {3}= \d+;/),
    grab(GS, /const _STALE_KEY_COUNT = '[^']*';/),
    grab(GS, /const _STALE_KEY_PART {2}= '[^']*';/),
    grab(GS, /const _STOCKLITE_TTL_SEC {3}= \d+;/),
    grab(GS, /const _STOCKLITE_KEY_COUNT = '[^']*';/),
    grab(GS, /const _STOCKLITE_KEY_PART {2}= '[^']*';/),
    grab(GS, /const PAYLOAD_VARIANTS_ = \[[\s\S]*?\];/),
    grab(GS, /function _cacheKeyCount_\(variant\) \{[\s\S]*?\n\}/),
    grab(GS, /function _cacheKeyPart_\(variant\) \{[\s\S]*?\n\}/),
    grab(GS, /function _staleKeyCount_\(variant\)\s+\{[^}]*\}/),
    grab(GS, /function _staleKeyPart_\(variant\)\s+\{[^}]*\}/),
    grab(GS, /function payloadCacheVariant_\(variant, enc\) \{[\s\S]*?\n\}/),
    grab(GS, /function _readChunked_\(kCount, kPart\) \{[\s\S]*?\n\}/),
    grab(GS, /function _writeChunked_\(str, kCount, kPart, ttlSec\) \{[\s\S]*?\n\}/),
    grab(GS, /function readFreshPayload_\(variant\) \{[\s\S]*?\n\}/),
    grab(GS, /function getCachedPayload_\(variant\) \{[\s\S]*?\n\}/),
    grab(GS, /function putCachedPayload_\(str, variant\) \{[\s\S]*?\n\}/),
    grab(GS, /function readStalePayload_\(variant\) \{[\s\S]*?\n\}/),
    grab(GS, /function putStalePayload_\(str, variant\) \{[\s\S]*?\n\}/),
    grab(GS, /function getSheetLastModified_\(\) \{[\s\S]*?\n\}/),
    grab(GS, /function invalidateCache_\(skipTsUpdate\) \{[\s\S]*?\n\}/),
    `return { getCachedPayload_, putCachedPayload_, readFreshPayload_, readStalePayload_,
              putStalePayload_, invalidateCache_, getSheetLastModified_, payloadCacheVariant_,
              _cacheKeyCount_, _cacheKeyPart_ };`,
  ].join('\n');
  const FakeDate = { now: () => now };
  // eslint-disable-next-line no-new-func
  const api = new Function(code)(CacheService, PropertiesService, FakeDate);
  return { ...api, store, tick: (ms) => { now += ms; }, setProp: (k, v) => { props[k] = String(v); } };
}

// ────────────────────────────────────────────────────────────────────────────
describe('A · correctness gate — build เก่าต้องไม่ทับ cache ชั้นสดที่ใหม่กว่า', () => {
  // ลำดับที่พิสูจน์ (§17): T0 build เริ่ม → T1 มีคนบันทึก → T2 invalidateCache_ →
  // T3 build เสร็จ → T4 build พยายามเขียน cache → T5 คนถัดไปอ่าน cache
  function runSequence({ guarded }) {
    const M = makeCacheModule();
    const cv = M.payloadCacheVariant_('full', 3);
    M.setProp('dmj_last_write_ts', '1000');

    const tsBefore = M.getSheetLastModified_();       // T0
    const built = JSON.stringify({ data: 'ก่อนบันทึก', lastModified: tsBefore });
    M.invalidateCache_();                              // T1+T2 (มีคนบันทึก → bump ts + ล้าง cache)
    const tsAfter = M.getSheetLastModified_();         // T3
    const staleBuild = !!(tsBefore && tsAfter && tsAfter !== tsBefore);

    if (!guarded || !staleBuild) M.putCachedPayload_(built, cv);   // T4
    M.putStalePayload_(built, cv);
    return { fresh: M.readFreshPayload_(cv).str, stale: M.readStalePayload_(cv).str, tsAfter, tsBefore };
  }

  it('มีคนบันทึกระหว่าง build → **ห้าม**เขียน cache ชั้นสดทับ (พฤติกรรมใหม่)', () => {
    const r = runSequence({ guarded: true });
    expect(r.tsAfter).not.toBe(r.tsBefore);   // ยืนยันว่าเกิด race จริงในสถานการณ์นี้
    expect(r.fresh).toBeNull();               // ← หัวใจ: ชั้นสดต้องว่าง คนถัดไปจึง build ใหม่
  });

  it('ของเดิม (ไม่มี guard) จะเขียนทับจริง — เทสต์นี้พิสูจน์ว่า race มีอยู่จริง ไม่ใช่ทฤษฎี', () => {
    const r = runSequence({ guarded: false });
    expect(r.fresh).toContain('ก่อนบันทึก');   // ข้อมูลก่อนบันทึกไปนั่งใน cache ชั้นสด
  });

  it('ชั้นสำรองยังเขียนได้เสมอ (ไม่เคยถูกปั๊ม lastModified สด จึงไม่ทำให้ conflict หลุด)', () => {
    const r = runSequence({ guarded: true });
    expect(r.stale).toContain('ก่อนบันทึก');
  });

  it('ไม่มีใครบันทึกระหว่าง build → เขียน cache ชั้นสดตามปกติ (ไม่เปลี่ยนพฤติกรรมเดิม)', () => {
    const M = makeCacheModule();
    const cv = M.payloadCacheVariant_('full', 3);
    M.setProp('dmj_last_write_ts', '1000');
    const tsBefore = M.getSheetLastModified_();
    const built = JSON.stringify({ data: 'สด', lastModified: tsBefore });
    const staleBuild = !!(tsBefore && M.getSheetLastModified_() !== tsBefore);
    expect(staleBuild).toBe(false);
    if (!staleBuild) M.putCachedPayload_(built, cv);
    expect(M.readFreshPayload_(cv).str).toContain('สด');
  });

  it('เขียนติดกันหลายครั้ง (concurrent writes) → ts ขยับทุกครั้ง และ cache ชั้นสดถูกล้างทุกครั้ง', () => {
    const M = makeCacheModule();
    const cv = M.payloadCacheVariant_('full', 3);
    M.setProp('dmj_last_write_ts', '1000');
    M.putCachedPayload_('{"a":1}', cv);
    const seen = new Set();
    for (let i = 0; i < 3; i++) {
      M.tick(5);
      M.invalidateCache_();
      seen.add(M.getSheetLastModified_());
      expect(M.readFreshPayload_(cv).str).toBeNull();
      M.putCachedPayload_('{"a":' + i + '}', cv);
    }
    expect(seen.size).toBe(3);
  });
});

describe('B · ข้อจำกัดความน่าเชื่อถือของ cache (chunk เดียวหลุด = ทั้งก้อนใช้ไม่ได้)', () => {
  it('round-trip ปกติ: เขียนแล้วอ่านกลับได้ครบ + มี ts กำกับ', () => {
    const M = makeCacheModule();
    const cv = M.payloadCacheVariant_('full', 3);
    const big = JSON.stringify({ x: 'ก'.repeat(100000) });
    M.putCachedPayload_(big, cv);
    const got = M.readFreshPayload_(cv);
    expect(got.str).toBe(big);
    expect(got.ts).toBeGreaterThan(0);
  });

  it('chunk หายไปแค่ตัวเดียว → ทั้งก้อนถูกถือว่า MISS (ข้อจำกัดเชิงโครงสร้าง §16.3)', () => {
    const M = makeCacheModule();
    const cv = M.payloadCacheVariant_('full', 3);
    const big = JSON.stringify({ x: 'ก'.repeat(100000) });
    M.putCachedPayload_(big, cv);
    const partKey = M._cacheKeyPart_(cv) + '1';
    expect(M.store.has(partKey)).toBe(true);
    M.store.delete(partKey);                       // จำลอง eviction ของ CacheService
    expect(M.readFreshPayload_(cv).str).toBeNull();
  });

  it('cache หมดอายุตาม TTL → MISS (ไม่คืนของค้าง)', () => {
    const M = makeCacheModule();
    const cv = M.payloadCacheVariant_('full', 3);
    M.putCachedPayload_('{"a":1}', cv);
    M.tick(200 * 1000);                            // เกิน _CACHE_TTL_SEC (180)
    expect(M.readFreshPayload_(cv).str).toBeNull();
  });

  it('invalidateCache_ ล้างชั้นสดทุก variant×encoding แต่ **ไม่แตะ** ชั้นสำรอง', () => {
    const M = makeCacheModule();
    ['full', 'ops', 'lite'].forEach(v => [1, 2, 3].forEach(enc => {
      const cv = M.payloadCacheVariant_(v, enc);
      M.putCachedPayload_('{"v":"' + v + enc + '"}', cv);
      M.putStalePayload_('{"stale":"' + v + enc + '"}', cv);
    }));
    M.invalidateCache_();
    ['full', 'ops', 'lite'].forEach(v => [1, 2, 3].forEach(enc => {
      const cv = M.payloadCacheVariant_(v, enc);
      expect(M.readFreshPayload_(cv).str).toBeNull();
      expect(M.readStalePayload_(cv).str).toContain('stale');
    }));
  });
});

describe('C · ตาข่ายออฟไลน์ — localStorage ต้องไม่มีวันบล็อกการเปิดแอป', () => {
  // `mo` (ยอดรายเดือนแบบย่อ) คือก้อนที่โตขึ้นเองทุกเดือน — วัดจริงได้ 16% ของก้อนย่อ
  // และเป็นสิ่งเดียวที่ trimForStorage_ ตัด จึงต้องมีน้ำหนักจริงในเทสต์ ไม่งั้นตัดแล้วไม่ต่าง
  const mkCompact = (n, months = 24) => JSON.stringify({
    products: {
      cols: ['sku', 'name', 'qtyWH', 'mo'],
      rows: Array.from({ length: n }, (_, i) => ['S' + i, 'ชื่อสินค้า' + i, i,
        Array.from({ length: months }, (_, m) => [m, i + m, (i + m) * 137])]),
    },
    monthLabels: Array.from({ length: months }, (_, m) => String(m + 1).padStart(2, '0') + '/2026'),
    lastModified: 123,
  });

  it('ก้อนย่อพอดีโควตา → เก็บได้ และโหลดกลับมาแล้วกางเป็นรูปเดิมครบ', () => {
    const S = makeStorageModule(5);
    expect(S.saveToStorage(mkCompact(50), 'sheet')).toBe(true);
    const back = S.loadFromStorage();
    expect(Array.isArray(back.products)).toBe(true);          // กางจากรูปคอลัมน์แล้ว
    expect(back.products[0].sku).toBe('S0');
    expect(Array.isArray(back.products[0].monthly)).toBe(true); // `mo` ถูกกางเป็น monthly
    expect(S.localStorage.getItem(S.LS_NOTE_KEY)).toBeNull();   // ไม่มีโน้ตปัญหา
  });

  it('ก้อนใหญ่เกินโควตา → ตัดของที่คำนวณใหม่ได้ออกแล้วเก็บให้ได้ (ไม่ยอมปล่อยว่าง)', () => {
    const S = makeStorageModule(0.35);          // โควตาแคบ ๆ ให้ tier1 ไม่ผ่าน
    const ok = S.saveToStorage(mkCompact(900), 'sheet');   // ~900 SKU × 24 เดือน
    expect(ok).toBe(true);
    const back = S.loadFromStorage();
    expect(back._trimmed).toBe(1);               // ← สัญญาณจริงว่าตกมาชั้นตัด
    expect(back.products.length).toBe(900);      // ยังมีสินค้าครบ — ตัดแค่ `mo`
    expect(back.products[0].monthly).toBeUndefined();
    // โน้ตวินิจฉัยเป็น best-effort: โควตาแคบจนเขียนโน้ตไม่ลงก็ต้องไม่พัง
    const note = S.localStorage.getItem(S.LS_NOTE_KEY);
    if (note) expect(JSON.parse(note).reason).toBe('trimmed');
  });

  it('เล็กเกินกว่าจะเก็บอะไรได้เลย → **ไม่ throw** และ **ไม่ลบของเก่าที่ยังใช้ได้**', () => {
    const S = makeStorageModule(5);
    S.saveToStorage(mkCompact(20), 'sheet');
    const before = S.localStorage.getItem(S.LS_KEY);
    expect(before).toBeTruthy();
    const S2 = makeStorageModule(0.02);
    S2.localStorage.setItem(S2.LS_KEY, before);   // จำลองว่ามีของเก่าอยู่แล้ว
    let threw = false;
    try { S2.saveToStorage(mkCompact(5000), 'sheet'); } catch (e) { threw = true; }
    expect(threw).toBe(false);                                  // ห้าม throw เด็ดขาด
    expect(S2.localStorage.getItem(S2.LS_KEY)).toBe(before);    // ของเก่ายังอยู่ครบ
    expect(S2.loadFromStorage()).toBeTruthy();                  // ยังเปิดแอปได้จากของเก่า
  });

  it('trimForStorage_ ตัด `mo` + ก้อนวิเคราะห์ แต่ไม่แตะจำนวนสินค้า', () => {
    const S = makeStorageModule(5);
    const o = JSON.parse(mkCompact(10));
    o.monthlyByCat = { a: 1 }; o.purchases = [1, 2, 3]; o.mtoGroups = [{ base: 'x' }];
    const t = S.trimForStorage_(o);
    expect(t.products.cols).not.toContain('mo');
    expect(t.products.rows.length).toBe(10);
    expect(t.monthlyByCat).toBeUndefined();
    expect(t.purchases).toBeUndefined();
    expect(t.mtoGroups).toBeUndefined();
  });

  it('ของเก่ารูปแบบเดิม (array-of-objects ที่กางแล้ว) ยังโหลดได้ — ไม่ต้อง migrate', () => {
    const S = makeStorageModule(5);
    S.localStorage.setItem(S.LS_KEY, JSON.stringify({
      products: [{ sku: 'A1', monthly: [{ month: '01/2026', qty: 1, sales: 2 }] }],
      monthLabels: ['01/2026'],
    }));
    const back = S.loadFromStorage();
    expect(back.products[0].sku).toBe('A1');
  });
});

describe('D · meta — สายส่งต้องยังต่อกันจริง (พังแล้วไม่มี error ให้เห็น)', () => {
  it('doGet เทียบ ts ก่อน/หลัง build แล้วกันการเขียน cache ชั้นสด', () => {
    expect(DOGET).toMatch(/const _tsBefore = getSheetLastModified_\(\);/);
    expect(DOGET).toMatch(/const _tsAfter = getSheetLastModified_\(\);/);
    expect(DOGET).toMatch(/_staleBuild/);
    expect(DOGET).toMatch(/if \(!_staleBuild\) putCachedPayload_/);
  });

  it('doGet ปั๊ม lastModified ด้วย ts **ตอนเริ่ม** build (ไม่ใช่ตอนประกอบเสร็จ)', () => {
    expect(DOGET).toMatch(/if \(_tsBefore\) data\.lastModified = _tsBefore;/);
  });

  it('ชั้นสำรองยังถูกเขียนเสมอ แม้ build จะเก่า (ไม่งั้นกลับไป stampede)', () => {
    const guardedPuts = DOGET.match(/if \(!_staleBuild\) putCachedPayload_/g) || [];
    const stalePuts   = DOGET.match(/putStalePayload_/g) || [];
    expect(guardedPuts.length).toBeGreaterThanOrEqual(3);
    expect(stalePuts.length).toBeGreaterThanOrEqual(3);
    expect(DOGET).not.toMatch(/if \(!_staleBuild\) putStalePayload_/);
  });

  it('keepWarm_ มี guard เดียวกัน (มัน build ทับ cache ได้เหมือนกันเป๊ะ)', () => {
    expect(KEEPWARM).toMatch(/_tsBefore/);
    expect(KEEPWARM).toMatch(/if \(!_staleBuild\) putCachedPayload_/);
  });

  it('logPayloadSizes_ (เครื่องมือวัดที่ stringify payload ซ้ำ) ถูกสุ่มออกจาก hot path — ไม่รันทุก build', () => {
    // หลักฐาน: production trace 27 ส.ค. 2026 — time-to-first-byte 19.3s = doGet execution
    // (ContentService buffer ไม่ stream) · logPayloadSizes_ re-stringify ทั้ง payload + ทุก mo
    // ค้างบนเส้นทางของผู้ที่ trigger build เอง (cache miss = first-open ตอน cache เย็น)
    expect(DOGET).toMatch(/if \(Math\.random\(\) < 0\.15\) logPayloadSizes_/);
    // ต้องไม่มีการเรียกแบบไม่มีเงื่อนไข (ไม่งั้น sampling ไม่มีผล)
    expect(DOGET).not.toMatch(/\n\s*logPayloadSizes_\(data, cacheVariant, out\.length\);/);
  });

  it('perfLogDoGet_ (ตัววัดราคาถูก ~0 ms) ยังรันทุก build เสมอ — observability หลักไม่หาย', () => {
    // logPayloadSizes_ ถูกสุ่ม แต่ perfLogDoGet_ (บรรทัดเดียว มี build=/shape+cache= ms) ต้องคงอยู่
    expect(DOGET).toMatch(/perfLogDoGet_\(wantFresh \? 'FRESH' : 'MISS'/);
    expect(DOGET).toMatch(/build=' \+ \(_tBuilt - _tReq\)/);
  });

  it('single-flight เดิมยังอยู่ (cache miss พร้อมกันต้องไม่ build ทุกคน)', () => {
    expect(DOGET).toMatch(/acquireBuildLock_\(0\)/);
    expect(DOGET).toMatch(/acquireBuildLock_\(_BUILD_LOCK_WAIT_MS\)/);
    expect(DOGET).toMatch(/readStalePayload_/);
  });

  it('fetchFromSheet เก็บ **ก้อนย่อ** ลงเครื่อง ไม่ใช่ผลของ enrichData', () => {
    expect(FETCH).toMatch(/compactStr = JSON\.stringify\(d\)/);
    expect(FETCH).toMatch(/saveToStorage\(compactStr \|\| enriched, "sheet"\)/);
    // ต้อง serialize ก่อนเรียก enrichData เสมอ (enrichData แก้ `d` ในที่)
    expect(FETCH.indexOf('compactStr = JSON.stringify(d)')).toBeLessThan(FETCH.indexOf('enrichData(d)'));
  });

  it('saveToStorage ไม่มีทาง throw และมีทางถอย 2 ชั้น', () => {
    const SAVE = grab(APP, /function saveToStorage\(d, source\) \{[\s\S]*?\n\}/);
    expect(SAVE).toMatch(/trySetLS_/);
    expect(SAVE).toMatch(/trimForStorage_/);
    expect(SAVE).not.toMatch(/throw/);
  });
});
