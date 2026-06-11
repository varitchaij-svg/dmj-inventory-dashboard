// tests/stock.test.js — ทดสอบ stockQty, whQty, deductStockCore
import { describe, it, expect } from 'vitest';
import { stockQty, whQty, deductStockCore } from './helpers.js';

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
