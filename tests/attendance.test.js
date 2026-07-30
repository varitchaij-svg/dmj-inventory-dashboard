// tests/attendance.test.js
// ─────────────────────────────────────────────────────────────────────────────
// ระบบลงเวลาเข้า-ออกงาน — ตรรกะที่ผิดแล้วเงียบ (ตัวเลขออกมาดูสมเหตุสมผลแต่ผิด)
//   1. attBuildTs  — แปลง "วันที่ + เวลา" ที่เจ้าของกรอกตอนแก้ย้อนหลัง เป็น serverTs
//                    ถ้าเพี้ยน ชั่วโมงทำงานทั้งเดือนเพี้ยนตามโดยไม่มีใครสังเกต
//   2. attSummarize — คิดชั่วโมงทำงาน/พัก/สาย จาก event log
//   3. attSequenceWarning — เตือนลำดับเพี้ยนหลังเจ้าของแก้ย้อนหลัง (เตือน ไม่บล็อก)
//   4. attMonthRange — ช่วงวันของ "เวลาของฉัน" เดือนนี้ต้องตัดที่เมื่อวาน ไม่โชว์วันอนาคต
//   5. attAllowedNext — สถานะ ห้องน้ำ/พัก แยกกัน ทำพร้อมกันไม่ได้ (กันกดข้ามสถานะ)
//   6. attSiteBucket — นับ "ใครอยู่หน้าร้าน/คลังสินค้า" จาก GPS จริงแทนเดาจาก role
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  attBuildTs, attSequenceWarning, attSummarize, attMonthRange, attAllowedNext,
  attLatestSiteName, attSiteBucket,
} from './helpers.js';

// event ปลอมจากวันที่/เวลา — เลียนแบบแถวในชีต "ลงเวลา"
const ev = (type, hhmm) => {
  const t = attBuildTs('2026-07-29', hhmm);
  return { type, time: t.time, serverTs: t.ms };
};

describe('attBuildTs — แปลงวันที่+เวลาเป็น serverTs', () => {
  it('แปลง HH:mm ปกติได้ และเติมวินาทีเป็น 00', () => {
    const r = attBuildTs('2026-07-29', '08:30');
    expect(r.time).toBe('08:30:00');
    const d = new Date(r.ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);      // ก.ค. = 6 (0-indexed)
    expect(d.getDate()).toBe(29);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
  });

  it('รับ HH:mm:ss ได้ด้วย', () => {
    expect(attBuildTs('2026-07-29', '17:45:12').time).toBe('17:45:12');
  });

  it('เติม 0 ข้างหน้าให้ชั่วโมงหลักเดียว', () => {
    expect(attBuildTs('2026-07-29', '9:05').time).toBe('09:05:00');
  });

  it('ms เดินหน้าตามเวลาจริง — ห่างกัน 1 ชม. = 3600000 ms', () => {
    const a = attBuildTs('2026-07-29', '08:00').ms;
    const b = attBuildTs('2026-07-29', '09:00').ms;
    expect(b - a).toBe(3600000);
  });

  it('ข้ามวันคำนวณถูก (ไม่ใช่ลบ)', () => {
    const a = attBuildTs('2026-07-29', '23:00').ms;
    const b = attBuildTs('2026-07-30', '01:00').ms;
    expect(b - a).toBe(2 * 3600000);
  });

  it('ปฏิเสธรูปแบบวันที่ผิด', () => {
    expect(attBuildTs('29/07/2026', '08:30')).toBeNull();
    expect(attBuildTs('2026-7-29', '08:30')).toBeNull();
    expect(attBuildTs('', '08:30')).toBeNull();
  });

  it('ปฏิเสธเวลาผิด / เกินช่วง', () => {
    expect(attBuildTs('2026-07-29', '25:00')).toBeNull();
    expect(attBuildTs('2026-07-29', '08:99')).toBeNull();
    expect(attBuildTs('2026-07-29', '08')).toBeNull();
    expect(attBuildTs('2026-07-29', '')).toBeNull();
  });

  it('24:00 ไม่ถือว่าใช้ได้ (ต้องเป็น 00:00 ของวันถัดไป)', () => {
    expect(attBuildTs('2026-07-29', '24:00')).toBeNull();
  });
});

describe('attSummarize — คิดชั่วโมงทำงาน/พัก/สาย', () => {
  it('วันปกติ: เข้า 08:30 พัก 1 ชม. ออก 17:30 → ทำงาน 8 ชม.', () => {
    const s = attSummarize(
      [ev('in', '08:30'), ev('breakStart', '12:00'), ev('breakEnd', '13:00'), ev('out', '17:30')],
      { start: 8 * 60 + 30 }
    );
    expect(s.workedMin).toBe(8 * 60);
    expect(s.breakMin).toBe(60);
    expect(s.lateMin).toBe(0);
    expect(s.inTime).toBe('08:30:00');
    expect(s.outTime).toBe('17:30:00');
  });

  it('พักหลายรอบ รวมทุกช่วง', () => {
    const s = attSummarize(
      [ev('in', '08:30'), ev('breakStart', '10:00'), ev('breakEnd', '10:15'),
       ev('breakStart', '12:00'), ev('breakEnd', '13:00'), ev('out', '17:30')],
      null
    );
    expect(s.breakMin).toBe(75);
    expect(s.workedMin).toBe(9 * 60 - 75);
  });

  it('ลืมกด "กลับจากพัก" → ตั้งธง + นับพักถึงเวลาออกงาน', () => {
    const s = attSummarize([ev('in', '08:30'), ev('breakStart', '12:00'), ev('out', '17:30')], null);
    expect(s.forgotBreakEnd).toBe(true);
    expect(s.breakMin).toBe(330);       // 12:00 → 17:30
    expect(s.workedMin).toBe(3 * 60 + 30);
  });

  it('เข้าสาย 15 นาที — ไม่มีผ่อนผันตามนโยบายเจ้าของ', () => {
    const s = attSummarize([ev('in', '08:45'), ev('out', '17:30')], { start: 8 * 60 + 30 });
    expect(s.lateMin).toBe(15);
  });

  it('มาก่อนเวลาไม่ติดลบ', () => {
    const s = attSummarize([ev('in', '08:00'), ev('out', '17:30')], { start: 8 * 60 + 30 });
    expect(s.lateMin).toBe(0);
  });

  it('ไม่มีกะวันนั้น → ไม่คิดสาย (null ไม่ใช่ 0)', () => {
    const s = attSummarize([ev('in', '10:30'), ev('out', '17:30')], null);
    expect(s.lateMin).toBeNull();
  });

  it('ยังไม่กดออกงาน → workedMin เป็น null (คำนวณไม่ได้ ไม่ใช่ 0)', () => {
    const s = attSummarize([ev('in', '08:30')], { start: 8 * 60 + 30 });
    expect(s.workedMin).toBeNull();
    expect(s.outTime).toBeNull();
  });

  it('กำลังพักอยู่ (ยังไม่ออกงาน) → onBreak = true', () => {
    const s = attSummarize([ev('in', '08:30'), ev('breakStart', '12:00')], null);
    expect(s.onBreak).toBe(true);
  });

  it('ยังไม่ลงเวลาเลย → ทุกค่าว่าง ไม่ throw', () => {
    const s = attSummarize([], { start: 8 * 60 + 30 });
    expect(s.inTime).toBeNull();
    expect(s.workedMin).toBeNull();
    expect(s.breakMin).toBe(0);
  });

  it('เติมเวลาออกงานย้อนหลัง (เคสหลักของ fixAttendance) → ชั่วโมงกลับมาคำนวณได้', () => {
    const before = attSummarize([ev('in', '08:30')], { start: 8 * 60 + 30 });
    expect(before.workedMin).toBeNull();
    const after = attSummarize([ev('in', '08:30'), ev('out', '18:00')], { start: 8 * 60 + 30 });
    expect(after.workedMin).toBe(9 * 60 + 30);
  });

  it('ไปห้องน้ำ 10 นาที → bathroomMin นับได้ แต่ "ไม่หัก" จาก workedMin (ต่างจากพักที่หัก)', () => {
    const s = attSummarize([ev('in', '08:30'), ev('bathroomStart', '10:00'), ev('bathroomEnd', '10:10'), ev('out', '17:30')], null);
    expect(s.bathroomMin).toBe(10);
    expect(s.workedMin).toBe(9 * 60);   // ไม่ลบ bathroomMin ออก (ต่างจาก breakMin ที่ลบ)
  });

  it('พัก + ห้องน้ำพร้อมกันในวันเดียว → นับแยกกันคนละยอด', () => {
    const s = attSummarize([
      ev('in', '08:30'), ev('breakStart', '12:00'), ev('breakEnd', '13:00'),
      ev('bathroomStart', '15:00'), ev('bathroomEnd', '15:05'), ev('out', '17:30'),
    ], null);
    expect(s.breakMin).toBe(60);
    expect(s.bathroomMin).toBe(5);
    expect(s.workedMin).toBe(9 * 60 - 60);   // หักแค่ breakMin ไม่หัก bathroomMin
  });

  it('ลืมกด "กลับจากห้องน้ำ" → ตั้งธง forgotBathroomEnd + นับถึงเวลาออกงาน', () => {
    const s = attSummarize([ev('in', '08:30'), ev('bathroomStart', '16:00'), ev('out', '17:30')], null);
    expect(s.forgotBathroomEnd).toBe(true);
    expect(s.bathroomMin).toBe(90);
  });

  it('กำลังอยู่ห้องน้ำ (ยังไม่ออกงาน) → onBathroom = true', () => {
    const s = attSummarize([ev('in', '08:30'), ev('bathroomStart', '10:00')], null);
    expect(s.onBathroom).toBe(true);
  });
});

describe('attSequenceWarning — เตือนลำดับเพี้ยนหลังแก้ย้อนหลัง', () => {
  it('ลำดับปกติ → ไม่เตือน', () => {
    expect(attSequenceWarning([ev('in', '08:30'), ev('breakStart', '12:00'), ev('breakEnd', '13:00'), ev('out', '17:30')])).toBe('');
  });

  it('ไม่มีเหตุการณ์เลย → ไม่เตือน (ยังไม่ได้ลงเวลา ไม่ใช่ข้อมูลผิด)', () => {
    expect(attSequenceWarning([])).toBe('');
  });

  it('เหตุการณ์แรกไม่ใช่ "เข้างาน" → เตือน', () => {
    expect(attSequenceWarning([ev('breakStart', '12:00'), ev('out', '17:30')])).toContain('เข้างาน');
  });

  it('มี "เข้างาน" 2 ครั้ง → เตือน', () => {
    expect(attSequenceWarning([ev('in', '08:30'), ev('in', '09:00'), ev('out', '17:30')])).toContain('มากกว่า 1 ครั้ง');
  });

  it('มีเหตุการณ์ต่อหลัง "ออกงาน" → เตือน', () => {
    expect(attSequenceWarning([ev('in', '08:30'), ev('out', '17:30'), ev('breakStart', '18:00')])).toContain('ออกงาน');
  });

  it('เตือนได้หลายข้อพร้อมกัน คั่นด้วย ·', () => {
    const w = attSequenceWarning([ev('breakStart', '08:00'), ev('in', '08:30'), ev('in', '09:00')]);
    expect(w.split('·').length).toBe(2);
  });

  it('กด "เข้างาน" อย่างเดียว (ยังทำงานอยู่) → ไม่เตือน', () => {
    expect(attSequenceWarning([ev('in', '08:30')])).toBe('');
  });
});

describe('attMonthRange — ช่วงวันของ "เวลาของฉัน"', () => {
  it('เดือนที่ผ่านไปแล้ว → เต็มเดือน (ก.พ. 2026 = 28 วัน ไม่ใช่ปีอธิกสุรทิน)', () => {
    const r = attMonthRange('2026-02', new Date(2026, 6, 29)); // วันนี้ = 29 ก.ค.
    expect(r.dates.length).toBe(28);
    expect(r.dates[0]).toBe('2026-02-01');
    expect(r.dates[27]).toBe('2026-02-28');
    expect(r.isCurrentMonth).toBe(false);
  });

  it('ปีอธิกสุรทิน → ก.พ. มี 29 วัน', () => {
    const r = attMonthRange('2024-02', new Date(2024, 5, 1));
    expect(r.dates.length).toBe(29);
    expect(r.dates[28]).toBe('2024-02-29');
  });

  it('เดือนปัจจุบัน → ตัดที่วันนี้ ไม่โชว์วันอนาคต', () => {
    const r = attMonthRange('2026-07', new Date(2026, 6, 29)); // วันนี้ = 29 ก.ค. 2026
    expect(r.dates.length).toBe(29);
    expect(r.dates[r.dates.length - 1]).toBe('2026-07-29');
    expect(r.dates).not.toContain('2026-07-30');
    expect(r.isCurrentMonth).toBe(true);
  });

  it('ไม่ระบุเดือน → default เป็นเดือนปัจจุบัน', () => {
    const today = new Date(2026, 6, 5);
    const r = attMonthRange('', today);
    expect(r.month).toBe('2026-07');
    expect(r.isCurrentMonth).toBe(true);
  });

  it('รูปแบบเดือนผิด → fallback เป็นเดือนปัจจุบันเหมือนไม่ระบุ', () => {
    const today = new Date(2026, 6, 5);
    expect(attMonthRange('July 2026', today).month).toBe('2026-07');
    expect(attMonthRange('2026/07', today).month).toBe('2026-07');
  });

  it('วันที่ 1 ของเดือนปัจจุบัน → มีแค่วันเดียว', () => {
    const r = attMonthRange('2026-07', new Date(2026, 6, 1));
    expect(r.dates).toEqual(['2026-07-01']);
  });
});

describe('attAllowedNext — ห้องน้ำ/พัก เป็นคนละสถานะ ทำพร้อมกันไม่ได้', () => {
  it('ยังไม่ลงเวลาเลย → กดได้แค่ "เข้างาน"', () => {
    expect(attAllowedNext([])).toEqual(['in']);
  });

  it('เพิ่งเข้างาน → เริ่มพัก/ไปห้องน้ำ/ออกงาน ได้ทั้ง 3', () => {
    expect(attAllowedNext([{ type: 'in' }])).toEqual(['breakStart', 'bathroomStart', 'out']);
  });

  it('กำลังพักอยู่ → กดได้แค่ "กลับจากพัก" หรือ "ออกงาน" — ไปห้องน้ำระหว่างพักไม่ได้', () => {
    const allowed = attAllowedNext([{ type: 'in' }, { type: 'breakStart' }]);
    expect(allowed).toEqual(['breakEnd', 'out']);
    expect(allowed).not.toContain('bathroomStart');
  });

  it('กำลังอยู่ห้องน้ำ → กดได้แค่ "กลับจากห้องน้ำ" หรือ "ออกงาน" — เริ่มพักระหว่างเข้าห้องน้ำไม่ได้', () => {
    const allowed = attAllowedNext([{ type: 'in' }, { type: 'bathroomStart' }]);
    expect(allowed).toEqual(['bathroomEnd', 'out']);
    expect(allowed).not.toContain('breakStart');
  });

  it('กลับจากพักแล้ว → เริ่มพัก/ไปห้องน้ำ/ออกงาน ได้ใหม่อีกครั้ง', () => {
    expect(attAllowedNext([{ type: 'in' }, { type: 'breakStart' }, { type: 'breakEnd' }]))
      .toEqual(['breakStart', 'bathroomStart', 'out']);
  });

  it('กลับจากห้องน้ำแล้ว → เริ่มพัก/ไปห้องน้ำ/ออกงาน ได้ใหม่อีกครั้ง', () => {
    expect(attAllowedNext([{ type: 'in' }, { type: 'bathroomStart' }, { type: 'bathroomEnd' }]))
      .toEqual(['breakStart', 'bathroomStart', 'out']);
  });

  it('ออกงานแล้ว → จบวัน กดอะไรไม่ได้อีก', () => {
    expect(attAllowedNext([{ type: 'in' }, { type: 'out' }])).toEqual([]);
  });

  it('ออกงานตอนกำลังพักอยู่ (ลืมกดกลับจากพัก) → ยอมให้ออกงานได้', () => {
    expect(attAllowedNext([{ type: 'in' }, { type: 'breakStart' }, { type: 'out' }])).toEqual([]);
  });
});

describe('attSiteBucket — นับหน้าร้าน/คลังสินค้าจาก GPS จริง (ไม่ใช่เดาจาก role)', () => {
  const FS = "หน้าร้าน (ดูเหมือนจริง)";
  const WH = "คลังสินค้าสาย 5";

  it('saler ที่ GPS ยืนยันว่าอยู่หน้าร้าน → นับเป็นหน้าร้าน (role เดียวไม่พอ)', () => {
    const row = { role: 'saler', events: [{ siteName: FS }] };
    expect(attSiteBucket(row)).toBe('frontstore');
  });

  it('frontstore ที่ GPS บอกว่าจริงๆ อยู่คลังสินค้าวันนี้ (ไปช่วยงาน) → นับตาม GPS ไม่ใช่ role', () => {
    const row = { role: 'frontstore', events: [{ siteName: WH }] };
    expect(attSiteBucket(row)).toBe('warehouse');
  });

  it('ไม่มี GPS เลยทั้งวัน → fallback ไปตาม role (เฉพาะ frontstore/warehouse ที่มี mapping ชัด)', () => {
    expect(attSiteBucket({ role: 'frontstore', events: [{ siteName: '' }, { siteName: null }] })).toBe('frontstore');
    expect(attSiteBucket({ role: 'warehouse', events: [] })).toBe('warehouse');
  });

  it('saler ไม่มี GPS เลย → ไม่มี default ที่แม่นพอ คืน null (ไม่ทราบตำแหน่ง)', () => {
    expect(attSiteBucket({ role: 'saler', events: [] })).toBeNull();
  });

  it('employee/owner/dev ไม่มี GPS เลย → คืน null เช่นกัน', () => {
    ['employee', 'owner', 'dev'].forEach(role => {
      expect(attSiteBucket({ role, events: [] }), role).toBeNull();
    });
  });

  it('ใช้จุดล่าสุดที่มี GPS จริง แม้การกดครั้งล่าสุดจะไม่มีสัญญาณ', () => {
    const row = { role: 'saler', events: [{ siteName: FS }, { siteName: '' }, { siteName: null }] };
    expect(attSiteBucket(row)).toBe('frontstore');
  });

  it('เจอชื่อจุดที่ไม่รู้จัก (ไม่ใช่หน้าร้าน/คลังสินค้า) → fallback ไป role', () => {
    const row = { role: 'warehouse', events: [{ siteName: 'จุดใหม่ที่เพิ่งเพิ่ม' }] };
    expect(attSiteBucket(row)).toBe('warehouse');
  });

  it('attLatestSiteName: เดินย้อนหาอีเวนต์ล่าสุดที่มีพิกัด', () => {
    expect(attLatestSiteName([{ siteName: FS }, { siteName: '' }])).toBe(FS);
    expect(attLatestSiteName([])).toBeNull();
    expect(attLatestSiteName([{ siteName: '' }, { siteName: null }])).toBeNull();
  });
});
