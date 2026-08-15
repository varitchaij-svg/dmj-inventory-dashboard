// tests/zort-deleted.test.js — เคลียร์สินค้าที่ลบจาก ZORT ออกจากเว็บ (soft-delete)
// ─────────────────────────────────────────────────────────────────────────────
// เว็บอ่านสินค้าจากชีต ไม่ได้อ่านสด ZORT → สินค้าที่ลบใน ZORT ค้างโชว์ตลอด
// ตัวนี้เทียบ SKU ในชีตเรากับ ZORT แล้ว "ซ่อน" ตัวที่ ZORT ไม่มีแล้ว (กู้กลับได้)
//
// eval ฟังก์ชันจริงจาก .gs (ไม่ copy — เหมือน auth.test.js) + meta-test คุมด่านความปลอดภัย
// ที่ "พังแล้วเงียบ": ดึง ZORT ไม่ครบต้อง abort · เกินเพดาน % ต้อง abort · readProducts_ กรองซ่อน
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(re, label) {
  const m = GS.match(re);
  if (!m) throw new Error('หาโค้ดใน .gs ไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

const F_CORE = grab(/function zortDeletedSkusCore_\(ourSkuMap, zortSet, hiddenSet\) \{[\s\S]*?\n\}/, 'zortDeletedSkusCore_');
// eslint-disable-next-line no-new-func
const { zortDeletedSkusCore_ } = new Function(F_CORE + '\nreturn { zortDeletedSkusCore_ };')();

describe('zortDeletedSkusCore_ — หา SKU ที่ ZORT ลบแล้ว', () => {
  const our = { 'BK001': 'กระเช้า1', 'BK002': 'กระเช้า2', 'R01025': 'กุหลาบ', 'OLD99': 'ของเก่า' };

  it('คืนเฉพาะตัวที่ ZORT ไม่มี', () => {
    const zort = { 'BK001': true, 'BK002': true, 'R01025': true };  // ไม่มี OLD99
    const del = zortDeletedSkusCore_(our, zort, {});
    expect(del.map(d => d.sku)).toEqual(['OLD99']);
    expect(del[0].name).toBe('ของเก่า');
  });

  it('ZORT มีครบ → ไม่มีอะไรถูกลบ', () => {
    const zort = { 'BK001': true, 'BK002': true, 'R01025': true, 'OLD99': true };
    expect(zortDeletedSkusCore_(our, zort, {})).toEqual([]);
  });

  it('ตัวที่ซ่อนไปแล้ว → ไม่นับซ้ำ', () => {
    const zort = { 'BK001': true };   // BK002, R01025, OLD99 หายจาก ZORT
    const hidden = { 'BK002': true, 'R01025': true };
    const del = zortDeletedSkusCore_(our, zort, hidden);
    expect(del.map(d => d.sku)).toEqual(['OLD99']);
  });

  it('เทียบแบบไม่สนตัวพิมพ์เล็กใหญ่ (uppercase ทั้งคู่)', () => {
    const del = zortDeletedSkusCore_({ 'bk001': 'x' }, { 'BK001': true }, {});
    expect(del).toEqual([]);   // bk001 = BK001 → ZORT มี
  });

  it('input ว่าง/null → ไม่พัง', () => {
    expect(zortDeletedSkusCore_(null, null, null)).toEqual([]);
    expect(zortDeletedSkusCore_({}, {}, {})).toEqual([]);
  });
});

// ── meta-test: ด่านความปลอดภัยที่ "พังแล้วเงียบ" ต้องยังอยู่ ──
describe('meta: ด่านกันซ่อนผิด', () => {
  it('zortAllSkusComplete_ abort (ok:false) เมื่อดึงหน้าใดไม่สำเร็จ — ไม่คืน partial', () => {
    const fn = grab(/function zortAllSkusComplete_\(\) \{[\s\S]*?\n\}/, 'zortAllSkusComplete_');
    expect(fn).toMatch(/ok:\s*false/);
    expect(fn).toMatch(/if \(!json \|\| !json\.list\)[\s\S]*return \{ ok: false/);
  });

  it('hideDeletedFromZort ยกเลิกเมื่อดึง ZORT ไม่ครบ (z.ok เป็นเท็จ)', () => {
    const fn = grab(/function hideDeletedFromZort\(\) \{[\s\S]*?\n\}/, 'hideDeletedFromZort');
    expect(fn).toMatch(/if \(!z\.ok\)[\s\S]*return/);
  });

  it('hideDeletedFromZort มีเพดาน HIDE_SAFETY_FRACTION กันซ่อนทั้งร้าน', () => {
    const fn = grab(/function hideDeletedFromZort\(\) \{[\s\S]*?\n\}/, 'hideDeletedFromZort');
    expect(fn).toMatch(/frac > HIDE_SAFETY_FRACTION/);
    expect(GS).toMatch(/const HIDE_SAFETY_FRACTION\s*=\s*0\.4/);
  });

  it('hideDeletedFromZort จับ LockService + invalidateCache_ หลังเขียน', () => {
    const fn = grab(/function hideDeletedFromZort\(\) \{[\s\S]*?\n\}/, 'hideDeletedFromZort');
    expect(fn).toMatch(/LockService\.getScriptLock/);
    expect(fn).toMatch(/invalidateCache_\(\)/);
  });

  it('readProducts_ กรอง SKU ที่ซ่อนออกทั้ง 2 ลูป (main + SELF-HEAL)', () => {
    const fn = grab(/function readProducts_\(stockRowsOpt, metaRowsOpt\) \{[\s\S]*?\n  return out;\n\}/, 'readProducts_');
    expect(fn).toMatch(/const hidden = getHiddenSkuSet_\(\)/);
    // ต้องมี hidden[...] continue อย่างน้อย 2 จุด (main loop + self-heal)
    const hits = (fn.match(/hidden\[sku\.toUpperCase\(\)\]\)\s*continue/g) || []).length;
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it('เครื่องมือกู้กลับครบ (unhideProduct / clearHiddenProducts) — soft-delete ต้องกู้ได้', () => {
    expect(GS).toMatch(/function unhideProduct\(sku\)/);
    expect(GS).toMatch(/function clearHiddenProducts\(\)/);
    expect(GS).toMatch(/function previewZortDeletedProducts\(\)/);
  });

  it('ชื่อฟังก์ชันเครื่องมือไม่มี `_` ต่อท้าย (โผล่ใน GAS dropdown — บทเรียนข้อ 1)', () => {
    ['previewZortDeletedProducts', 'hideDeletedFromZort', 'listHiddenProducts',
     'unhideProduct', 'clearHiddenProducts'].forEach(name => {
      expect(GS).toMatch(new RegExp('function ' + name + '\\('));
    });
  });
});
