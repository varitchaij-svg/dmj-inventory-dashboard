// tests/billing.test.js — เครื่องคิดบิล/ส่วนลด (ราคาปลีก→ส่ง) สำหรับ PosView
// business rule ยืนยันกับเจ้าของแล้ว (ดู comment ใน helpers.js computeBillTotals)
import { describe, it, expect } from 'vitest';
import { computeBillTotals, wholesaleTierRate, isBillExcludedCat } from './helpers.js';

const P = (category, qty, price) => ({ sku: 'X', name: 'x', category, qty, price });

describe('wholesaleTierRate — ช่วงเดียว ไม่สะสม', () => {
  it('ต่ำกว่า 10,000 → 0%', () => expect(wholesaleTierRate(9999)).toBe(0));
  it('10,000 พอดี → 5%', () => expect(wholesaleTierRate(10000)).toBe(0.05));
  it('49,999 → 5%', () => expect(wholesaleTierRate(49999)).toBe(0.05));
  it('50,000 → 6%', () => expect(wholesaleTierRate(50000)).toBe(0.06));
  it('60,000 → 6% (ไม่สะสม 5%+6%)', () => expect(wholesaleTierRate(60000)).toBe(0.06));
  it('100,000 → 7%', () => expect(wholesaleTierRate(100000)).toBe(0.07));
  it('500,000 → 10%', () => expect(wholesaleTierRate(500000)).toBe(0.10));
  it('1,000,000 → 12%', () => expect(wholesaleTierRate(1000000)).toBe(0.12));
});

describe('isBillExcludedCat', () => {
  it('Made to Order (substring, case-insensitive)', () => {
    expect(isBillExcludedCat('สินค้า Made to Order พิเศษ')).toBe(true);
  });
  it('จัดแบบพิเศษ', () => expect(isBillExcludedCat('จัดแบบพิเศษ')).toBe(true));
  it('อุปกรณ์สำนักงาน', () => expect(isBillExcludedCat('อุปกรณ์สำนักงาน')).toBe(true));
  it('หมวดปกติ → false', () => expect(isBillExcludedCat('ดอกไม้')).toBe(false));
  it('ว่าง/undefined → false', () => {
    expect(isBillExcludedCat('')).toBe(false);
    expect(isBillExcludedCat(undefined)).toBe(false);
  });
  it('รับ keyword list ที่ตั้งค่าเองได้', () => {
    expect(isBillExcludedCat('ของแถม', ['ของแถม'])).toBe(true);
    expect(isBillExcludedCat('อุปกรณ์สำนักงาน', ['ของแถม'])).toBe(false);
  });
});

describe('computeBillTotals — เงื่อนไข 6 ชิ้น (ราคาส่ง)', () => {
  it('น้อยกว่า 6 ชิ้น → ไม่ลด (ราคาปลีก)', () => {
    const r = computeBillTotals([P('ดอกไม้', 5, 100)]);
    expect(r.isWholesale).toBe(false);
    expect(r.wholesaleDiscount).toBe(0);
    expect(r.grandTotal).toBe(500);
  });

  it('ครบ 6 ชิ้นพอดี → ลด 20%', () => {
    const r = computeBillTotals([P('ดอกไม้', 6, 100)]);
    expect(r.isWholesale).toBe(true);
    expect(r.wholesaleSubtotal).toBe(480);       // 600 × 0.8
    expect(r.wholesaleDiscount).toBe(120);
    expect(r.tierRate).toBe(0);                    // 480 < 10,000
    expect(r.grandTotal).toBe(480);
  });

  it('ตัวอย่างเจ้าของ: 6 ชิ้น ปลีกรวม 12,000 → 9,600 (ไม่เข้าขั้น 5%)', () => {
    const r = computeBillTotals([P('ดอกไม้', 6, 2000)]);
    expect(r.wholesaleSubtotal).toBe(9600);        // 12,000 × 0.8
    expect(r.tierRate).toBe(0);                    // 9,600 < 10,000 (วัดหลังลด 20%)
    expect(r.grandTotal).toBe(9600);
  });

  it('เข้าขั้น 5%: 6 ชิ้น ปลีกรวม 15,000 → ×0.8=12,000 ≥10,000 → 12,000×0.95=11,400', () => {
    const r = computeBillTotals([P('ดอกไม้', 6, 2500)]);
    expect(r.wholesaleSubtotal).toBe(12000);
    expect(r.tierRate).toBe(0.05);
    expect(r.grandTotal).toBe(11400);
  });

  it('เข้าขั้น 6% (ช่วงเดียว): ปลีก 75,000 → ×0.8=60,000 → 6% → 56,400', () => {
    const r = computeBillTotals([P('ดอกไม้', 10, 7500)]);
    expect(r.wholesaleSubtotal).toBe(60000);
    expect(r.tierRate).toBe(0.06);
    expect(r.grandTotal).toBeCloseTo(56400, 6);
  });
});

describe('computeBillTotals — หมวดยกเว้น', () => {
  it('MTO ไม่นับเข้า 6 ชิ้น: 5 ปกติ + 3 MTO → ไม่ถึงเกณฑ์ส่ง', () => {
    const r = computeBillTotals([P('ดอกไม้', 5, 100), P('Made to Order', 3, 100)]);
    expect(r.eligiblePieces).toBe(5);
    expect(r.isWholesale).toBe(false);
    expect(r.retailExcluded).toBe(300);
    expect(r.grandTotal).toBe(800);               // 500 + 300 (ปลีกทั้งคู่)
  });

  it('MTO ไม่ถูกลดแม้ eligible เข้าเกณฑ์ส่ง: 6 ปกติ + MTO 1', () => {
    const r = computeBillTotals([P('ดอกไม้', 6, 1000), P('อุปกรณ์สำนักงาน', 1, 500)]);
    expect(r.isWholesale).toBe(true);
    expect(r.wholesaleSubtotal).toBe(4800);        // 6000 × 0.8
    expect(r.retailExcluded).toBe(500);            // ไม่ลด
    expect(r.grandTotal).toBe(5300);               // 4800 + 500
  });

  it('ยอด excluded ไม่นับเข้าขั้นบาท', () => {
    // eligible 6×2000=12,000 → ×0.8=9,600 (<10,000 ไม่เข้าขั้น) แม้ excluded 50,000
    const r = computeBillTotals([P('ดอกไม้', 6, 2000), P('อุปกรณ์สำนักงาน', 1, 50000)]);
    expect(r.tierRate).toBe(0);
    expect(r.grandTotal).toBe(9600 + 50000);
  });
});

describe('computeBillTotals — ส่วนลดมือ (saler override) + VAT', () => {
  it('ส่วนลดมือหักจากยอดรวมหลังกฎ', () => {
    const r = computeBillTotals([P('ดอกไม้', 6, 100)], { manualDiscount: 80 });
    expect(r.subtotalAfterRule).toBe(480);
    expect(r.manualDiscount).toBe(80);
    expect(r.grandTotal).toBe(400);
  });

  it('ส่วนลดมือไม่ทำให้ติดลบ', () => {
    const r = computeBillTotals([P('ดอกไม้', 6, 100)], { manualDiscount: 99999 });
    expect(r.grandTotal).toBe(0);
  });

  it('VAT ถอดกลับจากราคารวม VAT (7/107)', () => {
    const r = computeBillTotals([P('ดอกไม้', 1, 107)]);
    expect(r.grandTotal).toBe(107);
    expect(r.vat).toBeCloseTo(7, 6);
    expect(r.preVat).toBeCloseTo(100, 6);
  });

  it('savings = ปลีกทั้งบิล − ที่จ่ายจริง', () => {
    const r = computeBillTotals([P('ดอกไม้', 6, 2500)]);   // ปลีก 15,000 → จ่าย 11,400
    expect(r.savings).toBe(3600);
  });
});

describe('computeBillTotals — edge cases', () => {
  it('ตะกร้าว่าง → 0 ทุกค่า', () => {
    const r = computeBillTotals([]);
    expect(r.grandTotal).toBe(0);
    expect(r.eligiblePieces).toBe(0);
    expect(r.vat).toBe(0);
  });
  it('null → ไม่ throw', () => {
    expect(() => computeBillTotals(null)).not.toThrow();
  });
});
