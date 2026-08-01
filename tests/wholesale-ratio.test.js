// tests/wholesale-ratio.test.js — อัตราขายส่งที่ใช้คิด "มูลค่าสต๊อกคงเหลือ"
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน auth.test.js / qtyloc.test.js: **ไม่ copy โค้ดเข้า helpers.js**
// แต่ eval ฟังก์ชันจริงจาก .gs เพราะค่านี้คูณกับ "มูลค่าสต๊อกทั้งร้าน" ตรง ๆ
// อ่านค่าเพี้ยนไป 1 หลัก = ตัวเลขที่เจ้าของใช้ตัดสินใจเรื่องเงินเพี้ยนทั้งแดชบอร์ด
//
// ที่มา: ส.ค. 2026 — มูลค่าสต๊อกเดิมคิดที่ราคาปลีกจาก ZORT (฿36.23M) ทั้งที่ร้านขายส่ง
// เจ้าของสั่งให้โชว์ราคาขายส่งตัวเดียว (ปลีก −20% = ฿28.98M) ปรับอัตราได้ที่ Script Property
//
// สิ่งที่คุมไว้:
//   1. ไม่ตั้งค่า → 0.8 (ค่าที่เจ้าของเคาะ)
//   2. ค่าที่ใช้ไม่ได้ (0 / ติดลบ / เกิน 1 / ไม่ใช่ตัวเลข) → 0.8 ไม่ใช่ 0
//      **0 อันตรายที่สุด** — มูลค่าสต๊อกทั้งร้านกลายเป็น ฿0 โดยไม่มี error ให้เห็น
//   3. ค่าที่ใช้ได้ → ใช้ตามนั้น (รวม 1 = ไม่ลดราคา)
//   4. อ่าน Script Property พังก็ต้องไม่ทำให้ build payload ล้มทั้งก้อน
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

// สร้าง wholesaleRatio_ ใหม่ทุกครั้งพร้อม PropertiesService ปลอมที่คืนค่าที่กำหนด
function ratioWith(propValue) {
  const consts = grab(/const WHOLESALE_RATIO_DEFAULT_ = [\s\S]*?\n\}/);
  const stub = propValue === '__throw__'
    ? `const PropertiesService = { getScriptProperties: () => { throw new Error('boom'); } };`
    : `const PropertiesService = { getScriptProperties: () => ({ getProperty: () => ${JSON.stringify(propValue)} }) };`;
  // eslint-disable-next-line no-new-func
  return new Function(`${stub}\n${consts}\nreturn wholesaleRatio_();`)();
}

describe('wholesaleRatio_ (appsscript_complete.gs)', () => {
  it('ไม่ตั้ง Script Property → 0.8 ตามที่เจ้าของเคาะ', () => {
    expect(ratioWith(null)).toBe(0.8);
    expect(ratioWith('')).toBe(0.8);
  });

  it('ค่าที่ใช้ได้ → ใช้ตามนั้น', () => {
    expect(ratioWith('0.75')).toBe(0.75);
    expect(ratioWith('0.5')).toBe(0.5);
    expect(ratioWith('1')).toBe(1);       // 1 = ไม่ลดราคา (ยังถือว่าใช้ได้)
  });

  it('0 → fallback 0.8 ไม่ใช่ 0 (ไม่งั้นมูลค่าสต๊อกทั้งร้านกลายเป็น ฿0 เงียบ ๆ)', () => {
    expect(ratioWith('0')).toBe(0.8);
  });

  it('ติดลบ / เกิน 1 / ไม่ใช่ตัวเลข → fallback 0.8', () => {
    expect(ratioWith('-0.5')).toBe(0.8);
    expect(ratioWith('1.2')).toBe(0.8);
    expect(ratioWith('แปดสิบ')).toBe(0.8);
    expect(ratioWith('abc')).toBe(0.8);
  });

  it('อ่าน Script Property พัง → 0.8 ไม่ throw (build payload ต้องไม่ล้มทั้งก้อน)', () => {
    expect(ratioWith('__throw__')).toBe(0.8);
  });

  // meta-test: กันคนลบการคูณอัตราออกจาก stockValue แล้วเทสต์ยังเขียว
  it('buildFullData_ ยังคูณอัตราขายส่งเข้ากับ stockValue จริง', () => {
    expect(SRC).toContain('p.stockValue      = p.qty     * p.price * wholesaleRatio;');
    expect(SRC).toContain('p.stockValueWH    = (p.qtyWH    || 0) * p.price * wholesaleRatio;');
    expect(SRC).toContain('p.stockValueStore = (p.qtyStore || 0) * p.price * wholesaleRatio;');
  });

  // meta-test: frontend ต้องได้อัตรามากับ payload ไม่งั้นจะไป hard-code เอง
  it('ส่ง wholesaleRatio ลงมาใน totals ให้ frontend ใช้ค่าเดียวกัน', () => {
    expect(SRC).toMatch(/totals:\s*\{[\s\S]*?wholesaleRatio,[\s\S]*?\}/);
  });

  // meta-test: COST_RATIO เป็นคนละเรื่อง (ราคาทุน vs ราคาขายส่ง) ห้ามยุบรวมกัน
  it('ไม่เอา COST_RATIO ไปคูณ stockValue (คนละความหมาย)', () => {
    expect(SRC).not.toMatch(/stockValue\w*\s*=[^;\n]*COST_RATIO/);
  });
});
