// tests/invoice-idempotent.test.js — พิมพ์ใบแจ้งหนี้ใบเดิมซ้ำต้องได้เลขเดิมเสมอ
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน order-idempotent.test.js / transfer-idempotent.test.js: **ไม่ copy โค้ดเข้า
// helpers.js** แต่ eval ฟังก์ชันจริงจาก .gs (nextInvoiceNumber_) เพราะนี่คือตรรกะ
// "ป้องกันเลขเอกสารวิ่งเปลือง/ชนกัน" — สำเนา drift แล้วเทสต์เขียวทั้งที่ของจริงออกเลขซ้ำ
// (เอกสารการเงิน 2 ใบเลขที่เดียวกัน หรือใบเดิมได้เลขใหม่ทุกครั้งที่พิมพ์ซ้ำ) แย่ทั้งคู่
//
// กลไกจริง (appsscript_complete.gs): ผูก 1 แถวต่อ 1 เลขที่ใบเสนอราคา (quotationNumber)
// ในชีต SHEET_INVOICE_NUM — request ที่ส่ง quotationNumber เดิมมา เจอแถวเดิมในชีต →
// คืนเลขเดิมทันที ไม่เขียนแถวใหม่ (reused:true) · ไม่เจอ → ออกเลขถัดไปของเดือนปัจจุบัน
// (รูปแบบ IVB-yyyyMM### วิ่งต่อเนื่องในเดือนนั้น) แล้วเขียนแถวใหม่ (reused:false)
//
// สิ่งที่คุมไว้:
//   1. quotationNumber เดิม → ได้ invoiceNumber เดิมเป๊ะ + ไม่เขียนแถวซ้ำ (reused:true)
//   2. quotationNumber ต่างกัน ในเดือนเดียวกัน → เลขวิ่งต่อเนื่อง ไม่ชนกัน
//   3. ข้ามเดือน → prefix เปลี่ยน + เลขรีเซ็ตกลับ 001 (ไม่ไปต่อจากเดือนก่อน)
//   4. ไม่มีเลขที่ใบเสนอราคาอ้างอิง → error ทันที ไม่แตะล็อก/ไม่เขียนชีต
//   5. คว้าล็อกไม่ได้ → error "ระบบไม่ว่าง" ไม่เขียนชีตซ้ำ/ไม่ทับข้อมูล
//   6. deposit/remaining ของใบเสนอราคาใบเดียวกัน (frontend ไม่ส่ง "kind" เข้ามาเลย)
//      ต้องได้เลขเดียวกัน — เป็นผลจากข้อ 1 แต่ยืนยันตรง ๆ ว่า key คือ quotationNumber ล้วน
//   7. meta: ทั้ง 2 view (สร้างใหม่ / ติดตามสถานะ) ต้องยังส่ง quotationNumber ตัวเดียวกัน
//      ทั้งตอนพิมพ์ครั้งแรกและพิมพ์ซ้ำ ไม่ใช่ค่าที่เปลี่ยนไปทุกครั้ง (เช่น timestamp/random id)
//      — หลุดข้อนี้ backend จะไม่มีทางจับคู่ "ใบเดิม" ได้เลยไม่ว่า backend จะถูกแค่ไหน
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const QUOTE = readFileSync(join(ROOT, 'views-quote.jsx'), 'utf8');
const ANALYTICS = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const F_NEXT = grab(SRC, /function nextInvoiceNumber_\(quotationNumber, actor\) \{[\s\S]*?\n\}/);

// ชีตจำลอง — แถวแรกคือหัวตาราง (function loop เริ่ม i=1 ข้ามหัวตาราง)
function makeSheet(existingRows = []) {
  const headers = ['เลขที่ใบเสนอราคา', 'เลขที่ใบแจ้งหนี้', 'โดย', 'เมื่อ'];
  const rows = [headers, ...existingRows.map((r) => r.slice())];
  return {
    getDataRange: () => ({ getDisplayValues: () => rows.map((r) => r.slice()) }),
    appendRow: (r) => rows.push(r.slice()),
    _rows: rows, // เข้าถึงตรงจากเทสต์เพื่อตรวจว่ามีการเขียนแถวใหม่จริงไหม
  };
}

// ประกอบ nextInvoiceNumber_ จริงเข้ากับ GAS globals ปลอม — ควบคุม "วันนี้" ผ่าน nowIso
// เพื่อให้ทดสอบการข้ามเดือนได้แน่นอน (Asia/Bangkok = UTC+7 ตลอดปี ไม่มี DST)
function makeModule({ nowIso, sheet, lockAvailable = true }) {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) return super(nowIso);
      return super(...args);
    }
  }
  const Utilities = {
    formatDate(date, tz, pattern) {
      if (tz !== 'Asia/Bangkok') throw new Error('ต้องใช้ Asia/Bangkok เท่านั้น (บทเรียนข้อ 11)');
      const d = new RealDate(date.getTime() + 7 * 3600 * 1000);
      const yyyy = d.getUTCFullYear();
      const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const HH = String(d.getUTCHours()).padStart(2, '0');
      const mi = String(d.getUTCMinutes()).padStart(2, '0');
      if (pattern === 'yyyyMM') return yyyy + MM;
      if (pattern === 'yyyy-MM-dd HH:mm') return `${yyyy}-${MM}-${dd} ${HH}:${mi}`;
      throw new Error('unexpected pattern: ' + pattern);
    },
  };
  const SpreadsheetApp = { openById: () => ({}) };
  const getOrCreateSheet_ = () => sheet;
  const lockCalls = [];
  const LockService = {
    getScriptLock: () => ({
      tryLock: (ms) => { lockCalls.push(ms); return lockAvailable; },
      releaseLock: () => {},
    }),
  };
  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (text) => ({ setMimeType: () => ({ _text: text, _json: JSON.parse(text) }) }),
  };
  const SHEET_ID = 'fake-sheet-id';
  const SHEET_INVOICE_NUM = 'เลขที่ใบแจ้งหนี้';

  // eslint-disable-next-line no-new-func
  const { nextInvoiceNumber_ } = new Function(
    'Date', 'Utilities', 'SpreadsheetApp', 'getOrCreateSheet_', 'LockService', 'ContentService', 'SHEET_ID', 'SHEET_INVOICE_NUM',
    `${F_NEXT}\nreturn { nextInvoiceNumber_ };`
  )(FixedDate, Utilities, SpreadsheetApp, getOrCreateSheet_, LockService, ContentService, SHEET_ID, SHEET_INVOICE_NUM);
  return { nextInvoiceNumber_, lockCalls };
}

function call(mod, qNum, actor = 'สมชาย (หน้าร้าน)') {
  return mod.nextInvoiceNumber_(qNum, actor)._json;
}

describe('nextInvoiceNumber_ — เลขที่ใบแจ้งหนี้ (IVB-yyyyMM###)', () => {
  it('พิมพ์ครั้งแรก → ออกเลข 001 ของเดือนปัจจุบัน + เขียนแถวใหม่ 1 แถว', () => {
    const sheet = makeSheet();
    const mod = makeModule({ nowIso: '2026-08-08T10:00:00Z', sheet }); // Bangkok = 17:00 08/08
    const r = call(mod, 'QT-202608001');
    expect(r).toEqual({ ok: true, invoiceNumber: 'IVB-202608001', reused: false });
    expect(sheet._rows.length).toBe(2); // header + 1 แถวใหม่
    expect(sheet._rows[1][0]).toBe('QT-202608001');
    expect(sheet._rows[1][1]).toBe('IVB-202608001');
  });

  it('พิมพ์ใบเดิมซ้ำ (quotationNumber เดิม) → ได้เลขเดิมเป๊ะ ไม่เขียนแถวใหม่', () => {
    const sheet = makeSheet();
    const mod = makeModule({ nowIso: '2026-08-08T10:00:00Z', sheet });
    const first = call(mod, 'QT-202608001');
    const second = call(mod, 'QT-202608001');
    expect(second).toEqual({ ok: true, invoiceNumber: first.invoiceNumber, reused: true });
    expect(sheet._rows.length).toBe(2); // ยังมีแถวเดียว — ไม่ถูกเพิ่มซ้ำ
  });

  it('พิมพ์ซ้ำหลายรอบติดกัน (เช่นกด "บันทึกเป็น PDF" 3 ครั้ง) → เลขเดิมทุกครั้ง', () => {
    const sheet = makeSheet();
    const mod = makeModule({ nowIso: '2026-08-08T10:00:00Z', sheet });
    const nums = [1, 2, 3].map(() => call(mod, 'QT-999').invoiceNumber);
    expect(new Set(nums).size).toBe(1);
    expect(sheet._rows.length).toBe(2);
  });

  it('ใบแจ้งหนี้มัดจำ vs ยอดคงเหลือของใบเสนอราคาเดียวกัน (frontend ไม่ส่ง kind เข้ามาเลย) → เลขเดียวกัน', () => {
    // จำลองพฤติกรรมจริง: confirmInvoicePrint เรียก syncGetInvoiceNumber(quotationNumber) เท่านั้น
    // ไม่ว่าจะเลือก kind ไหนใน InvoiceOptionsModal — ดู meta-test ด้านล่างที่ยืนยันสัญญาณนี้จาก .jsx จริง
    const sheet = makeSheet();
    const mod = makeModule({ nowIso: '2026-08-08T10:00:00Z', sheet });
    const deposit = call(mod, 'QT-777');   // พิมพ์แบบมัดจำก่อน
    const remaining = call(mod, 'QT-777'); // พิมพ์แบบยอดคงเหลือทีหลัง ใบเสนอราคาเดิม
    expect(remaining.invoiceNumber).toBe(deposit.invoiceNumber);
    expect(sheet._rows.length).toBe(2);
  });

  it('ใบเสนอราคาต่างกันในเดือนเดียวกัน → เลขวิ่งต่อเนื่องไม่ชนกัน', () => {
    const sheet = makeSheet();
    const mod = makeModule({ nowIso: '2026-08-08T10:00:00Z', sheet });
    const a = call(mod, 'QT-A');
    const b = call(mod, 'QT-B');
    const c = call(mod, 'QT-C');
    expect([a.invoiceNumber, b.invoiceNumber, c.invoiceNumber]).toEqual([
      'IVB-202608001', 'IVB-202608002', 'IVB-202608003',
    ]);
  });

  it('เลขวิ่งต่อจากเลขสูงสุดที่มีอยู่จริงในชีต (ไม่ใช่นับจากจำนวนแถว)', () => {
    // จำลองว่าเคยมีการออกเลขไปแล้วถึง 009 (เช่นข้อมูลเก่า/แถวถูกลบทิ้งไปบางแถว)
    const sheet = makeSheet([
      ['QT-OLD-1', 'IVB-202608005', 'x', '2026-08-01 10:00'],
      ['QT-OLD-2', 'IVB-202608009', 'x', '2026-08-02 10:00'],
    ]);
    const mod = makeModule({ nowIso: '2026-08-08T10:00:00Z', sheet });
    const r = call(mod, 'QT-NEW');
    expect(r.invoiceNumber).toBe('IVB-202608010');
  });

  it('ข้ามเดือน → prefix เปลี่ยนตามเดือนปัจจุบัน + เลขรีเซ็ตกลับ 001 (ไม่ต่อจากเดือนก่อน)', () => {
    const sheet = makeSheet([
      ['QT-JUL-1', 'IVB-202607050', 'x', '2026-07-15 10:00'],
    ]);
    const mod = makeModule({ nowIso: '2026-08-01T20:00:00Z', sheet }); // Bangkok = 03:00 02/08
    const r = call(mod, 'QT-AUG-1');
    expect(r.invoiceNumber).toBe('IVB-202608001');
  });

  it('padStart 3 หลัก: เลขที่ 9 ตัวถัดไปต้องเป็น 010 ไม่ใช่ 10', () => {
    const rows = [];
    for (let i = 1; i <= 9; i++) rows.push([`QT-${i}`, `IVB-202608${String(i).padStart(3, '0')}`, 'x', 'y']);
    const sheet = makeSheet(rows);
    const mod = makeModule({ nowIso: '2026-08-08T10:00:00Z', sheet });
    expect(call(mod, 'QT-10').invoiceNumber).toBe('IVB-202608010');
  });

  it('ไม่มีเลขที่ใบเสนอราคาอ้างอิง → error ทันที ไม่คว้าล็อก ไม่เขียนชีต', () => {
    const sheet = makeSheet();
    const mod = makeModule({ nowIso: '2026-08-08T10:00:00Z', sheet });
    for (const bad of ['', '   ', null, undefined]) {
      const r = call(mod, bad);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('ไม่มีเลขที่ใบเสนอราคาอ้างอิง');
    }
    expect(sheet._rows.length).toBe(1); // ไม่มีแถวใหม่เลย
    expect(mod.lockCalls.length).toBe(0); // ไม่แตะล็อกด้วย
  });

  it('คว้าล็อกไม่ได้ (คนอื่นกำลังออกเลขพร้อมกัน) → ตอบ error "ระบบไม่ว่าง" ไม่เขียนชีตซ้ำ', () => {
    const sheet = makeSheet();
    const mod = makeModule({ nowIso: '2026-08-08T10:00:00Z', sheet, lockAvailable: false });
    const r = call(mod, 'QT-BUSY');
    expect(r).toEqual({ ok: false, error: 'ระบบไม่ว่าง ลองใหม่อีกครั้ง' });
    expect(sheet._rows.length).toBe(1);
  });

  it('เลขที่ใบเสนอราคาที่มีช่องว่างติดมา (จากชีต/ผู้ใช้พิมพ์) ต้องยัง match กับที่เคยออกไปแล้ว', () => {
    const sheet = makeSheet([['QT-777', 'IVB-202608001', 'x', 'y']]);
    const mod = makeModule({ nowIso: '2026-08-08T10:00:00Z', sheet });
    const r = call(mod, '  QT-777  ');
    expect(r).toEqual({ ok: true, invoiceNumber: 'IVB-202608001', reused: true });
    expect(sheet._rows.length).toBe(2);
  });
});

// ── meta-test: ฝั่ง frontend ต้องส่ง quotationNumber ตัวเดียวกันทุกครั้งที่พิมพ์ใบเดียวกัน ──
// (ไม่ใช่ค่าที่สร้างใหม่ทุกครั้ง เช่น Date.now()/random) ไม่งั้น backend เจ๋งแค่ไหนก็จับคู่ "ใบเดิม" ไม่ได้
describe('meta: frontend ผูก syncGetInvoiceNumber กับ quotationNumber เสมอ (ไม่ใช่ค่าที่เปลี่ยนทุกครั้ง)', () => {
  function codeOnly(s) {
    return String(s).split('\n').filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln)).join('\n');
  }

  it('views-quote.jsx (สร้างใบใหม่): confirmInvoicePrint เรียก syncGetInvoiceNumber(result.quotationNumber)', () => {
    const fn = grab(QUOTE, /async function confirmInvoicePrint\(extra\) \{[\s\S]*?\n  \}/);
    expect(codeOnly(fn)).toMatch(/syncGetInvoiceNumber\(result\.quotationNumber\)/);
  });

  it('views-analytics.jsx (ติดตามสถานะ/พิมพ์ซ้ำใบเก่า): confirmInvoicePrint ใช้ quotationNumber จาก printData ที่ดึงจากใบเดิมจริง', () => {
    const fn = grab(ANALYTICS, /async function confirmInvoicePrint\(extra\) \{[\s\S]*?\n  \}/);
    expect(codeOnly(fn)).toMatch(/syncGetInvoiceNumber\(\(printData \|\| \{\}\)\.quotationNumber\)/);
  });

  it('syncGetInvoiceNumber ส่ง quotationNumber ตรง ๆ ใน body ไม่ประกอบค่าเพิ่ม (เช่น ต่อ timestamp)', () => {
    const fn = grab(QUOTE, /async function syncGetInvoiceNumber\(quotationNumber\) \{[\s\S]*?\n\}/);
    expect(codeOnly(fn)).toMatch(/getInvoiceNumber:\s*true,\s*quotationNumber,/);
  });

  it('handlePrint (views-analytics.jsx) ดึงรายละเอียดใบเดิมจาก syncGetQuotationForPrint ก่อนเปิด modal ใบแจ้งหนี้ — ไม่สร้าง printData เอง', () => {
    // กันเคสที่ใครมาแก้แล้วเผลอไปสร้างเลขที่ใบเสนอราคาปลอม/ว่างส่งเข้า confirmInvoicePrint
    const fn = grab(ANALYTICS, /async function handlePrint\(q, docType\) \{[\s\S]*?\n  \}/);
    expect(codeOnly(fn)).toMatch(/syncGetQuotationForPrint\(q\.id \|\| q\.number\)/);
    expect(codeOnly(fn)).toMatch(/setPrintData\(r\.data \|\| \{\}\)/);
  });
});
