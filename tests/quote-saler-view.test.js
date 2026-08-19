// tests/quote-saler-view.test.js — หน้า "ใบเสนอราคา" ฝั่งพนักงานขาย (saler/storedevice)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของแจ้ง (ส.ค. 2026): หน้า saler ขาดหลายอย่าง — ตัวกรองวันที่ + การดูงาน (ยอดเป็นเงิน /
// ใบที่ปิดไปแล้ว) · เพิ่ม 3 อย่าง (frontend ล้วน) + ปิดช่องแคช 5 นาทีฝั่ง backend:
//   1. ไทล์โชว์ "ยอดบาท" ของฉัน ไม่ใช่แค่จำนวนใบ (empPendingV/empApprovedV)
//   2. ตัวกรองช่วงเวลา (ปี/เดือน) — ค่าเริ่มต้น "ทุกปี/ทุกเดือน" (pending เก่าต้องไม่ถูกซ่อน)
//   3. โหมด "❌ ปิด/ยกเลิก" — ประวัติงานที่จบแล้ว (อ่านอย่างเดียว ไม่มีปุ่มพิมพ์/แก้ไข)
//   4. createQuotation/editQuotation ล้าง cache quote_summary_v1 (ใบใหม่โผล่ทันที)
//
// meta-test สแกนต้นทางจริง (เหมือน quote-print-mobile / auth) — คุมจุดที่ "พังแล้วเงียบ"
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const GS   = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grabView(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('หา view ไม่เจอ: ' + name);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}
const VIEW = grabView(VANA, 'QuoteFollowupView');

describe('ตัวกรองช่วงเวลาของพนักงานขาย', () => {
  it('มี inPeriod ที่กรองด้วย selYear/selMonth (ว่าง = ไม่กรอง)', () => {
    expect(VIEW).toMatch(/const inPeriod = \(it\) => \{/);
    expect(VIEW).toMatch(/if \(selYear && yearOf\(it\) !== selYear\) return false;/);
    expect(VIEW).toMatch(/if \(selMonth && monthOf\(it\) !== selMonth\) return false;/);
  });

  it('empPending/empApproved/empVoided กรองผ่าน inPeriod และ deps มี selYear/selMonth', () => {
    ['empPending', 'empApproved', 'empVoided'].forEach(name => {
      const re = new RegExp('const ' + name + ' +=\\s*uM\\(\\(\\) => scopeMine\\([^\\n]*inPeriod\\(it\\)[^\\n]*\\[items, isOwner, mineOnly, myName, selYear, selMonth\\]');
      expect(re.test(VIEW), name + ' ต้องกรอง inPeriod + มี selYear/selMonth ใน deps').toBe(true);
    });
  });

  it('⚠️ auto-เลือกปีล่าสุดเฉพาะ owner (saler เริ่มที่ "ทุกปี" ไม่งั้น pending เก่าถูกซ่อนเงียบ ๆ)', () => {
    expect(VIEW).toMatch(/if \(isOwner && years\.length && !selYear\) setSelYear/);
  });

  it('มี <select> ปี/เดือน ฝั่งพนักงานขาย ค่าเริ่มต้น "ทุกปี"/"ทุกเดือน"', () => {
    // อยู่ในบล็อก !isOwner (ชิปของฉัน/ทั้งหมด) — ต้องมี option ว่าง = ทุกปี/ทุกเดือน
    expect(VIEW).toContain('>ทุกปี</option>');
    expect(VIEW).toMatch(/setSelYear\(e\.target\.value\)[^]*?setSelMonth\(e\.target\.value\)/);
  });
});

describe('ไทล์โชว์ยอดเป็นเงิน (ไม่ใช่แค่จำนวนใบ)', () => {
  it('คำนวณ empPendingV/empApprovedV เป็นผลรวม amount', () => {
    expect(VIEW).toMatch(/const empPendingV\s+= uM\(\(\) => empPending\.reduce\(\(s, it\) => s \+ \(Number\(it\.amount\) \|\| 0\), 0\)/);
    expect(VIEW).toMatch(/const empApprovedV = uM\(\(\) => empApproved\.reduce\(\(s, it\) => s \+ \(Number\(it\.amount\) \|\| 0\), 0\)/);
  });

  it('empTile รับ sub (ยอดบาท) และไทล์พนักงานขายส่งยอดบาทเข้าไปครบ 3 ช่อง', () => {
    expect(VIEW).toMatch(/const empTile = \(emoji, label, value, color, sub\) =>/);
    expect(VIEW).toMatch(/empTile\("⏳", "รออนุมัติ", empPending\.length, "#d97706", baht\(empPendingV\)\)/);
    expect(VIEW).toMatch(/empTile\("✅"[^\n]*empApproved\.length, "#16a34a", baht\(empApprovedV\)\)/);
    expect(VIEW).toMatch(/empTile\("📄"[^\n]*baht\(empPendingV \+ empApprovedV\)\)/);
  });
});

describe('โหมด "❌ ปิด/ยกเลิก" — เห็นใบที่จบแล้ว (เดิม saler มองไม่เห็นเลย)', () => {
  it('มี voided ในรายการโหมดทั้ง owner และ saler', () => {
    const both = [...VIEW.matchAll(/\["voided", "❌ ปิด\/ยกเลิก \(" \+ voidedRender\.length \+ "\)"\]/g)];
    expect(both.length, 'ต้องมี voided ทั้งชุด owner และ saler').toBe(2);
  });

  it('voidedRender = owner→voidedList · saler→empVoided', () => {
    expect(VIEW).toMatch(/const voidedRender\s+= isOwner \? voidedList\s+: empVoided;/);
    expect(VIEW).toMatch(/const voidedList\s+= uM\(\(\) => items\.filter\(it => isVoided\(it\.status\)/);
  });

  it('มี block เรนเดอร์ mode === "voided" + ค้นหา/หน้า + mineEmptyHint', () => {
    expect(VIEW).toContain('{mode === "voided" && (');
    expect(VIEW).toMatch(/mode === "pending" \|\| mode === "approved" \|\| mode === "voided"/); // ช่องค้นหาโผล่ในโหมด voided ด้วย
    expect(VIEW).toMatch(/allVoidedCount > 0[\s\S]*?mineEmptyHint\(allVoidedCount\)/);
  });

  it('⚠️ โหมด voided อ่านอย่างเดียว — ไม่มีปุ่มพิมพ์/แก้ไข (กันไปเพิ่ม handlePrint แล้วยอด desktop เพี้ยน)', () => {
    // ตัดเอาเฉพาะ block ของ voided (ถึง genAt ที่ตามหลัง)
    const i = VIEW.indexOf('{mode === "voided" && (');
    const j = VIEW.indexOf('{genAt &&', i);
    const block = VIEW.slice(i, j);
    expect(block).not.toContain('handlePrint(');
    expect(block).not.toContain('handleEdit(');
  });
});

describe('backend: สร้าง/แก้ใบเสนอราคาแล้วต้องล้าง cache quote_summary_v1 (ใบใหม่โผล่ทันที)', () => {
  function grabGs(name) {
    const i = GS.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('หา .gs ไม่เจอ: ' + name);
    const j = GS.indexOf('\nfunction ', i + 1);
    return GS.slice(i, j < 0 ? GS.length : j);
  }
  it('createQuotation ล้าง quote_summary_v1', () => {
    expect(grabGs('createQuotation')).toContain("CacheService.getScriptCache().remove('quote_summary_v1')");
  });
  it('editQuotation ล้าง quote_summary_v1', () => {
    expect(grabGs('editQuotation')).toContain("CacheService.getScriptCache().remove('quote_summary_v1')");
  });
});
