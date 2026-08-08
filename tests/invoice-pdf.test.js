// tests/invoice-pdf.test.js — ชื่อไฟล์ PDF + วันที่บนเอกสาร (ใบเสนอราคา / ใบแจ้งหนี้ 3 แบบ)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของขอ (2026-08-07): เวลาบันทึกเป็น PDF ให้ตั้งชื่อไฟล์เป็น
//   "ใบแจ้งหนี้ยอดมัดจำ _ IVB-202608002"  (ชื่อเอกสาร + เลขที่เอกสาร) — ใบเสนอราคาด้วย
// และเพิ่มช่องระบุวันที่เอกสาร
//
// **ทำผ่าน `document.title` + window.print() ไม่ใช่ html2canvas/jsPDF โดยตั้งใจ**:
// เลย์เอาต์ A4 จริงอยู่ใน `@media print` ทั้งชุด และ `.quote-print-area` ถูก display:none
// บนจอ → จับภาพจากจอได้เอกสารคนละหน้าตากับที่พิมพ์จริง · เทสต์ชุดนี้กันการถอยกลับไปทางนั้น
//
// รอบแรกที่ทำพลาด 3 จุด (เทสต์ด้านล่างกันทั้งสาม):
//   1. เส้นทาง PDF ไม่ได้ตั้ง printDocType="invoice" → พิมพ์ออกมาเป็นใบเสนอราคา
//   2. สั่งพิมพ์ทันทีหลัง setState → DOM ยังเป็น render รอบก่อน (เลขที่ใบแจ้งหนี้เป็น null)
//   3. ช่องวันที่ไม่ได้ส่งเป็น prop เข้าเอกสาร → เอกสารขึ้นวันนี้เสมอ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VQUOTE = readFileSync(join(ROOT, 'views-quote.jsx'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const HTML = readFileSync(join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');

// ── eval ฟังก์ชันจริงจากต้นทาง (ไม่ copy เข้า helpers.js — หลักเดียวกับ auth.test.js) ──
function evalFn(src, name) {
  const re = new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('หาฟังก์ชันในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + name);
  // eslint-disable-next-line no-new-func
  return new Function(m[0] + '; return ' + name + ';')();
}

const docFileName = evalFn(VQUOTE, 'docFileName');
const docDateLabel = evalFn(VQUOTE, 'docDateLabel');

// ═══════════════ ชื่อไฟล์ ═══════════════
describe('docFileName — "[ชื่อเอกสาร] _ [เลขที่เอกสาร]"', () => {
  it('ประกอบตามรูปแบบที่เจ้าของขอเป๊ะ', () => {
    expect(docFileName('ใบแจ้งหนี้ยอดมัดจำ', 'IVB-202608002')).toBe('ใบแจ้งหนี้ยอดมัดจำ _ IVB-202608002');
  });

  it('ใบเสนอราคาใช้เลข QT ของ ZORT', () => {
    expect(docFileName('ใบเสนอราคา', 'QT-202606002')).toBe('ใบเสนอราคา _ QT-202606002');
  });

  it('ครบทั้ง 3 แบบของใบแจ้งหนี้', () => {
    expect(docFileName('ใบแจ้งหนี้', 'IVB-202608001')).toBe('ใบแจ้งหนี้ _ IVB-202608001');
    expect(docFileName('ใบแจ้งหนี้ยอดมัดจำ', 'IVB-202608002')).toBe('ใบแจ้งหนี้ยอดมัดจำ _ IVB-202608002');
    expect(docFileName('ใบแจ้งหนี้ยอดคงเหลือ', 'IVB-202608003')).toBe('ใบแจ้งหนี้ยอดคงเหลือ _ IVB-202608003');
  });

  it('ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ทิ้ง (กันชื่อไฟล์พัง/หลุดเป็น path)', () => {
    expect(docFileName('ใบแจ้งหนี้/ทดสอบ', 'IVB-1')).toBe('ใบแจ้งหนี้ ทดสอบ _ IVB-1');
    expect(docFileName('a\\b:c*d?e"f<g>h|i', 'X')).toBe('a b c d e f g h i _ X');
    expect(docFileName('ใบแจ้งหนี้', '../../etc/passwd')).toBe('ใบแจ้งหนี้ _ .. .. etc passwd');
  });

  it('ขาดข้างใดข้างหนึ่ง → ไม่ทิ้ง " _ " ค้างไว้', () => {
    expect(docFileName('ใบเสนอราคา', '')).toBe('ใบเสนอราคา');
    expect(docFileName('', 'QT-1')).toBe('QT-1');
    expect(docFileName(null, undefined)).toBe('');
  });

  it('ตัดช่องว่างส่วนเกิน', () => {
    expect(docFileName('  ใบเสนอราคา  ', '  QT-1  ')).toBe('ใบเสนอราคา _ QT-1');
  });
});

// ═══════════════ วันที่บนเอกสาร ═══════════════
describe('docDateLabel — วันที่ที่ผู้ใช้ระบุ', () => {
  it('แปลง yyyy-MM-dd เป็นวันที่ไทย (ปี พ.ศ.)', () => {
    expect(docDateLabel('2026-08-07')).toBe('7 สิงหาคม 2569');
  });

  it('ไม่เลื่อนวันข้าม timezone — 1 ค.ศ. ต้องได้วันที่ 1 (ห้ามใช้ new Date("yyyy-MM-dd") ที่ตีเป็น UTC)', () => {
    expect(docDateLabel('2026-01-01')).toContain('1 มกราคม');
    expect(docDateLabel('2026-01-01')).toContain('2569');
    expect(docDateLabel('2026-12-31')).toContain('31 ธันวาคม');
  });

  it('ไม่ส่งมา / ค่าว่าง / รูปแบบไม่ตรง → ใช้วันนี้', () => {
    const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    expect(docDateLabel(null)).toBe(today);
    expect(docDateLabel('')).toBe(today);
    expect(docDateLabel('07/08/2026')).toBe(today);
    expect(docDateLabel('ไม่ใช่วันที่')).toBe(today);
  });

  it('วันที่ที่ไม่มีจริง → ใช้วันนี้ (ห้ามให้ JS เลื่อนเดือนเงียบ ๆ)', () => {
    const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    expect(docDateLabel('2026-02-31')).toBe(today);   // JS ปกติเลื่อนเป็น 3 มี.ค.
    expect(docDateLabel('2026-13-01')).toBe(today);
  });
});

// ═══════════════ meta-test: จุดเชื่อมต่อ ═══════════════
// สูตรถูกอย่างเดียวไม่พอ — รอบแรกที่พลาดคือ "ฟังก์ชันถูกแต่ไม่มีใครเรียก"
describe('จุดเชื่อมต่อ (กันเทสต์เขียวแต่ของจริงไม่ได้ต่อสาย)', () => {
  it('QuotationPrintDoc รับ prop docDate และคำนวณผ่าน docDateLabel', () => {
    expect(VQUOTE).toMatch(/function QuotationPrintDoc\(\{[^}]*docDate: docDateProp/);
    expect(VQUOTE).toMatch(/const docDate = docDateLabel\(docDateProp\)/);
  });

  it('เอกสารไม่คำนวณวันที่เองอีกต่อไป (ต้นเหตุที่ช่องวันที่ไม่มีผล)', () => {
    const doc = VQUOTE.slice(VQUOTE.indexOf('function QuotationPrintDoc'));
    expect(doc).not.toMatch(/const docDate = new Date\(\)\.toLocaleDateString/);
  });

  it('InvoiceOptionsModal ส่ง docDate ออกมากับ onConfirm', () => {
    expect(VQUOTE).toMatch(/onConfirm\(\{[^}]*docDate[^}]*\}\)/);
    expect(VQUOTE).toMatch(/type="date"/);
  });

  it('ทั้งสอง view ส่ง docDate เข้า QuotationPrintDoc', () => {
    expect(VQUOTE).toMatch(/docDate=\{printDocType === "invoice" && invoiceExtra \? invoiceExtra\.docDate : null\}/);
    expect(VANA).toMatch(/docDate=\{printDocType === "invoice" && invoiceExtra \? invoiceExtra\.docDate : null\}/);
  });

  it('ทั้งสอง view สั่งพิมพ์ผ่าน runQuoteDocPrint พร้อมชื่อไฟล์', () => {
    expect(VQUOTE).toMatch(/runQuoteDocPrint\(printFileName/);
    expect(VANA).toMatch(/runQuoteDocPrint\(printFileName/);
  });

  it('runQuoteDocPrint ตั้ง document.title ก่อนพิมพ์ แล้วคืนค่าเดิมตอน afterprint', () => {
    const fn = VQUOTE.match(/function runQuoteDocPrint[\s\S]*?\n\}/)[0];
    expect(fn).toMatch(/const prevTitle = document\.title/);
    expect(fn).toMatch(/document\.title = fileName/);
    expect(fn).toMatch(/document\.title = prevTitle/);
    // ผูก listener ก่อน print() — ไม่งั้น title ค้างเป็นชื่อไฟล์ไปทั้งแอป
    expect(fn.indexOf('addEventListener("afterprint"')).toBeLessThan(fn.indexOf('window.print()'));
  });

  it('ใบแจ้งหนี้ตั้งชื่อไฟล์จาก INVOICE_KIND_LABEL + เลข IVB ทั้งสอง view', () => {
    const re = /docFileName\(INVOICE_KIND_LABEL\[\(extra && extra\.kind\) \|\| "full"\], r\.invoiceNumber\)/;
    expect(VQUOTE).toMatch(re);
    expect(VANA).toMatch(re);
  });

  it('ใบเสนอราคาก็ได้ชื่อไฟล์ด้วย (ที่เจ้าของขอว่า "รวมถึงใบเสนอราคา")', () => {
    expect(VQUOTE).toMatch(/docFileName\("ใบเสนอราคา", result\.quotationNumber\)/);
    expect(VANA).toMatch(/docFileName\("ใบเสนอราคา"/);
  });

  it('พิมพ์ผ่าน effect เท่านั้น — ห้ามเรียก runQuoteDocPrint ตรง ๆ ใน handler ที่เพิ่ง setState', () => {
    // บั๊กรอบแรก: setInvoiceNumber(...) แล้วสั่งพิมพ์บรรทัดถัดไป → DOM ยังเป็น render รอบก่อน
    for (const [name, src] of [['views-quote.jsx', VQUOTE], ['views-analytics.jsx', VANA]]) {
      const calls = src.match(/(?<!function )runQuoteDocPrint\(/g) || [];   // ไม่นับตัวประกาศฟังก์ชัน
      expect(calls.length, name + ' ต้องเรียก runQuoteDocPrint ที่เดียว (ใน effect)').toBe(1);
    }
    // ตัวจุดชนวนคือ printReq ที่ effect เฝ้าอยู่
    expect(VQUOTE).toMatch(/setPrintReq\(n => n \+ 1\)/);
    expect(VANA).toMatch(/setPrintReq\(n => n \+ 1\)/);
  });

  it('เส้นทางใบแจ้งหนี้ตั้ง printDocType="invoice" เสมอ (ไม่งั้นพิมพ์ออกมาเป็นใบเสนอราคา)', () => {
    const fnQ = VQUOTE.match(/async function confirmInvoicePrint[\s\S]*?\n  \}/)[0];
    expect(fnQ).toMatch(/doPrint\("invoice"/);
    const fnA = VANA.match(/async function confirmInvoicePrint[\s\S]*?\n  \}/)[0];
    expect(fnA).toMatch(/setPrintDocType\("invoice"\)/);
  });

  it('ออกเลขที่ไม่สำเร็จ = ไม่พิมพ์ (ห้ามปล่อยเอกสารไม่มีเลขที่ออกไปหาลูกค้า)', () => {
    for (const src of [VQUOTE, VANA]) {
      const fn = src.match(/async function confirmInvoicePrint[\s\S]*?\n  \}/)[0];
      const guard = fn.indexOf('if (!r || !r.ok)');
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(fn.indexOf('setInvoiceNumber(r.invoiceNumber)'));
      expect(fn.slice(guard, fn.indexOf('\n', guard))).toMatch(/return;/);
    }
  });
});

// ═══════════════ กันถอยกลับไปทาง html2canvas/jsPDF ═══════════════
describe('ไม่ rasterize DOM เป็น PDF', () => {
  it('ไม่มี html2pdf / jsPDF ในหน้าหลัก', () => {
    expect(HTML).not.toMatch(/html2pdf/i);
    expect(HTML).not.toMatch(/jspdf/i);
  });

  it('ไม่มีโค้ด export PDF ฝั่ง frontend', () => {
    for (const src of [VQUOTE, VANA]) {
      expect(src).not.toMatch(/html2pdf/i);
      expect(src).not.toMatch(/exportDocumentAsPdf/);
    }
  });

  it('.quote-print-area ยัง display:none บนจอ (เหตุผลที่จับภาพจากจอไม่ได้)', () => {
    expect(HTML).toMatch(/\.quote-print-area\s*\{\s*display:\s*none;\s*\}/);
    // เลย์เอาต์ A4 จริงอยู่ใน @media print — ถ้าย้ายออกมาเมื่อไหร่ ข้อสรุปข้างบนเปลี่ยน
    const printBlock = HTML.slice(HTML.indexOf('@media print'));
    expect(printBlock).toMatch(/\.quote-print-page\s*\{[\s\S]*?min-height:\s*297mm/);
  });

  it('backend ไม่มี action trackPdfExport (ไม่ทำอะไรแต่ล้าง payload cache ทั้งระบบ)', () => {
    expect(GS).not.toMatch(/trackPdfExport/);
  });
});
