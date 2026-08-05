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
              invalidateCache_, payloadCacheVariant_,
              _CACHE_TTL_SEC, _STALE_TTL_SEC };`,
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
    expect(buildBlock).toMatch(/PAYLOAD_VARIANTS_\.forEach[\s\S]*?putStalePayload_\(s, cv\)/);
  });

  it('เส้นทาง client เก่า (ไม่ส่ง pv) ก็เติมชั้นสำรองด้วย', () => {
    const legacy = DOGET.slice(DOGET.indexOf('expandMonthlyForLegacy_(data)'));
    expect(legacy).toMatch(/putStalePayload_\(out, cacheVariant\)/);
  });
});
