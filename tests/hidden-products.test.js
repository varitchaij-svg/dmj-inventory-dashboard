// tests/hidden-products.test.js
// ─────────────────────────────────────────────────────────────────────────────
// อาการ "สแกนแล้วไม่ขึ้น / สินค้าหายไปจากตาราง" — บั๊กที่หาสาเหตุยากสุด เพราะ
// **ไม่มี error ให้เห็นเลย** ตารางว่างเฉย ๆ
//
// กลไก: View หลักทุกตัวกรองสินค้าด้วย `p.cat && p.cat !== "ไม่มีรหัสสินค้า"` ก่อนแสดงผล
//        → สินค้าที่หมวดว่าง (เช่น ที่ syncNewProductsFromZort เขียน `p.category || ""`
//          ลงคอลัมน์ D เพราะยังไม่ได้ตั้งหมวดใน ZORT) หายไปเงียบ ๆ ทั้งที่มีของจริง
//        → ตอนสแกน: หาเจอใน products ตัวเต็ม (ไม่ขึ้น toast "ไม่พบ") แต่พอ setSearch
//          ตารางกรองทิ้ง → ผู้ใช้เห็นแค่ตารางว่าง
//
// เทสต์นี้กันไม่ให้ "คำอธิบายสาเหตุ" หลุดหายไปตอนแก้โค้ดรอบหน้า — ตัวกรองยังอยู่ได้
// แต่ห้ามกลับไปเงียบใส่ผู้ใช้อีก
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

// ตรรกะเดียวกับ hiddenByCat ใน FrontStoreView — ตัวสินค้าที่ "ตรงคำค้นแต่โดนกรองทิ้ง"
const hiddenByCat = (products, search) => {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  return products.filter(p => {
    const cat = p.cat || p.category;
    if (cat && cat !== 'ไม่มีรหัสสินค้า') return false;
    const hay = ((p.sku || '') + ' ' + (p.name || '')).toLowerCase();
    return tokens.every(t => hay.includes(t));
  });
};

const PRODUCTS = [
  { sku: 'VAS001', name: 'แจกันแก้วใส',  cat: '' },                    // หมวดว่าง → ถูกซ่อน
  { sku: 'VAS002', name: 'แจกันเซรามิก', category: '' },               // หมวดว่าง (คีย์ category)
  { sku: 'VAS003', name: 'แจกันทรงสูง',  cat: 'ไม่มีรหัสสินค้า' },      // หมวดขยะ → ถูกซ่อน
  { sku: 'VAS004', name: 'แจกันปากกว้าง', cat: 'แจกัน' },              // ปกติ → ไม่ถูกซ่อน
  { sku: 'FLW001', name: 'กุหลาบแดง',    cat: 'ดอกไม้' },
];

describe('hiddenByCat — หาสินค้าที่ "มีอยู่จริงแต่โดนกรองทิ้งเพราะหมวดว่าง"', () => {
  it('จับสินค้าหมวดว่างที่ตรงกับคำค้น', () => {
    const r = hiddenByCat(PRODUCTS, 'VAS001');
    expect(r.map(p => p.sku)).toEqual(['VAS001']);
  });

  it('รองรับทั้งคีย์ cat และ category (payload เก่า/ใหม่ใช้คนละคีย์)', () => {
    expect(hiddenByCat(PRODUCTS, 'VAS002').map(p => p.sku)).toEqual(['VAS002']);
  });

  it('นับ "ไม่มีรหัสสินค้า" เป็นหมวดที่ถูกซ่อนด้วย', () => {
    expect(hiddenByCat(PRODUCTS, 'VAS003').map(p => p.sku)).toEqual(['VAS003']);
  });

  it('สินค้าที่มีหมวดปกติ ไม่ถูกนับว่าซ่อน (ไม่งั้นจะขึ้นคำอธิบายผิด)', () => {
    expect(hiddenByCat(PRODUCTS, 'VAS004')).toEqual([]);
    expect(hiddenByCat(PRODUCTS, 'FLW001')).toEqual([]);
  });

  it('ค้นด้วย prefix เจอทุกตัวที่ซ่อนอยู่ (เคสจริง: ทั้ง prefix หายทั้งชุด)', () => {
    expect(hiddenByCat(PRODUCTS, 'VAS').map(p => p.sku)).toEqual(['VAS001', 'VAS002', 'VAS003']);
  });

  it('multi-token AND-match เหมือนช่องค้นหาอื่นทั้งระบบ', () => {
    expect(hiddenByCat(PRODUCTS, 'แจกัน แก้ว').map(p => p.sku)).toEqual(['VAS001']);
    expect(hiddenByCat(PRODUCTS, 'แจกัน ไม่มีจริง')).toEqual([]);
  });

  it('คำค้นว่าง = ไม่ต้องอธิบายอะไร', () => {
    expect(hiddenByCat(PRODUCTS, '')).toEqual([]);
    expect(hiddenByCat(PRODUCTS, '   ')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('การเชื่อมต่อ (meta) — ห้ามกลับไปเงียบใส่ผู้ใช้', () => {
  it('handleScanDetected เช็คหมวดก่อน setSearch (ไม่งั้นได้ตารางว่างแบบไม่มีคำอธิบาย)', () => {
    const fn = VA.match(/const handleScanDetected = \(sku\) => \{[\s\S]*?\n  \};/)[0];
    expect(fn).toContain('ไม่มีรหัสสินค้า');
    // ต้อง return ออกก่อนถึง setSearch — ไม่ใช่เตือนแล้วยังปล่อยให้ตารางว่าง
    expect(fn.indexOf('showToast("warn"')).toBeLessThan(fn.indexOf('setSearch(clean)'));
  });

  it('หน้าจอว่างของ FrontStoreView อธิบายสาเหตุเมื่อของถูกซ่อนเพราะหมวด', () => {
    expect(VA).toContain('hiddenByCat');
    expect(VA).toContain('ยังไม่ได้ตั้งหมวด');
  });

  it('hiddenByCat คิดเฉพาะตอน filtered ว่าง (กันวนสินค้าทุกตัวทุกครั้งที่พิมพ์)', () => {
    const memo = VA.match(/const hiddenByCat = uM\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/)[0];
    expect(memo).toContain('filtered.length > 0');
    expect(memo).toMatch(/\}, \[products, search, filtered\]\);/);
  });

  it('debugHiddenProducts ไม่ลงท้าย _ (ต้องโผล่ใน dropdown ของ GAS editor — บทเรียนข้อ 1)', () => {
    expect(GS).toContain('function debugHiddenProducts()');
  });

  it('debugHiddenProducts อ่านอย่างเดียว + ใช้ readProducts_ ตัวจริง (ไม่ re-implement)', () => {
    const fn = GS.match(/function debugHiddenProducts\(\)[\s\S]*?\n}/)[0];
    expect(fn).toContain('readProducts_()');
    // ห้ามมีคำสั่งเขียนชีตใด ๆ — เครื่องมือวินิจฉัยต้องไม่แก้ข้อมูลของจริง
    expect(fn).not.toMatch(/setValue|appendRow|setValues|deleteRow/);
  });
});
