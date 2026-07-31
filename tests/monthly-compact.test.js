// ยอดขายรายเดือนแบบย่อ (`p.mo`) → กางกลับเป็น `p.monthly` เต็มรูปแบบเดิม
// ทำไมต้องมีเทสต์ชุดนี้: การย่อนี้อยู่บนเส้นทางข้อมูลของ **ทุก role ทุกหน้า** และถ้ากางผิด
// จะไม่มี error ให้เห็นเลย — แค่ตัวเลข "ควรสั่ง"/"กำลังมาแรง"/"สินค้าจม" เพี้ยนเงียบ ๆ
// จุดที่พังง่ายสุดคือ "ตำแหน่งของเดือน" เพราะ view อ่านด้วย slice(-3)/slice(0,half)
// ไม่ได้อ่านด้วยชื่อเดือน → เดือนที่ยอดเป็น 0 ต้องยังคงอยู่ในอาร์เรย์ ห้ามหายไป
import { describe, it, expect } from 'vitest';
import { expandMonthlyCompact } from './helpers';

const LABELS = ['01/2026', '02/2026', '03/2026', '04/2026', '05/2026'];
const mk = (products) => ({ monthLabels: LABELS, products });

describe('expandMonthlyCompact', () => {
  it('กางเป็นอาร์เรย์ที่มีครบทุกเดือน เรียงตาม monthLabels', () => {
    const d = mk([{ sku: 'A', mo: [[1, 5, 500]] }]);
    expandMonthlyCompact(d);
    expect(d.products[0].monthly).toEqual([
      { month: '01/2026', qty: 0, sales: 0 },
      { month: '02/2026', qty: 5, sales: 500 },
      { month: '03/2026', qty: 0, sales: 0 },
      { month: '04/2026', qty: 0, sales: 0 },
      { month: '05/2026', qty: 0, sales: 0 },
    ]);
  });

  it('เดือนที่ไม่มียอดต้องยังอยู่ครบ — slice(-3) ต้องหมายถึง "3 เดือนหลังสุด" จริง ๆ', () => {
    // สินค้าขายแค่เดือนแรกเดือนเดียว: 3 เดือนหลังสุดต้องได้ยอด 0 ไม่ใช่ยอดของเดือนที่ขายได้
    const d = mk([{ sku: 'A', mo: [[0, 99, 9900]] }]);
    expandMonthlyCompact(d);
    const last3 = d.products[0].monthly.slice(-3);
    expect(last3.map(x => x.month)).toEqual(['03/2026', '04/2026', '05/2026']);
    expect(last3.reduce((s, x) => s + x.qty, 0)).toBe(0);
  });

  it('ครึ่งแรก/ครึ่งหลัง (slice ตามตำแหน่ง) ยังคำนวณได้ถูก', () => {
    const d = mk([{ sku: 'A', mo: [[0, 10, 0], [4, 2, 0]] }]);
    expandMonthlyCompact(d);
    const m = d.products[0].monthly;
    const half = Math.floor(m.length / 2);
    expect(m.slice(0, half).reduce((s, x) => s + x.qty, 0)).toBe(10);
    expect(m.slice(half).reduce((s, x) => s + x.qty, 0)).toBe(2);
  });

  it('`mo` ว่าง = มีแถวในชีตยอดขายแต่ขายไม่ได้เลย → monthly ต้องยาวเท่าจำนวนเดือน (ไม่ใช่ 0)', () => {
    // OverviewView ใช้ (p.monthly||[]).length > 0 แยก "ไม่มีข้อมูลขาย" ออกจาก "มีข้อมูลแต่ไม่ขาย"
    const d = mk([{ sku: 'A', mo: [] }]);
    expandMonthlyCompact(d);
    expect(d.products[0].monthly).toHaveLength(LABELS.length);
    expect(d.products[0].monthly.every(x => x.qty === 0 && x.sales === 0)).toBe(true);
  });

  it('สินค้าที่ไม่มีคีย์ `mo` เลย = ไม่มีข้อมูลขาย → ต้องไม่สร้าง monthly ขึ้นมา', () => {
    const d = mk([{ sku: 'A' }]);
    expandMonthlyCompact(d);
    expect(d.products[0].monthly).toBeUndefined();
  });

  it('ลบ `mo` ทิ้งหลังกาง — ไม่เก็บซ้ำสองรูปแบบใน localStorage', () => {
    const d = mk([{ sku: 'A', mo: [[0, 1, 1]] }]);
    expandMonthlyCompact(d);
    expect('mo' in d.products[0]).toBe(false);
  });

  it('payload รูปแบบเก่า (มี monthly อยู่แล้ว ไม่มี mo) ต้องไม่ถูกแตะ', () => {
    const old = [{ month: '01/2026', qty: 7, sales: 700 }];
    const d = mk([{ sku: 'A', monthly: old }]);
    expandMonthlyCompact(d);
    expect(d.products[0].monthly).toBe(old);
  });

  it('ดัชนีเดือนที่เกินขอบเขต (payload เพี้ยน) ต้องข้ามไป ไม่ throw', () => {
    const d = mk([{ sku: 'A', mo: [[99, 5, 500], [0, 1, 100]] }]);
    expect(() => expandMonthlyCompact(d)).not.toThrow();
    expect(d.products[0].monthly[0]).toEqual({ month: '01/2026', qty: 1, sales: 100 });
  });

  it('ไม่มี monthLabels → ไม่ throw (คืนอาร์เรย์ว่าง)', () => {
    const d = { products: [{ sku: 'A', mo: [[0, 1, 1]] }] };
    expect(() => expandMonthlyCompact(d)).not.toThrow();
    expect(d.products[0].monthly).toEqual([]);
  });

  it('payload ที่ไม่มี products ต้องคืนค่าเดิม ไม่ throw', () => {
    expect(() => expandMonthlyCompact(null)).not.toThrow();
    expect(() => expandMonthlyCompact({})).not.toThrow();
  });

  it('รวมยอดทั้งปีเท่าเดิมหลังกาง (ไม่มีข้อมูลหาย)', () => {
    const rows = [[0, 3, 300], [2, 4, 400], [4, 5, 500]];
    const d = mk([{ sku: 'A', mo: rows }]);
    expandMonthlyCompact(d);
    const m = d.products[0].monthly;
    expect(m.reduce((s, x) => s + x.qty, 0)).toBe(12);
    expect(m.reduce((s, x) => s + x.sales, 0)).toBe(1200);
  });
});
