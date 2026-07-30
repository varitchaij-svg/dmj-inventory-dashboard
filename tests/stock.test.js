// tests/stock.test.js — ทดสอบ stockQty, whQty, deductStockCore, saleFrontStoreDeductCore
import { describe, it, expect } from 'vitest';
import { stockQty, whQty, deductStockCore, saleFrontStoreDeductCore } from './helpers.js';

describe('stockQty', () => {
  it('มีทั้ง qtyStore และ qtyWH → รวมกัน', () => {
    expect(stockQty({ qtyStore: 3, qtyWH: 5 })).toBe(8);
  });

  it('qtyStore=0, qtyWH=0 → fallback ไปที่ qty', () => {
    expect(stockQty({ qtyStore: 0, qtyWH: 0, qty: 12 })).toBe(12);
  });

  it('มี qtyStore > 0 → ไม่ fallback qty แม้ qtyWH=0', () => {
    expect(stockQty({ qtyStore: 1, qtyWH: 0, qty: 12 })).toBe(1);
  });

  it('มี qtyWH > 0 → ไม่ fallback qty แม้ qtyStore=0', () => {
    expect(stockQty({ qtyStore: 0, qtyWH: 7, qty: 20 })).toBe(7);
  });

  it('null → 0', () => {
    expect(stockQty(null)).toBe(0);
  });

  it('undefined → 0', () => {
    expect(stockQty(undefined)).toBe(0);
  });

  it('object ว่างเปล่า → 0 (ไม่มี qty fields)', () => {
    expect(stockQty({})).toBe(0);
  });
});

describe('whQty', () => {
  it('มี warehouseQty → คืน warehouseQty', () => {
    expect(whQty({ warehouseQty: 7 })).toBe(7);
  });

  it('ไม่มี warehouseQty แต่มี qtyWH → คืน qtyWH', () => {
    expect(whQty({ qtyWH: 4 })).toBe(4);
  });

  it('warehouseQty=0 → คืน 0 (ไม่ข้ามไป qtyWH)', () => {
    expect(whQty({ warehouseQty: 0, qtyWH: 9 })).toBe(0);
  });

  it('ไม่มีทั้ง warehouseQty และ qtyWH → คืน 0', () => {
    expect(whQty({})).toBe(0);
  });

  it('null → 0', () => {
    expect(whQty(null)).toBe(0);
  });

  it('undefined → 0', () => {
    expect(whQty(undefined)).toBe(0);
  });
});

describe('deductStockCore', () => {
  it('qty <= whQty → หักจาก WH ทั้งหมด ไม่แตะ FS', () => {
    const r = deductStockCore({ whQty: 10, fsQty: 5 }, 7);
    expect(r.deductWH).toBe(7);
    expect(r.deductFS).toBe(0);
    expect(r.newWH).toBe(3);
    expect(r.newFS).toBe(5);
    expect(r.shortfall).toBe(false);
    expect(r.shortfall_qty).toBe(0);
  });

  it('qty > whQty → หัก WH หมด แล้วล้นมา FS', () => {
    const r = deductStockCore({ whQty: 3, fsQty: 10 }, 8);
    expect(r.deductWH).toBe(3);
    expect(r.deductFS).toBe(5);
    expect(r.newWH).toBe(0);
    expect(r.newFS).toBe(5);
    expect(r.shortfall).toBe(false);
    expect(r.shortfall_qty).toBe(0);
  });

  it('qty > whQty + fsQty → shortfall', () => {
    const r = deductStockCore({ whQty: 3, fsQty: 4 }, 10);
    expect(r.deductWH).toBe(3);
    expect(r.deductFS).toBe(4);
    expect(r.shortfall).toBe(true);
    expect(r.shortfall_qty).toBe(3);  // 10 - (3+4) = 3
  });

  it('whQty=0, fsQty=0 → shortfall เต็มจำนวน', () => {
    const r = deductStockCore({ whQty: 0, fsQty: 0 }, 5);
    expect(r.deductWH).toBe(0);
    expect(r.deductFS).toBe(0);
    expect(r.shortfall).toBe(true);
    expect(r.shortfall_qty).toBe(5);
  });

  it('qty พอดีกับ whQty+fsQty → shortfall=false', () => {
    const r = deductStockCore({ whQty: 4, fsQty: 6 }, 10);
    expect(r.shortfall).toBe(false);
    expect(r.shortfall_qty).toBe(0);
    expect(r.newWH).toBe(0);
    expect(r.newFS).toBe(0);
  });

  it('whQty=0 → หักจาก FS โดยตรง', () => {
    const r = deductStockCore({ whQty: 0, fsQty: 8 }, 5);
    expect(r.deductWH).toBe(0);
    expect(r.deductFS).toBe(5);
    expect(r.newFS).toBe(3);
    expect(r.shortfall).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saleFrontStoreDeductCore — หักสต็อกหน้าร้าน (col G) หลังออกบิล POS
// ZORT AddOrder ตัดจากคลัง default = หน้าร้าน (W0001) แล้ว ฝั่งชีตจึงหัก col G ให้ตรงกัน
// ─────────────────────────────────────────────────────────────────────────────
describe('saleFrontStoreDeductCore', () => {
  const rows = [
    { sku: 'VAS001', qtyStore: 10 },
    { sku: 'FLW002', qtyStore: 3 },
    { sku: 'DEC003', qtyStore: 0 },
  ];

  it('หักปกติ — สต็อกพอ', () => {
    const r = saleFrontStoreDeductCore([{ sku: 'VAS001', number: 4 }], rows);
    expect(r.applied).toEqual([{ sku: 'VAS001', qty: 4, before: 10, after: 6 }]);
    expect(r.shortfall).toEqual([]);
    expect(r.notFound).toEqual([]);
  });

  it('หักหลาย SKU ในบิลเดียว', () => {
    const r = saleFrontStoreDeductCore(
      [{ sku: 'VAS001', number: 2 }, { sku: 'FLW002', number: 1 }], rows);
    expect(r.applied.map(a => [a.sku, a.after])).toEqual([['VAS001', 8], ['FLW002', 2]]);
    expect(r.shortfall).toEqual([]);
  });

  it('SKU ซ้ำหลายบรรทัดในบิล → รวม qty ก่อนหักครั้งเดียว', () => {
    const r = saleFrontStoreDeductCore(
      [{ sku: 'VAS001', number: 3 }, { sku: 'VAS001', number: 2 }], rows);
    expect(r.applied).toEqual([{ sku: 'VAS001', qty: 5, before: 10, after: 5 }]);
  });

  it('ขายเกินสต็อก → clamp ที่ 0 + รายงาน shortfall (ไม่ปล่อยติดลบ)', () => {
    const r = saleFrontStoreDeductCore([{ sku: 'FLW002', number: 8 }], rows);
    expect(r.applied).toEqual([{ sku: 'FLW002', qty: 8, before: 3, after: 0 }]);
    expect(r.shortfall).toEqual([{ sku: 'FLW002', want: 8, had: 3 }]);
  });

  it('สต็อกเป็น 0 อยู่แล้ว → after=0 และเข้า shortfall', () => {
    const r = saleFrontStoreDeductCore([{ sku: 'DEC003', number: 1 }], rows);
    expect(r.applied[0].after).toBe(0);
    expect(r.shortfall).toEqual([{ sku: 'DEC003', want: 1, had: 0 }]);
  });

  it('SKU ไม่มีในชีต → เข้า notFound ไม่ทำให้พัง', () => {
    const r = saleFrontStoreDeductCore([{ sku: 'NOPE999', number: 2 }], rows);
    expect(r.applied).toEqual([]);
    expect(r.notFound).toEqual(['NOPE999']);
  });

  it('SKU ซ้ำหลายแถวในชีต → หักแถวแรกแถวเดียว ไม่หักซ้ำ', () => {
    const dupRows = [{ sku: 'VAS001', qtyStore: 10 }, { sku: 'VAS001', qtyStore: 7 }];
    const r = saleFrontStoreDeductCore([{ sku: 'VAS001', number: 4 }], dupRows);
    expect(r.applied).toEqual([{ sku: 'VAS001', qty: 4, before: 10, after: 6 }]);
  });

  it('sku ต่างตัวพิมพ์/มีช่องว่าง → normalize แล้วเจอ', () => {
    const r = saleFrontStoreDeductCore([{ sku: ' vas001 ', number: 1 }], rows);
    expect(r.applied).toEqual([{ sku: 'VAS001', qty: 1, before: 10, after: 9 }]);
  });

  it('qty <= 0 หรือ sku ว่าง → ข้าม ไม่หัก', () => {
    const r = saleFrontStoreDeductCore(
      [{ sku: 'VAS001', number: 0 }, { sku: '', number: 5 }], rows);
    expect(r.applied).toEqual([]);
    expect(r.notFound).toEqual([]);
  });

  it('list/rows ว่าง → ไม่พัง', () => {
    expect(saleFrontStoreDeductCore([], rows).applied).toEqual([]);
    expect(saleFrontStoreDeductCore(null, null).applied).toEqual([]);
  });
});
