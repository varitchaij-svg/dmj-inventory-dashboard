// tests/print-confirm.test.js — F05: "พิมพ์แล้ว" ต้องแปลว่าป้ายออกจากเครื่องพิมพ์จริง
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (รายงานตรวจระบบ 5 ก.ย. 2026 · ประเด็น F05)
//
// สิ่งที่พบ: `printOrders` ตั้ง `localStorage` + `printFlag="printed"` **ทันทีหลัง**
// `onPrintRequest(...)` โดยไม่รอผล `syncOrderUpdate` → 2 อาการที่ไม่มี error ให้เห็นเลย
//   ① แค่เปิดหน้าพิมพ์แล้วกดย้อนกลับ (กระดาษหมด/เลือกผิดใบ/เครื่องพิมพ์ไม่ติด) ก็ขึ้น
//      "✓ พิมพ์ Label แล้ว" ค้างถาวร → พนักงานข้ามงานติดป้าย
//   ② server บันทึกไม่สำเร็จ (GAS ตอบหน้า HTML — บทเรียนข้อ 13) → เครื่องนี้ขึ้นพิมพ์แล้ว
//      แต่เครื่องอื่นยังเห็น "ยังไม่พิมพ์" = คนละความจริงบนสองจอ
//
// เกณฑ์ปิดงานของรายงาน 4 ข้อ — คุมครบในไฟล์นี้:
//   1. เปิดหน้าพิมพ์แล้วไม่ยืนยันต้องไม่ตีความว่างานเสร็จ
//   2. server fail ไม่แสดงยืนยันถาวร
//   3. อีกเครื่องเห็นสถานะหลังบันทึกสำเร็จ
//   4. ยังพิมพ์ซ้ำได้
//
// เป็น meta-test สแกน/ตัดฟังก์ชันจริงจาก `.jsx` (ไม่ copy) — เหมือน order-rowshift/gasjson
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

const PRINT_ORDERS    = grab(/const printOrders = \(ordersArr\) => \{[\s\S]*?\n  \};/, 'printOrders');
const CONFIRM_PRINTED = grab(/const confirmPrinted = async \(ordersArr\) => \{[\s\S]*?\n  \};/, 'confirmPrinted');

describe('F05 ข้อ 1 — เปิดหน้าพิมพ์แล้วไม่ยืนยัน ต้องไม่ตีความว่างานเสร็จ', () => {
  it('printOrders ไม่ตั้ง printFlag="printed" อีกแล้ว', () => {
    expect(PRINT_ORDERS, 'ตั้ง printed ตอนเปิดหน้าพิมพ์ = บั๊ก F05 กลับมา')
      .not.toMatch(/printFlag:\s*"printed"/);
  });

  it('printOrders ไม่เขียน localStorage ของ "พิมพ์แล้ว" อีกแล้ว', () => {
    expect(PRINT_ORDERS).not.toContain('LS_PRINTED_ORDERS');
    expect(PRINT_ORDERS).not.toMatch(/setPrinted\(/);
  });

  it('printOrders ไม่ยิง syncOrderUpdate เลย (แค่เปิดงานพิมพ์ ยังไม่ใช่ผลลัพธ์)', () => {
    expect(PRINT_ORDERS).not.toContain('syncOrderUpdate');
  });

  it('printOrders บันทึกแค่ "รอยืนยัน" (awaitPrint) พร้อม orderSig กันคิวค้างข้ามใบ', () => {
    expect(PRINT_ORDERS).toContain('setAwaitPrint');
    expect(PRINT_ORDERS, 'ต้องผูก orderSig — เลขแถวถูก reuse ได้หลังมีคนกดยกเลิกใบอื่น')
      .toMatch(/n\[o\.id\] = orderSig\(o\)/);
    expect(PRINT_ORDERS).toContain('onPrintRequest({ groups })');
  });

  it('การ์ดแยก "ส่งเข้าหน้าพิมพ์แล้ว" ออกจาก "พิมพ์ Label แล้ว" คนละป้าย', () => {
    expect(VANA).toMatch(/const awaitingPrint\s+= !alreadyPrinted && awaitPrint\[order\.id\] === orderSig\(order\)/);
    expect(VANA).toContain('✓ พิมพ์ Label แล้ว');
    expect(VANA).toContain('แตะยืนยันเมื่อป้ายออกมา');
  });

  it('awaitingOrders กรองด้วย orderSig + ตัดที่พิมพ์/ส่งไปแล้วออก', () => {
    const blk = grab(/const awaitingOrders = orders\.filter\([\s\S]*?\);\n/, 'awaitingOrders');
    expect(blk).toContain('awaitPrint[o.id] === orderSig(o)');
    expect(blk).toContain('!printed[o.id]');
    expect(blk).toContain('o.printFlag !== "printed"');
    expect(blk).toContain('!shipped[o.id]');
  });
});

describe('F05 ข้อ 2/3 — ต้องรอผลจริง ล้มเหลวไม่แสดงยืนยันถาวร', () => {
  it('confirmPrinted await ผลของ syncOrderUpdate ทุกใบ', () => {
    expect(CONFIRM_PRINTED).toMatch(/await syncOrderUpdate\(o, \{ printFlag: "printed" \}\)/);
  });

  it('ผลเป็น success===false → ไม่เข้ากอง okIds (ไม่บันทึกว่าพิมพ์แล้ว)', () => {
    expect(CONFIRM_PRINTED).toMatch(/if \(res && res\.success === false\) \{ failIds\.push\(o\.id\); continue; \}/);
  });

  it('throw (เน็ตหลุด/GAS ตอบ HTML) ก็นับเป็นล้มเหลว ไม่ใช่สำเร็จ', () => {
    expect(CONFIRM_PRINTED).toMatch(/catch \(e\) \{ res = \{ success: false/);
  });

  it('ที่ล้มเหลว **คงอยู่ในคิวรอยืนยัน** (ลบออกเฉพาะ okIds) — กดยืนยันซ้ำได้', () => {
    expect(CONFIRM_PRINTED).toMatch(/okIds\.forEach\(id => \{ delete n\[id\]; \}\)/);
    expect(CONFIRM_PRINTED, 'ลบทั้ง list = ที่ล้มเหลวหายจากจอทั้งที่ยังไม่ได้บันทึก')
      .not.toMatch(/list\.forEach\(o => \{ delete n\[o\.id\]/);
  });

  it('เขียน localStorage/setPrinted เฉพาะใบที่บันทึกผ่านจริง', () => {
    const i = CONFIRM_PRINTED.indexOf('localStorage.setItem(LS_PRINTED_ORDERS');
    expect(i).toBeGreaterThan(-1);
    const seg = CONFIRM_PRINTED.slice(0, i);
    expect(seg).toContain('okIds.forEach(id => { p2[id] = true; });');
  });

  it('ล้มเหลวแล้วต้องเตือนว่าเครื่องอื่นยังเห็นว่ายังไม่พิมพ์ (ข้อ 3)', () => {
    expect(CONFIRM_PRINTED).toContain('failIds.length');
    expect(CONFIRM_PRINTED).toMatch(/เครื่องอื่นยังเห็นว่ายังไม่พิมพ์/);
  });

  it('⚠️ ห้ามยิงซ้ำอัตโนมัติ — updateOrderState ยังไม่ idempotent (ไม่มี cid)', () => {
    expect(CONFIRM_PRINTED).not.toMatch(/retry|setTimeout/i);
  });
});

describe('F05 ข้อ 4 — ยังพิมพ์ซ้ำได้', () => {
  it('printableOrders ไม่ตัดใบที่อยู่ในคิว "รอยืนยัน" ออก (กดปริ้นซ้ำได้)', () => {
    const blk = grab(/const printableOrders = orders\.filter\(o => \{[\s\S]*?\n    \}\);/, 'printableOrders');
    expect(blk, 'ตัด awaitPrint ออกจากรายการที่พิมพ์ได้ = พิมพ์ไม่ออกแล้วสั่งซ้ำไม่ได้')
      .not.toContain('awaitPrint');
  });

  it('มีข้อความบอกผู้ใช้ว่าพิมพ์ไม่ออกให้กดปริ้นซ้ำได้', () => {
    expect(VANA).toMatch(/พิมพ์ไม่ออก\/พิมพ์ผิด/);
  });
});

describe('F05 — ขอบเขต: LabelPrintView ที่เลือกสินค้าเองไม่ตัดสถานะใบสั่งของ', () => {
  it('มีข้อความบอกขอบเขตในหน้าพิมพ์ Label', () => {
    expect(VANA).toMatch(/ไม่ตัดสถานะ “พิมพ์แล้ว”/);
    expect(VANA).toMatch(/สรุปสินค้าออกจากคลัง/);
  });

  it('LabelPrintView ยังไม่เรียก syncOrderUpdate เอง (ขอบเขตตรงกับข้อความ)', () => {
    const i = VANA.indexOf('function LabelPrintView(');
    const j = VANA.indexOf('\nfunction ', i + 10);
    expect(VANA.slice(i, j)).not.toContain('syncOrderUpdate');
  });
});
