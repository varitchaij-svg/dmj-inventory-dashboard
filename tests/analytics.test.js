// tests/analytics.test.js — YoY series + ABC classification + threshold sanitize
import { describe, it, expect } from 'vitest';
import { buildYoYSeries, abcClassify, sanitizeThresholds, THRESHOLDS_DEFAULT } from './helpers.js';

// ────────────────────────────────────────────────────────────────────
describe('buildYoYSeries', () => {
  const mbc = {
    '01/2025': { 'แจกัน': { qty: 10, sales: 1000 }, 'ดอกไม้': { qty: 5, sales: 500 } },
    '06/2025': { 'แจกัน': { qty: 20, sales: 2000 } },
    '01/2026': { 'แจกัน': { qty: 30, sales: 3000 } },
  };
  const labels = ['01/2025', '06/2025', '01/2026'];

  it('ดึงปีจาก monthLabels เรียงจากเก่าไปใหม่', () => {
    const { years } = buildYoYSeries(labels, mbc);
    expect(years).toEqual(['2025', '2026']);
  });

  it('คืน 12 แถวเสมอ (ม.ค.–ธ.ค.)', () => {
    const { rows } = buildYoYSeries(labels, mbc);
    expect(rows).toHaveLength(12);
    expect(rows[0].label).toBe('ม.ค.');
    expect(rows[11].label).toBe('ธ.ค.');
  });

  it('รวม rev/qty ข้ามหมวดในเดือนเดียวกัน', () => {
    const { rows } = buildYoYSeries(labels, mbc);
    expect(rows[0].y2025).toBe(1500); // ม.ค. 2025 = 1000 + 500
    expect(rows[0].q2025).toBe(15);
    expect(rows[0].y2026).toBe(3000);
  });

  it('เดือนที่ไม่มีข้อมูล → ไม่มี key ของปีนั้น (ให้กราฟเว้นช่อง ไม่ลากเส้นเป็นศูนย์)', () => {
    const { rows } = buildYoYSeries(labels, mbc);
    expect(rows[1].y2025).toBeUndefined(); // ก.พ. 2025 ไม่มีข้อมูล
    expect(rows[5].y2025).toBe(2000);      // มิ.ย. 2025 มี
    expect(rows[5].y2026).toBeUndefined(); // มิ.ย. 2026 ไม่มี
  });

  it('input ว่าง/พัง ไม่ throw', () => {
    expect(buildYoYSeries(null, null).years).toEqual([]);
    expect(buildYoYSeries([], {}).rows).toHaveLength(12);
    expect(buildYoYSeries(['bad-label', '13/xxxx'], {}).years).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────
describe('abcClassify', () => {
  it('แบ่ง A/B/C ตามสัดส่วนสะสมของยอดขาย (80/95)', () => {
    const products = [
      { sku: 'A1', soldRev: 800 },  // 0% ก่อนบวก → A
      { sku: 'B1', soldRev: 150 },  // 80% ก่อนบวก → B
      { sku: 'C1', soldRev: 50 },   // 95% ก่อนบวก → C
    ];
    const map = abcClassify(products);
    expect(map.A1).toBe('A');
    expect(map.B1).toBe('B');
    expect(map.C1).toBe('C');
  });

  it('ตัวท็อปเป็น A เสมอ แม้ตัวเดียวกินยอดเกิน 80%', () => {
    const map = abcClassify([
      { sku: 'TOP', soldRev: 99000 },
      { sku: 'X', soldRev: 1000 },
    ]);
    expect(map.TOP).toBe('A');
  });

  it('สินค้าไม่มียอดขาย = C เสมอ', () => {
    const map = abcClassify([
      { sku: 'S1', soldRev: 100 },
      { sku: 'Z1', soldRev: 0 },
      { sku: 'Z2' },
    ]);
    expect(map.Z1).toBe('C');
    expect(map.Z2).toBe('C');
  });

  it('ทุกตัวยอดศูนย์ → C หมด, ไม่หารศูนย์', () => {
    const map = abcClassify([{ sku: 'A' }, { sku: 'B' }]);
    expect(map).toEqual({ A: 'C', B: 'C' });
  });

  it('input ว่าง/ไม่มี sku ไม่ throw', () => {
    expect(abcClassify(null)).toEqual({});
    expect(abcClassify([{}, null, { soldRev: 5 }])).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────
describe('sanitizeThresholds', () => {
  it('ค่าปกติผ่านครบ', () => {
    const out = sanitizeThresholds({
      default: 20, coverMonths: 3,
      overrides: { 'แจกันแก้ว': 5 },
    });
    expect(out).toEqual({ default: 20, coverMonths: 3, overrides: { 'แจกันแก้ว': 5 } });
  });

  it('string number แปลงให้ (มาจาก input type=number บางเบราว์เซอร์)', () => {
    const out = sanitizeThresholds({ default: '25', coverMonths: '4', overrides: { 'x': '7' } });
    expect(out.default).toBe(25);
    expect(out.coverMonths).toBe(4);
    expect(out.overrides.x).toBe(7);
  });

  it('ค่าเพี้ยน → ใช้ default (ติดลบ, เกินเพดาน, NaN)', () => {
    const out = sanitizeThresholds({ default: -5, coverMonths: 99, overrides: { a: -1, b: 'xx', c: 3 } });
    expect(out.default).toBe(THRESHOLDS_DEFAULT.default);
    expect(out.coverMonths).toBe(THRESHOLDS_DEFAULT.coverMonths);
    expect(out.overrides).toEqual({ c: 3 });
  });

  it('shape ใช้ไม่ได้เลย → null (ให้ endpoint ตอบ error)', () => {
    expect(sanitizeThresholds(null)).toBeNull();
    expect(sanitizeThresholds('x')).toBeNull();
  });

  it('override เกิน 200 หมวดถูกตัด + ชื่อหมวดยาวถูก slice 100 ตัวอักษร', () => {
    const ov = {};
    for (let i = 0; i < 250; i++) ov['cat' + i] = 1;
    ov['ย'.repeat(150)] = 2;
    const out = sanitizeThresholds({ default: 10, coverMonths: 2, overrides: ov });
    expect(Object.keys(out.overrides).length).toBeLessThanOrEqual(200);
  });
});
