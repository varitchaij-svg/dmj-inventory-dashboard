// tests/shipment-receive-heal.test.js — "กดรับของแล้วเด้งให้กดใหม่ 2-3 ครั้ง"
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (ส.ค. 2026): พนักงานหน้าร้านแจ้งว่ากด "รับของ" แล้วจอขึ้นสำเร็จ แต่พอเปิดใหม่
// รายการเด้งกลับมาเป็นยังไม่รับ ต้องกดซ้ำ 2-3 รอบ ยิ่งหลายเครื่องช่วยกันเช็คยิ่งเจอบ่อย
//
// ต้นเหตุมี 2 ชั้น ซ้อนกัน (แก้ชั้นเดียวไม่พอ):
//   ชั้นที่ 1 — id ของ shipment คือ **เลขแถวในชีต** (`readShipments_` → 'S'+(i+1)) ซึ่งเลื่อน
//     ทุกครั้งที่มีแถวถูกลบ (archive ตี 3 / cleanup / เจ้าของแก้ชีตเอง) · เครื่องที่ถือข้อมูล
//     เก่าอยู่จะส่งเลขแถวที่ชี้ผิดแถว แล้ว server ตอบ "โปรดรีเฟรชแล้วลองใหม่"
//   ชั้นที่ 2 — ฝั่งเว็บ **ไม่เคยอ่านคำตอบ** ("สำเร็จปลอม" — บทเรียนข้อ 13 ใน CLAUDE.md)
//     ยิงแล้วขึ้น toast เขียวทันที → พนักงานเชื่อว่าบันทึกแล้ว ทั้งที่ชีตไม่มีอะไรเปลี่ยน
//
// เทสต์ชุดนี้ eval `findShipmentRow_` ตัวจริงจาก `.gs` มารันกับชีตจำลอง (ไม่ copy ตรรกะ)
// + meta-test ฝั่ง .jsx ว่ายังอ่านคำตอบจริง/ยังส่ง refNum อยู่
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const ANALYTICS = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// ตัดคอมเมนต์ทิ้งก่อนตรวจ "โค้ดต้องไม่มีแพทเทิร์นนี้" — ไม่งั้นคอมเมนต์ที่อธิบายว่า
// "เดิมเคยเขียนแบบไหนแล้วพัง" จะไปทำให้เทสต์แดงเอง ทั้งที่โค้ดจริงถูกต้อง
function codeOnly(s) {
  return String(s).split('\n').filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln)).join('\n');
}

const COLS    = grab(SRC, /const COL_SHIP_REF\s+= 1;[\s\S]*?const COL_SHIP_RECVBY\s+= 14;[^\n]*/);
const HEADERS = grab(SRC, /const SHIP_HEADERS = \[[\s\S]*?\];/);
const F_FIND  = grab(SRC, /function findShipmentRow_\(sheet, rowNum, refNum, sku\) \{[\s\S]*?\n\}/);

// eslint-disable-next-line no-new-func
const { findShipmentRow_ } = new Function(
  [COLS, HEADERS, F_FIND].join('\n') + '\nreturn { findShipmentRow_ };'
)();

const W = 15;
// index 0-based ตามคอลัมน์จริง: A=ref, B=date, F=sku, H=qty, M=recvAt
function row({ ref = '', sku = '', qty = 10, recvAt = '' } = {}) {
  const r = new Array(W).fill('');
  r[0] = ref; r[1] = '03/08/2026'; r[2] = 'สำเร็จ';
  r[5] = sku; r[7] = qty; r[12] = recvAt;
  return r;
}

// ชีตจำลอง: rows[0], rows[1] = หัวตาราง 2 แถว, ข้อมูลเริ่ม rows[2] (= sheet row 3)
function makeSheet(dataRows) {
  const rows = [new Array(W).fill('h1'), new Array(W).fill('h2'), ...dataRows];
  const cell = (r, c) => String(rows[r - 1] && rows[r - 1][c - 1] != null ? rows[r - 1][c - 1] : '');
  return {
    getLastRow: () => rows.length,
    getLastColumn: () => W,
    getDataRange: () => ({ getDisplayValues: () => rows.map((r) => r.map((c) => String(c == null ? '' : c))) }),
    getRange: (r, c, nR, nC) => ({
      getDisplayValue: () => cell(r, c),
      getDisplayValues: () => {
        const out = [];
        for (let i = 0; i < (nR || 1); i++) {
          const line = [];
          for (let j = 0; j < (nC || 1); j++) line.push(cell(r + i, c + j));
          out.push(line);
        }
        return out;
      },
    }),
  };
}

const REF = 'TF-20260803-005';

describe('เส้นทางปกติ — เลขแถวถูกต้อง', () => {
  it('เจอแถวทันทีโดยไม่ต้องไล่หา (healed=false)', () => {
    const sheet = makeSheet([row({ ref: REF, sku: 'OL00001' })]);
    const r = findShipmentRow_(sheet, 3, REF, 'OL00001');
    expect(r.row).toBe(3);
    expect(r.healed).toBe(false);
  });

  it('SKU พิมพ์เล็กมาก็ยังตรง', () => {
    const sheet = makeSheet([row({ ref: REF, sku: 'OL00001' })]);
    expect(findShipmentRow_(sheet, 3, REF, 'ol00001').row).toBe(3);
  });

  it('ไม่ส่ง refNum มาก็ยังใช้เลขแถวได้ถ้า SKU ตรง', () => {
    const sheet = makeSheet([row({ ref: REF, sku: 'OL00001' })]);
    const r = findShipmentRow_(sheet, 3, '', 'OL00001');
    expect(r.row).toBe(3);
    expect(r.healed).toBe(false);
  });
});

describe('เลขแถวเลื่อน — ต้องหาแถวที่ถูกให้เจอเอง ไม่ใช่ให้พนักงานกดใหม่', () => {
  it('เลขแถวชี้ไปสินค้าคนละตัว → ไล่หาจาก refNum+SKU แล้วเจอ (healed=true)', () => {
    // จำลองว่ามีแถวข้างบนถูก archive ไป 1 แถว ทุกอย่างจึงเลื่อนขึ้น 1
    const sheet = makeSheet([
      row({ ref: 'TF-20260804-001', sku: 'R01025' }),   // row 3
      row({ ref: REF, sku: 'OL00001' }),                 // row 4 ← ของจริงอยู่ตรงนี้
    ]);
    const r = findShipmentRow_(sheet, 3, REF, 'OL00001'); // เครื่องผู้ใช้ยังจำว่าเป็นแถว 3
    expect(r.row).toBe(4);
    expect(r.healed).toBe(true);
  });

  it('เลขแถวเกินท้ายตาราง (แถวถูกลบไปเยอะ) → ยังหาเจอ', () => {
    const sheet = makeSheet([row({ ref: REF, sku: 'OL00001' })]);
    const r = findShipmentRow_(sheet, 99, REF, 'OL00001');
    expect(r.row).toBe(3);
    expect(r.healed).toBe(true);
  });

  it('เลขแถวชี้เข้าหัวตาราง → ยังหาเจอ', () => {
    const sheet = makeSheet([row({ ref: REF, sku: 'OL00001' })]);
    expect(findShipmentRow_(sheet, 1, REF, 'OL00001').row).toBe(3);
  });

  it('SKU ตรงแต่คนละใบโอน → ไม่เอาแถวนั้น (ของคนละรอบส่ง)', () => {
    const sheet = makeSheet([
      row({ ref: 'TF-20260801-002', sku: 'OL00001' }),   // ใบเก่า
      row({ ref: REF, sku: 'OL00001' }),                 // ใบที่ผู้ใช้กำลังรับ
    ]);
    const r = findShipmentRow_(sheet, 3, REF, 'OL00001');
    expect(r.row).toBe(4);
  });

  it('ไม่มี refNum แต่ SKU เหลือรายการค้างรับตัวเดียว → ยังช่วยหาให้ได้', () => {
    const sheet = makeSheet([
      row({ ref: 'TF-20260801-002', sku: 'OL00001', recvAt: '02/08/2026 10:00' }), // รับไปแล้ว
      row({ ref: REF, sku: 'OL00001' }),                                            // ยังค้าง
    ]);
    const r = findShipmentRow_(sheet, 99, '', 'OL00001');
    expect(r.row).toBe(4);
    expect(r.healed).toBe(true);
  });
});

describe('เมื่อเลือกไม่ได้ ต้องไม่เดา — เขียนผิดแถวแย่กว่าให้กดใหม่', () => {
  it('มีของค้างรับ SKU เดียวกัน 2 ใบ และไม่ได้ส่ง refNum → ปฏิเสธ', () => {
    // เดาแล้วเขียนผิดใบ = ของใบหนึ่งถูกมาร์กว่ารับแล้วทั้งที่ยังไม่ได้รับ (หายเงียบ ๆ)
    const sheet = makeSheet([
      row({ ref: 'TF-20260801-002', sku: 'OL00001' }),
      row({ ref: REF, sku: 'OL00001' }),
    ]);
    const r = findShipmentRow_(sheet, 99, '', 'OL00001');
    expect(r.row).toBe(0);
    expect(r.reason).toMatch(/หลายรายการ/);
  });

  it('หาไม่เจอเลย (ถูกย้ายเข้าประวัติไปแล้ว) → บอกให้กด Sync', () => {
    const sheet = makeSheet([row({ ref: REF, sku: 'OL00001' })]);
    const r = findShipmentRow_(sheet, 3, 'TF-19990101-001', 'ZZ99999');
    expect(r.row).toBe(0);
    expect(r.reason).toMatch(/Sync/);
  });

  it('ไม่ส่ง SKU มาเลย → ปฏิเสธทันที ไม่ไล่หาอะไร', () => {
    const sheet = makeSheet([row({ ref: REF, sku: 'OL00001' })]);
    const r = findShipmentRow_(sheet, 3, REF, '');
    expect(r.row).toBe(0);
  });

  it('ชีตมีแต่หัวตาราง → ไม่พัง คืน row 0', () => {
    expect(findShipmentRow_(makeSheet([]), 3, REF, 'OL00001').row).toBe(0);
  });
});

describe('แก้จำนวนที่รับซ้ำ (กดรับผิดแล้วแก้)', () => {
  it('แถวเดียวที่ตรงและถูกรับไปแล้ว → ยังแก้ได้', () => {
    const sheet = makeSheet([row({ ref: REF, sku: 'OL00001', recvAt: '05/08/2026 17:30' })]);
    const r = findShipmentRow_(sheet, 99, REF, 'OL00001');
    expect(r.row).toBe(3);
  });

  it('ถูกรับไปแล้วหลายแถวและแยกไม่ออก → ไม่เดา', () => {
    const sheet = makeSheet([
      row({ ref: 'TF-20260801-002', sku: 'OL00001', recvAt: '02/08/2026 10:00' }),
      row({ ref: 'TF-20260802-003', sku: 'OL00001', recvAt: '03/08/2026 10:00' }),
    ]);
    expect(findShipmentRow_(makeSheet([
      row({ ref: 'TF-20260801-002', sku: 'OL00001', recvAt: '02/08/2026 10:00' }),
      row({ ref: 'TF-20260802-003', sku: 'OL00001', recvAt: '03/08/2026 10:00' }),
    ]), 99, '', 'OL00001').row).toBe(0);
    expect(sheet.getLastRow()).toBe(4); // ชีตจำลองไม่ถูกแก้ (ฟังก์ชันนี้อ่านอย่างเดียว)
  });
});

describe('meta-test — จุดเชื่อมต่อที่หลุดแล้วบั๊กกลับมาเงียบ ๆ', () => {
  it('confirmShipmentReceive ใช้ findShipmentRow_ ไม่ใช่เชื่อเลขแถวดิบ', () => {
    const fn = grab(SRC, /function confirmShipmentReceive\([\s\S]*?\n\}\n/);
    expect(fn).toContain('findShipmentRow_');
    // ข้อความเดิมที่โยนกลับไปให้พนักงานกดใหม่ ต้องไม่กลับมา
    expect(fn).not.toContain('ข้อมูลไม่ตรง (แถวอาจเลื่อน)');
  });

  it('doPost ส่ง refNum เข้า confirmShipmentReceive', () => {
    // ไม่ส่ง = ตกไปใช้การเดาจาก SKU อย่างเดียว ซึ่งจะปฏิเสธทันทีเมื่อมีของค้าง SKU ซ้ำ
    expect(codeOnly(SRC)).toMatch(
      /confirmShipmentReceive\(ss, data\.rowId, data\.sku, Number\(data\.receivedQty\) \|\| 0, actor, data\.refNum\)/
    );
  });

  it('ฝั่งเว็บส่ง refNum ไปด้วย', () => {
    expect(ANALYTICS).toMatch(/confirmShipmentReceive:true, rowId, sku, receivedQty, refNum/);
    expect(ANALYTICS).toMatch(/syncShipmentReceive\(s\.id, s\.sku, n, s\.refNum\)/);
  });

  it('syncShipmentReceive อ่านคำตอบจริงด้วย dmjJson (ห้ามกลับไป res.json().catch)', () => {
    const fn = grab(ANALYTICS, /async function syncShipmentReceive\([\s\S]*?\n\}/);
    expect(fn).toContain('dmjJson(res)');
    expect(codeOnly(fn)).not.toMatch(/res\.json\(\)\.catch/);
  });

  it('handleConfirm รอผลจริงก่อนขึ้น toast สำเร็จ และถอน overlay เมื่อพลาด', () => {
    // นี่คือหัวใจของการแก้ "สำเร็จปลอม" — ถ้าหลุดข้อใดข้อหนึ่ง พนักงานจะกลับไปเชื่อจอผิดอีก
    const fn = grab(ANALYTICS, /const handleConfirm = async \(s, n\) => \{[\s\S]*?\n  \};/);
    expect(fn).toContain('await syncShipmentReceive');
    expect(fn).toMatch(/if \(r && r\.success\)/);
    expect(fn).toMatch(/delete next\[s\.id\]/);
    expect(fn).toMatch(/showToast\("error"/);
  });

  it('syncOrderUpdate ก็อ่านคำตอบจริงแล้วเหมือนกัน', () => {
    const fn = grab(ANALYTICS, /async function syncOrderUpdate\([\s\S]*?\n\}/);
    expect(fn).toContain('dmjJson(res)');
    expect(fn).toMatch(/return \{ success:true \}/);
  });
});
