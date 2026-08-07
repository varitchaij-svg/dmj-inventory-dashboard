// tests/parsing.test.js — ทดสอบ compareSku, mtoBase, parseQty_, parseNum_, parseLocation_
import { describe, it, expect } from 'vitest';
import { compareSku, mtoBase, parseQty_, parseNum_, parseLocation_, lockKeyOf_ } from './helpers.js';

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

describe('parseQty_', () => {
  it('null → { num:0, status:"empty" }', () => {
    expect(parseQty_(null)).toEqual({ num: 0, status: 'empty' });
  });

  it('string ว่าง → empty', () => {
    expect(parseQty_('')).toEqual({ num: 0, status: 'empty' });
  });

  it('"out of stock full" → oosfull', () => {
    expect(parseQty_('out of stock full')).toEqual({ num: 0, status: 'oosfull' });
  });

  it('"OUT OF STOCK FULL" (uppercase) → oosfull (case-insensitive)', () => {
    expect(parseQty_('OUT OF STOCK FULL')).toEqual({ num: 0, status: 'oosfull' });
  });

  it('"out of stock" → oos', () => {
    expect(parseQty_('out of stock')).toEqual({ num: 0, status: 'oos' });
  });

  it('ตัวเลขปกติ → { num, status:"ok" }', () => {
    expect(parseQty_(5)).toEqual({ num: 5, status: 'ok' });
    expect(parseQty_('42')).toEqual({ num: 42, status: 'ok' });
    expect(parseQty_(0)).toEqual({ num: 0, status: 'ok' });
  });

  it('"1,234" → { num:1234, status:"ok" } (strip commas)', () => {
    expect(parseQty_('1,234')).toEqual({ num: 1234, status: 'ok' });
  });

  it('ติดลบ → status:"negative"', () => {
    expect(parseQty_(-5)).toEqual({ num: -5, status: 'negative' });
  });

  it('string ที่ parse ไม่ได้ → { num:0, status:"unknown" }', () => {
    expect(parseQty_('abc')).toEqual({ num: 0, status: 'unknown' });
    expect(parseQty_('N/A')).toEqual({ num: 0, status: 'unknown' });
  });
});

describe('parseNum_', () => {
  it('null → 0', () => {
    expect(parseNum_(null)).toBe(0);
  });

  it('string ว่าง → 0', () => {
    expect(parseNum_('')).toBe(0);
  });

  it('ตัวเลขปกติ → คืนค่าเดิม', () => {
    expect(parseNum_(5)).toBe(5);
    expect(parseNum_('5.5')).toBe(5.5);
  });

  it('"1,234.56" → 1234.56 (strip commas)', () => {
    expect(parseNum_('1,234.56')).toBe(1234.56);
  });

  it('"฿1,500" → 1500 (strip ฿ และ comma)', () => {
    expect(parseNum_('฿1,500')).toBe(1500);
  });

  it('string ที่ parse ไม่ได้ → 0', () => {
    expect(parseNum_('abc')).toBe(0);
  });
});

describe('parseLocation_', () => {
  it('null/undefined → null', () => {
    expect(parseLocation_(null)).toBeNull();
    expect(parseLocation_(undefined)).toBeNull();
    expect(parseLocation_('')).toBeNull();
  });

  it('"A12/3" → { raw:"A12/3", valid:true, side:"A", shelf:12, lock:3 }', () => {
    expect(parseLocation_('A12/3')).toEqual({ raw: 'A12/3', valid: true, side: 'A', shelf: 12, lock: 3 });
  });

  it('"B5/10" → side:"B", shelf:5, lock:10', () => {
    expect(parseLocation_('B5/10')).toEqual({ raw: 'B5/10', valid: true, side: 'B', shelf: 5, lock: 10 });
  });

  it('"a1/1" (lowercase) → side:"A" (uppercase)', () => {
    const r = parseLocation_('a1/1');
    expect(r).not.toBeNull();
    expect(r.side).toBe('A');
  });

  it('"C5/10" → null (ไม่ใช่ A หรือ B)', () => {
    expect(parseLocation_('C5/10')).toBeNull();
  });

  it('"A12" → null (ขาด /lock)', () => {
    expect(parseLocation_('A12')).toBeNull();
  });

  it('รูปแบบไม่รู้จัก → null', () => {
    expect(parseLocation_('blah')).toBeNull();
    expect(parseLocation_('A/3')).toBeNull();  // ขาดเลขชั้น
  });
});

// ─── ช่อง "ไม่ได้อยู่บนชั้น" (A0 / B0) ────────────────────────────────────────
// ของที่วางพื้น/นอกชั้นวางในซอยนั้น — ไม่มีเลขล็อค จึงเป็นรูปแบบพิเศษของตำแหน่งจัดเก็บ
describe('parseLocation_ — ช่องไม่ได้อยู่บนชั้น A0/B0', () => {
  it('"A0" → shelf 0, lock 0, floor true', () => {
    expect(parseLocation_('A0')).toEqual({
      raw: 'A0', valid: true, side: 'A', shelf: 0, lock: 0, floor: true,
    });
  });

  it('"B0" → side B', () => {
    expect(parseLocation_('B0')).toEqual({
      raw: 'B0', valid: true, side: 'B', shelf: 0, lock: 0, floor: true,
    });
  });

  it('"b0" (พิมพ์เล็ก) / มีช่องว่างหน้า-หลัง → ยังอ่านได้', () => {
    expect(parseLocation_('b0').side).toBe('B');
    expect(parseLocation_(' A0 ')).toMatchObject({ side: 'A', floor: true });
  });

  it('"C0" → null (ซอยมีแค่ A กับ B)', () => {
    expect(parseLocation_('C0')).toBeNull();
  });

  it('ล็อคปกติต้องไม่ถูกตีเป็นช่องไม่อยู่บนชั้น', () => {
    expect(parseLocation_('A1/3').floor).toBeUndefined();
    expect(parseLocation_('A10/1').shelf).toBe(10);   // "A10" ต้องไม่ชนกับ "A1"+"0"
  });
});

describe('lockKeyOf_', () => {
  it('ล็อคปกติ → "A3/7" (รูปแบบเดิมทุกประการ)', () => {
    expect(lockKeyOf_(parseLocation_('A3/7'))).toBe('A3/7');
    expect(lockKeyOf_(parseLocation_('B12/15'))).toBe('B12/15');
  });

  // ⚠️ ข้อนี้คือเหตุผลที่ helper นี้มีอยู่ — ต่อ string เองจะได้ "A0/0"
  //    ซึ่งไม่ตรงกับคีย์ที่เขียนในชีต แล้วของจะหายจากแผนผังโดยไม่มี error ให้เห็น
  it('ช่องไม่อยู่บนชั้น → "A0" ไม่ใช่ "A0/0"', () => {
    expect(lockKeyOf_(parseLocation_('A0'))).toBe('A0');
    expect(lockKeyOf_(parseLocation_('B0'))).toBe('B0');
  });

  it('ไป-กลับแล้วได้ค่าเดิม (parse → key → parse)', () => {
    ['A0', 'B0', 'A3/7', 'B12/15'].forEach(raw => {
      expect(lockKeyOf_(parseLocation_(raw))).toBe(raw);
    });
  });

  it('null → null', () => {
    expect(lockKeyOf_(null)).toBeNull();
    expect(lockKeyOf_(parseLocation_('blah'))).toBeNull();
  });
});
