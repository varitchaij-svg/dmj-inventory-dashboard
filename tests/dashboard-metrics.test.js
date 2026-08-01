// tests/dashboard-metrics.test.js — ตัวเลขบนหน้า "ภาพรวม" ที่เคยผิด (ตรวจ ส.ค. 2026)
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา: เจ้าของเห็นเลขผิดบนหน้าภาพรวมแล้วให้ไล่ตรวจทั้งระบบ (docs/PLAN-DASHBOARD-AUDIT.md)
// สิ่งที่คุมไว้:
//   1. completeMonths — ตัดเดือนที่ยังไม่จบออกก่อนหาเฉลี่ย (รับได้ทั้ง object และ string)
//   2. "ควรสั่ง" (StockView) — ค่าที่ได้ต้องไม่ต่ำกว่าจริงเพราะเดือนปัจจุบันยอด ~0
//   3. มูลค่าสต๊อกคิดที่ราคาขายส่ง — สูตร + การอ่าน Script Property WHOLESALE_RATIO
//   4. nSold ต้องมีจริงใน totals ฝั่ง GAS (เดิมไม่มี → หน้าเว็บโชว์ "0 SKU มียอดขาย")
//   5. KPI turnover ต้องไม่กลับมาโดยไม่มี COGS (Phase 0 ยืนยันว่า ZORT ไม่ส่งราคาทุนมา)
//   6. การ์ด "ของเข้าใหม่" ต้องไม่โชว์ยอดรวมเมื่อราคาไม่ครบ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { completeMonths } from './helpers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS   = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VM   = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const VA   = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

// คีย์เดือนปัจจุบัน/เดือนก่อน ๆ แบบเดียวกับที่ระบบใช้ ("MM/YYYY")
function mkey(offset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
const CUR = mkey(0), M1 = mkey(1), M2 = mkey(2), M3 = mkey(3);

// ── 1. completeMonths ────────────────────────────────────────────────────────
describe('completeMonths — ตัดเดือนที่ยังไม่จบ', () => {
  it('ตัดเดือนปัจจุบันออกจาก array ของ object {month}', () => {
    const rows = [
      { month: M2, qty: 30, sales: 3000 },
      { month: M1, qty: 30, sales: 3000 },
      { month: CUR, qty: 1, sales: 100 },
    ];
    const out = completeMonths(rows);
    expect(out).toHaveLength(2);
    expect(out.map(r => r.month)).toEqual([M2, M1]);
  });

  it('ตัดเดือนปัจจุบันออกจาก array ของ string ได้ด้วย (monthLabels)', () => {
    // เคยพลาดตรงนี้: filter เช็คแค่ m.month ทำให้ array ของ string ไม่ถูกกรองเลย
    // และไม่มี error ให้เห็น — เฉลี่ยยังเพี้ยนเหมือนเดิมทั้งที่ "แก้แล้ว"
    const out = completeMonths([M2, M1, CUR]);
    expect(out).toEqual([M2, M1]);
  });

  it('เดือนที่ไม่ใช่เดือนปัจจุบันต้องอยู่ครบ ไม่ตัดเดือนที่ยอด 0 ทิ้ง', () => {
    const rows = [
      { month: M3, qty: 0, sales: 0 },   // ขายไม่ได้เลย แต่เป็นเดือนที่จบแล้ว → ต้องเก็บไว้
      { month: M2, qty: 10, sales: 100 },
      { month: M1, qty: 20, sales: 200 },
    ];
    expect(completeMonths(rows)).toHaveLength(3);
  });

  it('input ที่ไม่ใช่ array / array ว่าง คืนค่าเดิม ไม่พัง', () => {
    expect(completeMonths(null)).toBe(null);
    expect(completeMonths(undefined)).toBe(undefined);
    expect(completeMonths([])).toEqual([]);
  });

  it('ข้าม element ที่เป็น null/undefined ในลิสต์', () => {
    expect(completeMonths([null, { month: M1 }, undefined])).toEqual([{ month: M1 }]);
  });
});

// ── 2. "ควรสั่ง" — ผลกระทบจริงของการตัดเดือนที่ยังไม่จบ ──────────────────────
describe('"ควรสั่ง" (StockView) — เฉลี่ย 3 เดือน', () => {
  // สูตรเดียวกับ enriched ใน StockView
  const avgOf = (rows) => {
    const c = completeMonths(rows);
    return c.length >= 3 ? c.slice(-3).reduce((s, x) => s + (x.qty || 0), 0) / 3 : null;
  };
  const suggest = (avg, coverMonths, onHand) =>
    avg > 0 ? Math.max(0, Math.ceil(avg * coverMonths - onHand)) : 0;

  it('เดือนปัจจุบันที่ยอดเกือบ 0 ต้องไม่ถูกนับเป็นเดือนเต็ม', () => {
    const rows = [
      { month: mkey(3), qty: 90 },
      { month: M2, qty: 90 },
      { month: M1, qty: 90 },
      { month: CUR, qty: 2 },   // เพิ่งขึ้นเดือนใหม่
    ];
    expect(avgOf(rows)).toBe(90);                    // ถูก: 3 เดือนเต็ม
    // ถ้าไม่ตัด จะได้ (90+90+2)/3 ≈ 60.67 → ต่ำกว่าจริง ~33%
    const naive = rows.slice(-3).reduce((s, x) => s + x.qty, 0) / 3;
    expect(naive).toBeLessThan(65);
  });

  it('ยอดที่ควรสั่งไม่ต่ำกว่าจริงจนเสี่ยงของขาด', () => {
    const rows = [
      { month: mkey(3), qty: 90 }, { month: M2, qty: 90 },
      { month: M1, qty: 90 },      { month: CUR, qty: 2 },
    ];
    const onHand = 50, cover = 2;
    expect(suggest(avgOf(rows), cover, onHand)).toBe(130);       // 90*2 − 50
    const naive = rows.slice(-3).reduce((s, x) => s + x.qty, 0) / 3;
    expect(suggest(naive, cover, onHand)).toBeLessThan(130);     // ของเดิมสั่งน้อยไป
  });

  it('มีเดือนที่จบแล้วไม่ถึง 3 เดือน → ไม่ใช้ค่าเฉลี่ย (ปล่อยให้ fallback)', () => {
    expect(avgOf([{ month: M1, qty: 10 }, { month: CUR, qty: 1 }])).toBe(null);
  });
});

// ── 3. มูลค่าสต๊อกที่ราคาขายส่ง ──────────────────────────────────────────────
describe('มูลค่าสต๊อก = ราคาปลีก × wholesaleRatio', () => {
  it('GAS มี wholesaleRatio_() อ่านจาก Script Property', () => {
    expect(GS).toMatch(/function wholesaleRatio_\(\)/);
    expect(GS).toMatch(/getProperty\('WHOLESALE_RATIO'\)/);
  });

  it('ค่า default = 0.8 (ปลีก −20%)', () => {
    expect(GS).toMatch(/const WHOLESALE_RATIO_DEFAULT = 0\.8;/);
  });

  it('ยอมรับเฉพาะ 0 < r ≤ 1 มิฉะนั้นกลับไปใช้ค่า default', () => {
    // 0 หรือค่าติดลบ/เกิน 1 = พิมพ์ผิด ถ้าปล่อยผ่านมูลค่าสต๊อกทั้งร้านจะเพี้ยนเงียบ ๆ
    expect(GS).toMatch(/isFinite\(r\) && r > 0 && r <= 1/);
  });

  it('stockValue ทั้ง 3 ตัวคูณ whRatio ครบ (รวม/คลัง/หน้าร้าน ต้องบวกกันได้)', () => {
    expect(GS).toMatch(/p\.stockValue\s*=\s*p\.qty\s*\*\s*p\.price\s*\*\s*whRatio;/);
    expect(GS).toMatch(/p\.stockValueWH\s*=.*\*\s*p\.price\s*\*\s*whRatio;/);
    expect(GS).toMatch(/p\.stockValueStore\s*=.*\*\s*p\.price\s*\*\s*whRatio;/);
  });

  it('ส่ง wholesaleRatio กลับไปให้ frontend ติดป้าย % ให้ตรงกับตัวเลข', () => {
    expect(GS).toMatch(/wholesaleRatio:\s*whRatio/);
  });

  it('p.price ยังเป็นราคาขายปลีกเหมือนเดิม (ไม่ถูกเขียนทับด้วยราคาขายส่ง)', () => {
    // ถ้าเผลอแก้ p.price ที่ต้นทาง ราคาขายในหน้า POS/ใบเสนอราคาจะเพี้ยนตามทั้งระบบ
    expect(GS).not.toMatch(/p\.price\s*=\s*p\.price\s*\*\s*whRatio/);
  });

  it('เลขคลัง + หน้าร้าน ต้องรวมได้เท่ายอดรวม (คูณอัตราเดียวกันทุกตัว)', () => {
    const price = 125, qtyWH = 40, qtyStore = 60, r = 0.8;
    const vWH = qtyWH * price * r, vStore = qtyStore * price * r;
    expect(vWH + vStore).toBeCloseTo((qtyWH + qtyStore) * price * r, 6);
    expect(vWH + vStore).toBeCloseTo(12500 * 0.8, 6);
  });
});

// ── 4. nSold ─────────────────────────────────────────────────────────────────
describe('"N SKU มียอดขาย"', () => {
  it('GAS ส่งคีย์ nSold มาใน totals (เดิมไม่มี → fmtN(undefined) โชว์ 0)', () => {
    expect(GS).toMatch(/nSold:\s*products\.filter/);
  });

  it('หน้าเว็บนับตามช่วงเวลาที่เลือกเอง ไม่อ่าน totals.nSold ตรง ๆ', () => {
    // KPI ข้าง ๆ (จำนวนชิ้น) เป็นค่าตามช่วงที่เลือก ถ้า SKU นับตลอดกาลจะขัดกันเอง
    expect(VM).toMatch(/const nSoldPeriod = uM\(/);
    expect(VM).toMatch(/periodInfo\.perProduct\(p\)\.qty > 0/);
    expect(VM).not.toMatch(/stockAgg\.nSold/);
  });

  it('นับเฉพาะ SKU ที่ขายได้ในช่วงนั้น', () => {
    const sellable = [
      { sku: 'A', monthly: [{ month: M1, qty: 5 }] },
      { sku: 'B', monthly: [{ month: M2, qty: 3 }] },   // ขายเดือนอื่น
      { sku: 'C', monthly: [] },
    ];
    const perProduct = p => {
      const mm = (p.monthly || []).find(x => x.month === M1);
      return { qty: mm ? mm.qty : 0 };
    };
    const n = sellable.reduce((s, p) => s + (perProduct(p).qty > 0 ? 1 : 0), 0);
    expect(n).toBe(1);
  });
});

// ── 5. KPI turnover ที่ถอดออก ────────────────────────────────────────────────
describe('KPI "ยอดขาย / ต้นทุนสต๊อก" ถูกถอดออก', () => {
  it('ไม่มีการหาร soldRev ด้วยมูลค่าสต๊อกอีกแล้ว', () => {
    // สูตรเดิมเอายอดขายสะสมทั้งประวัติ ÷ มูลค่าสต๊อกวันนี้ที่ราคาขาย — ไม่ใช่ turnover
    // จะกลับมาได้ต่อเมื่อมี COGS จริง (ต้องมีราคาทุนใน PO ฝั่ง ZORT ก่อน)
    expect(VM).not.toMatch(/stockAgg\.soldRev\s*\/\s*stockAgg\.val/);
    expect(VM).not.toMatch(/label="ยอดขาย \/ ต้นทุนสต๊อก"/);
  });

  it('เหลือ KPI 3 ใบสำหรับ owner → ต้องใช้ row-3 ไม่ใช่ row-4 (กันช่องว่างบนจอกว้าง)', () => {
    expect(VM).toMatch(/id="ov-kpi".*role==='employee'\?'row-2':'row-3'/);
  });
});

// ── 6. การ์ด "ของเข้าใหม่ 30 วัน" ────────────────────────────────────────────
describe('การ์ดของเข้าใหม่ — ยอดรวมที่ข้อมูลไม่ครบ', () => {
  it('มีตัวนับ coverage (nPriced / costComplete)', () => {
    expect(VM).toMatch(/const nPriced = items\.filter\(g => g\.cost > 0\)\.length;/);
    expect(VM).toMatch(/costComplete: nPriced === items\.length/);
  });

  it('โชว์ยอดรวมเฉพาะตอนราคาครบ', () => {
    expect(VM).toMatch(/recentIntake\.costComplete \?/);
  });

  it('costComplete = false เมื่อมีบางรายการไม่มีราคา', () => {
    const items = [{ cost: 0 }, { cost: 0 }, { cost: 250 }];
    const nPriced = items.filter(g => g.cost > 0).length;
    expect(nPriced).toBe(1);
    expect(nPriced === items.length).toBe(false);
  });

  it('costComplete = true เมื่อทุกรายการมีราคา', () => {
    const items = [{ cost: 100 }, { cost: 250 }];
    expect(items.filter(g => g.cost > 0).length === items.length).toBe(true);
  });
});

// ── 7. MoM delta ─────────────────────────────────────────────────────────────
describe('MoM delta — เทียบเดือนที่เลือก', () => {
  it('ไม่ใช้ "2 เดือนท้ายสุดของข้อมูล" อีกแล้ว', () => {
    // ของเดิม: monthlySeries[length-1] vs [length-2] → กดเลือกเดือนไหนก็ได้เลขเดิม
    // และเดือนท้ายสุด = เดือนปัจจุบันที่เพิ่งเริ่ม → −99.9% ทุกครั้ง
    expect(VM).not.toMatch(/monthlySeries\[monthlySeries\.length-2\]\.rev/);
  });

  it('หาเดือนก่อนหน้าจากปฏิทินจริง ไม่ใช่ตำแหน่งใน array', () => {
    // เดือนที่ยอด 0 ทั้งเดือนอาจไม่มีคอลัมน์ในชีต → "ตัวก่อนหน้าใน array" อาจข้ามไป 2 เดือน
    expect(VM).toMatch(/const pd = new Date\(Number\(ayr\), Number\(amo\) - 2, 1\);/);
  });

  it('เดือนปัจจุบันเทียบแบบช่วงวันเดียวกัน และมีป้ายบอกว่ายังไม่จบ', () => {
    expect(VM).toMatch(/เทียบเดือนก่อนช่วงเดียวกัน/);
    expect(VM).toMatch(/ผ่านไป \$\{dayN\} วัน/);
  });

  it('ไม่โชว์ delta ถ้าข้อมูลรายวันไม่ครอบคลุมวันที่ 1 ของเดือนก่อน', () => {
    // ครอบคลุมไม่ถึง = ฐานเทียบขาดไปเงียบ ๆ → % จะสูงเกินจริง
    expect(VM).toMatch(/if \(!days\.includes\(`01\/\$\{pmo\}\/\$\{pyr\}`\)\) return \{ pct: null, note \};/);
  });

  it('วันที่ 1–2 ของเดือนไม่โชว์ delta (กลุ่มตัวอย่างเล็กเกินไป)', () => {
    expect(VM).toMatch(/if \(dayN < 3\) return \{ pct: null, note \};/);
  });

  // สูตรเดียวกับ momInfo กรณีเดือนที่จบแล้ว
  const momFull = (series, activeMonth, prevKey) => {
    const prev = series.find(m => m.month === prevKey);
    if (!prev || !(prev.rev > 0)) return null;
    const cur = series.find(m => m.month === activeMonth);
    return (((cur ? cur.rev : 0) - prev.rev) / prev.rev * 100).toFixed(1);
  };

  it('เลือกเดือนไหน delta ต้องเปลี่ยนตาม ไม่ใช่ค่าเดิมเสมอ', () => {
    const series = [
      { month: M3, rev: 1000 }, { month: M2, rev: 1500 },
      { month: M1, rev: 1200 }, { month: CUR, rev: 5 },
    ];
    expect(momFull(series, M2, M3)).toBe('50.0');    // 1500 vs 1000
    expect(momFull(series, M1, M2)).toBe('-20.0');   // 1200 vs 1500
  });

  it('เดือนก่อนหน้ายอด 0 → ไม่โชว์ delta (หารศูนย์)', () => {
    const series = [{ month: M2, rev: 0 }, { month: M1, rev: 900 }];
    expect(momFull(series, M1, M2)).toBe(null);
  });

  it('เทียบช่วงวันเดียวกันให้ผลถูกต้อง', () => {
    const dayN = 10;
    const sumTo = (rows) => rows.filter(r => r.d <= dayN).reduce((s, r) => s + r.rev, 0);
    const cur  = sumTo([{ d: 1, rev: 100 }, { d: 5, rev: 200 }, { d: 20, rev: 999 }]);
    const prev = sumTo([{ d: 2, rev: 100 }, { d: 9, rev: 150 }, { d: 25, rev: 999 }]);
    expect(cur).toBe(300);
    expect(prev).toBe(250);
    expect(((cur - prev) / prev * 100).toFixed(1)).toBe('20.0');
  });
});

// ── 8. meta: จุดเชื่อมต่อที่ลืมแล้วพังเงียบ ──────────────────────────────────
describe('meta — จุดที่ต้องเรียกจริง', () => {
  it('buildFullData_ อ่าน whRatio ก่อนใช้คำนวณ stockValue', () => {
    const iRatio = GS.indexOf('const whRatio = wholesaleRatio_();');
    const iUse   = GS.indexOf('p.stockValue      = p.qty     * p.price * whRatio;');
    expect(iRatio).toBeGreaterThan(-1);
    expect(iUse).toBeGreaterThan(-1);
    expect(iRatio).toBeLessThan(iUse);   // ประกาศก่อนใช้ ไม่งั้น ReferenceError ตอน build payload
  });

  it('StockView "ควรสั่ง" เรียก completeMonths จริง', () => {
    expect(VM).toMatch(/const complete = completeMonths\(p\.monthly \|\| \[\]\);/);
    expect(VM).toMatch(/const last3 = complete\.slice\(-3\);/);
  });

  it('OverviewView ใช้ completeMonthsList กับ velocity + momMovers', () => {
    expect(VM).toMatch(/const completeMonthsList = uM\(\(\) => completeMonths\(months\), \[months\]\);/);
    expect(VM).toMatch(/const n = Math\.max\(1, Math\.min\(completeMonthsList\.length, 3\)\);/);
    expect(VM).toMatch(/if \(completeMonthsList\.length < 2\) return \{ risers: \[\]/);
  });

  it('deadStock ดูย้อนหลังจากเดือนที่จบแล้ว (offset 1,2 ไม่ใช่ 0,1)', () => {
    expect(VM).toMatch(/const recent = \[1, 2\]\.map\(offset =>/);
  });
});

// ── 9. จุดที่แบ่ง "ครึ่งแรก vs ครึ่งหลัง" / regression ────────────────────────
// ทั้งกลุ่มนี้เพี้ยนแรงที่สุดทุกต้นเดือน เพราะเดือนที่เพิ่งเริ่ม (ยอดเกือบ 0) ไปตกอยู่ครึ่งหลัง
describe('early/late half + forecast — ต้องตัดเดือนที่ยังไม่จบ', () => {
  const half = (m) => {
    const h = Math.floor(m.length / 2);
    const e = m.slice(0, h).reduce((s, x) => s + x.qty, 0) / Math.max(h, 1);
    const l = m.slice(h).reduce((s, x) => s + x.qty, 0) / Math.max(m.length - h, 1);
    return { earlyAvg: e, lateAvg: l };
  };

  it('เดือนปัจจุบันยอด ~0 เคยทำให้ "ยอดขายตก" เป็นจริงทั้งที่ขายปกติ', () => {
    const rows = [
      { month: mkey(4), qty: 100 }, { month: M3, qty: 100 },
      { month: M2, qty: 100 },      { month: M1, qty: 100 },
      { month: CUR, qty: 1 },
    ];
    // ไม่ตัด → ครึ่งหลังโดนถ่วง เข้าเงื่อนไข declining (late < early × 0.4)
    const naive = half(rows);
    expect(naive.lateAvg).toBeLessThan(naive.earlyAvg * 0.9);
    // ตัดแล้ว → ทรงตัว ไม่ควรติดธง
    const fixed = half(completeMonths(rows));
    expect(fixed.lateAvg).toBe(fixed.earlyAvg);
    expect(fixed.lateAvg >= fixed.earlyAvg * 0.4).toBe(true);
  });

  it('สินค้ามาแรงจริงต้องยังได้ป้าย "กำลังมาแรง" (late ≥ early × 1.4)', () => {
    const rows = [
      { month: mkey(4), qty: 10 }, { month: M3, qty: 10 },
      { month: M2, qty: 15 },      { month: M1, qty: 15 },
      { month: CUR, qty: 0 },      // เดือนใหม่ยังไม่ขาย
    ];
    // เดิม: ครึ่งหลัง = (15+15+0)/3 = 10 → ไม่ถึง 10 × 1.4 → ป้ายหาย
    const naive = half(rows);
    expect(naive.lateAvg >= naive.earlyAvg * 1.4).toBe(false);
    // ตอนนี้: ครึ่งหลัง = 15 → ถึงเกณฑ์ → ได้ป้าย
    const f = half(completeMonths(rows));
    expect(f.lateAvg >= f.earlyAvg * 1.4).toBe(true);
  });

  it('forecast: จุดสุดท้ายที่เกือบ 0 กดความชันของ regression ลง', () => {
    const linSlope = (v) => {
      const n = v.length, xM = (n - 1) / 2, yM = v.reduce((s, x) => s + x, 0) / n;
      let sxx = 0, sxy = 0;
      for (let i = 0; i < n; i++) { sxx += (i - xM) ** 2; sxy += (i - xM) * (v[i] - yM); }
      return sxx === 0 ? 0 : sxy / sxx;
    };
    const series = [
      { month: mkey(4), rev: 100 }, { month: M3, rev: 110 },
      { month: M2, rev: 120 },      { month: M1, rev: 130 },
      { month: CUR, rev: 3 },
    ];
    expect(linSlope(series.map(s => s.rev))).toBeLessThan(0);                       // เดิม: เทรนด์ลง
    expect(linSlope(completeMonths(series).map(s => s.rev))).toBeGreaterThan(0);    // ตอนนี้: เทรนด์ขึ้น
  });

  it('call site ทั้ง 5 จุดเรียก completeMonths จริง', () => {
    const CM = 'completeMonths(p.monthly || []);';
    // StockView declining (return null) vs TrendsView fading (return false) — คนละอัน
    expect(VM).toContain(CM + '\n      if (m.length < 4) return null;');
    expect(VM).toContain(CM + '\n      if (m.length < 4) return false;');
    // CategoryView ป้าย "กำลังมาแรง"
    expect(VM).toContain(CM + '\n      // Rising trend:');
    // TrendsView enriched (rising ใช้ earlyAvg/lateAvg จากตรงนี้)
    expect(VM).toContain(CM + '\n    let earlyAvg = 0');
    // OverviewView forecast
    expect(VM).toContain('const mSlice = completeMonths(monthlySeries).slice(-useLast);');
    // SeasonView (คนละไฟล์ — เรียกข้ามไฟล์ได้เพราะ global scope เดียวกัน)
    expect(VA).toContain('completeMonths(monthLabels).forEach(mk =>');
  });

  it('forecast บอกเดือนที่พยากรณ์จริง ไม่ใช่ทับว่า "เดือนหน้า" เสมอ', () => {
    // พอตัดเดือนที่ยังไม่จบออก เป้าพยากรณ์มักกลายเป็น "เดือนปัจจุบัน" — ป้ายต้องตรง
    expect(VM).toMatch(/isCurrentMonth: target\.key === curKey/);
    expect(VM).toMatch(/forecast\.isCurrentMonth/);
    // และ % ต้องเทียบกับเดือนเต็มล่าสุด ไม่ใช่เดือนที่กำลังเดินอยู่
    expect(VM).toMatch(/const baseMonthRev = mSlice\[mSlice\.length - 1\]\.rev;/);
    expect(VM).not.toMatch(/vs เดือนนี้/);
  });
});
