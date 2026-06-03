// tests/parsing.test.js — ทดสอบ compareSku และ mtoBase
import { describe, it, expect } from 'vitest';
import { compareSku, mtoBase } from './helpers.js';

describe('compareSku', () => {
  it('เรียง SKU แบบธรรมชาติ (prefix → num1 → num2)', () => {
    const items = [
      { sku: 'HL010' },
      { sku: 'HL002' },
      { sku: 'HL001' },
    ];
    items.sort(compareSku);
    expect(items.map(i => i.sku)).toEqual(['HL001', 'HL002', 'HL010']);
  });

  it('เรียง RT SKU ตาม color-part แล้ว sequence-part', () => {
    // RT09050 < RT09100 < RT10001
    const items = [
      { sku: 'RT10001' },
      { sku: 'RT09050' },
      { sku: 'RT09100' },
    ];
    items.sort(compareSku);
    expect(items.map(i => i.sku)).toEqual(['RT09050', 'RT09100', 'RT10001']);
  });

  it('SKU ต่าง prefix เรียงตามตัวอักษร', () => {
    const items = [
      { sku: 'RT01001' },
      { sku: 'HL01001' },
    ];
    items.sort(compareSku);
    expect(items[0].sku).toBe('HL01001');
  });

  it('SKU null/undefined ไม่ throw', () => {
    expect(() => compareSku({ sku: null }, { sku: 'HL001' })).not.toThrow();
    expect(() => compareSku({ sku: undefined }, { sku: undefined })).not.toThrow();
  });

  it('SKU รูปแบบแปลก (ไม่ match regex) → fallback เรียง string ปกติ', () => {
    // ไม่ crash
    expect(() => compareSku({ sku: 'ABC' }, { sku: 'XYZ' })).not.toThrow();
  });
});

describe('mtoBase', () => {
  it('"แจกัน #1" → "แจกัน"', () => {
    expect(mtoBase('แจกัน #1')).toBe('แจกัน');
  });

  it('"แจกัน 5" → "แจกัน"', () => {
    expect(mtoBase('แจกัน 5')).toBe('แจกัน');
  });

  it('"แจกัน" (ไม่มี suffix) → "แจกัน"', () => {
    expect(mtoBase('แจกัน')).toBe('แจกัน');
  });

  it('null/undefined/"" → "งานพิเศษ"', () => {
    expect(mtoBase(null)).toBe('งานพิเศษ');
    expect(mtoBase(undefined)).toBe('งานพิเศษ');
    expect(mtoBase('')).toBe('งานพิเศษ');
  });

  it('"แจกันชุด#1" → "แจกันชุด"', () => {
    expect(mtoBase('แจกันชุด#1')).toBe('แจกันชุด');
  });

  it('"จัดแบบพิเศษ #10 สีแดง" → "จัดแบบพิเศษ"', () => {
    expect(mtoBase('จัดแบบพิเศษ #10 สีแดง')).toBe('จัดแบบพิเศษ');
  });
});
