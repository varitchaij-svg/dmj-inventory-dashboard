// tests/stockcount-r1-merge.test.js — Write-reliability: R1 (changed-only entries) + recentCountedSkus merge
// ─────────────────────────────────────────────────────────────────────────────
// ครอบ 2 การแก้ที่ approve เฉพาะ REQUIRED scope (ดู verification "ปิดดีไซน์ R1 + merge"):
//   R1  (views-analytics.jsx): handleSave/handleConfirm/handleSavePreShelf ส่งเข้า confirmStockCount
//       เฉพาะ SKU ที่ qty !== savedQtys[sku] — เลิก re-push ค่าเดิมสะสมทุก auto-save (O(n²)/รอบนับ)
//   merge (appsscript_complete.gs): recentCountedSkus overwrite → read-merge-put ใน ScriptLock เดิม
//       (writer จุดเดียว → atomic ฟรี · หลายเครื่องนับพร้อมกัน guard ไม่หาย)
//
// **ไม่ copy โค้ด** — eval นิพจน์/บล็อกจริงจาก .jsx/.gs (หลักเดียวกับ auth.test.js / stampede.test.js)
// ถ้าต้นทาง drift เทสต์จะพังทันที ไม่เขียวลวง
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// R1 — changed-only predicate (eval นิพจน์จริงจาก .jsx)
// ═══════════════════════════════════════════════════════════════════════════
describe('R1 — confirmEntries ส่งเฉพาะ SKU ที่ qty !== savedQtys[sku]', () => {
  // นิพจน์จริงในต้นทาง: confirmAll.filter(e => e.qty !== savedQtys[e.sku])
  const ARROW = grab(VANA, /e => e\.qty !== savedQtys\[e\.sku\]/);
  // สร้าง predicate จากนิพจน์จริง (eval เห็น savedQtys จาก closure ในฟังก์ชันนี้)
  const makePred = (savedQtys) => eval('(' + ARROW + ')'); // eslint-disable-line no-eval

  const filterChanged = (list, savedQtys) => list.filter(makePred(savedQtys));

  it('ครั้งแรก (ยังไม่เคย save) — ส่งครบทุก SKU', () => {
    const entries = [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }, { sku: 'C', qty: 3 }];
    const out = filterChanged(entries, {});
    expect(out.map(e => e.sku)).toEqual(['A', 'B', 'C']);
  });

  it('หลัง save แล้วค่าไม่เปลี่ยน — ไม่ resend เลย', () => {
    const entries = [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }, { sku: 'C', qty: 3 }];
    const savedQtys = { A: 1, B: 2, C: 3 };
    expect(filterChanged(entries, savedQtys)).toEqual([]);
  });

  it('แก้ 1 SKU หลัง save — ส่งเฉพาะตัวที่เปลี่ยน', () => {
    const entries = [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }, { sku: 'C', qty: 9 }];
    const savedQtys = { A: 1, B: 2, C: 3 };
    const out = filterChanged(entries, savedQtys);
    expect(out.map(e => e.sku)).toEqual(['C']);
    expect(out[0].qty).toBe(9);
  });

  it('qty = 0 ครั้งแรก — ต้องส่ง (0 !== undefined)', () => {
    const out = filterChanged([{ sku: 'D', qty: 0 }], {});
    expect(out.map(e => e.sku)).toEqual(['D']);
  });

  it('qty = 0 ที่ save ไปแล้ว — ไม่ resend (0 !== 0 เป็น false)', () => {
    const out = filterChanged([{ sku: 'D', qty: 0 }], { D: 0 });
    expect(out).toEqual([]);
  });

  it('save ล้มเหลว (savedQtys ไม่ถูกตั้ง) — รอบถัดไปยังส่งซ้ำ', () => {
    // จำลอง: เคยพยายาม save A แต่ล้มเหลว → savedQtys ยังไม่มี A → ส่งต่อได้
    const out = filterChanged([{ sku: 'A', qty: 5 }], {});
    expect(out.map(e => e.sku)).toEqual(['A']);
  });
});

describe('R1 — meta: จุดเชื่อมต่อในต้นทางไม่ drift', () => {
  it('ทั้ง 3 handler กรองด้วย qty !== savedQtys[sku]', () => {
    const n = (VANA.match(/\.filter\(e => e\.qty !== savedQtys\[e\.sku\]\)/g) || []).length;
    expect(n, 'ต้องมี 3 จุด (handleSave/handleConfirm/handleSavePreShelf)').toBe(3);
  });

  it('confirmStockCount ทุก call site ยังส่ง arg confirmEntries/entries + sessionIdRef (ไม่ทำ session tracking พัง)', () => {
    const n = (VANA.match(/confirmStockCount\((?:confirmEntries|entries), sessionIdRef\.current\)/g) || []).length;
    expect(n).toBe(3);
  });

  it('ห้ามแตะ/ล้าง localEditsRef (merge-guard ของ stocklite) — ยังกรองด้วย .has(sku) และไม่มี .clear()', () => {
    expect(VANA).toMatch(/localEditsRef\.current\.has\(sku\)/);
    expect(VANA.includes('localEditsRef.current.clear()')).toBe(false);
  });

  it('session tracking นับจาก confirmAll/allEntries (ทั้งรอบ) ไม่ใช่เฉพาะที่เปลี่ยน', () => {
    // กันถอยกลับไปนับ sessionSkuSet จาก confirmEntries (ที่ R1 กรองแล้ว) = เวลานับเพี้ยน
    expect(VANA).toMatch(/confirmAll\.forEach\(e => sessionSkuSetRef\.current\.add/);
    expect(VANA).toMatch(/allEntries\.forEach\(e => sessionSkuSetRef\.current\.add/);
  });

  it('nFound ("เจอในล็อค") อิง confirmAll ไม่ใช่ confirmEntries ที่ถูกกรอง', () => {
    const n = (VANA.match(/const nFound = entries\.length - confirmAll\.length;/g) || []).length;
    expect(n, 'handleSave + handleConfirm').toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// merge — recentCountedSkus read-merge-put (eval บล็อกจริงจาก .gs)
// ═══════════════════════════════════════════════════════════════════════════
describe('recentCountedSkus — read-merge-put (eval บล็อกจริงจาก .gs)', () => {
  const MERGE = grab(SRC,
    /const _rcCache = CacheService\.getScriptCache\(\);[\s\S]*?_rcCache\.put\('recentCountedSkus', JSON\.stringify\(_rcPrev\), 1800\);/);

  // รันบล็อกจริงกับ CacheService ปลอม + countedSkuMap ที่กำหนด — share store ข้าม call ได้
  function runMerge(store, countedSkuMap) {
    let lastTtl = null;
    const CacheService = {
      getScriptCache: () => ({
        get: (k) => (k in store ? store[k] : null),
        put: (k, v, ttl) => { store[k] = v; lastTtl = ttl; },
      }),
    };
    // eslint-disable-next-line no-new-func
    new Function('CacheService', 'countedSkuMap', MERGE)(CacheService, countedSkuMap);
    return lastTtl;
  }

  it('Scenario A/C — call A={A} แล้ว call B={B} → guard มีครบ A+B (ไม่ overwrite)', () => {
    const store = {};
    runMerge(store, { A: 10 });
    runMerge(store, { B: 20 });
    expect(JSON.parse(store.recentCountedSkus)).toEqual({ A: 10, B: 20 });
  });

  it('Scenario B — call เดียวกัน SKU เดิม ค่าใหม่ชนะ (latest wins)', () => {
    const store = {};
    runMerge(store, { X: 1 });
    runMerge(store, { X: 5 });
    expect(JSON.parse(store.recentCountedSkus)).toEqual({ X: 5 });
  });

  it('Scenario D — frontend เก่า (ส่งทั้งชุด) + ใหม่ (เฉพาะเปลี่ยน) merge ได้ทั้งคู่', () => {
    const store = {};
    runMerge(store, { A: 1, B: 2, C: 3 });   // เก่า: ทั้งชุด
    runMerge(store, { C: 9 });               // ใหม่: เฉพาะที่เปลี่ยน
    expect(JSON.parse(store.recentCountedSkus)).toEqual({ A: 1, B: 2, C: 9 });
  });

  it('เริ่มจาก cache ว่าง/พัง — ไม่ throw, เขียนของใหม่ได้', () => {
    const store = { recentCountedSkus: 'not-json{' };
    expect(() => runMerge(store, { A: 1 })).not.toThrow();
    expect(JSON.parse(store.recentCountedSkus)).toEqual({ A: 1 });
  });

  it('คง TTL 1800 (ไม่เปลี่ยนในรอบนี้ตาม scope)', () => {
    const ttl = runMerge({}, { A: 1 });
    expect(ttl).toBe(1800);
  });
});

describe('recentCountedSkus — meta: writer เดียว + อยู่ใน ScriptLock', () => {
  it('มี writer จุดเดียว (put recentCountedSkus)', () => {
    const n = (SRC.match(/\.put\('recentCountedSkus'/g) || []).length;
    expect(n).toBe(1);
  });

  it('read-merge-put อยู่ใน confirmStockCount และ "ก่อน" lock.releaseLock() (ยังอยู่ในล็อก)', () => {
    const fn = grab(SRC, /function confirmStockCount\(ss, entries, clientLoadedAt, actor, sessionId\)[\s\S]*?\n\}/);
    const iPut     = fn.indexOf("_rcCache.put('recentCountedSkus'");
    const iRelease = fn.indexOf('lock.releaseLock()');
    expect(iPut).toBeGreaterThan(0);
    expect(iRelease).toBeGreaterThan(0);
    expect(iPut, 'merge-put ต้องอยู่ก่อน releaseLock (atomic ใต้ ScriptLock เดิม)').toBeLessThan(iRelease);
  });

  it('ZORT push ยังใช้ countedSkuMap (เฉพาะ call นี้) ไม่ push ชุด merge (กัน re-push ค่าเดิม)', () => {
    const fn = grab(SRC, /function confirmStockCount\(ss, entries, clientLoadedAt, actor, sessionId\)[\s\S]*?\n\}/);
    expect(fn).toMatch(/Object\.entries\(countedSkuMap\)\.map\(function\(\[sku, qty\]\)/);
  });
});
