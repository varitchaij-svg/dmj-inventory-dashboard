// tests/app.test.js — ทดสอบ enrichDataCore (pure logic จาก app.jsx:231)
import { describe, it, expect } from 'vitest';
import { enrichDataCore } from './helpers.js';

describe('enrichDataCore — guards', () => {
  it('null → คืน null', () => {
    expect(enrichDataCore(null)).toBeNull();
  });

  it('undefined → คืน undefined', () => {
    expect(enrichDataCore(undefined)).toBeUndefined();
  });

  it('object ที่ไม่มี products → คืนเดิม ไม่ throw', () => {
    const d = { orders: [] };
    expect(enrichDataCore(d)).toBe(d);
  });

  it('products=null → คืนเดิม ไม่ throw', () => {
    const d = { products: null };
    expect(enrichDataCore(d)).toBe(d);
  });
});

describe('enrichDataCore — null-safety บน fields สินค้า', () => {
  it('name=null → ไม่ throw', () => {
    const d = { products: [{ name: null, qtyWH: 0 }] };
    expect(() => enrichDataCore(d)).not.toThrow();
  });

  it('name=undefined → ไม่ throw', () => {
    const d = { products: [{ name: undefined, qtyWH: 0 }] };
    expect(() => enrichDataCore(d)).not.toThrow();
  });

  it('tag=undefined → supplierTags และ statusTags เป็น array ว่าง', () => {
    const d = { products: [{ qtyWH: 0 }] };
    enrichDataCore(d);
    expect(d.products[0].supplierTags).toEqual([]);
    expect(d.products[0].statusTags).toEqual([]);
  });
});

describe('enrichDataCore — category normalization', () => {
  it('category → คัดลอกเป็น cat', () => {
    const d = { products: [{ category: 'แจกัน', qtyWH: 0 }] };
    enrichDataCore(d);
    expect(d.products[0].cat).toBe('แจกัน');
  });

  it('cat มีอยู่แล้ว → ไม่ทับด้วย category', () => {
    const d = { products: [{ cat: 'เดิม', category: 'ใหม่', qtyWH: 0 }] };
    enrichDataCore(d);
    expect(d.products[0].cat).toBe('เดิม');
  });
});

describe('enrichDataCore — tag parsing', () => {
  it('tag ผสม EN+TH → แยก supplierTags (EN) กับ statusTags (TH) ถูกต้อง', () => {
    const d = { products: [{ tag: 'S001,ขายหน้าร้าน,B002,สินค้าจมเกิน2เดือน', qtyWH: 0 }] };
    enrichDataCore(d);
    expect(d.products[0].supplierTags).toEqual(['S001', 'B002']);
    expect(d.products[0].statusTags).toEqual(['ขายหน้าร้าน', 'สินค้าจมเกิน2เดือน']);
  });

  it('tag EN ล้วน → statusTags ว่าง', () => {
    const d = { products: [{ tag: 'VENDOR1,VENDOR2', qtyWH: 0 }] };
    enrichDataCore(d);
    expect(d.products[0].supplierTags).toEqual(['VENDOR1', 'VENDOR2']);
    expect(d.products[0].statusTags).toEqual([]);
  });

  it('supplierTags มีค่า → vendor ถูก set จาก tag แรก', () => {
    const d = { products: [{ tag: 'VENDOR1,VENDOR2', qtyWH: 0 }] };
    enrichDataCore(d);
    expect(d.products[0].vendor).toBe('VENDOR1');
  });

  it('supplierTags ว่าง → vendor ไม่ถูก set', () => {
    const d = { products: [{ tag: 'ขายหน้าร้าน', qtyWH: 0 }] };
    enrichDataCore(d);
    expect(d.products[0].vendor).toBeUndefined();
  });
});

describe('enrichDataCore — deadMonths', () => {
  it('qtyWH=0 → deadMonths=null (ของหมดคลัง ไม่นับว่าจม)', () => {
    const d = { products: [{ qtyWH: 0, lastTransferDate: '2020-01-01' }] };
    enrichDataCore(d);
    expect(d.products[0].deadMonths).toBeNull();
  });

  it('qtyWH>0 + lastTransferDate เก่า → deadMonths > 0', () => {
    const d = { products: [{ qtyWH: 5, lastTransferDate: '2024-01-01' }] };
    enrichDataCore(d);
    expect(d.products[0].deadMonths).toBeGreaterThan(0);
  });

  it('qtyWH>0 + ไม่มี date เลย → deadMonths=null', () => {
    const d = { products: [{ qtyWH: 5 }] };
    enrichDataCore(d);
    expect(d.products[0].deadMonths).toBeNull();
  });

  it('qtyWH>0 + lastStockInDate fallback (ไม่มี lastTransferDate) → deadMonths > 0', () => {
    const d = { products: [{ qtyWH: 5, lastStockInDate: '2024-06-01' }] };
    enrichDataCore(d);
    expect(d.products[0].deadMonths).toBeGreaterThan(0);
  });

  it('warehouseQty ใช้ได้เหมือน qtyWH', () => {
    const d = { products: [{ warehouseQty: 3, lastTransferDate: '2024-01-01' }] };
    enrichDataCore(d);
    expect(d.products[0].deadMonths).toBeGreaterThan(0);
  });
});

describe('enrichDataCore — tag edge cases', () => {
  it('tag มี spaces รอบ comma → trim ออก', () => {
    const d = { products: [{ tag: ' S001 , ขายหน้าร้าน , B002 ', qtyWH: 0 }] };
    enrichDataCore(d);
    expect(d.products[0].supplierTags).toEqual(['S001', 'B002']);
    expect(d.products[0].statusTags).toEqual(['ขายหน้าร้าน']);
  });

  it('tag ว่าง ("") → supplierTags และ statusTags เป็น []', () => {
    const d = { products: [{ tag: '', qtyWH: 0 }] };
    enrichDataCore(d);
    expect(d.products[0].supplierTags).toEqual([]);
    expect(d.products[0].statusTags).toEqual([]);
  });

  it('tag มี comma ซ้อน → filter out string ว่าง', () => {
    const d = { products: [{ tag: 'S001,,S002', qtyWH: 0 }] };
    enrichDataCore(d);
    expect(d.products[0].supplierTags).toEqual(['S001', 'S002']);
  });

  it('tag เป็น number → แปลงเป็น string ไม่ throw', () => {
    const d = { products: [{ tag: 12345, qtyWH: 0 }] };
    expect(() => enrichDataCore(d)).not.toThrow();
  });
});

describe('enrichDataCore — หลายสินค้าในครั้งเดียว', () => {
  it('products หลายอัน: แต่ละอันได้รับ enrichment ถูกต้อง', () => {
    const d = {
      products: [
        { sku: 'A001', tag: 'VENDOR1', category: 'แจกัน', qtyWH: 0 },
        { sku: 'B002', tag: 'สินค้าจม', category: 'ดอกไม้', qtyWH: 5, lastTransferDate: '2024-01-01' },
      ],
    };
    enrichDataCore(d);
    expect(d.products[0].vendor).toBe('VENDOR1');
    expect(d.products[0].cat).toBe('แจกัน');
    expect(d.products[1].statusTags).toEqual(['สินค้าจม']);
    expect(d.products[1].deadMonths).toBeGreaterThan(0);
  });
});

describe('enrichDataCore — deadMonths edge cases', () => {
  it('qtyWH=0, warehouseQty=0 → deadMonths=null (ทั้งสองฟิลด์ = 0)', () => {
    const d = { products: [{ qtyWH: 0, warehouseQty: 0, lastTransferDate: '2024-01-01' }] };
    enrichDataCore(d);
    expect(d.products[0].deadMonths).toBeNull();
  });

  it('warehouseQty>0, lastTransferDate อนาคต → deadMonths = 0 (ไม่ติดลบ)', () => {
    const d = { products: [{ warehouseQty: 5, lastTransferDate: '2099-01-01' }] };
    enrichDataCore(d);
    expect(d.products[0].deadMonths).toBe(0);
  });

  it('warehouseQty>0, lastStockInDate อนาคต, ไม่มี lastTransferDate → deadMonths = 0', () => {
    const d = { products: [{ warehouseQty: 5, lastStockInDate: '2099-01-01' }] };
    enrichDataCore(d);
    expect(d.products[0].deadMonths).toBe(0);
  });
});
