// tests/stockcount-autosave.test.js — autosave หน้านับสต็อกคลังต้องทำงานทุกโหมด "ทุกวิธีกรอก"
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของแจ้ง (ส.ค. 2026): นับของปกติ autosave ได้ แต่พอนับของที่มีคำขอเช็คตามซัพพลายเออร์
// autosave ไม่ทำงาน · ต้นเหตุ: autosave (`handleSave`) บันทึกเฉพาะ SKU ที่อยู่ใน
// `localEditsRef` (กันทับค่าที่ merge มาจากเครื่องอื่น) → ทุกจุดที่ผู้ใช้กรอกจำนวน "ต้อง"
// `localEditsRef.current.add(sku)` ก่อนเสมอ
//
// แต่ `CalcPadModal.onConfirm` ในโหมดซัพพลายเออร์ (เครื่องคิดเลข) ลืม add → จำนวนที่กรอกผ่าน
// เครื่องคิดเลขถูก autosave กรองทิ้ง → ค้างที่ "รอบันทึก..." ตลอด ไม่บันทึกจริง ไม่มี error ให้เห็น
// (ปุ่ม 💾 แมนนวลใช้ `handleSaveSupplier` ที่ไม่กรองด้วย localEditsRef เลยยังทำงาน — จึงดูเหมือน
//  "บันทึกได้แต่ autosave พัง")
//
// เทสต์นี้สแกน source จริงของ StockCountView: ทุกจุดที่ commit ค่าจากเครื่องคิดเลข
// (`o[calcPad.sku] = qty`) ต้องมี `localEditsRef.current.add(calcPad.sku)` นำหน้าเสมอ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANALYTICS = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

// ตัดเอาเฉพาะตัวฟังก์ชัน StockCountView (ถึง top-level function ตัวถัดไป)
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('หาฟังก์ชันในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + name);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}

const SCV = grabFn(VANALYTICS, 'StockCountView');

describe('StockCountView autosave — ทุกวิธีกรอกจำนวนต้องลง localEditsRef', () => {
  it('มีจุด commit เครื่องคิดเลข (o[calcPad.sku]=qty) อยู่จริงในหลายโหมด', () => {
    // signature ทนช่องว่าง: `o[calcPad.sku]` ตามด้วย `=` แล้ว `qty`
    const commits = SCV.match(/o\[calcPad\.sku\]\s*=\s*qty/g) || [];
    // อย่างน้อยต้องมีในโหมดล็อค + นับก่อนขึ้นชั้น + ซัพพลายเออร์
    expect(commits.length).toBeGreaterThanOrEqual(3);
  });

  it('ทุกจุด commit เครื่องคิดเลขต้อง add เข้า localEditsRef ก่อน setCheckedQtys', () => {
    const sig = /o\[calcPad\.sku\]\s*=\s*qty/g;
    let m;
    let checked = 0;
    while ((m = sig.exec(SCV)) !== null) {
      // มองย้อนหลัง ~260 ตัวอักษรจากจุด commit — ต้องเจอ localEditsRef.current.add(calcPad.sku)
      const before = SCV.slice(Math.max(0, m.index - 260), m.index);
      expect(
        /localEditsRef\.current\.add\(\s*calcPad\.sku\s*\)/.test(before),
        `commit เครื่องคิดเลขที่ index ~${m.index} ไม่ได้ add เข้า localEditsRef ก่อน → ` +
        `autosave จะกรองทิ้ง จำนวนที่กรอกจะไม่ถูกบันทึก (ค้าง "รอบันทึก...")`
      ).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('ปุ่ม +/- (adjustQty) ก็ยัง add เข้า localEditsRef', () => {
    const adjust = SCV.slice(SCV.indexOf('const adjustQty'), SCV.indexOf('const adjustQty') + 500);
    expect(/localEditsRef\.current\.add\(\s*sku\s*\)/.test(adjust)).toBe(true);
  });

  it('autosave effect ยังครอบทั้งโหมดล็อคและซัพพลายเออร์ (เงื่อนไข selLockKey/selSupplier)', () => {
    // กันการถอยกลับไปกั้น autosave ไว้เฉพาะโหมดล็อค
    expect(SCV).toMatch(/if\s*\(\s*!selLockKey\s*&&\s*!selSupplier\s*\)\s*return/);
  });
});
