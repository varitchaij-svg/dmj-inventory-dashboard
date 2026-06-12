// tests/dates.test.js — ทดสอบ monthsSince, monthLabel, monthKey_, dayKey_
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { monthsSince, monthLabel, monthKey_, dayKey_ } from './helpers.js';

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

  // ──── Boundary tests ใช้ fake timers เพื่อ pin วันที่ → ไม่เปลี่ยนแปลงตาม calendar ────
  describe('ขอบเดือน (pinned: today = 2026-06-15)', () => {
    beforeAll(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15'));
    });
    afterAll(() => {
      vi.useRealTimers();
    });

    it('วันที่ยังไม่ครบเดือน → นับหักหนึ่ง', () => {
      // today = 2026-06-15
      // 2026-05-16: 15 < 16 → mo = 1 - 1 = 0
      expect(monthsSince('2026-05-16')).toBe(0);
      // 2026-05-15: 15 === 15 → ครบพอดี → mo = 1
      expect(monthsSince('2026-05-15')).toBe(1);
      // 2026-05-01: 15 > 1 → mo = 1
      expect(monthsSince('2026-05-01')).toBe(1);
    });

    it('ครบ 2 เดือน → 2', () => {
      // 2026-04-01: months = 2, 15 >= 1 → 2
      expect(monthsSince('2026-04-01')).toBe(2);
    });

    it('ครบ 2 เดือนแบบขอบ: วันเดียวกัน → 2', () => {
      // 2026-04-15: 15 === 15 → mo = 2
      expect(monthsSince('2026-04-15')).toBe(2);
    });

    it('วันตรงขอบข้ามปี (ม.ค. → มิ.ย.) → 5 เดือน', () => {
      // 2026-01-15: months = 5, 15 === 15 → mo = 5
      expect(monthsSince('2026-01-15')).toBe(5);
    });
  });
});

describe('monthKey_', () => {
  it('"5/2026" → "05/2026" (pad เลขเดือน)', () => {
    expect(monthKey_('5/2026')).toBe('05/2026');
  });

  it('"05/2026" → "05/2026" (already padded)', () => {
    expect(monthKey_('05/2026')).toBe('05/2026');
  });

  it('"12/2025" → "12/2025"', () => {
    expect(monthKey_('12/2025')).toBe('12/2025');
  });

  it('"01/05/2026" (DD/MM/YYYY) → ดึงเดือน "05/2026"', () => {
    expect(monthKey_('01/05/2026')).toBe('05/2026');
  });

  it('Date object (Sheets auto-convert) → "MM/YYYY"', () => {
    expect(monthKey_(new Date(2026, 4, 1))).toBe('05/2026');  // month index 4 = May
  });

  it('Date object ธันวาคม → "12/2025"', () => {
    expect(monthKey_(new Date(2025, 11, 15))).toBe('12/2025'); // month index 11 = Dec
  });

  it('รูปแบบไม่รู้จัก → null', () => {
    expect(monthKey_('not-a-date')).toBeNull();
    expect(monthKey_('2026-05')).toBeNull();    // ISO partial ไม่รองรับ
    expect(monthKey_('')).toBeNull();
  });
});

describe('dayKey_', () => {
  it('"5/1/2026" → "05/01/2026" (pad ทั้ง DD และ MM)', () => {
    expect(dayKey_('5/1/2026')).toBe('05/01/2026');
  });

  it('"15/06/2026" → "15/06/2026" (already padded)', () => {
    expect(dayKey_('15/06/2026')).toBe('15/06/2026');
  });

  it('Date object (Sheets auto-convert) → "DD/MM/YYYY"', () => {
    expect(dayKey_(new Date(2026, 4, 5))).toBe('05/05/2026');  // 5 May 2026
  });

  it('Date object วันที่สองหลัก → pad ถูกต้อง', () => {
    expect(dayKey_(new Date(2026, 11, 31))).toBe('31/12/2026'); // 31 Dec 2026
  });

  it('รูปแบบไม่รู้จัก → null', () => {
    expect(dayKey_('not-a-date')).toBeNull();
    expect(dayKey_('2026-05-01')).toBeNull();  // ISO format ไม่รองรับ
    expect(dayKey_('')).toBeNull();
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
