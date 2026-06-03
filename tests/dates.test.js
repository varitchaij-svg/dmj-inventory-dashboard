// tests/dates.test.js — ทดสอบ monthsSince และ monthLabel
import { describe, it, expect } from 'vitest';
import { monthsSince, monthLabel } from './helpers.js';

describe('monthsSince', () => {
  it('รับ ISO date เก่า → คืนตัวเลขบวก', () => {
    const result = monthsSince('2024-01-15');
    expect(result).toBeGreaterThan(0);
  });

  it('รับ DD/MM/YYYY format ทำงานได้', () => {
    const result = monthsSince('01/01/2024');
    expect(result).toBeGreaterThan(0);
  });

  it('วันที่อนาคต → คืน 0 (ไม่ติดลบ)', () => {
    const result = monthsSince('2099-12-31');
    expect(result).toBe(0);
  });

  it('null → คืน null', () => {
    expect(monthsSince(null)).toBeNull();
  });

  it('undefined → คืน null', () => {
    expect(monthsSince(undefined)).toBeNull();
  });

  it('string ที่ parse ไม่ได้ → คืน null', () => {
    expect(monthsSince('not-a-date')).toBeNull();
    expect(monthsSince('พังๆ')).toBeNull();
    expect(monthsSince('')).toBeNull();
  });

  it('ขอบเดือน: วันที่ยังไม่ครบเดือน → นับหักหนึ่ง', () => {
    // วันที่ปัจจุบัน 2026-06-03 (today = 2026-06-03 per system context)
    // อ้างอิง 2026-05-04: 3 < 4 → mo = 1 - 1 = 0
    const result = monthsSince('2026-05-04');
    expect(result).toBe(0);
    // อ้างอิง 2026-05-03: 3 === 3 → ครบเดือนพอดี → mo = 1 (ไม่หัก)
    const result2 = monthsSince('2026-05-03');
    expect(result2).toBe(1);
    // อ้างอิง 2026-05-01: 3 > 1 → mo = 1 (ครบเดือน)
    const result3 = monthsSince('2026-05-01');
    expect(result3).toBe(1);
  });

  it('วันที่เดือนก่อน (ครบ 2 เดือน) → 2', () => {
    // 2026-04-01 → 2 เดือน (3 >= 1)
    const result = monthsSince('2026-04-01');
    expect(result).toBe(2);
  });
});

describe('monthLabel', () => {
  it('"01/2026" → "ม.ค. 26"', () => {
    expect(monthLabel('01/2026')).toBe('ม.ค. 26');
  });

  it('"12/2025" → "ธ.ค. 25"', () => {
    expect(monthLabel('12/2025')).toBe('ธ.ค. 25');
  });

  it('"06/2024" → "มิ.ย. 24"', () => {
    expect(monthLabel('06/2024')).toBe('มิ.ย. 24');
  });

  it('input พัง (ไม่มี /) → คืนค่าเดิมใน format "bad "', () => {
    // "bad".split("/") = ["bad"] → m="bad", y=undefined
    // names[NaN-1] = undefined → fallback ใช้ m = "bad"
    const result = monthLabel('bad');
    expect(result).toContain('bad');
  });
});
