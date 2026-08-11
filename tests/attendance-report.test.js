// tests/attendance-report.test.js — 📅 รายงานการเข้างาน (แท็บ attreport)
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน tracking-batch.test.js: **ไม่ copy โค้ดเข้า helpers.js** แต่ eval ฟังก์ชันจริงจาก
// views-attendance.jsx — ตัวเลขในหน้านี้คือสิ่งที่เจ้าของเอาไปคุยเรื่องชั่วโมงทำงาน/เงินเดือน
// สำเนา drift แล้วเทสต์จะเขียวทั้งที่เลขบนจอผิด (ซึ่งไม่มี error ให้ใครเห็นเลย)
//
// ที่มา (ส.ค. 2026): เจ้าของสั่งเพิ่มเมนูในหมวด "ภาพรวม" แล้ว **ยุบ "📊 สรุปเดือน"** ที่เคยซ่อน
//   อยู่หลัง Seg ของแท็บ "ใครเข้างานวันนี้" เข้ามารวมที่นี่
//
// สิ่งที่คุมไว้ — ทุกข้อคือแบบ "พังแล้วตัวเลขยังดูสมเหตุสมผล":
//   1. attTimeToMin ต้องคืน null (ไม่ใช่ 0) เมื่อไม่มีเวลา — 0 = เที่ยงคืนจริง เอาไปเฉลี่ยแล้วพัง
//   2. ค่าเฉลี่ยนับเฉพาะวันที่กดจริง — วันหยุด/วันขาดห้ามถูกเอามาหาร
//   3. daysPresent (มาทำงาน) ต้องแยกจาก daysWorked (คิดชั่วโมงได้)
//   4. บัคเก็ตสัปดาห์ = วันที่ 1-7/8-14/… และวันที่ 29-31 ต้องไม่หลุดเป็นสัปดาห์ที่ 6
//   5. แกนตั้งของกราฟเวลาเข้างานต้องกว้างพอ ไม่ขยายความต่าง 2 นาทีเป็นภูเขา
//   6. meta: "📊 สรุปเดือน" เดิมต้องถูกยุบจริง (ไม่เหลือ 2 ที่ที่คิดคนละรอบ)
//   7. meta: backend ต้องส่ง days[] + นับ "ครั้ง" ที่ Start และ frontend ต้องไม่คิดชั่วโมงเอง
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ATT = readFileSync(join(ROOT, 'views-attendance.jsx'), 'utf8');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}
// คอมเมนต์ที่อธิบาย "ทำไมของเดิมผิด" มักมีคำเดียวกับของเดิม — ตัดทิ้งก่อนเทียบ pattern เสมอ
function codeOnly(s) {
  return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// ── ฟังก์ชันจริงจาก views-attendance.jsx ────────────────────────────────────
const { attTimeToMin, attMinToClock, attHoursLabel, attReportAgg, attWeekBuckets, attDayNote } = (() => {
  const src = [
    grab(ATT, /function attMinLabel\(min\) \{[\s\S]*?\n\}/),
    grab(ATT, /function attTimeToMin\(t\) \{[\s\S]*?\n\}/),
    grab(ATT, /function attMinToClock\(min\) \{[\s\S]*?\n\}/),
    grab(ATT, /function attHoursLabel\(min\) \{[\s\S]*?\n\}/),
    grab(ATT, /function attReportAgg\(rows\) \{[\s\S]*?\n\}/),
    grab(ATT, /function attWeekBuckets\(days\) \{[\s\S]*?\n\}/),
    grab(ATT, /function attDayNote\(d\) \{[\s\S]*?\n\}/),
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}
    return { attTimeToMin, attMinToClock, attHoursLabel, attReportAgg, attWeekBuckets, attDayNote };`)();
})();

// วันหนึ่งแบบที่ backend ส่งมา (attendanceMonthlySummaryBuild_)
const day = (o) => Object.assign({
  date: '2026-07-01', dow: 3, isToday: false, isPast: true, absent: false, beforeHire: false,
  shift: { name: 'กะปกติ', start: '08:00', end: '17:00' },
  inTime: null, outTime: null, workedMin: null, lateMin: null,
  breakMin: 0, breakCount: 0, bathroomMin: 0, bathroomCount: 0,
  forgotBreakEnd: false, forgotBathroomEnd: false,
}, o);

describe('attTimeToMin — "ไม่มีเวลา" ต้องไม่กลายเป็นเที่ยงคืน', () => {
  it('แปลง HH:mm / HH:mm:ss ได้', () => {
    expect(attTimeToMin('08:01')).toBe(481);
    expect(attTimeToMin('17:05:33')).toBe(1025);
    expect(attTimeToMin('8:05')).toBe(485);
  });

  it('ค่าว่าง/null/รูปแบบผิด → null ไม่ใช่ 0', () => {
    for (const v of ['', null, undefined, '-', 'ไม่มา', '25:00', '08:99']) {
      expect(attTimeToMin(v), String(v)).toBeNull();
    }
  });

  it('00:00 ที่กดจริงยังเป็น 0 (ไม่ใช่ null) — กะดึกมีจริง', () => {
    expect(attTimeToMin('00:00')).toBe(0);
  });
});

describe('attMinToClock / attHoursLabel', () => {
  it('นาที → นาฬิกา 2 หลักเสมอ', () => {
    expect(attMinToClock(481)).toBe('08:01');
    expect(attMinToClock(0)).toBe('00:00');
    expect(attMinToClock(1025)).toBe('17:05');
  });
  it('ไม่มีค่า → "—" (ไม่ใช่ 00:00 ที่อ่านเหมือนเข้างานเที่ยงคืน)', () => {
    expect(attMinToClock(null)).toBe('—');
    expect(attMinToClock(undefined)).toBe('—');
    expect(attMinToClock(NaN)).toBe('—');
  });
  it('เศษนาทีถูกปัด ไม่โผล่เป็นทศนิยมบนหน้าจอ', () => {
    expect(attMinToClock(481.6)).toBe('08:02');
  });
  it('ชั่วโมงรวมอ่านเต็มคำ', () => {
    expect(attHoursLabel(14055)).toBe('234 ชั่วโมง 15 นาที');
    expect(attHoursLabel(45)).toBe('45 นาที');
    expect(attHoursLabel(0)).toBe('0 นาที');
  });
});

describe('attReportAgg — รวม/เฉลี่ยจากรายวันที่ server ส่งมา', () => {
  const rows = [{
    staffId: 'S1', name: 'สมชาย', role: 'frontstore',
    days: [
      day({ date: '2026-07-01', inTime: '08:00:00', outTime: '17:00:00', workedMin: 480, lateMin: 0, breakMin: 60, breakCount: 1, bathroomMin: 40, bathroomCount: 4 }),
      day({ date: '2026-07-02', inTime: '08:10:00', outTime: '17:20:00', workedMin: 490, lateMin: 10, breakMin: 60, breakCount: 1, bathroomMin: 20, bathroomCount: 2 }),
      day({ date: '2026-07-05', shift: null }),                       // วันหยุด
      day({ date: '2026-07-06', absent: true }),                      // มีกะแต่ไม่มา
      day({ date: '2026-07-07', inTime: '08:00:00', outTime: null, workedMin: null, lateMin: 0, breakMin: 0, bathroomMin: 0 }), // ลืมกดออกงาน
    ],
  }];

  it('ค่าเฉลี่ยเวลาเข้างานนับเฉพาะวันที่กดจริง (วันหยุด/วันขาดไม่ถูกเอามาหาร)', () => {
    const t = attReportAgg(rows);
    // 480 + 490 + 480 = 1450 / 3 วัน — ถ้าเอา 5 วันมาหารจะได้ 290 = เข้างานตี 4 ครึ่ง
    expect(t.avgInMin).toBeCloseTo(1450 / 3, 6);
  });

  it('ค่าเฉลี่ยเวลาออกงานนับเฉพาะวันที่กดออกจริง (วันที่ลืมกดไม่นับเป็น 0)', () => {
    const t = attReportAgg(rows);
    expect(t.avgOutMin).toBeCloseTo((1020 + 1040) / 2, 6);
  });

  it('daysPresent (มาทำงาน) แยกจาก daysWorked (คิดชั่วโมงได้)', () => {
    const t = attReportAgg(rows);
    expect(t.daysPresent).toBe(3);   // มา 3 วัน
    expect(t.daysWorked).toBe(2);    // คิดชั่วโมงได้ 2 วัน (อีกวันลืมกดออก)
    expect(t.noOutDays).toBe(1);     // ต้องรายงานออกไป ไม่ใช่กลืนหาย
  });

  it('วันหยุดไม่ถูกนับเป็นวันทำงาน · วันขาดนับเฉพาะวันที่มีกะ', () => {
    const t = attReportAgg(rows);
    expect(t.daysScheduled).toBe(4);
    expect(t.daysAbsent).toBe(1);
  });

  it('สาย/พัก/ห้องน้ำ รวมตรง และเฉลี่ยหารด้วย "วันที่มา" ไม่ใช่ทั้งเดือน', () => {
    const t = attReportAgg(rows);
    expect(t.lateDays).toBe(1);
    expect(t.lateMin).toBe(10);
    expect(t.breakMin).toBe(120);
    expect(t.bathroomCount).toBe(6);
    expect(t.breakAvg).toBeCloseTo(120 / 3, 6);
    expect(t.bathroomAvgCount).toBeCloseTo(6 / 3, 6);
  });

  it('เวลากะที่ใช้เป็นเส้นอ้างอิง = กะที่พบบ่อยสุด (ไม่ใช่กะของวันแรกที่เจอ)', () => {
    const t = attReportAgg([{
      days: [
        day({ shift: { name: 'พิเศษ', start: '10:00', end: '19:00' } }),
        day({ shift: { name: 'ปกติ', start: '08:00', end: '17:00' } }),
        day({ shift: { name: 'ปกติ', start: '08:00', end: '17:00' } }),
      ],
    }]);
    expect(t.shiftStart).toBe('08:00');
    expect(t.shiftEnd).toBe('17:00');
  });

  it('รวมหลายคนได้ (โหมด "ทั้งหมด") — เฉลี่ยคิดจากทุกวันของทุกคน', () => {
    const t = attReportAgg([
      { days: [day({ inTime: '08:00:00' })] },
      { days: [day({ inTime: '09:00:00' })] },
    ]);
    expect(t.people).toBe(2);
    expect(t.daysPresent).toBe(2);
    expect(t.avgInMin).toBe(510);
  });

  it('ไม่มีข้อมูลเลย → ค่าเฉลี่ยเป็น null ไม่ใช่ 0/NaN', () => {
    const t = attReportAgg([]);
    expect(t.avgInMin).toBeNull();
    expect(t.avgOutMin).toBeNull();
    expect(t.breakAvg).toBeNull();
    expect(t.bathroomAvgCount).toBeNull();
  });
});

describe('attWeekBuckets — สัปดาห์ที่ 1-5 ของเดือน', () => {
  it('วันที่ 1-7 = สัปดาห์ 1 · 8-14 = สัปดาห์ 2', () => {
    const w = attWeekBuckets([
      day({ date: '2026-07-01', inTime: '08:00:00' }),
      day({ date: '2026-07-07', inTime: '08:20:00' }),
      day({ date: '2026-07-08', inTime: '09:00:00' }),
    ]);
    expect(w.length).toBe(2);
    expect(w[0].label).toBe('สัปดาห์ 1');
    expect(w[0].avgIn).toBe(490);
    expect(w[1].label).toBe('สัปดาห์ 2');
    expect(w[1].avgIn).toBe(540);
  });

  it('วันที่ 29-31 ยุบเข้าสัปดาห์ 5 (ห้ามมีสัปดาห์ที่ 6)', () => {
    const w = attWeekBuckets([
      day({ date: '2026-07-29', inTime: '08:00:00' }),
      day({ date: '2026-07-31', inTime: '08:00:00' }),
    ]);
    expect(w.length).toBe(1);
    expect(w[0].label).toBe('สัปดาห์ 5');
  });

  it('วันที่ไม่ได้มาทำงานไม่ถูกเอามาหารค่าเฉลี่ยห้องน้ำ', () => {
    const w = attWeekBuckets([
      day({ date: '2026-07-01', inTime: '08:00:00', bathroomMin: 60 }),
      day({ date: '2026-07-02', absent: true }),
      day({ date: '2026-07-03', shift: null }),
    ]);
    expect(w[0].avgBath).toBe(60);   // หารด้วย 1 ไม่ใช่ 3
  });

  it('สัปดาห์ที่ยังไม่มีใครมา → avgIn เป็น null (ไม่ใช่ 0 = เที่ยงคืน)', () => {
    const w = attWeekBuckets([day({ date: '2026-07-01', absent: true })]);
    expect(w[0].avgIn).toBeNull();
  });
});

describe('attDayNote — หมายเหตุรายวันต้องบอกเป็นคำ', () => {
  it('ไม่มีกะ + ไม่ได้มา = วันหยุด (ไม่ใช่ "ขาด")', () => {
    expect(attDayNote(day({ shift: null })).text).toBe('วันหยุด');
  });
  it('มีกะแต่ไม่มา = ขาด (สีแดง)', () => {
    const n = attDayNote(day({ absent: true }));
    expect(n.text).toBe('ขาด');
    expect(n.tone).toBe('bad');
  });
  it('มาสาย → บอกจำนวนนาที', () => {
    expect(attDayNote(day({ inTime: '08:06:00', outTime: '17:00:00', lateMin: 6 })).text).toContain('สาย 6 นาที');
  });
  it('ลืมกดออกงานของวันเก่า ≠ วันนี้ที่ยังทำงานอยู่', () => {
    expect(attDayNote(day({ inTime: '08:00:00' })).text).toContain('ไม่ได้กดออกงาน');
    expect(attDayNote(day({ inTime: '08:00:00', isToday: true })).text).toContain('ยังทำงานอยู่');
  });
  it('วันปกติครบถ้วน = "-" ไม่ใช่ข้อความเตือน', () => {
    expect(attDayNote(day({ inTime: '08:00:00', outTime: '17:00:00', lateMin: 0 })).text).toBe('-');
  });
  it('วันก่อนเข้างานจริง (beforeHire) = "ยังไม่เข้าทำงาน" ไม่ใช่ "ขาด"/"วันหยุด"', () => {
    // ถ้าเข้าไปทาง "วันหยุด"/"ขาด" แปลว่า backend ไม่ได้กันวันก่อนวันเข้างานออกจาก absent
    // ให้ (มีคีย์ shift อยู่ + absent=false) แล้วยังต้องอ่านจาก beforeHire โดยตรง ไม่ใช่เดาจาก field อื่น
    const n = attDayNote(day({ beforeHire: true, shift: null, absent: false }));
    expect(n.text).toBe('ยังไม่เข้าทำงาน');
    expect(n.tone).toBe('muted');
  });
});

// ── meta: จุดเชื่อมต่อที่พังแล้วไม่มี error ให้เห็น ──────────────────────────
describe('meta — "📊 สรุปเดือน" ถูกยุบมาที่รายงานจริง', () => {
  it('AttendanceMonthlySummaryView ถูกลบแล้ว (ไม่เหลือสรุปเดือน 2 ที่)', () => {
    expect(ATT).not.toMatch(/function AttendanceMonthlySummaryView/);
  });

  it('AttendanceTodayView ไม่มี Seg "สรุปเดือน" เหลืออยู่', () => {
    const view = grab(ATT, /function AttendanceTodayView\([\s\S]*?\n\}\n/);
    expect(codeOnly(view)).not.toMatch(/สรุปเดือน/);
  });

  it('AttendanceTodayView ยังมีทางเข้าไปรายงาน (คนที่คุ้นปุ่มเดิมต้องหาเจอ)', () => {
    const view = grab(ATT, /function AttendanceTodayView\([\s\S]*?\n\}\n/);
    expect(view).toMatch(/onNav\("attreport"\)/);
    expect(APP).toMatch(/<AttendanceTodayView[^>]*onNav=\{handleSetTab\}/);
  });
});

describe('meta — แท็บใหม่ต่อครบสาย', () => {
  it('attreport อยู่ใน TABS + ROLE_TABS ของ owner และ dev', () => {
    expect(APP).toMatch(/id: "attreport"/);
    const roleTabs = grab(APP, /const ROLE_TABS = \{[\s\S]*?\n\};/);
    for (const role of ['dev', 'owner']) {
      const line = roleTabs.split('\n').find(l => l.trim().startsWith(role + ':'));
      expect(line, `ROLE_TABS.${role}`).toMatch(/"attreport"/);
    }
  });

  it('อยู่หมวด "ภาพรวม" ตามที่เจ้าของสั่ง (ไม่ใช่หมวดพนักงาน)', () => {
    const g = grab(APP, /\{ id: "g_overview"[^\n]*\}/);
    expect(g).toMatch(/"attreport"/);
    const p = grab(APP, /\{ id: "g_people"[^\n]*\}/);
    expect(p).not.toMatch(/"attreport"/);
  });

  it('มีจุดเรนเดอร์จริงใน app.jsx (อยู่ใน ROLE_TABS แต่ไม่มี view = จอว่าง)', () => {
    expect(APP).toMatch(/activeTab === "attreport"[\s\S]{0,120}<AttendanceReportView\s*\/>/);
  });

  it('ไม่อยู่ใน NO_DATA_TABS — view นี้ยิง endpoint เอง แต่ยังไม่ได้ตรวจเส้น data=null', () => {
    const m = APP.match(/const NO_DATA_TABS = \[([^\]]*)\]/);
    expect(m[1]).not.toMatch(/attreport/);
  });
});

describe('meta — ตัวเลขต้องมาจาก GAS ที่เดียว', () => {
  it('backend ส่ง days[] ต่อคน (ไม่งั้นตารางรายวัน/กราฟไม่มีข้อมูล)', () => {
    const h = grab(GS, /function attendanceMonthlySummaryBuild_[\s\S]*?\n\}/);
    expect(h).toMatch(/days: days/);
    expect(h).toMatch(/daysPresent/);
    expect(h).toMatch(/bathroomCount/);
  });

  it('backend ยังใช้ attSummarize_/attShiftFor_ ตัวเดียวกับหน้า "เวลาของฉัน"', () => {
    const h = grab(GS, /function attendanceMonthlySummaryBuild_[\s\S]*?\n\}/);
    expect(h).toMatch(/attSummarize_\(evs, shift\)/);
    expect(h).toMatch(/attShiftFor_\(shifts, st\.role/);
  });

  it('handler cache ผล 5 นาที ต่อเดือน แต่ fresh=1 ต้องข้าม cache เสมอ (กด 🔄 ต้องได้ของสด)', () => {
    const h = grab(GS, /function attendanceMonthlySummaryHandler_[\s\S]*?\n\}/);
    expect(h).toMatch(/cache\.get\(cacheKey\)/);
    expect(h).toMatch(/if \(!data\.fresh\)/);
    expect(h).toMatch(/attendanceMonthlySummaryBuild_\(ss, month\)/);
  });

  it('แก้เวลาย้อนหลัง (fixAttendance) ต้องล้าง cache ของรายงานเดือนนั้น ไม่งั้นเจ้าของแก้แล้วยังเห็นเลขเก่า', () => {
    const h = grab(GS, /function fixAttendanceHandler_[\s\S]*?\n\}/);
    expect(h).toMatch(/dmj_attmonthly_.*dateStr\.slice\(0, 7\)/);
  });

  it('นับ "ครั้ง" ที่ Start — วันที่ลืมกดกลับต้องยังนับเป็น 1 ครั้ง', () => {
    const f = grab(GS, /function attSummarize_\(events, shift\) \{[\s\S]*?\n\}/);
    expect(f).toMatch(/if \(e\.type === "bathroomStart"\) \{ openBathroom = e; bathroomCount\+\+; \}/);
    expect(f).toMatch(/if \(e\.type === "breakStart"\) \{ openBreak = e; breakCount\+\+; \}/);
  });

  it('frontend ไม่คิดชั่วโมงทำงาน/สายเองซ้ำ (รวม/เฉลี่ยเท่านั้น)', () => {
    const agg = codeOnly(grab(ATT, /function attReportAgg\(rows\) \{[\s\S]*?\n\}/));
    // สูตรชั่วโมง/สายของจริงอยู่ใน attSummarize_ ฝั่ง GAS — เห็น serverTs/shift.start ที่นี่
    // แปลว่ามีคนเริ่มคำนวณซ้ำแล้ว ซึ่งจะเพี้ยนคนละทางกับหน้าอื่นโดยไม่มีอะไรเตือน
    // (อ่าน d.shift.start ได้ — เป็นแค่ "เวลากะไว้วาดเส้นอ้างอิง" ไม่ใช่การคิดว่าสายกี่นาที)
    expect(agg).not.toMatch(/serverTs/);
    expect(agg).toMatch(/d\.workedMin/);
    expect(agg).toMatch(/d\.lateMin/);
  });

  it('ใช้ action เดิม (attendanceMonthlySummary) ไม่ได้เพิ่ม action ใหม่ที่ยังไม่ได้ตรวจสิทธิ์', () => {
    const view = grab(ATT, /function AttendanceReportView\(\)[\s\S]*?\n\}\n/);
    expect(view).toMatch(/action: "attendanceMonthlySummary"/);
  });
});

// ── วันก่อนเข้างานจริง (hire-floor) ห้ามถูกนับเป็น "ขาด"/"มีกะ" ────────────────
// พังจริงที่พบ: คนเข้าใหม่กลางเดือน โดนนับขาดทุกวันก่อนหน้าที่ยังไม่ได้เป็นพนักงานเลย
// เพราะ absent เดิมเช็คแค่ isPast+shift+!inTime โดยไม่มีพื้นวันเข้างานกันไว้เลย
describe('meta — วันก่อนเข้างานจริง (createdAt) ต้องไม่นับขาด/มีกะ', () => {
  it('hireFloor คำนวณจาก st.createdAt แล้วกันทั้ง shift และ absent ของวันก่อนหน้านั้น', () => {
    const build = grab(GS, /function attendanceMonthlySummaryBuild_[\s\S]*?\n\}/);
    expect(build).toMatch(/hireFloor = st\.createdAt \? attDateKey_\(new Date\(st\.createdAt\)\) : ''/);
    expect(build).toMatch(/beforeHire = !!\(hireFloor && dateStr < hireFloor\)/);
    // shift ต้องเป็น null ก่อนวันเข้างาน — ถ้ายังเรียก attShiftFor_ ตรง ๆ แปลว่า guard หลุด
    expect(build).toMatch(/shift = beforeHire \? null : attShiftFor_\(/);
    // absent ต้องยังพึ่ง shift (ซึ่งเป็น null ไปแล้วเมื่อ beforeHire) ไม่ใช่เช็ค beforeHire ซ้ำคนละที่
    expect(build).toMatch(/absent = !!\(isPast && shift && !sum\.inTime\)/);
  });

  it('ส่ง beforeHire ออกไปในแต่ละวัน ไม่งั้น frontend แยกไม่ออกจาก "วันหยุด" ธรรมดา', () => {
    const build = grab(GS, /function attendanceMonthlySummaryBuild_[\s\S]*?\n\}/);
    expect(build).toMatch(/beforeHire: beforeHire,/);
  });

  it('createdAt ว่าง/parse ไม่ออก → hireFloor เป็นค่าว่าง (ไม่จำกัดวัน) ไม่ใช่เดาวันเข้างาน', () => {
    // st.createdAt falsy → เงื่อนไข ternary สั้นวงจรไปที่ '' โดยไม่เรียก attDateKey_/new Date เลย
    const hireFloorOf = (createdAt) => {
      const attDateKey_ = () => { throw new Error('ไม่ควรถูกเรียกเมื่อ createdAt ว่าง'); };
      const st = { createdAt };
      return st.createdAt ? attDateKey_(new Date(st.createdAt)) : '';
    };
    expect(hireFloorOf('')).toBe('');
    expect(hireFloorOf(null)).toBe('');
    expect(hireFloorOf(undefined)).toBe('');
  });
});

describe('meta — อ่านรายงานผิดไม่ได้', () => {
  it('แถบ "อ่านตัวเลขนี้ยังไง" ยังอยู่ (ค่าเฉลี่ยพวกนี้ตีความผิดง่ายมาก)', () => {
    const view = grab(ATT, /function AttendanceReportView\(\)[\s\S]*?\n\}\n/);
    expect(view).toMatch(/อ่านตัวเลขนี้ยังไง/);
  });

  it('ตารางรายวันโชว์ครบทุกวัน — ห้ามมี "ดูเพิ่มเติม/ดูข้อมูลทั้งหมด" ที่ตัดแถวหายจาก PDF', () => {
    const table = grab(ATT, /function AttDayTable\(\{ days \}\) \{[\s\S]*?\n\}\n/);
    // ห้ามตัดจำนวนแถว — days.slice(...) / .slice(0, N) ที่ระดับรายการ (ไม่ใช่ slice ของสตริงเวลา)
    expect(codeOnly(table)).not.toMatch(/days\.slice|ดูเพิ่มเติม|ดูข้อมูลทั้งหมด|showAll/);
  });

  it('แกนตั้งของกราฟเวลาเข้างานถูกบังคับความกว้างขั้นต่ำ + มีเส้นกะให้เทียบ', () => {
    const chart = grab(ATT, /function AttWeekLine\(\{ weeks, refMin, refLabel \}\) \{[\s\S]*?\n\}\n/);
    expect(chart).toMatch(/Math\.max\(40,/);
    expect(chart).toMatch(/refMin/);
  });

  it('โหมด "ทั้งหมด" (คนละกะกันได้) ต้องบอกว่าเส้นอ้างอิงเป็นค่าที่พบบ่อยสุด ไม่ใช่กะจริงของทุกคน', () => {
    const view = grab(ATT, /function AttendanceReportView\(\)[\s\S]*?\n\}\n/);
    expect(view).toMatch(/refLabel=\{one \?/);
    expect(view).toMatch(/ที่พบบ่อยสุด/);
  });

  it('ปุ่ม/ตัวเลือกมี .no-print — ไม่งั้นปุ่มติดไปใน PDF ที่ส่งให้คนอื่นดู', () => {
    const view = grab(ATT, /function AttendanceReportView\(\)[\s\S]*?\n\}\n/);
    expect(view).toMatch(/className="no-print"/);
  });

  it('จอมือถือสลับตารางเป็นการ์ด (ตาราง 9 คอลัมน์บนจอ 360px อ่านไม่ได้)', () => {
    const view = grab(ATT, /function AttendanceReportView\(\)[\s\S]*?\n\}\n/);
    expect(view).toMatch(/useIsMobile\(/);
    expect(view).toMatch(/mobile \? <AttDayCards[\s\S]*?: <AttDayTable/);
  });

  it('ROLE_TH_ATT ครบทุก role ที่ readStaffAll_ กรอง active ให้ (ไม่งั้น dev/storedevice ขึ้นเป็นภาษาอังกฤษดิบ)', () => {
    const rolesTh = grab(GS, /const STAFF_ROLE_TH_ = \{[^}]*\}/);
    const roleKeys = [...rolesTh.matchAll(/(\w+):\s*"/g)].map(m => m[1]);
    const attTable = grab(ATT, /const ROLE_TH_ATT = \{[^}]*\}/);
    roleKeys.forEach(role => expect(attTable).toMatch(new RegExp('\\b' + role + ':')));
  });
});
