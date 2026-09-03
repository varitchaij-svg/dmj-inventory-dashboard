// tests/tax-invoice-idempotent.test.js — กันออกใบกำกับภาษี (issueFullTaxInvoice) ซ้ำ
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน order-idempotent.test.js / transfer-idempotent.test.js: **ไม่ copy โค้ดเข้า
// helpers.js** แต่ eval ฟังก์ชันจริงจาก .gs — นี่คือเส้นทางที่ออกเอกสารจริงใน ZORT
// (ต่างจาก createSaleBill ตรงที่ endpoint นี้ไม่เขียนชีตของเราเองเลยสักแถว — เขียนแค่
// Audit Log — จึงไม่มี "ของเราเอง" ให้เก็บ cid ไว้เทียบแบบ billCid/cid/tid ตัวอื่น ใช้ ZORT
// เองเป็น source of truth แทน: GetDocumentOrders บอกได้อยู่แล้วว่า order นี้มีใบกำกับ
// (documenttype 2) ออกไปหรือยัง)
//
// สิ่งที่คุมไว้ (พังแล้ว = ออกใบกำกับภาษีซ้ำใบจริงใน ZORT — เจ็บที่สุดในกลุ่ม document-emitter):
//   1. findExistingTaxInvoiceDoc_ อ่านเอกสาร documenttype 2 ถูกต้อง (ตรง type, ตรง regex ชื่อ,
//      ไม่ตรง = null, orderId ว่าง = null ไม่ยิง fetch เลย, error จาก fetch ไม่ throw)
//   2. meta: issueFullTaxInvoice ต้องเช็ค findExistingTaxInvoiceDoc_ ก่อนแตะ EditOrderInfo/
//      AddDocumentOrder เสมอ และเช็ค "ในล็อก" (หลัง tryLock สำเร็จ)
//   3. meta: เจอเอกสารเดิมแล้วต้องคืน ok(...dedup:true) ไม่ใช่ error (ไม่งั้น frontend ขึ้นแดง
//      ทั้งที่มีใบกำกับอยู่แล้วจริง)
//   4. meta: lookupSaleBill ใช้ findExistingTaxInvoiceDoc_ ตัวเดียวกัน ไม่มี query ซ้ำแยกกัน
//      (สองจุดตอบไม่ตรงกัน = จุดหนึ่งเตือนอีกจุดไม่เตือน)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(re, label) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + (label || re));
  return m[0];
}

// eval ใหม่ทุกเคสเพราะ UrlFetchApp ต้องผูกเป็น mock คนละแบบต่อเทสต์
function makeFinder(fetchImpl) {
  const fn = grab(/function findExistingTaxInvoiceDoc_\(orderId\) \{[\s\S]*?\n\}/, 'findExistingTaxInvoiceDoc_');
  // eslint-disable-next-line no-new-func
  return new Function('ZORT_BASE', 'zortHeaders_', 'UrlFetchApp',
    `${fn}\nreturn findExistingTaxInvoiceDoc_;`
  )('https://open-api.zortout.com/v4', () => ({}), fetchImpl);
}

function fakeResponse(bodyObj) {
  return { getContentText: () => JSON.stringify(bodyObj) };
}

describe('findExistingTaxInvoiceDoc_', () => {
  it('orderId ว่าง → null ทันที ไม่ยิง fetch เลย', () => {
    const calls = [];
    const finder = makeFinder({ fetch: (...a) => { calls.push(a); return fakeResponse({}); } });
    expect(finder(null)).toBeNull();
    expect(finder('')).toBeNull();
    expect(finder(undefined)).toBeNull();
    expect(calls.length).toBe(0);
  });

  it('มีเอกสาร documenttype "2" → คืนเลขที่เอกสาร', () => {
    const finder = makeFinder({
      fetch: () => fakeResponse({ list: [{ documenttype: 2, number: 'TI-2026-001' }] }),
    });
    expect(finder(123)).toBe('TI-2026-001');
  });

  it('documenttypename มีคำว่า tax (case-insensitive) ก็นับด้วย แม้ documenttype ไม่ใช่ "2"', () => {
    const finder = makeFinder({
      fetch: () => fakeResponse({ documents: [{ documenttype: 9, documenttypename: 'Full Tax Invoice', documentnumber: 'TX-9' }] }),
    });
    expect(finder(123)).toBe('TX-9');
  });

  it('ไม่มีเอกสารประเภทใบกำกับภาษีเลย → null', () => {
    const finder = makeFinder({
      fetch: () => fakeResponse({ list: [{ documenttype: 1, number: 'QT-1' }] }),
    });
    expect(finder(123)).toBeNull();
  });

  it('ไม่มี field number/documentnumber แต่เจอประเภทตรง → คืน placeholder ไม่ใช่ null (ยังต้องกันซ้ำ)', () => {
    const finder = makeFinder({
      fetch: () => fakeResponse({ list: [{ documenttype: '2' }] }),
    });
    expect(finder(123)).toBe('(มีแล้ว)');
  });

  it('fetch โยน error (เน็ต/ZORT ล่ม) → null ไม่ throw (best-effort เหมือนเดิม)', () => {
    const finder = makeFinder({ fetch: () => { throw new Error('network down'); } });
    expect(() => finder(123)).not.toThrow();
    expect(finder(123)).toBeNull();
  });

  it('JSON parse ไม่ได้ (ตอบ HTML) → null ไม่ throw', () => {
    const finder = makeFinder({ fetch: () => ({ getContentText: () => '<!DOCTYPE html>' }) });
    expect(() => finder(123)).not.toThrow();
  });

  it('list ว่าง → null', () => {
    const finder = makeFinder({ fetch: () => fakeResponse({ list: [] }) });
    expect(finder(123)).toBeNull();
  });
});

describe('meta — จุดเชื่อมต่อที่ถ้าหลุดแล้วเทสต์ข้างบนเขียวแต่ของจริงออกใบกำกับซ้ำ', () => {
  const issueFn = grab(/function issueFullTaxInvoice\(orderNumber, customer, actor, orderId\) \{[\s\S]*?\n\}\n/, 'issueFullTaxInvoice');

  it('issueFullTaxInvoice เช็ค findExistingTaxInvoiceDoc_(oid) ก่อนแตะ ZORT', () => {
    expect(issueFn).toMatch(/findExistingTaxInvoiceDoc_\(oid\)/);
  });

  it('เจอเอกสารเดิม → คืน ok(...dedup:true) ไม่ใช่ error (frontend ต้องไม่ขึ้นแดง)', () => {
    expect(issueFn).toMatch(/return ok\(\{ orderNumber: num, documentNumber: _existingDoc, dedup: true \}\)/);
  });

  it('เช็คเกิดขึ้นหลังคว้าล็อกสำเร็จ (กันสองคำขอพร้อมกันแข่งกันสร้างซ้ำ)', () => {
    const lockIdx = issueFn.indexOf('lock.tryLock(10000)');
    const checkIdx = issueFn.indexOf('findExistingTaxInvoiceDoc_(oid)');
    const editIdx = issueFn.indexOf('/Order/EditOrderInfo');
    const addDocIdx = issueFn.indexOf('/Document/AddDocumentOrder');
    expect(lockIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeGreaterThan(lockIdx);
    expect(editIdx).toBeGreaterThan(checkIdx);
    expect(addDocIdx).toBeGreaterThan(checkIdx);
  });

  it('lookupSaleBill ใช้ findExistingTaxInvoiceDoc_ ตัวเดียวกัน ไม่ query ซ้ำแยกเอง', () => {
    const lookupFn = grab(/function lookupSaleBill\(orderNumber\) \{[\s\S]*?\n\}\n/, 'lookupSaleBill');
    expect(lookupFn).toMatch(/findExistingTaxInvoiceDoc_\(found\.id\)/);
    // ต้องไม่มี query GetDocumentOrders แยกต่างหากอีกชุดอยู่ในนี้ (ของเดิมก่อนแก้มี — กันถอยกลับ)
    expect(lookupFn).not.toMatch(/GetDocumentOrders/);
  });

  it('findExistingTaxInvoiceDoc_ มีที่เดียวในไฟล์ (ไม่ถูกก็อปแยกอีกชุด)', () => {
    const count = (SRC.match(/function findExistingTaxInvoiceDoc_\(/g) || []).length;
    expect(count).toBe(1);
  });
});
