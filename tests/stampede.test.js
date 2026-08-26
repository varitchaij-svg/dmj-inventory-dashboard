// tests/stampede.test.js — Phase 7.3: single-flight + stale-while-rebuild
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (docs/PHASE0-RESULTS.md, วัดจริง 5 ส.ค. 2026): ยิง 15 request พร้อมกัน
// → **87-93% ได้หน้า HTML แทน JSON, มัธยฐาน 41-52 วิ, ช้าสุด 115 วิ** เพราะ cache miss
// พร้อมกันแล้วทุกคนสั่ง `buildFullData_()` (9.8 วิ, อ่าน 9 ชีต) พร้อมกันหมด
//
// เทสต์ชุดนี้คุม **ของที่พังแล้วไม่มี error ให้เห็น** เป็นหลัก — ทั้ง 3 ข้อล่างนี้ถ้าหลุด
// ระบบยังรันได้ปกติทุกอย่าง แต่ผลลัพธ์ผิด/กลับไปพังเหมือนเดิมโดยไม่มีอะไรเตือน:
//   1. `invalidateCache_` เผลอลบชั้นสำรอง → กลับไป stampede เต็มรูปแบบทันที (เทสต์อื่นเขียวหมด)
//   2. เส้นทาง stale เผลอปั๊ม `lastModified` สด → client คิดว่าถือข้อมูลล่าสุด →
//      conflict detection ปล่อยผ่าน → **เขียนทับงานคนอื่นเงียบ ๆ** (แย่กว่าเห็นข้อมูลช้า)
//   3. ใช้ `getScriptLock()` แทน `getUserLock()` → build 10 วิ ไปขวางคนกดสั่งของ/โอนของ
//      (ย้ายคอขวดจากฝั่งอ่านไปฝั่งเขียน ซึ่งเจ็บกว่าเดิม)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const SRC_APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const DOGET = grab(/function doGet\(e\)[\s\S]*?\n\}\n/);
const INVALIDATE = grab(/function invalidateCache_\(skipTsUpdate\)[\s\S]*?\n\}/);

// ── เอาฟังก์ชันจริงมารันกับ CacheService ปลอม (ไม่ copy โค้ด — หลักเดียวกับ auth.test.js) ──
function makeCacheModule() {
  const store = new Map();          // key → { v, expAt }
  let now = 1_000_000;
  const alive = (k) => {
    const e = store.get(k);
    if (!e) return null;
    if (e.expAt <= now) { store.delete(k); return null; }
    return e.v;
  };
  const CacheService = {
    getScriptCache: () => ({
      get: (k) => alive(k),
      getAll: (keys) => {
        const out = {};
        keys.forEach((k) => { const v = alive(k); if (v != null) out[k] = v; });
        return out;
      },
      putAll: (entries, ttl) => {
        Object.keys(entries).forEach((k) => store.set(k, { v: entries[k], expAt: now + ttl * 1000 }));
      },
      removeAll: (keys) => keys.forEach((k) => store.delete(k)),
      remove: (k) => store.delete(k),
    }),
  };
  const code = [
    'const CacheService = arguments[0];',
    'const Date = arguments[1];',
    grab(/const _CACHE_TTL_SEC {3}= \d+;/),
    grab(/const _CACHE_CHUNK_LEN = \d+;/),
    grab(/const _CACHE_KEY_COUNT = '[^']*';/),
    grab(/const _CACHE_KEY_PART {2}= '[^']*';/),
    grab(/const _CACHE_TS_SUFFIX = '[^']*';/),
    grab(/const _STALE_TTL_SEC {3}= \d+;/),
    grab(/const _STALE_KEY_COUNT = '[^']*';/),
    grab(/const _STALE_KEY_PART {2}= '[^']*';/),
    grab(/const _STOCKLITE_TTL_SEC {3}= \d+;/),
    grab(/const _STOCKLITE_KEY_COUNT = '[^']*';/),
    grab(/const _STOCKLITE_KEY_PART {2}= '[^']*';/),
    grab(/const PAYLOAD_VARIANTS_ = \[[\s\S]*?\];/),
    grab(/function _cacheKeyCount_\(variant\) \{[\s\S]*?\n\}/),
    grab(/function _cacheKeyPart_\(variant\) \{[\s\S]*?\n\}/),
    grab(/function _staleKeyCount_\(variant\)\s+\{[^}]*\}/),
    grab(/function _staleKeyPart_\(variant\)\s+\{[^}]*\}/),
    grab(/function payloadCacheVariant_\(variant, enc\) \{[\s\S]*?\n\}/),
    grab(/function _readChunked_\(kCount, kPart\) \{[\s\S]*?\n\}/),
    grab(/function _writeChunked_\(str, kCount, kPart, ttlSec\) \{[\s\S]*?\n\}/),
    grab(/function readFreshPayload_\(variant\) \{[\s\S]*?\n\}/),
    grab(/function getCachedPayload_\(variant\) \{[\s\S]*?\n\}/),
    grab(/function putCachedPayload_\(str, variant\) \{[\s\S]*?\n\}/),
    grab(/function readStalePayload_\(variant\) \{[\s\S]*?\n\}/),
    grab(/function putStalePayload_\(str, variant\) \{[\s\S]*?\n\}/),
    grab(/function markStalePayload_\(s, ts\) \{[\s\S]*?\n\}/),
    // invalidateCache_ แตะ PropertiesService ด้วย — ใส่ตัวปลอมให้ผ่าน
    'const PropertiesService = { getScriptProperties: () => ({ setProperty: () => {} }) };',
    INVALIDATE,
    `return { getCachedPayload_, putCachedPayload_, readFreshPayload_,
              readStalePayload_, putStalePayload_, markStalePayload_,
              invalidateCache_, payloadCacheVariant_, _readChunked_, _writeChunked_,
              _CACHE_TTL_SEC, _STALE_TTL_SEC, _STOCKLITE_TTL_SEC,
              _STOCKLITE_KEY_COUNT, _STOCKLITE_KEY_PART };`,
  ].join('\n');
  const fakeDate = { now: () => now };
  // eslint-disable-next-line no-new-func
  const mod = new Function(code)(CacheService, fakeDate);
  // ตัวช่วยของเทสต์เอง ต้องอยู่นอก new Function เพราะต้องเห็น closure ของ store/now
  return Object.assign(mod, { _tick: (ms) => { now += ms; }, _size: () => store.size });
}

describe('ชั้น cache สด/สำรอง — พฤติกรรมจริง', () => {
  it('เขียนแล้วอ่านกลับได้ครบทั้งก้อน แม้ยาวเกิน 1 chunk', () => {
    const M = makeCacheModule();
    const big = '{"x":"' + 'ก'.repeat(95_000) + '"}';   // > 3 chunk
    M.putCachedPayload_(big, 'full');
    expect(M.getCachedPayload_('full')).toBe(big);
  });

  it('อ่านกลับมาพร้อมเวลาที่เขียน (ใช้ตัดสินว่าของใหม่พอสำหรับคนกด Sync ไหม)', () => {
    const M = makeCacheModule();
    M.putCachedPayload_('{"a":1}', 'lite');
    const r = M.readFreshPayload_('lite');
    expect(r.str).toBe('{"a":1}');
    expect(r.ts).toBeGreaterThan(0);
  });

  it('chunk หายไปตัวหนึ่ง → ถือว่า cache ใช้ไม่ได้ (ไม่คืนก้อนที่ขาด)', () => {
    // ก้อนที่ขาดกลาง = JSON พัง → หน้าขาว · คืน null ให้ไป build ใหม่ปลอดภัยกว่า
    const M = makeCacheModule();
    M.putCachedPayload_('{"x":"' + 'ข'.repeat(70_000) + '"}', 'full');
    M.invalidateCache_(true);
    expect(M.getCachedPayload_('full')).toBe(null);
  });

  it('ชั้นสำรองอยู่ได้นานกว่าชั้นสด แต่ไม่นานเกินไป (ไม่เกิน 1 ชม.)', () => {
    const M = makeCacheModule();
    expect(M._STALE_TTL_SEC).toBeGreaterThan(M._CACHE_TTL_SEC);
    // เพดานบน: build พังติดกันนานกว่านี้ ให้ผู้ใช้เห็น error ดีกว่าเสิร์ฟตัวเลขสต็อกเก่ามาก
    expect(M._STALE_TTL_SEC).toBeLessThanOrEqual(3600);
  });

  it('ชั้นสำรองหมดอายุเองตามเวลา (ไม่ค้างถาวรเมื่อ build พังยาว)', () => {
    const M = makeCacheModule();
    M.putStalePayload_('{"a":1}', 'full');
    M._tick((M._STALE_TTL_SEC + 1) * 1000);
    expect(M.readStalePayload_('full').str).toBe(null);
  });
});

describe('invalidateCache_ ต้องล้างเฉพาะชั้นสด (หัวใจของ stale-while-rebuild)', () => {
  it('ล้างชั้นสดทุก variant × ทุก encoding แต่ชั้นสำรองยังอยู่ครบ', () => {
    // ถ้าข้อนี้แดง = กลับไป stampede เต็มรูปแบบ (ทุกคน miss พร้อมกัน → build พร้อมกัน)
    // โดยที่ไม่มีอะไรพังให้เห็นเลย นอกจากแอปช้าลงเฉย ๆ ตอนมีคนใช้เยอะ
    const M = makeCacheModule();
    const variants = ['full', 'ops', 'lite'];
    variants.forEach((v) => {
      [1, 2].forEach((enc) => {
        const cv = M.payloadCacheVariant_(v, enc);
        M.putCachedPayload_('{"v":"' + cv + '"}', cv);
        M.putStalePayload_('{"v":"' + cv + '"}', cv);
      });
    });

    M.invalidateCache_(true);

    variants.forEach((v) => {
      [1, 2].forEach((enc) => {
        const cv = M.payloadCacheVariant_(v, enc);
        expect(M.getCachedPayload_(cv), 'ชั้นสดของ ' + cv + ' ต้องถูกล้าง').toBe(null);
        expect(M.readStalePayload_(cv).str, 'ชั้นสำรองของ ' + cv + ' ห้ามถูกล้าง')
          .toBe('{"v":"' + cv + '"}');
      });
    });
  });

  it('ล้างคีย์เวลา (_ts) ของชั้นสดด้วย ไม่ทิ้งขยะค้าง', () => {
    const M = makeCacheModule();
    M.putCachedPayload_('{"a":1}', 'full');
    const before = M._size();
    M.invalidateCache_(true);
    expect(M._size()).toBeLessThan(before);
    expect(M.readFreshPayload_('full').ts).toBe(0);
  });

  it('คีย์ชั้นสำรองต้องไม่ทับคีย์ชั้นสดของ variant ไหนเลย', () => {
    // ทับกัน = ล้างชั้นสดแล้วชั้นสำรองหายตาม (หรือแย่กว่า: role หนึ่งอ่านของอีก role)
    const M = makeCacheModule();
    const variants = ['full', 'ops', 'lite'];
    const fresh = [], stale = [];
    variants.forEach((v) => [1, 2].forEach((enc) => {
      const cv = M.payloadCacheVariant_(v, enc);
      M.putCachedPayload_('{"f":"' + cv + '"}', cv);
      fresh.push(cv);
      M.putStalePayload_('{"s":"' + cv + '"}', cv);
      stale.push(cv);
    }));
    M.invalidateCache_(true);
    // ชั้นสำรองยังอ่านได้ครบและเป็นค่าของตัวเอง ไม่ใช่ของ variant อื่น
    stale.forEach((cv) => expect(M.readStalePayload_(cv).str).toBe('{"s":"' + cv + '"}'));
  });
});

describe('markStalePayload_ — ธงบอกผู้ใช้ว่าเป็นข้อมูลสำรอง', () => {
  it('แทรก stale/staleAt แล้วยังเป็น JSON ที่ parse ได้ และข้อมูลเดิมครบ', () => {
    const M = makeCacheModule();
    const src = JSON.stringify({ products: [{ sku: 'A1' }], lastModified: 111 });
    const out = JSON.parse(M.markStalePayload_(src, 999));
    expect(out.stale).toBe(1);
    expect(out.staleAt).toBe(999);
    expect(out.products).toEqual([{ sku: 'A1' }]);
    expect(out.lastModified).toBe(111);
  });

  it('ก้อนว่าง/ไม่ใช่ object → คืนของเดิม ไม่สร้าง JSON พัง', () => {
    const M = makeCacheModule();
    expect(M.markStalePayload_('{}', 1)).toBe('{}');
    expect(M.markStalePayload_('', 1)).toBe('');
    expect(M.markStalePayload_(null, 1)).toBe(null);
    expect(() => JSON.parse(M.markStalePayload_('{}', 1))).not.toThrow();
  });
});

describe('single-flight ใน doGet — จุดเชื่อมต่อที่พังแล้วไม่มี error ให้เห็น', () => {
  it('ใช้ getUserLock() ไม่ใช่ getScriptLock() (build ห้ามขวางคนกดสั่งของ)', () => {
    // getScriptLock() คือล็อกตัวเดียวกับที่ handleOrder_/transferStock ใช้ —
    // ถือคร่อม build 10 วิ = ย้ายคอขวดไปฝั่งเขียน ซึ่งเจ็บกว่าอ่านช้า
    const fn = grab(/function acquireBuildLock_\(waitMs\) \{[\s\S]*?\n\}/);
    expect(fn).toContain('LockService.getUserLock()');
    expect(fn).not.toContain('getScriptLock');
    expect(fn).toMatch(/tryLock\(/);
  });

  it('doGet พยายามคว้าล็อกแบบไม่รอ (tryLock 0) ก่อนตัดสินใจเสิร์ฟของสำรอง', () => {
    // ถ้าเผลอรอตั้งแต่ครั้งแรก ทุกคนจะไปกองรอคิวแทนที่จะได้ของสำรองกลับไปทันที
    expect(DOGET).toMatch(/acquireBuildLock_\(0\)/);
  });

  it('ปล่อยล็อกใน finally เสมอ (ล็อกค้าง = ทั้งร้านรอคิวจนหมดเวลา)', () => {
    expect(DOGET).toMatch(/finally \{[\s\S]{0,600}?releaseBuildLock_\(buildLock\)/);
  });

  it('ปล่อยล็อกหลังเขียน cache เสร็จ ไม่ใช่ก่อน', () => {
    // ปล่อยก่อนเขียน cache = คนที่รออยู่ตื่นมาเจอ cache ว่าง แล้ว build ซ้ำ = ปัญหาเดิม
    const iPut = DOGET.lastIndexOf('putCachedPayload_(');
    const iRelease = DOGET.lastIndexOf('releaseBuildLock_(buildLock)');
    expect(iPut).toBeGreaterThan(-1);
    expect(iRelease).toBeGreaterThan(iPut);
  });

  it('มีทางออกเสมอเมื่อรอคิวไม่ทัน — ไม่ปล่อยให้ผู้ใช้ได้หน้าเปล่า', () => {
    // ต้อง build เองได้แม้ไม่ได้ล็อก ไม่งั้นวันที่ล็อกมีปัญหา = ทั้งร้านอ่านข้อมูลไม่ได้เลย
    expect(DOGET).toMatch(/acquireBuildLock_\(_BUILD_LOCK_WAIT_MS\)/);
    const iWait = DOGET.indexOf('acquireBuildLock_(_BUILD_LOCK_WAIT_MS)');
    const iBuild = DOGET.indexOf('const data = buildFullData_()');
    expect(iBuild, 'ไม่เจอจุดที่ build จริง').toBeGreaterThan(-1);
    expect(iBuild, 'build ต้องอยู่หลังจังหวะรอคิว').toBeGreaterThan(iWait);
  });

  it('log "build ซ้อน" อ่านจากค่าที่จำไว้ ไม่ใช่ buildLock ที่ถูก set null ไปแล้ว', () => {
    // เจอตอนรีวิวโค้ดตัวเอง: เส้นทาง build ปล่อยล็อกแล้ว `buildLock = null` ก่อนถึงบรรทัด log
    // ถ้า log ไปอ่าน `buildLock` ตรง ๆ จะได้ null เสมอ → รายงานว่า "build ซ้อน" ทุกครั้ง
    // ทั้งที่ single-flight ทำงานปกติ · เป็นบั๊กที่ไม่มีอะไรพัง มีแค่ตัวเลขที่ทำให้สรุปผิด
    expect(DOGET).toMatch(/const hadLock = !!buildLock;/);
    expect(DOGET).toMatch(/hadLock \? '' : ' \(build ซ้อน/);
    const iNull = DOGET.indexOf('buildLock = null;');   // มี ; เพื่อไม่ไปเจอข้อความในคอมเมนต์
    const iHad = DOGET.indexOf('const hadLock = !!buildLock;');
    expect(iHad, 'ต้องจำค่าไว้ก่อนจุดที่ set null').toBeLessThan(iNull);
  });

  it('เวลารอคิวยาวกว่าเวลา build จริง (วัดได้ ~10 วิ) แต่ไม่เกิน 60 วิ', () => {
    const m = SRC.match(/const _BUILD_LOCK_WAIT_MS = (\d+);/);
    expect(m, 'ไม่เจอ _BUILD_LOCK_WAIT_MS').toBeTruthy();
    const ms = parseInt(m[1], 10);
    expect(ms).toBeGreaterThanOrEqual(15000);   // สั้นกว่านี้ = รอไม่ทัน build แล้วไป build ซ้อน
    expect(ms).toBeLessThanOrEqual(60000);      // ยาวกว่านี้ = ผู้ใช้ค้างจอนานเกินรับได้
  });
});

describe('เส้นทาง stale ห้ามทำให้ conflict detection เพี้ยน', () => {
  it('ไม่ปั๊ม lastModified สดลงในก้อนสำรอง', () => {
    // ก้อนสำรอง = ข้อมูล **ก่อน** การบันทึกล่าสุด · ถ้าปั๊ม lastModified เป็นเวลาปัจจุบัน
    // client จะเข้าใจว่าถือข้อมูลล่าสุดอยู่ → shouldRejectConflict_ ปล่อยผ่าน →
    // เขียนทับงานคนอื่นเงียบ ๆ (ไม่มี error ให้เห็นทั้งฝั่ง client และ server)
    const iStale = DOGET.indexOf('readStalePayload_(cacheVariant)');
    const staleBlock = DOGET.slice(iStale, DOGET.indexOf('if (!buildLock) {', iStale));
    expect(staleBlock.length).toBeGreaterThan(0);
    expect(staleBlock, 'เส้นทาง stale ห้ามเรียก serveCached (ตัวนั้นปั๊ม lastModified สด)')
      .not.toContain('serveCached(');
    expect(staleBlock).toContain('markStalePayload_(');
  });

  it('เส้นทาง HIT/WAIT-HIT ยังปั๊ม lastModified สดเหมือนเดิม', () => {
    const fn = grab(/const serveCached = function[\s\S]*?\n {4}\};/);
    expect(fn).toContain('getSheetLastModified_()');
    expect(fn).toMatch(/"lastModified"/);
  });

  it('คนกดปุ่ม Sync (fresh=1) ไม่มีวันได้ก้อนสำรอง', () => {
    // กด Sync = ตั้งใจขอข้อมูลใหม่ (มักเพราะไปแก้ชีตด้วยมือแล้วอยากเห็นผล)
    // ให้ของสำรองไป = ปุ่มดูเหมือนพัง แล้วเขาจะกดรัว ๆ ซึ่งยิ่งซ้ำเติมตอนระบบแย่
    expect(DOGET).toMatch(/if \(!buildLock && !wantFresh\) \{[\s\S]{0,200}?readStalePayload_/);
  });

  it('คนกด Sync รับของจากคิวได้เฉพาะที่ build หลังคำขอเขาเริ่ม', () => {
    // ไม่เช็คเวลา = ได้ก้อนที่ build ไปก่อนหน้าแล้ว ซึ่งอาจยังไม่มีสิ่งที่เขากด Sync มาหา
    expect(DOGET).toMatch(/!wantFresh \|\| after\.ts >= _tReq/);
  });
});

describe('เส้นทาง build ต้องเติมชั้นสำรองทุกครั้ง', () => {
  it('เขียนชั้นสำรองคู่กับชั้นสดครบทุก variant', () => {
    // ลืมข้อนี้ = ชั้นสำรองว่างตลอดกาล → ทุกคนไปกองรอคิว build = แก้แล้วเหมือนไม่ได้แก้
    const buildBlock = DOGET.slice(DOGET.indexOf('const data = buildFullData_()'));
    // enc=2 (ชั้นสด+สำรองต่อ variant) — Phase A1 เปลี่ยนชื่อตัวแปรเป็น s2/cv2 (เพิ่ม s3/cv3 สำหรับ pv=3)
    expect(buildBlock).toMatch(/PAYLOAD_VARIANTS_\.forEach[\s\S]*?putStalePayload_\(s2, cv2\)/);
  });

  it('เส้นทาง client เก่า (ไม่ส่ง pv) ก็เติมชั้นสำรองด้วย', () => {
    const legacy = DOGET.slice(DOGET.indexOf('expandMonthlyForLegacy_(data)'));
    expect(legacy).toMatch(/putStalePayload_\(out, cacheVariant\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7.4 — ตัดไบต์ออกจากเส้นทางที่วิ่งบ่อยที่สุด
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (วัดจริง 5 ส.ค. 2026 หลัง Phase 7.3 deploy): executions ฝั่ง GAS เหลือ 2-3.6 วิ ทุกอัน
// แต่ browser ยังได้ HTTP 404 ที่ 24-28 วิ 5 จาก 15 อัน · `action=ping` (คำตอบ 0KB) ยิงพร้อมกัน
// 15 อันเท่ากันกลับผ่านครบ → **คอขวดที่เหลือคือจำนวนไบต์ ไม่ใช่จำนวนคนพร้อมกัน**
// payload 4.2MB × 15 = 63MB ผ่านท่อเดียวที่ ~2.3MB/วิ ≈ 27 วิ = นานเกินอายุลิงก์ดาวน์โหลด
//
// เทสต์ชุดนี้คุม "ของที่ถอยกลับแล้วไม่มี error ให้เห็น" เหมือนเดิม:
//   1. poll ทุก 30 วิ กลับไปดึง payload ทั้งก้อน → กิน 500MB/ชม./เครื่อง เงียบ ๆ
//   2. ก้อนเบาสลับลำดับคอลัมน์ → เลขสต็อกเพี้ยนโดยไม่มีอะไรฟ้อง
//   3. ลืมล้าง cache ก้อนเบา → เพื่อนบันทึกแล้วเราไม่เห็นในแท็บที่ตั้งใจให้เห็นสด
describe('Phase 7.4 — ก้อนเบา stocklite', () => {
  const STOCKLITE = grab(/function stockLiteHandler_\(\) \{[\s\S]*?\n\}/);

  it('อ่าน cache ก่อนแตะชีตเสมอ', () => {
    // ไม่มี cache = 15 เครื่องที่ poll พร้อมกันสั่งอ่านชีตพร้อมกัน 15 ครั้งทุก 30 วิ
    const beforeSheets = STOCKLITE.slice(0, STOCKLITE.indexOf('readQtyByLocation_'));
    expect(beforeSheets).toContain('_readChunked_');
    expect(beforeSheets).toMatch(/if \(cached\.str\) return/);
  });

  it('อ่านแค่ 2 ชีต (สต็อก + จำนวนหน้าร้าน) ไม่ใช่ buildFullData_', () => {
    // เผลอเรียก buildFullData_ = ก้อนเบาแพงเท่าก้อนหนัก แค่ส่งกลับน้อยลง (แย่ที่สุดของสองโลก)
    expect(STOCKLITE).not.toContain('buildFullData_');
    expect(STOCKLITE).toContain('readQtyByLocation_');
    expect(STOCKLITE).toContain('readFrontStoreCheckedQty_');
  });

  it('ลำดับคอลัมน์ในแต่ละแถวต้องตรงกับที่ฝั่ง client อ่าน', () => {
    // client อ่านตาม **ตำแหน่ง** (row[1]=หน้าร้าน, row[2]=คลัง) ไม่ใช่ชื่อคีย์
    // สลับสองตัวนี้ = ของในคลังไปโผล่เป็นของหน้าร้านทั้งระบบ โดยไม่มี error ให้เห็นเลย
    expect(STOCKLITE).toMatch(/skuU, loc\.qtyStore, loc\.qtyWH/);
  });

  it('ส่งเป็น array ไม่ใช่ object (ชื่อคีย์ซ้ำทุกแถวคือส่วนที่ใหญ่ที่สุด)', () => {
    expect(STOCKLITE).toMatch(/items\.push\(\[/);
  });

  it('แยก "ยังไม่เคยเช็ค" (null) ออกจาก "เช็คแล้วได้ 0"', () => {
    // ส่ง 0 แทน null = หน้าเช็คหน้าร้านจะคิดว่าเช็คไปแล้วทั้งร้าน คิว "ควรเช็คก่อน" ว่างเปล่า
    expect(STOCKLITE).toMatch(/fs \? fs\.qty : null/);
  });

  it('invalidateCache_ ล้าง cache ก้อนเบาด้วย (เพื่อนบันทึกแล้วต้องเห็นทันที)', () => {
    const M = makeCacheModule();
    M._writeChunked_('{"ok":true}', M._STOCKLITE_KEY_COUNT, M._STOCKLITE_KEY_PART, M._STOCKLITE_TTL_SEC);
    expect(M._readChunked_(M._STOCKLITE_KEY_COUNT, M._STOCKLITE_KEY_PART).str).toBe('{"ok":true}');
    M.invalidateCache_(true);
    expect(M._readChunked_(M._STOCKLITE_KEY_COUNT, M._STOCKLITE_KEY_PART).str).toBe(null);
  });

  it('ล้างก้อนเบาแล้วชั้นสำรองต้องยังอยู่ (ห้ามลามไปโดนของ Phase 7.3)', () => {
    const M = makeCacheModule();
    M.putStalePayload_('{"v":"full"}', 'full');
    M._writeChunked_('{"ok":true}', M._STOCKLITE_KEY_COUNT, M._STOCKLITE_KEY_PART, M._STOCKLITE_TTL_SEC);
    M.invalidateCache_(true);
    expect(M.readStalePayload_('full').str).toBe('{"v":"full"}');
  });

  it('TTL สั้นกว่าชั้นสด — ก้อนนี้ถูก poll ถี่กว่ามาก', () => {
    const M = makeCacheModule();
    expect(M._STOCKLITE_TTL_SEC).toBeLessThan(M._CACHE_TTL_SEC);
  });

  it('doGet ตอบ ver/stocklite ก่อนเข้าเส้นทาง payload หนัก', () => {
    // ตกไปอยู่หลังเส้นทาง payload = ก้อนเบาต้องรอ build 10 วิ ซึ่งทำลายเหตุผลที่มีมันอยู่
    const iVer   = DOGET.indexOf("action === 'ver'");
    const iLite  = DOGET.indexOf("action === 'stocklite'");
    const iHeavy = DOGET.indexOf('buildFullData_()');
    expect(iVer).toBeGreaterThan(-1);
    expect(iLite).toBeGreaterThan(-1);
    expect(iVer).toBeLessThan(iHeavy);
    expect(iLite).toBeLessThan(iHeavy);
  });

  it('action=ver ต้องไม่แตะชีตเลย (ไม่งั้นตัวตรวจแพงกว่าของที่ตรวจ)', () => {
    const verBlock = DOGET.slice(iOf(DOGET, "action === 'ver'"), iOf(DOGET, "action === 'stocklite'"));
    expect(verBlock).toContain('getSheetLastModified_()');
    expect(verBlock).not.toContain('SpreadsheetApp');
    expect(verBlock).not.toContain('buildFullData_');
  });
});

function iOf(s, needle) { return s.indexOf(needle); }

describe('Phase 7.4 — ฝั่ง frontend (จุดที่ถอยกลับแล้วไม่มีอะไรฟ้อง)', () => {
  const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
  const LITE = APP.slice(APP.indexOf('const fetchStockLite'), APP.indexOf('const fetchOrdersOnly'));

  it('poll ของแท็บนับสต็อก/เช็คหน้าร้านใช้ก้อนเบา ไม่ใช่ payload ทั้งก้อน', () => {
    // ถอยกลับไป fetchFromSheet = เครื่องที่จอดหน้าร้านทั้งวันกลับไปกิน ~500MB/ชม.
    // โดยที่ทุกอย่างยังทำงานถูกต้อง 100% — ไม่มีทางรู้ได้เลยถ้าไม่มีเทสต์ข้อนี้
    const pollBlock = APP.slice(APP.indexOf('const LIVE_TABS'));
    const poll = pollBlock.slice(0, pollBlock.indexOf('}, [tab, role'));
    expect(poll).toContain('fetchStockLite()');
    expect(poll).not.toContain('fetchFromSheet()');
  });

  it('ก้อนเบาคำนวณ qty/isOOS ใหม่ทุกครั้งที่แตะจำนวน (บั๊ก WL)', () => {
    // เขียนทับแค่ qtyStore/qtyWH แล้วปล่อย qty เดิม = สินค้าที่มีของจริงโชว์ "หมด" ทั้งระบบ
    // เคยเกิดจริง ก.ค. 2026 (WL00002 มี 41+240 แต่หน้าเว็บขึ้นหมด) และไม่มี error ให้เห็นเลย
    expect(LITE).toMatch(/qty:\s*total/);
    expect(LITE).toMatch(/isOOS:\s*total <= 0/);
    expect(LITE).toMatch(/isOversold:\s*total < 0/);
    expect(LITE).toMatch(/qtyStatus:\s*total < 0/);
  });

  it('ก้อนเบาอ่านคอลัมน์ตามตำแหน่งเดียวกับที่ GAS ส่ง', () => {
    expect(LITE).toMatch(/qtyStore\s*=\s*Number\(row\[1\]\)/);
    expect(LITE).toMatch(/qtyWH\s*=\s*Number\(row\[2\]\)/);
  });

  it('ก้อนเบาไม่เขียน localStorage (เขียนหลายเมกะทุก 30 วิ = เครื่องกระตุก)', () => {
    // เช็ค "การเรียก" ไม่ใช่แค่ชื่อ — คอมเมนต์ในโค้ดอธิบายเหตุผลไว้ จึงมีคำนี้อยู่โดยตั้งใจ
    expect(LITE).not.toMatch(/saveToStorage\s*\(/);
  });

  it('กดปุ่ม Sync เอง (force) ต้องข้ามตัวตรวจ ver เสมอ', () => {
    // แก้ชีตด้วยมือใน Google Sheets **ไม่ขยับ `dmj_last_write_ts`** → ver จะตอบว่า "ไม่เปลี่ยน"
    // ถ้าเชื่อตอนผู้ใช้กด Sync = ปุ่มดูเหมือนพัง ทั้งที่เขาแก้ข้อมูลมาแล้วจริง ๆ
    expect(APP).toMatch(/const verGate = \(!force &&/);
  });

  it('ใบรับรอง ver ผูกกับ role และมีเพดานอายุ', () => {
    // ไม่ผูก role = สลับ role แล้วได้ก้อนที่ขาดข้อมูลของ role ใหม่ (payload ตัดตาม role)
    // ไม่มีเพดานอายุ = คนที่แก้ชีตด้วยมือจะไม่เห็นผลตลอดไปจนกว่าจะกด Sync
    const fn = APP.slice(APP.indexOf('function checkDataUnchanged'), APP.indexOf('function saveToStorage'));
    expect(fn).toMatch(/stamp\.role \|\| ""\) !== \(role \|\| ""\)/);
    expect(fn).toMatch(/VER_MAX_SKIP_MS/);
    expect(fn).toMatch(/\.catch\(\(\) => false\)/);   // ตอบไม่ได้ = ไปโหลดจริง ห้ามเดาว่าไม่เปลี่ยน
  });


  it('ถือของสำรองอยู่ (stale) ต้องข้ามตัวตรวจ ver — ไม่งั้นแถบเหลืองค้างถาวร', () => {
    // ของสำรองถูกเสิร์ฟตอน TTL หมดได้ด้วย (ไม่มีใครเขียน) → `lastModified` ของมัน = ts ปัจจุบันพอดี
    // → ver ตอบ "ไม่เปลี่ยน" → ข้ามการโหลด → setStaleAt(0) ไม่ถูกเรียก → แถบเหลืองไม่มีวันหาย
    expect(APP).toMatch(/const verGate = \(!force && !prefetched && !staleRef\.current && hasDataRef\.current\)/);
    expect(APP).toMatch(/staleRef\.current = staleAt/);
  });

  it('อัปโหลดไฟล์ทับต้องทิ้งใบรับรอง ver', () => {
    // ไม่ทิ้ง = ts ยังตรงกับ server → รอบถัดไปข้ามการโหลด → ข้อมูลจากไฟล์ค้างอยู่
    // พร้อมป้าย "ซิงค์แล้ว" ทั้งที่ไม่เคยดึงจากชีตเลย
    const upload = APP.slice(APP.indexOf('const handleDataLoaded'), APP.indexOf('setTab("overview")'));
    expect(upload).toMatch(/clearVerStamp\(\)/);
  });


  it('GAS โค้ดเก่าที่ไม่รู้จัก action=ver → เลิกถามชั่วคราว (ไม่จ่ายไบต์ซ้ำซ้อนยาว)', () => {
    // โค้ดเก่าจะคืน payload เต็มก้อนแทนคำตอบจิ๋ว = จ่าย 4.2MB ฟรีแล้วยังต้องโหลดซ้ำอีกรอบ
    // Cloudflare กับ GAS deploy คนละจังหวะ และถ้า Actions พังจะค้างสถานะนี้ยาว
    const fn = APP.slice(APP.indexOf('function checkDataUnchanged'), APP.indexOf('function saveToStorage'));
    expect(fn).toMatch(/VER_UNSUPPORTED_KEY/);
    expect(fn).toMatch(/if \(!v \|\| !v\.ok\)/);
    // "เน็ตพัง" ต้องไม่ถูกตีตราว่าเป็นเรื่องเวอร์ชัน — .catch ห้ามเขียนธงนี้
    const catchPart = fn.slice(fn.indexOf('.catch('));
    expect(catchPart).not.toMatch(/VER_UNSUPPORTED_KEY/);
  });

  it('เขียนใบรับรองพร้อม role ทุกครั้งที่โหลด payload สำเร็จ', () => {
    expect(APP).toMatch(/writeVerStamp\(d && d\.lastModified, role\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7.5 — ตัดวงจรที่แอป "ทำร้ายตัวเอง" ตอนท่อเต็ม
//
// อาการจริง (5 ส.ค. 2026, เครื่องผู้ใช้จริงไม่ใช่ loadtest): จอค้างที่ "กำลังโหลดข้อมูล
// Dashboard…" · DevTools เห็น `googleusercontent/macros/echo` **404 สองอัน ที่ 11.9 และ
// 14.7 วิ** แล้วยังมีอีกอันค้าง pending — คือแอปดาวน์โหลด payload หลายเมกะ **ซ้ำแล้วซ้ำอีก**
// ในท่อที่เต็มอยู่แล้ว ทุกครั้งที่โดนตัดก็ยิงใหม่ทันที = เติมเชื้อให้ตัวเอง
//
// เทสต์ชุดนี้คุม 4 ข้อที่ถอยกลับแล้ว **ทุกอย่างยังทำงานถูกต้อง 100%** ไม่มี error ให้เห็น
// แต่กลับไปพังแบบเดิมทันทีเมื่อคนใช้พร้อมกันเยอะ
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.5 — ไม่ทำให้ท่อที่เต็มอยู่แล้วเต็มกว่าเดิม', () => {
  const APP  = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
  const HTML = readFileSync(join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');
  const FETCH = APP.slice(APP.indexOf('const fetchFromSheet'), APP.indexOf('const fetchStockLite'));

  it('prefetch ที่ role ไม่ตรง ต้องถูก "ยกเลิก" ไม่ใช่แค่ทิ้งตัวแปร', () => {
    // ตั้ง window._dataPrefetch = null เฉย ๆ ตัดแค่ "ตัวชี้" — ก้อนจริงยังไหลต่อจนจบ
    // กินท่อเดียวกับก้อนใหม่ที่กำลังยิง = โหลดหน้าเดียวจ่ายสองเท่า ซึ่งเป็นตัวเร่ง 404 โดยตรง
    // และมองไม่เห็นเลยจาก UI เพราะข้อมูลที่ได้ถูกต้องทุกประการ
    expect(HTML).toMatch(/window\._dataPrefetchAbort\s*=\s*function/);
    expect(HTML).toMatch(/ctl && ctl\.abort\(\)/);
    const mismatch = FETCH.slice(FETCH.indexOf('_dataPrefetchRole'));
    expect(mismatch).toMatch(/else\s*\{[^}]*_dataPrefetchAbort/);
  });

  it('prefetch ไม่ใช้ r.json() ตรง ๆ (GAS ตอบ HTML ได้)', () => {
    const pre = HTML.slice(HTML.indexOf('window._prefetchData'), HTML.indexOf('window._jsxPre'));
    expect(pre).not.toMatch(/return r\.json\(\)/);
    expect(pre).toMatch(/dmj_last_backend_error/);   // เก็บต้นฉบับไว้ให้เจ้าของไล่ย้อนได้
  });

  it('payload หลักอ่านคำตอบผ่าน dmjJson — ผู้ใช้ต้องไม่เห็น SyntaxError ดิบ', () => {
    // บทเรียนข้อ 13: `Unexpected token '<', "<!DOCTYPE "…` คือสิ่งที่พนักงานหน้าร้านเคยเห็นจริง
    expect(FETCH).toMatch(/dmjJson\s*\(\s*r\s*\)/);
    expect(FETCH).not.toMatch(/\.then\(r => r\.json\(\)\)/);
    expect(FETCH).toMatch(/dmjErrText/);
  });

  it('เจอ HTML แล้วถอยนานกว่า + สุ่มเวลา + ลองน้อยครั้งกว่าเน็ตพัง', () => {
    // เหตุผล: "ตอบเป็น HTML" = ไปถึง Google แล้วแต่ก้อนถูกตัดกลางคัน (ท่อเต็ม)
    // ยิงซ้ำทันทีคือเติมอีก 4 เมกะเข้าไปในท่อที่เต็ม · ถอยเท่ากันทุกเครื่อง = กลับมาชนกันอีก
    expect(FETCH).toMatch(/dmjKind === "badjson"/);
    expect(FETCH).toMatch(/Math\.random\(\)/);
    expect(FETCH).toMatch(/isBadJson \? Math\.max\(0, retryLeft - 2\) : retryLeft - 1/);
  });

  it('จำนวนครั้งที่เหลือห้ามติดลบ (ติดลบ = ลองใหม่ไม่รู้จบ)', () => {
    // `fetchFromSheet` normalize ค่าที่ไม่ใช่ตัวเลข>=0 กลับเป็น PAYLOAD_MAX_RETRY
    // → ส่ง -1 เข้าไปต้องไม่กลายเป็นลบ = วนยิง payload หลายเมกะไม่มีวันหยุด
    // **clamp ด้วย Math.min** เพราะจุดเรียก "ลองใหม่" หลายที่ยังส่งเลขเดิม (3) มาตรง ๆ
    expect(FETCH).toMatch(/Math\.min\(retryLeft, PAYLOAD_MAX_RETRY\) : PAYLOAD_MAX_RETRY/);
    const MAX = Number(/const PAYLOAD_MAX_RETRY = (\d+)/.exec(SRC_APP)[1]);
    const nextLeft = (isBadJson, retryLeft) =>
      isBadJson ? Math.max(0, retryLeft - 2) : retryLeft - 1;
    for (const bad of [true, false]) {
      for (let r = MAX; r > 0; r--) expect(nextLeft(bad, r)).toBeGreaterThanOrEqual(0);
    }
    // ต้องจบจริงและ **ยิงน้อยลงกว่าเดิม** (เดิม 4 ครั้ง) — แต่ละครั้งราคาเป็นเมกะไบต์
    const attempts = (bad) => { let n = 1, r = MAX; while (r > 0) { r = nextLeft(bad, r); n++; } return n; };
    expect(attempts(false)).toBe(3);
    expect(attempts(false)).toBeLessThan(4);
    expect(attempts(true)).toBeLessThanOrEqual(attempts(false));
  });

  it('เพดานเวลาของ retry ต้องยาวกว่าคิว build ฝั่ง server (ไม่งั้นลองใหม่ไม่มีวันสำเร็จ)', () => {
    // หลักฐาน (docs/REVIEW-ARCHITECTURE-FINAL-2026-08-26.md §2.2): ของเดิม retry ตั้ง 20s
    // แต่ `_BUILD_LOCK_WAIT_MS` ฝั่ง GAS = 25s → คำขอที่กำลังต่อคิวรอ build อยู่ถูกตัดทิ้ง
    // "ก่อน" คิวจะปล่อยของเสมอ = ยิงกี่ครั้งก็ล้มเหลว และ GAS ไม่ยกเลิก execution ตาม
    // client abort → คำขอที่ถูกตัดยังกินสล็อตจนจบ = ยิ่งลองยิ่งถ่วงระบบ
    const retryMs = Number(/const PAYLOAD_TIMEOUT_RETRY_MS = (\d+)/.exec(SRC_APP)[1]);
    const firstMs = Number(/const PAYLOAD_TIMEOUT_FIRST_MS = (\d+)/.exec(SRC_APP)[1]);
    const waitMs  = Number(/const _BUILD_LOCK_WAIT_MS = (\d+)/.exec(SRC)[1]);
    expect(retryMs).toBeGreaterThan(waitMs);
    expect(firstMs).toBeGreaterThan(waitMs);
  });

  it('ไม่ส่ง locationRaw ที่ไม่มีใครอ่าน (ไบต์เปล่าคูณจำนวน SKU ทุกตัว)', () => {
    expect(SRC).not.toMatch(/locationRaw:/);
    const jsx = ['app.jsx', 'ui.jsx', 'views-main.jsx', 'views-analytics.jsx']
      .map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n');
    expect(jsx).not.toMatch(/locationRaw/);   // ถ้าวันหลังมีคนเริ่มใช้ ต้องรู้ตัวว่าไม่มีค่าส่งมาแล้ว
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7.5b — `fetch` ไม่มี timeout ในตัว
//
// อาการจริง (5 ส.ค. 2026): DevTools ของเครื่องผู้ใช้ เห็นคำขอ **ค้าง pending หลังเปิดหน้าไป
// 7.7 นาที** · คำขอที่ไปถึง Google แล้วแต่ไม่มีคำตอบกลับ (ลิงก์ตาย/เน็ตร้านหลุดกลางคัน)
// จะไม่ resolve และไม่ reject **ตลอดกาล** → ปุ่มหมุนไม่จบ ไม่ขึ้นทั้งสำเร็จและล้มเหลว
// พนักงานกดซ้ำก็ไม่ได้ ไม่รู้ว่าต้องทำอะไรต่อ — แย่กว่าขึ้น error
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 7.5b — dmjFetch ต้องมีเพดานเวลาเสมอ', () => {
  const UI = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');

  // เอาฟังก์ชันจริงมารัน ไม่ copy (หลักเดียวกับ auth.test.js)
  function loadDmjFetch(fetchImpl) {
    const src = UI.slice(UI.indexOf('function dmjFetch'), UI.indexOf('// ────────────── dmjJson'));
    const timers = [];
    const sandbox = {
      fetch: fetchImpl,
      localStorage: { getItem: () => null, setItem: () => {} },
      AbortController: class { constructor() { this.signal = { aborted: false }; }
                              abort() { this.signal.aborted = true; if (this.signal.onabort) this.signal.onabort(); } },
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    };
    const make = new Function(...Object.keys(sandbox), src + '; return dmjFetch;');
    return { dmjFetch: make(...Object.values(sandbox)), timers };
  }

  it('คำขอที่ไม่มีวันตอบ ต้องถูกตัดด้วย AbortController ไม่ค้างตลอดกาล', async () => {
    let seenSignal = null;
    const { dmjFetch, timers } = loadDmjFetch((u, o) => {
      seenSignal = o && o.signal;
      return new Promise(() => {});         // ไม่ resolve ไม่ reject — เหมือนของจริงที่ค้าง
    });
    dmjFetch('https://example.test/exec');
    expect(seenSignal).toBeTruthy();        // ต้องแนบ signal ให้ fetch จริง ๆ
    expect(timers.length).toBe(1);
    expect(timers[0].ms).toBeGreaterThan(0);
    expect(seenSignal.aborted).toBe(false);
    timers[0].fn();                          // เวลาครบ
    expect(seenSignal.aborted).toBe(true);   // ← หลุดข้อนี้ = กลับไปค้างข้ามนาทีเหมือนเดิม
  });

  it('ตัวเรียกที่คุมเวลาเองอยู่แล้ว (ส่ง signal มา) ต้องไม่ถูกแทรกแซง', async () => {
    const mine = { aborted: false, mine: true };
    let seen = null;
    const { dmjFetch, timers } = loadDmjFetch((u, o) => { seen = o.signal; return Promise.resolve('ok'); });
    await dmjFetch('u', { signal: mine });
    expect(seen).toBe(mine);                 // ห้ามเขียนทับ signal ของตัวเรียก
    expect(timers.length).toBe(0);
  });

  it('ยกเลิกตัวจับเวลาเมื่อคำขอจบแล้ว (ไม่ปล่อย timer ค้าง)', async () => {
    const { dmjFetch, timers } = loadDmjFetch(() => Promise.resolve('ok'));
    await dmjFetch('u');
    expect(timers[0].cleared).toBe(true);
  });

  it('ปรับเพดานเองได้ผ่าน dmjTimeoutMs', async () => {
    const { dmjFetch, timers } = loadDmjFetch(() => new Promise(() => {}));
    dmjFetch('u', { dmjTimeoutMs: 1234 });
    expect(timers[0].ms).toBe(1234);
  });

  it('การดึงออเดอร์อ่านคำตอบผ่าน dmjJson ด้วย (GAS ตอบ HTML ได้ทุกเส้นทาง)', () => {
    const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
    const orders = APP.slice(APP.indexOf('const fetchOrdersOnly'), APP.indexOf('const fetchOrdersOnly') + 900);
    expect(orders).toMatch(/dmjJson\s*\(\s*r\s*\)/);
  });
});

describe('Phase 7.5b — จุดที่ยิง GAS เองโดยไม่ผ่าน dmjFetch', () => {
  it('attPost (ลงเวลา+อัปโหลดรูป) ต้องมีเพดานเวลา + อ่านคำตอบให้ปลอดภัย', () => {
    // ลงเวลาแนบรูปมาด้วย = หนักและช้าที่สุดใน action ทั้งหมด · ถ้าค้างตลอดกาล พนักงานจะเห็น
    // ปุ่มหมุนไม่จบ ไม่รู้ว่าลงเวลาสำเร็จหรือยัง แล้วกดซ้ำก็ไม่ได้ (ต้นทุนจริงคือเงินเดือนคนนั้น)
    const ATT = readFileSync(join(ROOT, 'views-attendance.jsx'), 'utf8');
    const fn = ATT.slice(ATT.indexOf('async function attPost'), ATT.indexOf('const ATT_TYPE_META'));
    expect(fn).toMatch(/dmjFetch/);
    expect(fn).toMatch(/dmjTimeoutMs/);
    expect(fn).toMatch(/dmjJson/);
    expect(fn).not.toMatch(/return res\.json\(\);/);
  });
});
