// tests/qtyloc.test.js — รวมจำนวนจริงจากชีตสต็อกเข้ากับสินค้า (applyQtyLocToProduct_)
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน auth.test.js / payload-variant.test.js: **ไม่ copy โค้ดเข้า helpers.js**
// แต่ eval ฟังก์ชันจริงจาก .gs เพราะนี่คือตรรกะที่ตัดสิน "สินค้ามีของหรือหมด" บนหน้าเว็บ
// ถ้าสำเนา drift เทสต์จะเขียวทั้งที่ของจริงโชว์ "หมด" ให้พนักงานเห็น
//
// เคสจริงที่เป็นที่มาของไฟล์นี้ (2026-07-31):
//   สินค้ารหัส WL ทุกตัวโชว์ "หมด" บนเว็บ ทั้งที่ชีตสต็อกมี WL00002 = 41 หน้าร้าน + 240 คลัง
//   สาเหตุ: โค้ดเขียนทับ qtyStore/qtyWH แต่ไม่คำนวณ qty/isOOS ใหม่ → ค้างค่า 0 จากชีต
//   "ข้อมูลสินค้า" (เก่า) · ไม่มี error ให้เห็นเลย เจ้าของนึกว่าสินค้ายังไม่ถูกดึงเข้าระบบ
//
// สิ่งที่คุมไว้:
//   1. มีสต็อกจริงในชีตสต็อก → ต้องไม่ถูกมองว่า "หมด" ไม่ว่าค่าเดิมจะเป็นอะไร
//   2. qty ต้องเท่ากับ qtyStore + qtyWH เสมอ (ไม่ใช่ค่าค้างจากชีตเก่า)
//   3. ชีตสต็อกต้องชนะค่าเดิมเสมอ รวมถึงกรณีบอกว่า "หมด" จริง (ขาขึ้นและขาลง)
//   4. ไม่มีแถวในชีตสต็อก → ห้ามแตะค่าเดิม (ไม่งั้นสินค้าที่ไม่มีแถวจะกลายเป็น 0 ยกแผง)
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

const applyQtyLocToProduct_ = (() => {
  const code = grab(/function applyQtyLocToProduct_\(p, loc\) \{[\s\S]*?\n\}/);
  // eslint-disable-next-line no-new-func
  return new Function(`${code}; return applyQtyLocToProduct_;`)();
})();

// สินค้าตามที่ readProducts_ สร้างจากชีต "ข้อมูลสินค้า" (คอลัมน์ I/J/K เก่า → มักเป็น 0)
const staleProduct = (over = {}) => ({
  sku: 'WL00002', name: 'ใบหลิว 218',
  qtyStore: 0, qtyWH: 0, qty: 0,
  qtyStatus: 'empty', isOOS: true, isOversold: false,
  price: 0,
  ...over,
});

describe('applyQtyLocToProduct_ — ชีตสต็อกต้องชนะค่าเก่าเสมอ', () => {
  it('เคส WL00002 ของจริง: มีของ 41+240 แต่ค่าเดิมบอกหมด → ต้องกลับมามีของ', () => {
    const p = applyQtyLocToProduct_(staleProduct(), { qtyStore: 41, qtyWH: 240, price: 0 });

    expect(p.qty).toBe(281);
    expect(p.isOOS).toBe(false);       // ← บั๊กเดิมค้างเป็น true ทำให้โชว์ "หมด"
    expect(p.qtyStatus).toBe('ok');
    expect(p.qtyStore).toBe(41);
    expect(p.qtyWH).toBe(240);
  });

  it('qty ต้อง = qtyStore + qtyWH เสมอ (ไม่ใช่ค่าค้างจากชีตเก่า)', () => {
    for (const [store, wh] of [[0, 36], [83, 48], [72, 0], [5, 5]]) {
      const p = applyQtyLocToProduct_(staleProduct({ qty: 999 }), { qtyStore: store, qtyWH: wh, price: 0 });
      expect(p.qty).toBe(store + wh);
    }
  });

  it('ค่าเดิมบอกว่ามีของ แต่ชีตสต็อกบอกหมดจริง → ต้องเชื่อชีตสต็อก (ขาลง)', () => {
    const p = applyQtyLocToProduct_(
      staleProduct({ qty: 500, qtyStore: 500, isOOS: false, qtyStatus: 'ok' }),
      { qtyStore: 0, qtyWH: 0, price: 0 },
    );
    expect(p.qty).toBe(0);
    expect(p.isOOS).toBe(true);
  });

  it('ติดลบ (ขายเกิน) → ต้องติดธง negative/oversold ไม่ใช่กลบเป็น 0', () => {
    const p = applyQtyLocToProduct_(staleProduct(), { qtyStore: -3, qtyWH: 0, price: 0 });
    expect(p.qty).toBe(-3);
    expect(p.qtyStatus).toBe('negative');
    expect(p.isOversold).toBe(true);
    expect(p.isOOS).toBe(true);        // ติดลบ = ไม่มีของให้ขาย
  });

  it('ราคา: ชีตสต็อกมีราคา (>0) → ทับ · ราคา 0 → คงราคาเดิมไว้', () => {
    expect(applyQtyLocToProduct_(staleProduct({ price: 120 }), { qtyStore: 1, qtyWH: 0, price: 250 }).price).toBe(250);
    expect(applyQtyLocToProduct_(staleProduct({ price: 120 }), { qtyStore: 1, qtyWH: 0, price: 0 }).price).toBe(120);
  });

  it('ไม่มีแถวในชีตสต็อก (loc ว่าง) → ห้ามแตะค่าเดิมแม้แต่ฟิลด์เดียว', () => {
    const before = staleProduct({ qty: 7, qtyStore: 7, isOOS: false, qtyStatus: 'ok' });
    const snapshot = { ...before };
    for (const loc of [null, undefined]) {
      expect(applyQtyLocToProduct_(before, loc)).toEqual(snapshot);
    }
  });

  it('ขอบเขต: มีของแค่ฝั่งเดียวก็ยังไม่ใช่ "หมด"', () => {
    expect(applyQtyLocToProduct_(staleProduct(), { qtyStore: 0, qtyWH: 36, price: 0 }).isOOS).toBe(false);
    expect(applyQtyLocToProduct_(staleProduct(), { qtyStore: 72, qtyWH: 0, price: 0 }).isOOS).toBe(false);
  });
});

describe('applyQtyLocToProduct_ — ยังถูกเรียกจริงใน buildFullData_', () => {
  // กันเคส "เทสต์เขียวแต่ของจริงไม่ได้เรียก" — ถ้ามีคนย้าย/ลบจุดเรียกออก ต้องแดงทันที
  it('buildFullData_ ต้องเรียก applyQtyLocToProduct_ กับ qtyLoc', () => {
    expect(SRC).toMatch(/applyQtyLocToProduct_\(p,\s*qtyLoc\[skuU\]\)/);
  });
});
