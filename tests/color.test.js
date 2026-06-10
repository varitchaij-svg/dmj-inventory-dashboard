// tests/color.test.js — ทดสอบ detectColor (views.jsx:1502)
import { describe, it, expect } from 'vitest';
import { detectColor, COLOR_MAP } from './helpers.js';

describe('detectColor — guards', () => {
  it('null → null', () => {
    expect(detectColor(null)).toBeNull();
  });

  it('undefined → null', () => {
    expect(detectColor(undefined)).toBeNull();
  });

  it('string ว่าง → null', () => {
    expect(detectColor('')).toBeNull();
  });

  it('ชื่อที่ไม่มีสี → null', () => {
    expect(detectColor('แจกันทรงสูง')).toBeNull();
    expect(detectColor('HL001')).toBeNull();
  });
});

describe('detectColor — exact match', () => {
  it('"บานเย็น" → entry ที่ถูกต้อง', () => {
    const r = detectColor('บานเย็น');
    expect(r).toEqual(COLOR_MAP['บานเย็น']);
    expect(r.en).toBe('Magenta');
  });

  it('"ขาว" → White', () => {
    expect(detectColor('ขาว').en).toBe('White');
  });

  it('"ดำ" → Black', () => {
    expect(detectColor('ดำ').en).toBe('Black');
  });

  it('ชื่อมีสีฝังใน → detect ได้', () => {
    expect(detectColor('แจกันสีแดง').en).toBe('Red');
    expect(detectColor('กระถางเขียวอ่อนทรงกลม').en).toBe('GreenLight');
  });
});

describe('detectColor — compound key priority (ยาวก่อนสั้น)', () => {
  it('"เขียวเข้ม" → GreenDark ไม่ใช่ Green', () => {
    expect(detectColor('เขียวเข้ม').en).toBe('GreenDark');
  });

  it('"เขียวอ่อน" → GreenLight ไม่ใช่ Green', () => {
    expect(detectColor('เขียวอ่อน').en).toBe('GreenLight');
  });

  it('"น้ำเงิน" → Navy ไม่ใช่ Silver (น้ำเงิน มี "เงิน" ฝังอยู่)', () => {
    const r = detectColor('น้ำเงิน');
    expect(r.en).toBe('Navy');
  });

  it('"น้ำเงินเข้ม" → NavyDark', () => {
    expect(detectColor('น้ำเงินเข้ม').en).toBe('NavyDark');
  });

  it('"น้ำตาลอ่อน" → BrownLight ไม่ใช่ Brown', () => {
    expect(detectColor('น้ำตาลอ่อน').en).toBe('BrownLight');
  });

  it('"ชมพูเข้ม" → PinkDark', () => {
    expect(detectColor('ชมพูเข้ม').en).toBe('PinkDark');
  });
});

describe('detectColor — return shape', () => {
  it('ทุก entry มี .name, .hex, .en', () => {
    const r = detectColor('แดง');
    expect(r).toHaveProperty('name');
    expect(r).toHaveProperty('hex');
    expect(r).toHaveProperty('en');
  });

  it('.hex เป็น CSS hex color (#rrggbb)', () => {
    const r = detectColor('เขียว');
    expect(r.hex).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('.name ตรงกับ key ที่ใช้ค้นหา', () => {
    expect(detectColor('มิ้นต์').name).toBe('มิ้นต์');
    expect(detectColor('เทาอ่อน').name).toBe('เทาอ่อน');
  });
});
