// tests/staff-perf.test.js — 🏅 สรุปผลงานพนักงาน (action=staffPerf)
// ─────────────────────────────────────────────────────────────────────────────
// **ไม่ copy โค้ดเข้า tests/helpers.js** — eval ฟังก์ชันจริงจาก appsscript_complete.gs
// เหมือน auth.test.js/qtyloc.test.js เพราะตัวที่ต้องกันคือ "ตารางหมวดงาน drift จาก
// action ที่โค้ดเขียนจริง" ซึ่งถ้าเก็บสำเนาไว้ก็จะ drift ทั้งคู่พร้อมกันแล้วเทสต์ยังเขียว
//
// สิ่งที่คุมไว้ (ทุกข้อคือแบบ "พังแล้วไม่มี error ให้เห็น"):
//   1. ทุก action ที่ writeAuditLog_ เขียนจริง ต้องมีหมวดรองรับ — ไม่ตกไป "อื่นๆ"
//   2. การกดลงเวลา (~5 ครั้ง/วัน/คน) ต้องไม่ถูกนับเป็น "งาน" ไม่งั้นกลบงานจริงทั้งหมด
//   3. actor ที่จับคู่พนักงานไม่ได้ ต้องไม่ถูกกลืนหาย (ยอดพนักงานเป็น 0 โดยไม่มีอะไรบอก)
//   4. วันที่ปี พ.ศ. ในชีตต้องไม่ตีความเป็นอนาคต 543 ปี (บทเรียนข้อ 11)
//   5. endpoint ต้องตรวจสิทธิ์ owner/dev จริง (ข้อมูลผลงานรายคนเป็นเรื่องอ่อนไหว)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const VA  = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// ── sandbox: stub GAS globals เท่าที่ฟังก์ชันพวกนี้ใช้จริง ──
function load() {
  const ctx = {
    Utilities: {
      // ใช้แค่ yyyy-MM-dd โซน Asia/Bangkok — คำนวณเองให้ผลคงที่ไม่ว่าเครื่องเทสต์ TZ อะไร
      formatDate: (d) => {
        const u = new Date(d.getTime() + 7 * 3600 * 1000);
        const p = (n) => String(n).padStart(2, '0');
        return u.getUTCFullYear() + '-' + p(u.getUTCMonth() + 1) + '-' + p(u.getUTCDate());
      },
    },
  };
  const code = [
    grab(/const STAFF_PERF_CATEGORIES_ = \[[\s\S]*?\n\];/),
    grab(/const STAFF_PERF_OTHER_ = \{[\s\S]*?\};/),
    grab(/const STAFF_PERF_SYSTEM_ACTORS_ = \[[\s\S]*?\];/),
    grab(/function staffPerfCategoryOf_\(action\) \{[\s\S]*?\n\}/),
    grab(/function staffPerfNormalizeActor_\(actor\) \{[\s\S]*?\n\}/),
    grab(/function staffPerfDayKey_\(v\) \{[\s\S]*?\n\}/),
    grab(/function staffPerfRowUnits_\(resource\) \{[\s\S]*?\n\}/),
    grab(/function staffPerfCountDetail_\(total, changed\) \{[\s\S]*?\n\}/),
    grab(/function staffPerfAggregateAudit_\(rows, monthKey\) \{[\s\S]*?\n\}/),
    grab(/function staffPerfAggregateSales_\(rows, monthKey\) \{[\s\S]*?\n\}/),
    grab(/function staffPerfCatDef_\(key\) \{[\s\S]*?\n\}/),
    'return { STAFF_PERF_CATEGORIES_, STAFF_PERF_OTHER_, STAFF_PERF_SYSTEM_ACTORS_,' +
    ' staffPerfCategoryOf_, staffPerfNormalizeActor_, staffPerfDayKey_,' +
    ' staffPerfRowUnits_, staffPerfCountDetail_,' +
    ' staffPerfAggregateAudit_, staffPerfAggregateSales_, staffPerfCatDef_ };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(ctx), code)(...Object.values(ctx));
}

const M = load();

// ── ดึง action literal จาก call site ของ writeAuditLog_ ในโค้ดจริง ──
// นับวงเล็บ + ข้าม string literal (arg แรกมี `" ("` อยู่จริง naive counting จะเพี้ยน)
// ⚠️ ต้องสแกน writeAuditLogBatch_ ด้วย — งานที่ทำทีละหลายสิบ SKU (โอนของขึ้นรถ) ย้ายไปใช้
//    ตัวนั้นแล้ว ถ้าสแกนแค่ตัวเดิม action ของมันจะหลุดการตรวจไปเงียบ ๆ ทั้งที่เทสต์ยังเขียว
function auditActionLiterals(src) {
  return ['writeAuditLog_(', 'writeAuditLogBatch_('].reduce(
    (acc, n) => acc.concat(auditActionLiteralsFor(src, n)), []);
}
function auditActionLiteralsFor(src, NEEDLE) {
  const out = new Set();
  let i = 0;
  while ((i = src.indexOf(NEEDLE, i)) >= 0) {
    if (/function\s$/.test(src.slice(Math.max(0, i - 9), i))) { i += NEEDLE.length; continue; }
    let j = i + NEEDLE.length, depth = 1, q = null, cur = '', args = [];
    while (j < src.length && depth > 0) {
      const ch = src[j];
      if (q) {
        if (ch === '\\') { cur += ch + src[j + 1]; j += 2; continue; }
        if (ch === q) q = null;
        cur += ch; j++; continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; cur += ch; j++; continue; }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      if (ch === ')' || ch === ']' || ch === '}') depth--;
      if (depth === 0) { args.push(cur); break; }
      if (ch === ',' && depth === 1) { args.push(cur); cur = ''; j++; continue; }
      cur += ch; j++;
    }
    const arg1 = (args[1] || '').trim();
    // แยกตาม ? : || ก่อน แล้วเอา literal "ตัวแรก" ของแต่ละสาขา
    // (ตัวแรกเท่านั้น — ตัวถัด ๆ มาคือส่วนที่ถูก + ต่อท้าย เช่น "แก้ไขการลงเวลา (" + op + ")")
    arg1.split(/\?|:|\|\|/).forEach(function (branch) {
      const m = branch.match(/(['"`])((?:\\.|(?!\1).)*)\1/);
      if (m) out.add(m[2]);
    });
    i = j;
  }
  return [...out];
}

describe('staffPerfCategoryOf_ — จับ action เข้าหมวด', () => {
  it('จับ action หลักของแต่ละงานได้ถูกหมวด', () => {
    expect(M.staffPerfCategoryOf_('นับสต็อก')).toBe('count');
    expect(M.staffPerfCategoryOf_('ตรวจหน้าร้าน')).toBe('fscheck');
    expect(M.staffPerfCategoryOf_('อัปเดต order')).toBe('order');
    expect(M.staffPerfCategoryOf_('โอนสต็อก')).toBe('transfer');
    expect(M.staffPerfCategoryOf_('รับสินค้า')).toBe('receive');
    expect(M.staffPerfCategoryOf_('updateLockData')).toBe('location');
    expect(M.staffPerfCategoryOf_('ซื้อสินค้าเข้า')).toBe('purchase');
    expect(M.staffPerfCategoryOf_('เพิ่มสินค้าใหม่')).toBe('newproduct');
    expect(M.staffPerfCategoryOf_('ออกบิลขาย')).toBe('sale');
    expect(M.staffPerfCategoryOf_('สร้างใบเสนอราคา')).toBe('quote');
    expect(M.staffPerfCategoryOf_('ปิดงาน MTO')).toBe('mto');
    expect(M.staffPerfCategoryOf_('ลงเวลา')).toBe('punch');
  });

  it('จับแบบ prefix — action ที่ต่อท้ายด้วยข้อมูลเพิ่มยังเข้าหมวดเดิม', () => {
    expect(M.staffPerfCategoryOf_('แก้ไขการลงเวลา (แก้เวลา)')).toBe('admin');
    expect(M.staffPerfCategoryOf_('ลบ order (batch)')).toBe('adjust');
    expect(M.staffPerfCategoryOf_('ปิดใบเสนอราคา (ไม่อนุมัติ)')).toBe('quote');
    expect(M.staffPerfCategoryOf_('อนุมัติใบเสนอราคา (ZORT สร้างออเดอร์ขายให้อัตโนมัติ)')).toBe('quote');
    expect(M.staffPerfCategoryOf_('ตั้งตำแหน่งพนักงาน (จาก script)')).toBe('admin');
  });

  it('"แก้ไขการลงเวลา" ต้องเข้า admin ไม่ใช่ punch — ทั้งคู่ขึ้นต้นคล้ายกัน', () => {
    expect(M.staffPerfCategoryOf_('แก้ไขการลงเวลา (เพิ่ม)')).toBe('admin');
    expect(M.staffPerfCategoryOf_('ลงเวลา')).toBe('punch');
  });

  it('"ลบ order" กับ "อัปเดต order" คนละหมวด — จัดของกับลบทิ้งไม่ใช่งานเดียวกัน', () => {
    expect(M.staffPerfCategoryOf_('อัปเดต order')).toBe('order');
    expect(M.staffPerfCategoryOf_('ลบ order')).toBe('adjust');
  });

  it('action ที่ไม่รู้จัก/ว่าง → "อื่นๆ" (ไม่ throw)', () => {
    expect(M.staffPerfCategoryOf_('อะไรก็ไม่รู้')).toBe('other');
    expect(M.staffPerfCategoryOf_('')).toBe('other');
    expect(M.staffPerfCategoryOf_(null)).toBe('other');
    expect(M.staffPerfCategoryOf_(undefined)).toBe('other');
  });
});

describe('meta: ตารางหมวดงานต้องตามทันโค้ดจริง', () => {
  it('ทุก action ที่ writeAuditLog_ เขียนจริง ต้องมีหมวดรองรับ (ไม่ตกไป "อื่นๆ")', () => {
    const lits = auditActionLiterals(SRC);
    expect(lits.length).toBeGreaterThan(20);   // กันกรณี extractor พังแล้วได้ [] ว่างแล้วผ่าน
    const orphan = lits.filter((a) => M.staffPerfCategoryOf_(a) === 'other');
    expect(orphan, 'action พวกนี้ยังไม่มีหมวด — เติม prefix ใน STAFF_PERF_CATEGORIES_')
      .toEqual([]);
  });

  it('key ของหมวดไม่ซ้ำกัน และไม่ชนกับ "other"', () => {
    const keys = M.STAFF_PERF_CATEGORIES_.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(M.STAFF_PERF_OTHER_.key);
  });

  it('prefix ห้ามคลุมกันข้ามหมวด — ไม่งั้นงานไปตกหมวดผิดตามลำดับที่เขียน', () => {
    const clashes = [];
    M.STAFF_PERF_CATEGORIES_.forEach((a) => {
      a.prefixes.forEach((pa) => {
        M.STAFF_PERF_CATEGORIES_.forEach((b) => {
          if (a.key === b.key) return;
          b.prefixes.forEach((pb) => {
            if (pa.indexOf(pb) === 0 || pb.indexOf(pa) === 0) clashes.push(a.key + ':' + pa + ' ↔ ' + b.key + ':' + pb);
          });
        });
      });
    });
    expect(clashes).toEqual([]);
  });

  it('ทุกหมวดมี label/emoji/unit ครบ (UI อ่านตรง ๆ ไม่มี fallback)', () => {
    M.STAFF_PERF_CATEGORIES_.forEach((c) => {
      expect(c.label, c.key).toBeTruthy();
      expect(c.emoji, c.key).toBeTruthy();
      expect(c.unit, c.key).toBeTruthy();
      expect(c.prefixes.length, c.key).toBeGreaterThan(0);
    });
  });
});

describe('staffPerfNormalizeActor_ — ตัดวงเล็บตำแหน่งท้ายชื่อ', () => {
  it('ตัด "(ตำแหน่ง)" ท้ายชื่อออก', () => {
    expect(M.staffPerfNormalizeActor_('สมชาย (คลังสินค้า)')).toBe('สมชาย');
    expect(M.staffPerfNormalizeActor_('Somchai (DEV)')).toBe('Somchai');
  });
  it('ชื่อที่ไม่มีวงเล็บ คงเดิม', () => {
    expect(M.staffPerfNormalizeActor_('สมชาย')).toBe('สมชาย');
  });
  it('ตัดแค่วงเล็บชุดท้ายสุดชุดเดียว', () => {
    expect(M.staffPerfNormalizeActor_('สมชาย (เก่า) (หน้าร้าน)')).toBe('สมชาย (เก่า)');
  });
  it('ค่าว่าง/null → string ว่าง (ไม่ throw)', () => {
    expect(M.staffPerfNormalizeActor_('')).toBe('');
    expect(M.staffPerfNormalizeActor_(null)).toBe('');
    expect(M.staffPerfNormalizeActor_(undefined)).toBe('');
  });
});

describe('staffPerfDayKey_ — วันที่จากชีต', () => {
  it('Date object → yyyy-MM-dd ตามเวลาไทย', () => {
    // 2026-08-04T18:30Z = 2026-08-05 01:30 เวลาไทย → ต้องได้วันที่ 5 ไม่ใช่ 4
    expect(M.staffPerfDayKey_(new Date('2026-08-04T18:30:00Z'))).toBe('2026-08-05');
  });
  it('string ISO', () => {
    expect(M.staffPerfDayKey_('2026-08-05 11:30:45')).toBe('2026-08-05');
    expect(M.staffPerfDayKey_('2026-08-05T11:30:45.000Z')).toBe('2026-08-05');
  });
  it('ปี พ.ศ. ต้องแปลงกลับเป็น ค.ศ. (บทเรียนข้อ 11 — ไม่งั้นเป็นอนาคต 543 ปี)', () => {
    expect(M.staffPerfDayKey_('5/8/2569 11:30:45')).toBe('2026-08-05');
    expect(M.staffPerfDayKey_('15/12/2569')).toBe('2026-12-15');
  });
  it('d/M/yyyy ที่เป็น ค.ศ. อยู่แล้ว ไม่โดนลบ 543', () => {
    expect(M.staffPerfDayKey_('5/8/2026')).toBe('2026-08-05');
  });
  it('ค่าว่าง/ขยะ → string ว่าง (ไม่ throw, ไม่คืนวันมั่ว)', () => {
    expect(M.staffPerfDayKey_('')).toBe('');
    expect(M.staffPerfDayKey_(null)).toBe('');
    expect(M.staffPerfDayKey_(undefined)).toBe('');
    expect(M.staffPerfDayKey_('ไม่ใช่วันที่')).toBe('');
    expect(M.staffPerfDayKey_(new Date('ขยะ'))).toBe('');
  });
});

describe('staffPerfAggregateAudit_ — รวมยอดจาก Audit Log', () => {
  const row = (d, actor, action) => [d, actor, action, 'SKU1', ''];

  it('รวมยอดต่อคน แยกตามหมวด และแยกตามวัน', () => {
    const r = M.staffPerfAggregateAudit_([
      row('2026-08-01', 'สมชาย (คลังสินค้า)', 'นับสต็อก'),
      row('2026-08-01', 'สมชาย (คลังสินค้า)', 'นับสต็อก'),
      row('2026-08-02', 'สมชาย (คลังสินค้า)', 'โอนสต็อก'),
      row('2026-08-02', 'สมหญิง (หน้าร้าน)', 'ตรวจหน้าร้าน'),
    ], '2026-08');
    expect(r.rows).toBe(4);
    const a = r.byActor['สมชาย (คลังสินค้า)'];
    expect(a.total).toBe(3);
    expect(a.byCat).toEqual({ count: 2, transfer: 1 });
    expect(a.byDay).toEqual({ '2026-08-01': 2, '2026-08-02': 1 });
    expect(r.byActor['สมหญิง (หน้าร้าน)'].total).toBe(1);
  });

  it('ตัดแถวนอกเดือนที่ขอทิ้ง', () => {
    const r = M.staffPerfAggregateAudit_([
      row('2026-07-31', 'ก', 'นับสต็อก'),
      row('2026-08-01', 'ก', 'นับสต็อก'),
      row('2026-09-01', 'ก', 'นับสต็อก'),
    ], '2026-08');
    expect(r.rows).toBe(1);
    expect(r.byActor['ก'].total).toBe(1);
  });

  it('แถวที่วันที่อ่านไม่ออก ถูกข้าม ไม่ทำให้ทั้งก้อนพัง', () => {
    const r = M.staffPerfAggregateAudit_([
      row('', 'ก', 'นับสต็อก'),
      row('ขยะ', 'ก', 'นับสต็อก'),
      row('2026-08-01', 'ก', 'นับสต็อก'),
    ], '2026-08');
    expect(r.rows).toBe(1);
  });

  it('opsTotal นับเฉพาะงานหน้างาน — งานตั้งค่าไม่นับ', () => {
    const r = M.staffPerfAggregateAudit_([
      row('2026-08-01', 'ก', 'นับสต็อก'),        // ops
      row('2026-08-01', 'ก', 'แก้ไขพนักงาน'),     // admin — ไม่ใช่ ops
      row('2026-08-01', 'ก', 'setProductOwner'), // star — ไม่ใช่ ops
    ], '2026-08');
    expect(r.byActor['ก'].total).toBe(3);
    expect(r.byActor['ก'].opsTotal).toBe(1);
  });

  it('การกดลงเวลาไม่ถูกนับเป็น "งาน" — แต่ยังเห็นใน byCat', () => {
    const r = M.staffPerfAggregateAudit_([
      row('2026-08-01', 'ก', 'ลงเวลา'),
      row('2026-08-01', 'ก', 'ลงเวลา'),
      row('2026-08-01', 'ก', 'ลงเวลา'),
      row('2026-08-01', 'ก', 'ลงเวลา'),
      row('2026-08-01', 'ก', 'นับสต็อก'),
    ], '2026-08');
    const a = r.byActor['ก'];
    expect(a.total).toBe(1);                 // กดลงเวลา 4 ครั้งต้องไม่กลายเป็น 5 งาน
    expect(a.opsTotal).toBe(1);
    expect(a.byCat).toEqual({ punch: 4, count: 1 });
    expect(a.byDay).toEqual({ '2026-08-01': 1 });   // กราฟรายวันก็ต้องไม่นับด้วย
  });

  it('คนที่กดแต่ลงเวลาอย่างเดียว → total 0 (ไม่ใช่ 6) แต่ยังมีแถวอยู่', () => {
    const r = M.staffPerfAggregateAudit_(
      Array.from({ length: 6 }, () => row('2026-08-03', 'ข', 'ลงเวลา')), '2026-08');
    expect(r.byActor['ข'].total).toBe(0);
    expect(r.byActor['ข'].byCat.punch).toBe(6);
  });

  it('input ว่าง/ไม่ใช่ array → ไม่ throw', () => {
    expect(M.staffPerfAggregateAudit_([], '2026-08').rows).toBe(0);
    expect(M.staffPerfAggregateAudit_(null, '2026-08').rows).toBe(0);
  });
});

describe('staffPerfAggregateSales_ — ยอดขายเป็นเงินต่อผู้ขาย (จากชีต "บิลขาย")', () => {
  // แถวบิลขาย: idx1=วันที่ idx5=ผู้ขาย idx8=ยอดสุทธิ (อ่านแค่ A..I = 9 คอลัมน์)
  const bill = (date, seller, total, status) =>
    ['SB-x', date, '10:00', 'RC-1', '', seller, 'หน้าร้าน', 'เงินสด', total, 0];
  const billWithStatus = (date, seller, total, status) => {
    const r = bill(date, seller, total); r[20] = status; return r;
  };

  it('รวมยอดบาท + นับใบ ต่อผู้ขาย ในเดือนที่ขอ', () => {
    const r = M.staffPerfAggregateSales_([
      bill('2026-08-01', 'สมหญิง (เซล)', 1000),
      bill('2026-08-02', 'สมหญิง (เซล)', 500),
      bill('2026-08-02', 'ป้าแดง (เซล)', 250),
    ], '2026-08');
    expect(r.byActor['สมหญิง (เซล)']).toEqual({ revenue: 1500, bills: 2 });
    expect(r.byActor['ป้าแดง (เซล)']).toEqual({ revenue: 250, bills: 1 });
    expect(r.rows).toBe(3);
  });

  it('ตัดบิลนอกเดือนทิ้ง', () => {
    const r = M.staffPerfAggregateSales_([
      bill('2026-07-31', 'ก (เซล)', 999),
      bill('2026-08-15', 'ก (เซล)', 100),
      bill('2026-09-01', 'ก (เซล)', 999),
    ], '2026-08');
    expect(r.byActor['ก (เซล)']).toEqual({ revenue: 100, bills: 1 });
  });

  it('บิลไม่มีชื่อผู้ขาย → ข้าม (ผูกกับใครไม่ได้)', () => {
    const r = M.staffPerfAggregateSales_([
      bill('2026-08-01', '', 500),
      bill('2026-08-01', '   ', 500),
      bill('2026-08-01', 'ก (เซล)', 100),
    ], '2026-08');
    expect(Object.keys(r.byActor)).toEqual(['ก (เซล)']);
    expect(r.rows).toBe(1);
  });

  it('บิลสถานะไม่ใช่ "สำเร็จ" ถูกตัด (เผื่ออนาคตมีบิลยกเลิก) — แต่ไม่มีคอลัมน์สถานะก็ยังนับ', () => {
    const r = M.staffPerfAggregateSales_([
      billWithStatus('2026-08-01', 'ก (เซล)', 1000, 'สำเร็จ'),
      billWithStatus('2026-08-01', 'ก (เซล)', 9999, 'ยกเลิก'),
      bill('2026-08-01', 'ก (เซล)', 200),   // อ่านมาแค่ A..I → r[20] undefined → นับ
    ], '2026-08');
    expect(r.byActor['ก (เซล)']).toEqual({ revenue: 1200, bills: 2 });
  });

  it('วันที่ปี พ.ศ. (ชีตเขียนเป็น text) อ่านออก', () => {
    const r = M.staffPerfAggregateSales_([
      bill('15/8/2569', 'ก (เซล)', 300),   // 2569 - 543 = 2026
    ], '2026-08');
    expect(r.byActor['ก (เซล)']).toEqual({ revenue: 300, bills: 1 });
  });

  it('ยอดสุทธิที่อ่านไม่ออก = 0 (ไม่ทำให้ทั้งก้อน NaN)', () => {
    const r = M.staffPerfAggregateSales_([
      bill('2026-08-01', 'ก (เซล)', 'ขยะ'),
      bill('2026-08-01', 'ก (เซล)', 100),
    ], '2026-08');
    expect(r.byActor['ก (เซล)']).toEqual({ revenue: 100, bills: 2 });
  });

  it('input ว่าง/ไม่ใช่ array → ไม่ throw', () => {
    expect(M.staffPerfAggregateSales_([], '2026-08').rows).toBe(0);
    expect(M.staffPerfAggregateSales_(null, '2026-08').rows).toBe(0);
  });
});

describe('meta: ยอดขายต่อเซล ต่อสายครบ', () => {
  const b = grab(/function staffPerfBuild_\(ss, monthStr\) \{[\s\S]*?\n\}/);

  it('staffPerfBuild_ อ่านชีตบิลขายแล้วผูก staffId ด้วย nameToId ชุดเดียวกับ audit', () => {
    expect(b).toMatch(/getSheetByName\(SHEET_SALE_BILLS\)/);
    expect(b).toMatch(/staffPerfAggregateSales_/);
    // ต้องผูกด้วย nameToId (แหล่งเดียวกับ audit) ไม่ใช่ map ใหม่ที่ drift ได้
    expect(b).toMatch(/salesByRaw[\s\S]*?nameToId\[raw\.toLowerCase\(\)\]/);
  });

  it('อ่านชีตบิลขายแค่ A..I (9 คอลัมน์) — ไม่ getDataRange ทั้งชีต', () => {
    expect(b).toMatch(/getRange\(2, 1, lastBill - 1, 9\)/);
    // เฉพาะบล็อกบิลขาย — getDataRange ทั้งชีตยังห้ามเหมือนเดิม (เช็คซ้ำจาก describe อื่นแล้ว)
  });

  it('แถวต่อคนมี saleRevenue/saleBills + คนที่ขายได้อย่างเดียวไม่ถูก filter ทิ้ง', () => {
    expect(b).toMatch(/saleRevenue: sales\.revenue, saleBills: sales\.bills/);
    expect(b).toMatch(/row\.saleRevenue > 0/);   // อยู่ในเงื่อนไข filter
  });

  it('UI โชว์ยอดขายเป็นเงิน ไม่ใช่แค่จำนวนใบ (views-analytics)', () => {
    expect(VA).toMatch(/s\.saleRevenue > 0/);
    expect(VA).toMatch(/fmtBfull\(s\.saleRevenue\)/);
  });
});

describe('staffPerfCatDef_', () => {
  it('คืน def ของหมวดที่มีจริง', () => {
    expect(M.staffPerfCatDef_('count').ops).toBe(true);
    expect(M.staffPerfCatDef_('punch').skip).toBe(true);
    expect(M.staffPerfCatDef_('admin').ops).toBe(false);
  });
  it('key ที่ไม่มี → คืน def ของ "อื่นๆ" (ops/skip เป็น falsy — ไม่ทำให้ยอดหาย)', () => {
    const d = M.staffPerfCatDef_('ไม่มีจริง');
    expect(d.key).toBe('other');
    expect(!!d.ops).toBe(false);
    expect(!!d.skip).toBe(false);
  });
});

describe('meta: จุดเชื่อมต่อ endpoint + UI', () => {
  it('doGet มี dispatch action=staffPerf', () => {
    expect(SRC).toMatch(/e\.parameter\.action === 'staffPerf'/);
    expect(SRC).toMatch(/return staffPerfHandler_\(e\)/);
  });

  it('staffPerfHandler_ ตรวจ session จริง + จำกัด owner/dev (ไม่เชื่อ role จาก query param)', () => {
    const h = grab(/function staffPerfHandler_\(e\) \{[\s\S]*?\n\}/);
    expect(h).toMatch(/resolveSession_\(ss, p\.sessionToken\)/);
    expect(h).toMatch(/isAdminRole_\(sess\.role\)/);
    expect(h).toMatch(/return unauthorized_\(\)/);
    // ห้ามกลับไปอ่าน role ที่ client ส่งมาเอง
    expect(h).not.toMatch(/isAdminRole_\(\s*p\.role/);
  });

  it('รวมยอดฝั่ง server — ห้ามส่งแถวดิบทั้งชีตกลับไปให้ client', () => {
    const b = grab(/function staffPerfBuild_\(ss, monthStr\) \{[\s\S]*?\n\}/);
    expect(b).toMatch(/staffPerfAggregateAudit_/);
    // payload ที่คืนต้องไม่มีคีย์แถวดิบ
    expect(b).not.toMatch(/auditRaw|rawRows:/);
  });

  it('อ่านคอลัมน์วันที่ก่อนเพื่อจำกัดช่วงแถว — ไม่ใช่ getDataRange ทั้งชีต', () => {
    const b = grab(/function staffPerfBuild_\(ss, monthStr\) \{[\s\S]*?\n\}/);
    expect(b).not.toMatch(/getDataRange\(\)/);
    expect(b).toMatch(/getRange\(2, 1, lastA - 1, 1\)/);
  });

  // column index เพี้ยนเป็นบั๊กที่เกิดบ่อยสุดในโปรเจกต์นี้ (บทเรียนข้อ 5)
  // อ่านชีตลงเวลาเริ่มที่ col B ไม่ใช่ A → index ทุกตัวเลื่อนไป 1 จากที่คุ้นเคย
  it('อ่านชีตลงเวลาเริ่ม col B กว้าง 7 — index ที่ใช้ต้องตรงกับ B..H', () => {
    const b = grab(/function staffPerfBuild_\(ss, monthStr\) \{[\s\S]*?\n\}/);
    expect(b).toMatch(/getRange\(2, 2, lastAtt - 1, 7\)/);
    // B=staffId(0) C=ชื่อ(1) D=วันที่(2) E=เวลา(3) F=serverTs(4) G=clientTs(5) H=ประเภท(6)
    expect(b).toMatch(/attRowDateStr_\(r\[2\]\)/);       // วันที่
    expect(b).toMatch(/String\(r\[0\]\)/);               // staffId
    expect(b).toMatch(/type: r\[6\]/);                   // ประเภท
    expect(b).toMatch(/time: r\[3\]/);                   // เวลา
    expect(b).toMatch(/serverTs: Number\(r\[4\]\)/);     // serverTs
  });

  it('ชั่วโมงทำงานคิดจาก attSummarize_ ตัวเดียวกับหน้า "เวลาของฉัน" (ไม่คำนวณเอง)', () => {
    const b = grab(/function staffPerfBuild_\(ss, monthStr\) \{[\s\S]*?\n\}/);
    expect(b).toMatch(/attSummarize_\(evs, shift\)/);
    expect(b).toMatch(/attShiftFor_\(shifts, st\.role/);
    expect(b).toMatch(/attMonthRange_\(monthStr\)/);
  });

  it('tab "staffperf" มีใน TABS และอยู่ใน ROLE_TABS ของ owner + dev เท่านั้น', () => {
    expect(APP).toMatch(/id: "staffperf"/);
    const roleTabs = APP.match(/const ROLE_TABS = \{[\s\S]*?\n\};/)[0];
    const withTab = roleTabs.split('\n').filter((l) => l.includes('"staffperf"'));
    expect(withTab.length).toBe(2);
    expect(withTab.every((l) => /^\s*(owner|dev):/.test(l))).toBe(true);
  });

  it('tab staffperf ถูก render จริงใน router (ไม่ใช่ประกาศไว้เฉย ๆ)', () => {
    expect(APP).toMatch(/activeTab === "staffperf"[\s\S]{0,120}<StaffPerformanceView\s*\/>/);
  });

  it('tab staffperf อยู่ในกลุ่ม nav ของ owner — ไม่ตกไป "อื่นๆ"', () => {
    const groups = APP.match(/const OWNER_GROUPS = \[[\s\S]*?\n\];/)[0];
    expect(groups).toMatch(/"staffperf"/);
  });

  it('frontend อ่านคำตอบจริงผ่าน dmjJson (บทเรียนข้อ 13 — กัน "สำเร็จปลอม")', () => {
    const fn = VA.match(/async function syncGetStaffPerf\([\s\S]*?\n\}/)[0];
    expect(fn).toMatch(/await dmjJson\(res\)/);
    expect(fn).toMatch(/sessionToken=/);
    expect(fn).toMatch(/dmjErrText/);
  });

  it('UI จัดกลุ่มตามตำแหน่ง — ห้ามเป็นอันดับรวมทั้งร้าน (เทียบคนละหน่วยกัน)', () => {
    const view = VA.match(/function StaffPerformanceView\(\)[\s\S]*?\n\}\n/)[0];
    expect(view).toMatch(/s\.role/);
    expect(view).toMatch(/STAFF_PERF_ROLE_LABEL/);
  });

  it('UI โชว์ actor ที่จับคู่ไม่ได้ — ห้ามทิ้งเงียบ', () => {
    expect(VA).toMatch(/d\.unmatched/);
    const b = grab(/function staffPerfBuild_\(ss, monthStr\) \{[\s\S]*?\n\}/);
    expect(b).toMatch(/unmatched\.push/);
  });
});

// ── นับสต็อก/เช็คหน้าร้าน = "รอบการนับ" ไม่ใช่ราย SKU (เจ้าของเลือก ส.ค. 2026) ──
// เดิมบันทึก audit เฉพาะ SKU ที่ค่าเปลี่ยน → นับ 100 ตรง 85 ได้เครดิตแค่ 15 (งานนับหาย)
// ตอนนี้ 1 รอบนับ = 1 แถว · resource "รอบนับ:N" ให้รู้ว่ารอบนั้นนับกี่ตัว
describe('staffPerfRowUnits_ — ดึง "กี่ตัว" จาก resource ของรอบนับ', () => {
  it('"รอบนับ:30" → 30', () => { expect(M.staffPerfRowUnits_('รอบนับ:30')).toBe(30); });
  it('resource เป็น SKU ปกติ → 1 (backward compat แถวเก่า/งานอื่น)', () => {
    expect(M.staffPerfRowUnits_('OL00008')).toBe(1);   // ห้ามไปดึง "00008" มาเป็น 8
    expect(M.staffPerfRowUnits_('R01025')).toBe(1);
  });
  it('ว่าง / null / ไม่มีเลข → 1', () => {
    expect(M.staffPerfRowUnits_('')).toBe(1);
    expect(M.staffPerfRowUnits_(null)).toBe(1);
    expect(M.staffPerfRowUnits_('รอบนับ:')).toBe(1);
  });
});

describe('staffPerfCountDetail_ — สรุปรอบนับ', () => {
  it('ไม่มีที่เปลี่ยน → หัวเรื่องอย่างเดียว', () => {
    expect(M.staffPerfCountDetail_(30, [])).toBe('นับ 30 ตัว · เปลี่ยน 0 ตัว');
  });
  it('มีที่เปลี่ยน → แนบรายการ (oldQty null = ของใหม่ โชว์ "-")', () => {
    const d = M.staffPerfCountDetail_(3, [{ sku: 'A1', oldQty: 40, newQty: 35 }, { sku: 'B2', oldQty: null, newQty: 5 }]);
    expect(d).toMatch(/นับ 3 ตัว · เปลี่ยน 2 ตัว/);
    expect(d).toMatch(/A1 40→35/);
    expect(d).toMatch(/B2 -→5/);
  });
  it('เปลี่ยนเกิน 40 ตัว → cap ไว้ 40 แรก', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ sku: 'S' + i, oldQty: 1, newQty: 2 }));
    const d = M.staffPerfCountDetail_(60, many);
    expect(d).toMatch(/40 แรก/);
    expect(d).not.toMatch(/S45/);
  });
});

describe('staffPerfAggregateAudit_ — รอบนับนับเป็น 1 แถว แต่ byCatUnits รวมจำนวนตัว', () => {
  it('2 รอบนับ (30 + 20 ตัว) → count byCat=2 รอบ · byCatUnits=50 ตัว', () => {
    const r = M.staffPerfAggregateAudit_([
      ['2026-08-01', 'สมชาย (คลังสินค้า)', 'นับสต็อก', 'รอบนับ:30', 'x'],
      ['2026-08-02', 'สมชาย (คลังสินค้า)', 'นับสต็อก', 'รอบนับ:20', 'x'],
    ], '2026-08');
    const a = r.byActor['สมชาย (คลังสินค้า)'];
    expect(a.byCat.count).toBe(2);         // 2 รอบ
    expect(a.byCatUnits.count).toBe(50);   // รวม 50 ตัว
    expect(a.total).toBe(2);               // total นับเป็นรอบ (1 แถว = 1 งาน)
  });
  it('เช็คหน้าร้าน "รอบนับ:12" → fscheck 1 รอบ · 12 ตัว', () => {
    const r = M.staffPerfAggregateAudit_([
      ['2026-08-01', 'สมหญิง (หน้าร้าน)', 'ตรวจหน้าร้าน', 'รอบนับ:12', 'x'],
    ], '2026-08');
    const a = r.byActor['สมหญิง (หน้าร้าน)'];
    expect(a.byCat.fscheck).toBe(1);
    expect(a.byCatUnits.fscheck).toBe(12);
  });
});

// meta: ทั้ง 2 เส้นทางนับ ต้องเขียน 1 แถว/รอบ + resource "รอบนับ:" (ไม่งั้นกลับไปนับราย SKU เงียบ ๆ)
describe('meta: confirmStockCount / updateFrontStore เขียนแบบ "รอบนับ"', () => {
  const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
  it('confirmStockCount เขียน "นับสต็อก" resource "รอบนับ:" + updated', () => {
    const fn = GS.match(/function confirmStockCount\([\s\S]*?\n\}/)[0];
    expect(fn).toMatch(/writeAuditLog_\(actor, "นับสต็อก", "รอบนับ:" \+ updated/);
    // ต้องไม่กลับไป log ราย SKU เฉพาะที่เปลี่ยนแบบเดิม
    expect(fn).not.toMatch(/writeAuditLog_\(actor, "นับสต็อก", r\.sku/);
  });
  it('updateFrontStore เขียน "ตรวจหน้าร้าน" resource "รอบนับ:"', () => {
    const fn = GS.match(/function updateFrontStore\([\s\S]*?\n\}/)[0];
    expect(fn).toMatch(/writeAuditLog_\([\s\S]*?"ตรวจหน้าร้าน", "รอบนับ:"/);
  });
  it('count/fscheck ใช้ unit "รอบ" + sumUnits:true', () => {
    const tbl = GS.match(/const STAFF_PERF_CATEGORIES_ = \[[\s\S]*?\n\];/)[0];
    expect(tbl).toMatch(/key: "count",[\s\S]*?unit: "รอบ",[\s\S]*?sumUnits: true/);
    expect(tbl).toMatch(/key: "fscheck",[\s\S]*?unit: "รอบ",[\s\S]*?sumUnits: true/);
  });
});
