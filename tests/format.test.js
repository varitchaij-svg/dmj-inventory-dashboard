// tests/format.test.js — ทดสอบ fmtN, fmtB, fmtPct
import { describe, it, expect } from 'vitest';
import { fmtN, fmtB, fmtPct } from './helpers.js';

describe('fmtN', () => {
  it('1234 → มี comma (toLocaleString format)', () => {
    const result = fmtN(1234);
    // toLocaleString ใน Node อาจใช้ , หรือ . ขึ้นกับ locale — ตรวจว่าไม่ใช่ "0" และมีตัวเลขครบ
    expect(result).not.toBe('0');
    expect(result).toMatch(/1[,.]?234/);  // รองรับทั้ง en (1,234) และ th (1,234)
  });

  it('null → "0"', () => {
    expect(fmtN(null)).toBe('0');
  });

  it('undefined → "0"', () => {
    expect(fmtN(undefined)).toBe('0');
  });

  it('NaN → "0"', () => {
    expect(fmtN(NaN)).toBe('0');
  });

  it('0 → "0"', () => {
    expect(fmtN(0)).toBe('0');
  });

  it('ค่าทศนิยม → ปัดเป็น integer', () => {
    expect(fmtN(1.7)).toBe('2');
  });
});

describe('fmtB', () => {
  it('1500000 → มี "M" (ล้านบาท)', () => {
    const result = fmtB(1500000);
    expect(result).toContain('M');
    expect(result).toContain('฿');
    expect(result).toContain('1.50');
  });

  it('2500 → มี "K" (พัน)', () => {
    const result = fmtB(2500);
    expect(result).toContain('K');
    expect(result).toContain('฿');
    expect(result).toContain('2.5');
  });

  it('500 → มี "฿" (ไม่ scale)', () => {
    const result = fmtB(500);
    expect(result).toContain('฿');
    expect(result).not.toContain('K');
    expect(result).not.toContain('M');
  });

  it('ค่าลบ → คงเครื่องหมายลบในตัวเลข', () => {
    const result = fmtB(-500);
    expect(result).toContain('-');
    expect(result).toContain('฿');
  });

  it('ค่าลบล้าน → มี M', () => {
    const result = fmtB(-2000000);
    expect(result).toContain('M');
    expect(result).toContain('-');
  });

  it('null → "฿0"', () => {
    expect(fmtB(null)).toBe('฿0');
  });

  it('undefined → "฿0"', () => {
    expect(fmtB(undefined)).toBe('฿0');
  });
});

describe('fmtPct', () => {
  it('null → "—"', () => {
    expect(fmtPct(null)).toBe('—');
  });

  it('undefined → "—"', () => {
    expect(fmtPct(undefined)).toBe('—');
  });

  it('0.125 → "12.5%"', () => {
    expect(fmtPct(0.125)).toBe('12.5%');
  });

  it('1.0 → "100.0%"', () => {
    expect(fmtPct(1.0)).toBe('100.0%');
  });

  it('0 → "0.0%"', () => {
    expect(fmtPct(0)).toBe('0.0%');
  });

  it('decimals=2 → ทศนิยม 2 ตำแหน่ง', () => {
    expect(fmtPct(0.1256, 2)).toBe('12.56%');
  });
});
