// tests/quote-employee-filter.test.js — พนักงานขาย: กรองปี/เดือน + ป้ายเจ้าของใบ (ดู "ทั้งหมด")
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง (ส.ค. 2026): (1) พนักงานขายเห็นใบของทุกคนได้ (มีชิป "📋 ทั้งหมด" อยู่แล้ว) แต่ต้อง
// "แยกชัดเจนว่าอันไหนของใคร" → เพิ่มป้ายเจ้าของใบ (อ่านอย่างเดียว) บนการ์ด/แถวฝั่งพนักงาน
// (2) "filter เดือนอย่าลืมใส่ให้พนักงานด้วย" → เพิ่มตัวกรองปี/เดือนในหน้าพนักงาน (เดิม owner เท่านั้น)
//
// ทำไมต้องมีเทสต์ (ทั้งคู่พังเงียบ ไม่มี error):
//   · empPending/empApproved ที่ลืมผูกปี/เดือน = กดเลือกเดือนแล้วลิสต์ไม่เปลี่ยน (ดูเหมือนพัง)
//   · ป้ายเจ้าของที่โผล่แค่ isOwner = พนักงานกด "ทั้งหมด" แล้วเห็นใบเพื่อนแบบไม่รู้ว่าของใคร
//   · ป้ายที่โผล่ตอน mineOnly ด้วย = รกเปล่า ๆ (ของฉันทุกใบเป็นของตัวเองอยู่แล้ว)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(re, what) {
  const m = VANA.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + what);
  return m[0];
}
function codeOnly(s) {
  return String(s).split('\n').filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln)).join('\n');
}

// ── ตัวจริงจาก .jsx: inPeriod + empPending/empApproved ผูกปี/เดือน ──
describe('พนักงานขาย: รายการผูกปี/เดือน (filter เดือน)', () => {
  it('มี inPeriod ที่เทียบปีและเดือน', () => {
    const fn = codeOnly(grab(/const inPeriod = \(it\) =>[^\n]*/, 'inPeriod'));
    expect(fn).toMatch(/yearOf\(it\) === selYear/);
    expect(fn).toMatch(/!selMonth \|\| monthOf\(it\) === selMonth/);
  });

  it('empPending/empApproved เรียก inPeriod และมี selYear/selMonth ใน deps', () => {
    for (const name of ['empPending', 'empApproved']) {
      const um = codeOnly(grab(new RegExp('const ' + name + ' = uM\\(\\(\\) => scopeMine\\([\\s\\S]*?\\]\\);'), name));
      expect(um).toMatch(/inPeriod\(it\)/);
      expect(um).toMatch(/selYear, selMonth\]/);
    }
  });

  it('allPendingCount/allApprovedCount ก็ผูกปี/เดือน (เลขบนปุ่ม "ดูทั้งหมด" ต้องตรงกับที่เห็นจริง)', () => {
    for (const name of ['allPendingCount', 'allApprovedCount']) {
      const um = codeOnly(grab(new RegExp('const ' + name + ' *= uM\\(\\(\\) => items\\.filter[\\s\\S]*?\\]\\);'), name));
      expect(um).toMatch(/inPeriod\(it\)/);
      expect(um).toMatch(/selYear, selMonth\]/);
    }
  });

  it('รีเซ็ตหน้าเมื่อเปลี่ยนปี/เดือน (ไม่งั้นค้างหน้า 3 แล้วจอว่าง)', () => {
    const eff = grab(/uE\(\(\) => \{ setQPage\(1\); \}, \[[^\]]*\]\);/, 'qPage reset');
    expect(eff).toMatch(/selYear/);
    expect(eff).toMatch(/selMonth/);
  });

  it('หน้าพนักงาน (!isOwner) มีตัวเลือกปี/เดือนจริง (setSelYear/setSelMonth ในบล็อกพนักงาน)', () => {
    // บล็อก "พนักงานขาย" เริ่มที่คอมเมนต์ "พนักงานขาย: ชิป ของฉัน/ทั้งหมด + ตัวกรองปี/เดือน"
    const block = grab(/\{!isOwner && \(<>[\s\S]*?<\/>\)\}/, 'บล็อกพนักงานขาย');
    expect(block).toMatch(/setSelYear\(e\.target\.value\)/);
    expect(block).toMatch(/setSelMonth\(e\.target\.value\)/);
  });
});

describe('พนักงานขาย: ป้ายเจ้าของใบ (แยกชัดเจนว่าอันไหนของใคร)', () => {
  it('มี ownerChip helper ที่อ่าน q.sale (อ่านอย่างเดียว)', () => {
    const fn = grab(/const ownerChip = \(q\) => \([\s\S]*?\n {2}\);/, 'ownerChip');
    expect(fn).toMatch(/q\.sale/);
    expect(fn).toMatch(/ยังไม่ระบุ/);            // ใบที่ไม่ติดชื่อต้องบอกว่ายังไม่ระบุ (สำคัญตอนดูทั้งหมด)
  });

  it('ไม่มี {isOwner && <input ...ชื่อเซล} เหลือ — พนักงานต้องได้ป้าย ไม่ใช่ช่องว่างเปล่า', () => {
    // เดิมช่องชื่อเซลถูก gate ด้วย isOwner เฉย ๆ → พนักงานเห็นแค่เลขที่ ไม่รู้ว่าใบของใคร
    expect(codeOnly(VANA)).not.toMatch(/\{isOwner && <input list="dmjQuoteSales"/);
  });

  it('ป้ายเจ้าของโผล่เฉพาะตอนดู "ทั้งหมด" (!mineOnly) — ทั้ง 4 จุด (การ์ด+ตาราง × รอ/อนุมัติ)', () => {
    const uses = (codeOnly(VANA).match(/!mineOnly && ownerChip\(q\)/g) || []).length;
    expect(uses).toBe(4);
  });

  it('ทุกจุดที่พนักงานเห็นชื่อเซล = ผ่าน ownerChip (ไม่มี input ที่ไม่ถูก gate ให้พนักงานแก้ได้)', () => {
    // จับคู่: input ชื่อเซล ต้องมาคู่กับเงื่อนไข isOwner ? ... : (...ownerChip) เสมอ
    const inputs = (codeOnly(VANA).match(/isOwner \? <input list="dmjQuoteSales"/g) || []).length;
    expect(inputs).toBe(4);
  });
});
