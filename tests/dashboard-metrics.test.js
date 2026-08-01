// tests/dashboard-metrics.test.js — Phase 3 ของแผนตรวจ dashboard (docs/PLAN-DASHBOARD-AUDIT.md)
// คุม 3 เรื่องที่ "ผิดแล้วเจ้าของเอาไปตัดสินใจเรื่องเงินผิดตาม":
//   1) กติกาเดียวว่าสินค้าตัวไหนนับเข้าสถิติ (isCountableProduct) — ข้อ 3.1
//   2) กำไรขั้นต้นคิดจากเงินที่เข้าจริง ไม่ใช่ราคาป้าย + ไม่คิดต้นทุนของที่เบิกไป MTO — ข้อ 3.2/3.3
//   3) ABC ใช้หน้าต่าง 12 เดือนล่าสุด ไม่ใช่ยอดสะสมทั้งประวัติ — ข้อ 3.5
// เคสที่ต้องมีเสมอ: **วันนี้เป็นวันที่ 1 ของเดือน** — วันที่บั๊ก "เดือนที่ยังไม่จบ" แสดงตัวแรงสุด
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  completeMonths, currentMonthInfo, isCountableProduct,
  marginRowCore, abcClassify, abcWindowRev, ABC_WINDOW_MONTHS,
  momDeltaOf, wholesaleRatioOf, stockValuesOf, WHOLESALE_RATIO_FALLBACK,
} from './helpers.js';

// สร้าง array รายเดือนย้อนหลังจากเดือน anchor: ["MM/YYYY", ...] เรียงเก่า→ใหม่
function monthsBack(anchorY, anchorM, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(anchorY, anchorM - 1 - i, 1);
    out.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
describe('completeMonths / currentMonthInfo — เดือนที่ยังไม่จบ', () => {
  afterEach(() => vi.useRealTimers());

  it('วันที่ 1 ส.ค. → ตัด 08/2026 ออก เหลือเฉพาะเดือนที่จบแล้ว', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0)); // 1 ส.ค. 2026
    const monthly = [
      { month: '06/2026', qty: 30, sales: 3000 },
      { month: '07/2026', qty: 30, sales: 3000 },
      { month: '08/2026', qty: 1,  sales: 100 },
    ];
    const done = completeMonths(monthly);
    expect(done.map(m => m.month)).toEqual(['06/2026', '07/2026']);
    // นี่คือหัวใจของบั๊ก: เฉลี่ยรวมเดือนที่ยังไม่จบ = 2,033 (ต่ำกว่าจริง ~33%)
    const avgWrong = monthly.reduce((s, m) => s + m.sales, 0) / monthly.length;
    const avgRight = done.reduce((s, m) => s + m.sales, 0) / done.length;
    expect(Math.round(avgWrong)).toBe(2033);
    expect(avgRight).toBe(3000);
  });

  it('วันสิ้นเดือนก็ยังถือว่า "ยังไม่จบ" (ยอดวันสุดท้ายยังเข้าได้อยู่)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 31, 23, 0, 0));
    expect(completeMonths([{ month: '08/2026', sales: 1 }])).toEqual([]);
  });

  it('เดือนที่ไม่มีเลข 0 นำหน้าในข้อมูล ไม่ถูกตัดผิดตัว', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1));
    // "8/2026" (ไม่มี 0 นำหน้า) ไม่ตรงกับคีย์ "08/2026" — คงไว้ตามพฤติกรรมจริงของ payload
    // (GAS สร้างคีย์เป็น MM/YYYY เสมอ) เทสต์นี้ล็อกไว้กันมีคนเปลี่ยน format แล้วเงียบ
    expect(completeMonths([{ month: '08/2026', sales: 1 }, { month: '07/2026', sales: 2 }]))
      .toEqual([{ month: '07/2026', sales: 2 }]);
  });

  it('input ว่าง/ไม่ใช่ array ไม่ throw', () => {
    expect(completeMonths(null)).toBe(null);
    expect(completeMonths([])).toEqual([]);
    expect(completeMonths([null, { month: '01/2020' }]).length).toBe(1);
  });

  it('currentMonthInfo บอกว่าผ่านไปกี่วันจากกี่วัน (ใช้ติดป้าย "ยังไม่จบเดือน")', () => {
    expect(currentMonthInfo(new Date(2026, 7, 1))).toEqual({ key: '08/2026', dayOfMonth: 1, daysInMonth: 31 });
    expect(currentMonthInfo(new Date(2026, 1, 10))).toEqual({ key: '02/2026', dayOfMonth: 10, daysInMonth: 28 });
    expect(currentMonthInfo(new Date(2024, 1, 10)).daysInMonth).toBe(29); // ปีอธิกสุรทิน
  });
});

// ────────────────────────────────────────────────────────────────────
describe('isCountableProduct — กติกาเดียวทุกหน้า (ข้อ 3.1)', () => {
  it('สินค้าปกติ = นับ', () => {
    expect(isCountableProduct({ sku: 'R01025', cat: 'ดอกไม้' })).toBe(true);
  });

  it('ตัด MTO / "ไม่มีรหัสสินค้า" / หมวดว่าง', () => {
    expect(isCountableProduct({ sku: 'M1', cat: 'Made to Order', isMTO: true })).toBe(false);
    expect(isCountableProduct({ sku: 'X1', cat: 'ไม่มีรหัสสินค้า' })).toBe(false);
    expect(isCountableProduct({ sku: 'Y1', cat: '' })).toBe(false);
    expect(isCountableProduct({ sku: 'Y2' })).toBe(false);
    expect(isCountableProduct(null)).toBe(false);
  });

  it('บวกทีละหมวดแล้วต้องเท่ากับ "ทุกหมวด" (บั๊กเดิม: สองทางใช้กติกาคนละแบบ)', () => {
    const products = [
      { sku: 'A', cat: 'ดอกไม้', stockValue: 100 },
      { sku: 'B', cat: 'แจกัน',  stockValue: 200 },
      { sku: 'C', cat: 'Made to Order งานจัด', isMTO: true, stockValue: 900 },
      { sku: 'D', cat: 'ไม่มีรหัสสินค้า', stockValue: 50 },
    ];
    const countable = products.filter(isCountableProduct);
    const all = countable.reduce((s, p) => s + p.stockValue, 0);
    const cats = [...new Set(countable.map(p => p.cat))];
    const sumByCat = cats.reduce(
      (s, c) => s + countable.filter(p => p.cat === c).reduce((t, p) => t + p.stockValue, 0), 0);
    expect(sumByCat).toBe(all);
    expect(all).toBe(300);
  });
});

// ────────────────────────────────────────────────────────────────────
describe('marginRowCore — กำไรจากเงินที่เข้าจริง (ข้อ 3.2 + 3.3)', () => {
  it('ขายส่ง −20%: กำไรคิดจาก soldRev ไม่ใช่ราคาป้าย', () => {
    // ป้าย 100 · ขายจริง 80 · ทุน 60 · ขาย 10 ชิ้น
    const r = marginRowCore({ soldQty: 10, soldRev: 800, price: 100 }, 60);
    expect(r.revQty).toBe(10);
    expect(r.avgPrice).toBe(80);
    expect(r.cogs).toBe(600);
    expect(r.profit).toBe(200);              // สูตรเก่า (100−60)×10 = 400 → เกินจริงเท่าตัว
    expect(r.marginPct).toBeCloseTo(0.25);   // สูตรเก่าได้ 40%
    expect(r.unitMargin).toBe(20);
  });

  it('ของที่เบิกไปงาน MTO ไม่ถูกเอาไปคูณต้นทุน (soldQty รวมมันแต่ soldRev ไม่รวม)', () => {
    // ขายจริง 10 ชิ้น 800 บาท + เบิกไป MTO อีก 40 ชิ้น (ไม่มีเงินเข้าที่นี่)
    const r = marginRowCore({ soldQty: 50, soldQtyUnscanned: 40, soldRev: 800, price: 100 }, 60);
    expect(r.revQty).toBe(10);
    expect(r.cogs).toBe(600);          // ไม่ใช่ 60 × 50 = 3,000
    expect(r.profit).toBe(200);        // สูตรเก่าได้ (100−60)×50 = 2,000
    expect(r.unscanned).toBe(40);
  });

  it('เบิกไป MTO ล้วน (ไม่มียอดขาย) → คำนวณกำไรไม่ได้ คืน null ไม่ใช่ 0', () => {
    const r = marginRowCore({ soldQty: 40, soldQtyUnscanned: 40, soldRev: 0, price: 100 }, 60);
    expect(r.revQty).toBe(0);
    expect(r.avgPrice).toBe(null);
    expect(r.profit).toBe(null);
    expect(r.marginPct).toBe(null);
  });

  it('ไม่มีประวัติต้นทุนจาก PO → ทุก field กำไรเป็น null (ไม่เดา ไม่ใส่ 0)', () => {
    const r = marginRowCore({ soldQty: 10, soldRev: 800, price: 100 }, null);
    expect(r.cost).toBe(null);
    expect(r.profit).toBe(null);
    expect(r.marginPct).toBe(null);
    expect(r.avgPrice).toBe(80);       // ราคาขายจริงยังบอกได้
  });

  it('ต้นทุน 0/ติดลบ ถือว่า "ไม่รู้ต้นทุน" — กัน PO ที่ราคาเป็น 0 ทำกำไรพองปลอม', () => {
    expect(marginRowCore({ soldQty: 10, soldRev: 800 }, 0).profit).toBe(null);
    expect(marginRowCore({ soldQty: 10, soldRev: 800 }, -5).profit).toBe(null);
  });

  it('ขายต่ำกว่าทุน → กำไรติดลบ (ธง "ขาดทุน" ต้องยังจับได้)', () => {
    const r = marginRowCore({ soldQty: 10, soldRev: 400, price: 100 }, 60);
    expect(r.profit).toBe(-200);
    expect(r.marginPct).toBeCloseTo(-0.5);
    expect(r.unitMargin).toBe(-20);
  });

  it('input พัง/ว่าง ไม่ throw', () => {
    const r = marginRowCore(null, null);
    expect(r.revQty).toBe(0);
    expect(r.profit).toBe(null);
    expect(marginRowCore({ soldQty: 'x', soldRev: 'y' }, 'z').revQty).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
describe('abcClassify — หน้าต่าง 12 เดือนล่าสุด (ข้อ 3.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1)); // 1 ส.ค. 2026 — เดือนปัจจุบันยังไม่จบ
  });
  afterEach(() => vi.useRealTimers());

  const withMonthly = (sku, pairs, soldRev) => ({
    sku, cat: 'ดอกไม้', soldRev,
    monthly: pairs.map(([month, sales]) => ({ month, qty: 0, sales })),
  });

  it('ของที่ขายดีเมื่อ 2 ปีก่อนแต่ตอนนี้เงียบ → ตกไปคลาส C', () => {
    const old = withMonthly('OLD', [['03/2024', 100000]], 100000);
    const now = withMonthly('NOW', monthsBack(2026, 7, 3).map(m => [m, 10000]), 30000);
    const map = abcClassify([old, now]);
    expect(map.NOW).toBe('A');
    expect(map.OLD).toBe('C');   // เดิม (ยอดสะสม) OLD จะเป็น A แล้วขึ้นคิว "ควรนับก่อน" ทุก 30 วัน
  });

  it('เดือนปัจจุบันที่ยังไม่จบไม่ถูกนับเข้าหน้าต่าง', () => {
    const p = withMonthly('P', [['07/2026', 500], ['08/2026', 9999]], 10499);
    expect(abcWindowRev(p)).toBe(500);
  });

  it('นับย้อนหลังแค่ 12 เดือนสมบูรณ์ ไม่เอาเดือนที่ 13 ขึ้นไป', () => {
    // 07/2025 … 07/2026 = 13 เดือนสมบูรณ์ · เดือนเก่าสุด (07/2025) ต้องหลุดหน้าต่าง
    const months = monthsBack(2026, 7, 13);
    const p = withMonthly('P', months.map((m, i) => [m, i === 0 ? 1000000 : 100]), 1001200);
    expect(ABC_WINDOW_MONTHS).toBe(12);
    expect(abcWindowRev(p)).toBe(1200);   // 12 เดือนหลัง × 100
  });

  it('สินค้าที่ไม่มี array รายเดือน → fallback ไปยอดสะสม (payload เก่า/ไม่ส่งรายเดือน)', () => {
    const map = abcClassify([{ sku: 'LEGACY', cat: 'ดอกไม้', soldRev: 900 }, { sku: 'Z', cat: 'ดอกไม้', soldRev: 0 }]);
    expect(map.LEGACY).toBe('A');
    expect(map.Z).toBe('C');
  });

  it('ส่ง windowMonths เองได้ (เช่นอยากดู 3 เดือน)', () => {
    const p = withMonthly('P', monthsBack(2026, 7, 6).map(m => [m, 100]), 600);
    expect(abcWindowRev(p, 3)).toBe(300);
  });

  it('ยังตัด "ไม่มีรหัสสินค้า" ออกเหมือนเดิม', () => {
    const map = abcClassify([
      withMonthly('OK', [['07/2026', 100]], 100),
      { sku: 'NOCODE', cat: 'ไม่มีรหัสสินค้า', soldRev: 999999 },
    ]);
    expect(map.NOCODE).toBeUndefined();
    expect(map.OK).toBe('A');
  });
});

// ────────────────────────────────────────────────────────────────────
describe('momDeltaOf — % เทียบเดือนก่อนหน้า (ข้อ 1.1)', () => {
  const series = [
    { month: '05/2026', rev: 1000000 },
    { month: '06/2026', rev: 1100000 },
    { month: '07/2026', rev: 1280000 },
    { month: '08/2026', rev: 900 },      // เดือนปัจจุบัน เพิ่งผ่านไป 1 วัน
  ];
  const CUR = '08/2026';

  it('เทียบเดือนที่เลือกกับเดือนก่อนหน้าเดือนนั้น ไม่ใช่ 2 เดือนท้ายเสมอ', () => {
    expect(momDeltaOf(series, '06/2026', CUR)).toBe('10.0');   // 1.1M vs 1.0M
    expect(momDeltaOf(series, '07/2026', CUR)).toBe('16.4');   // 1.28M vs 1.1M
  });

  it('กดคนละเดือนต้องได้คนละค่า (บั๊กเดิม: ได้ −99.9% เท่ากันทุกเดือน)', () => {
    expect(momDeltaOf(series, '06/2026', CUR)).not.toBe(momDeltaOf(series, '07/2026', CUR));
  });

  it('เดือนปัจจุบันที่ยังไม่จบ → ไม่โชว์ % เลย (null) แทนการโชว์ ↓99.9%', () => {
    expect(momDeltaOf(series, CUR, CUR)).toBe(null);
    // ยืนยันว่าสูตรเก่าจะได้อะไร: (900 − 1,280,000) / 1,280,000 ≈ −99.9%
    const oldFormula = ((series[3].rev - series[2].rev) / series[2].rev * 100).toFixed(1);
    expect(oldFormula).toBe('-99.9');
  });

  it('ข้ามปีถูก (ม.ค. เทียบ ธ.ค. ปีก่อน)', () => {
    const s = [{ month: '12/2025', rev: 500 }, { month: '01/2026', rev: 750 }];
    expect(momDeltaOf(s, '01/2026', '03/2026')).toBe('50.0');
  });

  it('เดือนก่อนหน้าไม่มีในข้อมูล → null (ไม่ข้ามไปเทียบเดือนที่ไกลกว่า)', () => {
    const s = [{ month: '03/2026', rev: 500 }, { month: '07/2026', rev: 900 }];
    expect(momDeltaOf(s, '07/2026', '08/2026')).toBe(null);
  });

  it('เดือนก่อนหน้ายอด 0 → null (หารศูนย์ไม่ได้)', () => {
    const s = [{ month: '06/2026', rev: 0 }, { month: '07/2026', rev: 900 }];
    expect(momDeltaOf(s, '07/2026', '08/2026')).toBe(null);
  });

  it('input ว่าง/พัง ไม่ throw', () => {
    expect(momDeltaOf(null, '07/2026', '08/2026')).toBe(null);
    expect(momDeltaOf(series, null, '08/2026')).toBe(null);
    expect(momDeltaOf(series, 'ขยะ', '08/2026')).toBe(null);
  });
});

// ────────────────────────────────────────────────────────────────────
describe('มูลค่าสต๊อกที่ราคาขายส่ง (ข้อ 1.5)', () => {
  it('อ่านอัตราจาก payload — ไม่ hard-code ฝั่งเว็บ', () => {
    expect(wholesaleRatioOf({ totals: { wholesaleRatio: 0.75 } })).toBe(0.75);
    expect(wholesaleRatioOf({ totals: { wholesaleRatio: 1 } })).toBe(1);
  });

  it('อัตราที่ใช้ไม่ได้ → fallback 0.8 (ไม่ใช่ 0 ที่จะทำให้มูลค่าหายทั้งร้าน)', () => {
    expect(WHOLESALE_RATIO_FALLBACK).toBe(0.8);
    for (const bad of [undefined, null, 0, -1, 1.5, '0.9', NaN]) {
      expect(wholesaleRatioOf({ totals: { wholesaleRatio: bad } })).toBe(0.8);
    }
    expect(wholesaleRatioOf(null)).toBe(0.8);
    expect(wholesaleRatioOf({})).toBe(0.8);
  });

  it('ใช้ค่าที่ GAS คิดมาเสมอเมื่อมี (จะได้ตรงกับ KPI ทุกหน้า)', () => {
    const p = { qtyStore: 10, qtyWH: 5, price: 100, stockValue: 1200, stockValueWH: 400, stockValueStore: 800 };
    const v = stockValuesOf(p, 0.8);
    expect(v).toEqual({ all: 1200, wh: 400, store: 800 });
  });

  it('ไม่มีค่าจาก GAS (เช่นข้อมูลจากไฟล์อัปโหลด) → คูณอัตราขายส่งเอง', () => {
    const p = { qtyStore: 10, qtyWH: 5, price: 100 };
    const v = stockValuesOf(p, 0.8);
    expect(v.all).toBe(1200);     // 15 × 100 × 0.8 — ไม่ใช่ 1,500 (ราคาป้าย)
    expect(v.wh).toBe(400);
    expect(v.store).toBe(800);
  });

  it('คลัง + หน้าร้าน = ยอดรวม (ตัวเลขบน KPI ต้องบวกกันได้)', () => {
    const p = { qtyStore: 7, qtyWH: 3, price: 250 };
    const v = stockValuesOf(p, 0.8);
    expect(v.wh + v.store).toBeCloseTo(v.all);
  });

  it('stockValue = 0 จริง ๆ ต้องไม่ถูกมองว่า "ไม่มีค่า" แล้วคำนวณใหม่', () => {
    const p = { qtyStore: 10, qtyWH: 0, price: 100, stockValue: 0, stockValueWH: 0, stockValueStore: 0 };
    expect(stockValuesOf(p, 0.8).all).toBe(0);
  });

  it('input ว่าง ไม่ throw', () => {
    expect(stockValuesOf(null, 0.8)).toEqual({ all: 0, wh: 0, store: 0 });
    expect(stockValuesOf({ qty: 5 }, 0.8).all).toBe(0);   // ไม่มีราคา
  });
});

// ────────────────────────────────────────────────────────────────────
// meta-test: หน้าภาพรวมมี ABC ของตัวเองแยกอีกชุด (สร้างกลุ่ม A/B/C ให้กดดูรายการ)
// ถ้ามันใช้ฐานคนละแบบกับ abcClassify สินค้าตัวเดียวกันจะเป็น A ที่หน้าหนึ่ง C อีกหน้าหนึ่ง
// — เป็นบั๊กที่ไม่มี error ให้เห็น ต้องล็อกไว้ว่าสองที่ใช้ฐานเดียวกันจริง
describe('ABC บนหน้าภาพรวมใช้ฐานเดียวกับคิว "ควรนับ/ควรเช็คก่อน"', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const SRC = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

  it('คิดรายได้ด้วย abcWindowRev (12 เดือนล่าสุด) ไม่ใช่ p.soldRev สะสม', () => {
    expect(SRC).toContain('const revOf = p => { const w = abcWindowRev(p);');
  });

  it('ตัดคลาสด้วย cumulative ก่อนบวกตัวเอง (ตัวท็อปต้องเป็น A เสมอ)', () => {
    expect(SRC).toContain("const cls = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C';");
  });
});
