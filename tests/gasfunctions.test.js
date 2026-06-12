// tests/gasfunctions.test.js
// Pure functions ที่ extract จาก appsscript_complete.gs
// ทดสอบ business logic โดยไม่ต้องมี GAS environment (Sheet, Lock, Cache)
import { describe, it, expect } from 'vitest';
import {
  parseOrderId,
  shipmentReceiveStatus,
  carryModeToType,
  transferBatchItemCore,
  deductMaterialsCore,
} from './helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
describe('parseOrderId (จาก updateOrderState GAS:1103)', () => {
  it('"R5" → 5', () => {
    expect(parseOrderId('R5')).toBe(5);
  });

  it('"R123" → 123', () => {
    expect(parseOrderId('R123')).toBe(123);
  });

  it('"S3" (shipment ID) → 3 (digits-only extraction)', () => {
    expect(parseOrderId('S3')).toBe(3);
  });

  it('"1" (ตัวเลขล้วน) → 1', () => {
    expect(parseOrderId('1')).toBe(1);
  });

  it('ค่า 0 → NaN (< 1 = invalid)', () => {
    expect(parseOrderId('R0')).toBeNaN();
  });

  it('string ว่าง → NaN', () => {
    expect(parseOrderId('')).toBeNaN();
  });

  it('null/undefined → NaN', () => {
    expect(parseOrderId(null)).toBeNaN();
    expect(parseOrderId(undefined)).toBeNaN();
  });

  it('ตัวอักษรล้วน (ไม่มีเลข) → NaN', () => {
    expect(parseOrderId('ABC')).toBeNaN();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('shipmentReceiveStatus (จาก confirmShipmentReceive GAS:1175)', () => {
  it('รับครบ: recv === sentQty', () => {
    expect(shipmentReceiveStatus(10, 10)).toBe('รับครบ');
  });

  it('รับครบ: recv > sentQty (รับเกิน)', () => {
    expect(shipmentReceiveStatus(11, 10)).toBe('รับครบ');
  });

  it('รับไม่ครบ: recv < sentQty', () => {
    expect(shipmentReceiveStatus(8, 10)).toBe('รับไม่ครบ');
  });

  it('รับไม่ครบ: recv = 0', () => {
    expect(shipmentReceiveStatus(0, 5)).toBe('รับไม่ครบ');
  });

  it('sentQty = 0 และ recv = 0 → รับครบ', () => {
    expect(shipmentReceiveStatus(0, 0)).toBe('รับครบ');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('carryModeToType (จาก updateOrderState GAS:1110)', () => {
  it('"carry" → "หิ้ว"', () => {
    expect(carryModeToType('carry')).toBe('หิ้ว');
  });

  it('"truck" (อื่นๆ) → "รอขึ้นรถ"', () => {
    expect(carryModeToType('truck')).toBe('รอขึ้นรถ');
  });

  it('null → "รอขึ้นรถ" (default)', () => {
    expect(carryModeToType(null)).toBe('รอขึ้นรถ');
  });

  it('undefined → "รอขึ้นรถ" (default)', () => {
    expect(carryModeToType(undefined)).toBe('รอขึ้นรถ');
  });

  it('string ว่าง → "รอขึ้นรถ" (default)', () => {
    expect(carryModeToType('')).toBe('รอขึ้นรถ');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('transferBatchItemCore (pure math จาก transferStockBatch GAS:774-793)', () => {
  it('WH พอ: ย้าย qty ทั้งหมด WH→FS', () => {
    const r = transferBatchItemCore(10, 5, 3);
    expect(r.actual).toBe(3);
    expect(r.newWH).toBe(7);
    expect(r.newFS).toBe(8);
    expect(r.shortfall).toBe(false);
    expect(r.shortfall_qty).toBe(0);
  });

  it('WH ไม่พอ: ย้ายเท่าที่มี → shortfall', () => {
    const r = transferBatchItemCore(2, 5, 10);
    expect(r.actual).toBe(2);
    expect(r.newWH).toBe(0);
    expect(r.newFS).toBe(7);
    expect(r.shortfall).toBe(true);
    expect(r.shortfall_qty).toBe(8);
  });

  it('WH = 0: ย้ายไม่ได้เลย → actual=0, shortfall ทั้งหมด', () => {
    const r = transferBatchItemCore(0, 5, 3);
    expect(r.actual).toBe(0);
    expect(r.newWH).toBe(0);
    expect(r.newFS).toBe(5); // FS ไม่เปลี่ยน
    expect(r.shortfall).toBe(true);
    expect(r.shortfall_qty).toBe(3);
  });

  it('requestedQty = WH พอดี: ย้ายหมด, shortfall=false', () => {
    const r = transferBatchItemCore(5, 0, 5);
    expect(r.actual).toBe(5);
    expect(r.newWH).toBe(0);
    expect(r.newFS).toBe(5);
    expect(r.shortfall).toBe(false);
    expect(r.shortfall_qty).toBe(0);
  });

  it('requestedQty = 1, WH = 1000: ย้าย 1', () => {
    const r = transferBatchItemCore(1000, 0, 1);
    expect(r.actual).toBe(1);
    expect(r.newWH).toBe(999);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('deductMaterialsCore (pure math จาก deductMaterials GAS:1047-1091)', () => {
  it('หักวัสดุที่มีพอ: deducted = qty ที่ขอ', () => {
    const stock = { 'CH001': 10, 'OL002': 5 };
    const r = deductMaterialsCore(stock, [{ sku: 'CH001', qty: 3 }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ sku: 'CH001', deducted: 3, newWH: 7 });
  });

  it('หักวัสดุที่ไม่พอ: deducted = qty คงเหลือ (clamp)', () => {
    const stock = { 'CH001': 2 };
    const r = deductMaterialsCore(stock, [{ sku: 'CH001', qty: 10 }]);
    expect(r[0].deducted).toBe(2);
    expect(r[0].newWH).toBe(0);
  });

  it('SKU ไม่พบใน stock → ข้าม (ไม่ push ลง results)', () => {
    const stock = { 'CH001': 10 };
    const r = deductMaterialsCore(stock, [{ sku: 'NOTEXIST', qty: 5 }]);
    expect(r).toHaveLength(0);
  });

  it('SKU case-insensitive: "ch001" ตรงกับ "CH001" ใน stockMap', () => {
    const stock = { 'CH001': 10 };
    const r = deductMaterialsCore(stock, [{ sku: 'ch001', qty: 3 }]);
    expect(r[0].sku).toBe('CH001');
    expect(r[0].deducted).toBe(3);
  });

  it('หลาย SKU ในครั้งเดียว: ผลลัพธ์ทุกอันถูกต้อง', () => {
    const stock = { 'A001': 10, 'B002': 8 };
    const r = deductMaterialsCore(stock, [
      { sku: 'A001', qty: 4 },
      { sku: 'B002', qty: 3 },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ sku: 'A001', deducted: 4, newWH: 6 });
    expect(r[1]).toMatchObject({ sku: 'B002', deducted: 3, newWH: 5 });
  });

  it('SKU เดียวกัน 2 ครั้ง: หักสะสม (stock ลดทีละรอบ)', () => {
    const stock = { 'A001': 10 };
    const r = deductMaterialsCore(stock, [
      { sku: 'A001', qty: 4 },
      { sku: 'A001', qty: 4 },
    ]);
    expect(r[0].newWH).toBe(6);
    expect(r[1].newWH).toBe(2);
  });

  it('qty <= 0 → ข้าม item', () => {
    const stock = { 'A001': 10 };
    const r = deductMaterialsCore(stock, [{ sku: 'A001', qty: 0 }]);
    expect(r).toHaveLength(0);
  });

  it('items ว่าง → คืน []', () => {
    expect(deductMaterialsCore({ 'A001': 10 }, [])).toEqual([]);
  });

  it('stockMap ไม่ mutate ตัวแปรต้นฉบับ', () => {
    const stock = { 'A001': 10 };
    deductMaterialsCore(stock, [{ sku: 'A001', qty: 5 }]);
    expect(stock['A001']).toBe(10); // ต้นฉบับไม่เปลี่ยน
  });
});
