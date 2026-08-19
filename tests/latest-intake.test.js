// tests/latest-intake.test.js — "เข้าล่าสุด" บนการ์ดสินค้า (p.lastStockInDate/Qty/Supplier)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของแจ้ง: เขียนแถวซื้อ (รหัสซัพพลายเออร์ เช่น BA) ในชีต "รายการซื้อสินค้า" แล้ว
// "จำนวนเข้าล่าสุด" บนการ์ดผิด — โผล่แถวทดสอบ qty 1 แทนแถวจริงล่าสุด
// ต้นเหตุ 3 อย่างในเส้นทาง buildFullData → purchasesBySku:
//   1) comparator `a.date < b.date ? 1 : -1` ไม่เคยคืน 0 → วันเท่ากันลำดับไม่แน่นอน
//   2) จับกลุ่มด้วย pu.sku ดิบ (ไม่ upper) → แถวพิมพ์เอง case ไม่ตรง หายจากการจับคู่
//   3) readPurchases_ ไม่รองรับปี พ.ศ. + คืน string ดิบเมื่อ parse ไม่ได้ → sort เพี้ยน
// เทสต์นี้ eval ฟังก์ชันจริงจาก .gs (ไม่ copy — เหมือน auth.test.js) + meta-test จุดเชื่อมต่อ
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

function loadSort() {
  const code = [
    grab(/function sortPurchasesLatestFirst_\(rows\) \{[\s\S]*?\n\}/),
    'return { sortPurchasesLatestFirst_ };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(code)();
}

const { sortPurchasesLatestFirst_ } = loadSort();

// เลียนแบบสิ่งที่ buildFullData ทำ: sort แล้วหยิบ [0] เป็น "เข้าล่าสุด"
function latest(rows) {
  return sortPurchasesLatestFirst_(rows)[0];
}

describe('sortPurchasesLatestFirst_ — เลือกแถวเข้าล่าสุดให้ถูก', () => {
  it('วันที่ต่างกัน → แถววันที่มากสุดมาก่อน', () => {
    const rows = [
      { date: '2026-06-01', qty: 100, supplier: 'BA' },
      { date: '2026-07-07', qty: 203, supplier: 'BA' },
      { date: '2026-05-10', qty: 50, supplier: 'BA' },
    ];
    expect(latest(rows)).toMatchObject({ date: '2026-07-07', qty: 203 });
  });

  it('เป็น comparator ที่ถูกต้อง — วันเท่ากันคืน 0 (คงลำดับเดิม/stable)', () => {
    // แถวจริง (บนสุด/ซิงค์จาก ZORT) มาก่อนแถวทดสอบที่พิมพ์เพิ่มท้าย เมื่อวันเท่ากัน
    const rows = [
      { date: '2026-07-07', qty: 203, supplier: 'BA' },              // แถวจริง อยู่บน
      { date: '2026-07-07', qty: 1,   supplier: 'ทดสอบระบบ (ลบทิ้งได้)' }, // แถวทดสอบ อยู่ล่าง
    ];
    expect(latest(rows)).toMatchObject({ qty: 203, supplier: 'BA' });
  });

  it('ผลลัพธ์คงที่ (deterministic) ไม่ว่าจะรันกี่ครั้ง', () => {
    const mk = () => [
      { date: '2026-07-07', qty: 203, supplier: 'BA' },
      { date: '2026-07-07', qty: 1, supplier: 'test' },
      { date: '2026-07-07', qty: 7, supplier: 'x' },
    ];
    const first = latest(mk());
    for (let i = 0; i < 20; i++) expect(latest(mk())).toEqual(first);
  });

  it('แถวไม่มีวันที่ ("") จมท้ายสุด ไม่แย่งเป็นเข้าล่าสุด', () => {
    const rows = [
      { date: '', qty: 999, supplier: 'ไม่มีวันที่' },
      { date: '2026-01-01', qty: 5, supplier: 'BA' },
    ];
    expect(latest(rows)).toMatchObject({ date: '2026-01-01', qty: 5 });
  });

  it('ทุกแถวไม่มีวันที่ → ยังคืนแถวแรก ไม่ throw', () => {
    const rows = [{ date: '', qty: 3 }, { date: '', qty: 4 }];
    expect(() => latest(rows)).not.toThrow();
    expect(latest(rows)).toMatchObject({ qty: 3 });
  });

  it('ไม่ mutate array เดิม (ใช้ slice())', () => {
    const rows = [{ date: '2026-01-01', qty: 1 }, { date: '2026-09-09', qty: 2 }];
    const before = rows.map(r => r.qty);
    sortPurchasesLatestFirst_(rows);
    expect(rows.map(r => r.qty)).toEqual(before);
  });
});

describe('meta: จุดเชื่อมต่อใน buildFullData / readPurchases_ ต้องไม่ถอยกลับ', () => {
  it('purchasesBySku จับกลุ่มด้วย SKU ตัวพิมพ์ใหญ่ (ไม่ใช่ pu.sku ดิบ)', () => {
    // ต้องมี toUpperCase() ตอนสร้างคีย์ และตอน lookup — กัน case mismatch ทำแถวจริงหาย
    expect(SRC).toMatch(/purchasesBySku\[key\]/);
    expect(SRC).toMatch(/const key = String\(pu\.sku \|\| ''\)\.trim\(\)\.toUpperCase\(\)/);
    expect(SRC).toMatch(/purchasesBySku\[String\(p\.sku \|\| ''\)\.trim\(\)\.toUpperCase\(\)\]/);
  });

  it('buildFullData เรียก sortPurchasesLatestFirst_ จริง (ไม่ใช่ comparator เก่าที่ไม่คืน 0)', () => {
    expect(SRC).toMatch(/purchasesBySku\[k\] = sortPurchasesLatestFirst_\(purchasesBySku\[k\]\)/);
    // comparator เก่าที่พังต้องไม่หลงเหลือ
    expect(SRC).not.toMatch(/\.sort\(\(a, b\) => \(a\.date < b\.date \? 1 : -1\)\)/);
  });

  it('readPurchases_ รองรับปี พ.ศ. (>= 2400 → -543) — บทเรียนข้อ 11', () => {
    expect(SRC).toMatch(/if \(yy >= 2400\) yy -= 543;/);
  });
});
