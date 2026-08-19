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
const VQ   = readFileSync(join(ROOT, 'views-quote.jsx'), 'utf8');
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

  it('⚠️ auto-เลือกปีล่าสุดเฉพาะ owner (saler มี default ของตัวเอง ไม่ผ่าน effect นี้)', () => {
    expect(VIEW).toMatch(/if \(isOwner && years\.length && !selYear\) setSelYear/);
  });

  it('default ของ saler = เดือน/ปีปัจจุบัน · owner = "" (เจ้าของสั่ง: เปิดมาเห็นงานเดือนนี้ก่อน)', () => {
    expect(VIEW).toMatch(/const \[selYear, setSelYear\] = uS\(role === "owner" \? "" : String\(new Date\(\)\.getFullYear\(\)\)\)/);
    expect(VIEW).toMatch(/const \[selMonth, setSelMonth\] = uS\(role === "owner" \? "" : String\(new Date\(\)\.getMonth\(\) \+ 1\)\)/);
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

// ─────────────────────────────────────────────────────────────────────────────
// ③ ทำใบใหม่จากใบเดิม (duplicate → create) — ได้ใบใหม่ ราคาปัจจุบัน ไม่แตะใบเก่า
// ─────────────────────────────────────────────────────────────────────────────
describe('③ ทำใบใหม่จากใบเดิม', () => {
  it('handleDuplicate ตั้ง dupSeed (sku+qty) + เคลียร์ editQuote → เข้าโหมด create', () => {
    expect(VIEW).toMatch(/async function handleDuplicate\(q\)/);
    const i = VIEW.indexOf('async function handleDuplicate(q)');
    const block = VIEW.slice(i, i + 900);
    expect(block).toContain('setEditQuote(null)');            // ต้องไม่ใช่โหมดแก้ไข (จะไปแก้ใบเก่า)
    expect(block).toMatch(/setDupSeed\(\{/);
    expect(block).toMatch(/items:\s*\(d\.items \|\| \[\]\)\.map\(it => \(\{ sku: it\.sku, qty:/); // ส่งแค่ sku+qty
    expect(block).toContain('setMode("create")');
  });

  it('ส่ง dupSeed เข้า QuotationFormView + เคลียร์ตอน onBack', () => {
    expect(VIEW).toContain('dupSeed={dupSeed}');
    expect(VIEW).toMatch(/onBack=\{\(\) => \{ setEditQuote\(null\); setDupSeed\(null\);/);
  });

  it('มีปุ่ม "ทำใบใหม่" ทั้งใบอนุมัติแล้วและใบที่ปิด (handleDuplicate)', () => {
    const calls = VIEW.match(/handleDuplicate\(q\)/g) || [];
    expect(calls.length, 'อย่างน้อย 3 จุด: การ์ดอนุมัติ + ตารางอนุมัติ + ใบที่ปิด').toBeGreaterThanOrEqual(3);
  });

  it('QuotationFormView รับ dupSeed + hydrate ราคาจาก catalog (ไม่ใช่ราคาสุทธิใบเก่า)', () => {
    expect(VQ).toMatch(/function QuotationFormView\(\{ data, role, onBack, onSubmitted, editQuote, dupSeed \}\)/);
    // dup ใช้ราคาตั้งจาก catalog (p.price) + ข้าม SKU ที่ถูกลบ (return null → filter)
    const i = VQ.indexOf('return (dupSeed.items || []).map');
    expect(i, 'ต้อง hydrate cart จาก dupSeed').toBeGreaterThan(-1);
    const block = VQ.slice(i, i + 400);
    expect(block).toMatch(/if \(!p\) return null;/);
    expect(block).toMatch(/price:\s*Number\(p\.price\)/);
  });

  it('⚠️ dup เป็นใบใหม่ — totals ไม่ pricesFinal (หักส่วนลดจริง) + ไม่ส่ง quotationId', () => {
    // pricesFinal ผูกกับ editQuote เท่านั้น (dup=false) · quotationId undefined เมื่อไม่มี editQuote
    expect(VQ).toMatch(/computeBillTotals\(cart, \{ manualDiscount: md, pricesFinal: !!editQuote \}\)/);
    expect(VQ).toMatch(/quotationId: editQuote \? [^\n]*: undefined/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ④ โน้ตติดตามใบเสนอราคา (ตามลูกค้าไปถึงไหน)
// ─────────────────────────────────────────────────────────────────────────────
describe('④ โน้ตติดตามใบเสนอราคา', () => {
  it('sync helper อ่าน/เขียนผ่าน dmjJson (บทเรียนข้อ 13)', () => {
    expect(VANA).toMatch(/async function syncGetQuoteFollowups\(\)/);
    expect(VANA).toMatch(/async function syncSaveQuoteFollowup\(number, note\)/);
    const i = VANA.indexOf('async function syncSaveQuoteFollowup');
    expect(VANA.slice(i, i + 500)).toContain('dmjJson(res)');
  });

  it('โหลดโน้ตตอนเปิด + FollowupLine โผล่ในลิสต์', () => {
    expect(VIEW).toMatch(/uE\(\(\) => \{ loadFollowups\(\); \}, \[\]\)/);
    expect(VIEW).toMatch(/const FollowupLine = \(q\) =>/);
    const calls = VIEW.match(/\{FollowupLine\(q\)\}/g) || [];
    expect(calls.length, 'FollowupLine ต้องโผล่หลายจุด (รออนุมัติ/อนุมัติ/ปิด · การ์ด+ตาราง)').toBeGreaterThanOrEqual(4);
  });

  it('editFollowup บันทึกผ่าน syncSaveQuoteFollowup + อัปเดต state', () => {
    const i = VIEW.indexOf('async function editFollowup(q)');
    expect(i).toBeGreaterThan(-1);
    const block = VIEW.slice(i, i + 700);
    expect(block).toContain('syncSaveQuoteFollowup(num, note)');
    expect(block).toContain('setFollowups(prev =>');
  });

  it('backend: handler + dispatch + สิทธิ์ saler/storedevice', () => {
    expect(GS).toMatch(/function listQuoteFollowupsHandler_\(e\)/);
    expect(GS).toMatch(/function saveQuoteFollowupHandler_\(ss, data\)/);
    expect(GS).toMatch(/action === 'quoteFollowups'\)\s*\{\s*\n\s*return listQuoteFollowupsHandler_/);
    expect(GS).toMatch(/data\.action === 'saveQuoteFollowup'\) return saveQuoteFollowupHandler_/);
    // อยู่เหนือ invalidateCache_(true) — ไม่ล้าง payload cache ทั้งก้อน
    const iSave = GS.indexOf("data.action === 'saveQuoteFollowup'");
    const iInval = GS.indexOf('invalidateCache_(true); // clear payload cache');
    expect(iSave).toBeGreaterThan(-1);
    expect(iSave, 'dispatch ต้องอยู่เหนือ invalidateCache_').toBeLessThan(iInval);
    // actor จาก session (staffActorName_) ไม่รับจาก client
    expect(GS.slice(GS.indexOf('function saveQuoteFollowupHandler_'), GS.indexOf('function saveQuoteFollowupHandler_') + 1400)).toContain('staffActorName_(sess)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ เรียง "อนุมัติแล้ว" ตามวันอนุมัติ/แก้ล่าสุด (movedAt) fallback วันที่ออกใบ
// ─────────────────────────────────────────────────────────────────────────────
describe('⑤ เรียงอนุมัติแล้วตามวันอนุมัติ (best-effort)', () => {
  it('มี approvedKey = movedAt || quotationDate + empApproved เรียงด้วยมัน (desc)', () => {
    expect(VIEW).toMatch(/const approvedKey = \(it\) => String\(\(it && \(it\.movedAt \|\| it\.quotationDate\)\)/);
    expect(VIEW).toMatch(/empApproved = uM\([^\n]*approvedKey\(b\)\.localeCompare\(approvedKey\(a\)\)/);
  });

  it('backend ส่ง movedAt (best-effort, fallback "") — quoteMovedDate_ ไม่เดา field ที่พังเงียบ', () => {
    expect(GS).toMatch(/function quoteMovedDate_\(q\)/);
    expect(GS).toMatch(/movedAt: quoteMovedDate_\(q\)/);
    // หาไม่เจอ = "" (ไม่ใช่ค่ามั่ว) → frontend fallback วันที่ออกใบ = พฤติกรรมเดิม
    expect(GS.slice(GS.indexOf('function quoteMovedDate_'), GS.indexOf('function quoteMovedDate_') + 500)).toContain('return "";');
  });
});
