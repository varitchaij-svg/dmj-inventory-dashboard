// 📊 ลูกค้าใหม่ vs ลูกค้าเก่า (เทียบปีต่อปี) — CustomerView (views-analytics.jsx)
//
// ทำไมต้องมีเทสต์ชุดนี้: ตัวเลขชุดนี้เจ้าของใช้ตอบคำถาม "ปีนี้ได้ลูกค้าใหม่กี่เจ้า / ลูกค้าเก่า
// ซื้อลดลงไหม" ซึ่งเป็นข้อมูลตัดสินใจเรื่องการตลาด · ถ้าจัดกลุ่มผิดจะ **ไม่มี error ให้เห็นเลย**
// เห็นแค่เปอร์เซ็นต์ที่ดูสมเหตุสมผลแต่ผิด
//
// กับดักที่คุมไว้:
//  1. เดือนปัจจุบันยังไม่จบ — เอาไปเทียบทั้งเดือนกับปีที่แล้วเมื่อไหร่ "ปีนี้" หดทุกครั้ง
//     (กติกาข้อ 1/ข้อ 4 ใน CLAUDE.md)
//  2. "ใหม่" ต้องดูจาก **ทั้งประวัติ** ไม่ใช่แค่หน้าต่างที่เทียบ — ลูกค้าที่ซื้อครั้งแรก ธ.ค. ปีที่แล้ว
//     (นอกหน้าต่าง ม.ค.–ก.ค.) ต้องเป็น "เก่า" ไม่ใช่ "ใหม่"
//  3. ลูกค้าที่ปีนี้ยังไม่ซื้อ ห้ามเข้าฐานคิด % ของลูกค้าใหม่/เก่า (แต่ต้องรายงานแยกว่าหายไป)
//  4. ปีแรกของข้อมูลนับ "ใหม่" ไม่ได้จริง ต้องมีคำเตือนบนจอเสมอ
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, '..', 'views-analytics.jsx'), 'utf8');

// ── behavioral model ของการจัดกลุ่มใน `yoy` (views-analytics.jsx) ──────────────
// สำเนาเชิงพฤติกรรม ไม่ใช่โค้ดจริง — meta-test ด้านล่างคอยเช็คว่า landmark ในโค้ดจริงยังอยู่
const mkey = (m, y) => String(m).padStart(2, '0') + '/' + y;

function classify(customers, allMonths, year, endM) {
  const prevYear = year - 1;
  const win = (c, y) => {
    let total = 0, count = 0;
    for (let m = 1; m <= endM; m++) {
      const e = c.byMonth[mkey(m, y)];
      if (e) { total += e.total || 0; count += e.count || 0; }
    }
    return { total, count };
  };
  const firstYear = (c) => {
    for (const mk of allMonths) {
      const e = c.byMonth[mk];
      if (e && (e.total || 0) > 0) return Number(mk.split('/')[1]);
    }
    return null;
  };
  const rows = [];
  customers.forEach(c => {
    const cur = win(c, year), prv = win(c, prevYear);
    if (cur.total <= 0 && prv.total <= 0) return;
    const deltaPct = prv.total > 0 ? (cur.total - prv.total) / prv.total * 100 : null;
    let bucket;
    if (cur.total <= 0) bucket = 'lost';
    else if (firstYear(c) === year) bucket = 'new';
    else if (prv.total <= 0) bucket = 'back';
    else if (deltaPct > 5) bucket = 'up';
    else if (deltaPct < -5) bucket = 'down';
    else bucket = 'flat';
    rows.push({ name: c.name, cur, prv, deltaPct, bucket });
  });
  const of = (b) => rows.filter(r => r.bucket === b);
  const active = rows.filter(r => r.cur.total > 0);
  const both = of('up').concat(of('down'), of('flat'));
  const sum = (a, f) => a.reduce((s, r) => s + f(r), 0);
  const bothPrv = sum(both, r => r.prv.total), bothCur = sum(both, r => r.cur.total);
  return {
    rows, of, nActive: active.length,
    nNew: of('new').length, nOld: active.length - of('new').length,
    curTotal: sum(active, r => r.cur.total),
    newRev: sum(of('new'), r => r.cur.total),
    bothPrv, bothCur,
    bothDeltaPct: bothPrv > 0 ? (bothCur - bothPrv) / bothPrv * 100 : null,
    lostRev: sum(of('lost'), r => r.prv.total),
  };
}

const MONTHS = [];
for (const y of [2024, 2025, 2026]) for (let m = 1; m <= 12; m++) {
  if (y === 2024 && m < 3) continue;          // ข้อมูลจริงเริ่ม 03/2024
  if (y === 2026 && m > 8) continue;          // ถึง 08/2026
  MONTHS.push(mkey(m, y));
}

const cust = (name, byMonth) => ({ key: name, name, byMonth });
const m = (obj) => {
  const o = {};
  Object.keys(obj).forEach(k => { o[k] = { total: obj[k], count: 1 }; });
  return o;
};

describe('จัดกลุ่มลูกค้าใหม่ / เก่า (ปี 2026 เทียบ 2025, ช่วง ม.ค.–ก.ค.)', () => {
  const endM = 7;
  const customers = [
    cust('ใหม่ปีนี้',        m({ '02/2026': 100 })),
    cust('เก่า-ซื้อเพิ่ม',    m({ '03/2025': 100, '03/2026': 200 })),
    cust('เก่า-ซื้อลด',      m({ '03/2025': 200, '03/2026': 100 })),
    cust('เก่า-ใกล้เคียง',   m({ '03/2025': 100, '03/2026': 103 })),
    cust('เก่า-กลับมา',      m({ '05/2024': 500, '04/2026': 300 })),
    cust('หายไป',           m({ '06/2025': 400 })),
  ];
  const r = classify(customers, MONTHS, 2026, endM);

  it('แยกใหม่/เก่าได้ถูก และนับเฉพาะคนที่ซื้อ "ปีนี้" เข้าฐาน %', () => {
    expect(r.nNew).toBe(1);
    expect(r.nOld).toBe(4);              // เพิ่ม + ลด + ใกล้เคียง + กลับมา
    expect(r.nActive).toBe(5);           // "หายไป" ไม่นับ (ปีนี้ยังไม่ซื้อ)
    expect(r.nNew / r.nActive * 100).toBeCloseTo(20);
  });

  it('% ยอดของลูกค้าใหม่คิดจากยอดของคนที่ซื้อปีนี้เท่านั้น', () => {
    expect(r.curTotal).toBe(100 + 200 + 100 + 103 + 300);
    expect(r.newRev / r.curTotal * 100).toBeCloseTo(100 / 803 * 100);
  });

  it('เก่าที่ซื้อทั้งสองปี → เทียบยอดรวมได้ตรง ๆ (±5% = ใกล้เคียง ไม่นับเป็นโต/หด)', () => {
    expect(r.of('up').map(x => x.name)).toEqual(['เก่า-ซื้อเพิ่ม']);
    expect(r.of('down').map(x => x.name)).toEqual(['เก่า-ซื้อลด']);
    expect(r.of('flat').map(x => x.name)).toEqual(['เก่า-ใกล้เคียง']);
    expect(r.bothPrv).toBe(400);
    expect(r.bothCur).toBe(403);
    expect(r.bothDeltaPct).toBeCloseTo(0.75);
  });

  it('ลูกค้าเก่าที่ปีที่แล้วเงียบแล้วกลับมา = "กลับมา" ไม่ใช่ "ใหม่"', () => {
    expect(r.of('back').map(x => x.name)).toEqual(['เก่า-กลับมา']);
    expect(r.of('new').map(x => x.name)).not.toContain('เก่า-กลับมา');
  });

  it('คนที่ปีนี้ยังไม่ซื้อถูกแยกเป็น "หายไป" พร้อมยอดที่หายไป', () => {
    expect(r.of('lost').map(x => x.name)).toEqual(['หายไป']);
    expect(r.lostRev).toBe(400);
  });
});

describe('หน้าต่างเวลา — เดือนที่ยังไม่จบต้องไม่ถูกนับ', () => {
  it('ตัดเดือนที่ยังไม่จบแล้ว ปีนี้ที่ยอดเท่าเดิมต้องออกมา "เท่ากัน" ไม่ใช่ "หด"', () => {
    // ซื้อเดือนละ 100 เท่ากันทั้งสองปี แต่ 08/2026 เพิ่งผ่านไปครึ่งเดือน (ได้แค่ 40)
    const byMonth = {};
    for (let mm = 1; mm <= 7; mm++) { byMonth[mkey(mm, 2025)] = { total: 100, count: 1 }; byMonth[mkey(mm, 2026)] = { total: 100, count: 1 }; }
    byMonth['08/2025'] = { total: 100, count: 1 };
    byMonth['08/2026'] = { total: 40, count: 1 };
    const c = [cust('ลูกค้าเก่า', byMonth)];
    expect(classify(c, MONTHS, 2026, 7).bothDeltaPct).toBeCloseTo(0);   // ตัด ส.ค. ทิ้ง = เท่ากัน
    expect(classify(c, MONTHS, 2026, 8).bothDeltaPct).toBeLessThan(-5); // ไม่ตัด = หดทั้งที่ไม่ได้หดจริง
  });

  it('"ใหม่" ดูจากทั้งประวัติ ไม่ใช่แค่ในหน้าต่างที่เทียบ', () => {
    // ซื้อครั้งแรก 12/2025 (นอกหน้าต่าง ม.ค.–ก.ค.) → ต้องเป็น "เก่าที่กลับมา" ไม่ใช่ "ใหม่"
    const c = [cust('ซื้อครั้งแรกปลายปีก่อน', m({ '12/2025': 500, '03/2026': 200 }))];
    const r = classify(c, MONTHS, 2026, 7);
    expect(r.nNew).toBe(0);
    expect(r.of('back').length).toBe(1);
  });
});

describe('meta: โค้ดจริงยังทำตามข้อตกลงพวกนี้อยู่', () => {
  const view = SRC.slice(SRC.indexOf('function CustomerView'));

  it('CustomerView มีบล็อกคำนวณ yoy + ตัวเลือกปี/โหมด', () => {
    expect(view).toMatch(/const yoy = uM\(/);
    expect(view).toMatch(/setYoyYear/);
    expect(view).toMatch(/yoyMode/);
  });

  it('โหมด "เทียบช่วงเดียวกัน" ยังตัดเดือนปัจจุบันที่ยังไม่จบทิ้ง', () => {
    // ถอดบรรทัดนี้ออกเมื่อไหร่ = ปีปัจจุบันจะดูหดตลอดโดยไม่มีอะไรบอก
    expect(view).toMatch(/now\.getFullYear\(\)\s*&&\s*last\s*>=\s*now\.getMonth\(\)\s*\+\s*1/);
  });

  it('ยังจัดกลุ่มครบทั้ง 6 แบบ (ไม่ยุบ back/lost หายไปเงียบ ๆ)', () => {
    ['"lost"', '"new"', '"back"', '"up"', '"down"', '"flat"'].forEach(b => {
      expect(view.includes('bucket = ' + b)).toBe(true);
    });
  });

  it('% ลูกค้าใหม่/เก่า คิดจากฐาน activeRows (คนที่ซื้อปีนี้) ไม่ใช่ rows ทั้งหมด', () => {
    expect(view).toMatch(/activeRows\s*=\s*rows\.filter\(r\s*=>\s*r\.cur\.total\s*>\s*0\)/);
    expect(view).toMatch(/pctOf\(yoy\.nNew,\s*yoy\.nActive\)/);
    expect(view).toMatch(/pctOf\(yoy\.nOld,\s*yoy\.nActive\)/);
  });

  it('ยังเตือนเรื่องปีแรกของข้อมูล/ปีที่ยังไม่จบ — ห้ามเงียบ', () => {
    expect(view).toMatch(/warns\.push/);
    expect(view).toMatch(/ปีแรกที่มีข้อมูล/);
    expect(view).toMatch(/ยังไม่จบ/);
  });

  it('ไม่ได้ไปแตะ payload หลัก — ยังอ่านจาก customers\\[\\].byMonth เดิม', () => {
    expect(view).toMatch(/c\.byMonth\s*&&\s*c\.byMonth\[String\(m\)\.padStart/);
  });
});
