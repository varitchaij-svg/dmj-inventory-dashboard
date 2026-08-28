// tests/order-summary-print.test.js — เลือกหลายรายการเพื่อพิมพ์ Label + เลือก Format ให้เอง (ส.ค. 2026)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง: หน้า "สรุปสินค้าออกจากคลัง" (OrderSummaryView) ให้พนักงานคิดแค่ "เลือกสินค้า → ปริ้น"
//   - เปลี่ยนปุ่มพิมพ์ราย Card → เป็น checkbox เลือกสินค้า
//   - ปุ่มด้านบน: 🖨️ ปริ้นที่เลือก (จำนวน) · ☑️ เลือกทั้งหมด · ✕ ล้างการเลือก · คง "ปริ้นทั้งหมด"
//   - กด "ปริ้นที่เลือก" → เลือก Format อัตโนมัติตามหมวด:
//       แจกันแก้ว / เรซิ่นและอื่นๆ → สติ๊กเกอร์ 32×25 3 ช่อง (sticker3) · หมวดอื่น → A4
//   - เลือกหลายหมวด → จัดกลุ่ม Sticker / A4 ให้เอง พิมพ์ทีละกลุ่ม
//
// เทสต์นี้ eval ฟังก์ชัน pure จริงจาก views-analytics.jsx (labelFormatForCat/groupOrdersForLabel)
// ไม่ copy — เหมือน auth.test.js · + meta-test สแกนต้นทางว่าจุดเชื่อมต่อยังครบ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

// ── eval ฟังก์ชัน pure จริงจากต้นทาง ──
const stickerCatsSrc = grab(VANA, /const LABEL_STICKER_CATS = \[[^\]]*\];/, 'LABEL_STICKER_CATS');
const fmtSrc         = grab(VANA, /const labelFormatForCat = \(cat\) =>[\s\S]*?;\n/, 'labelFormatForCat');
const groupSrc       = grab(VANA, /function groupOrdersForLabel\(ordersArr\) \{[\s\S]*?\n\}\n/, 'groupOrdersForLabel');
// eslint-disable-next-line no-new-func
const mod = new Function(stickerCatsSrc + '\n' + fmtSrc + '\n' + groupSrc +
  '\nreturn { labelFormatForCat, groupOrdersForLabel };')();

describe('labelFormatForCat — เลือก Format ตามหมวด', () => {
  it('แจกันแก้ว → sticker3', () => {
    expect(mod.labelFormatForCat('แจกันแก้ว')).toBe('sticker3');
  });
  it('เรซิ่นและอื่นๆ → sticker3', () => {
    expect(mod.labelFormatForCat('เรซิ่นและอื่นๆ')).toBe('sticker3');
  });
  it('หมวดอื่น (ดอกไม้/ใบ/อุปกรณ์) → a4', () => {
    expect(mod.labelFormatForCat('ดอกไม้')).toBe('a4');
    expect(mod.labelFormatForCat('ใบ')).toBe('a4');
    expect(mod.labelFormatForCat('อุปกรณ์สำนักงาน')).toBe('a4');
  });
  it('ตัด whitespace ก่อนเทียบ (ชีตเว้นวรรคไม่คงที่)', () => {
    expect(mod.labelFormatForCat('  แจกันแก้ว ')).toBe('sticker3');
  });
  it('ว่าง/null/undefined → a4 (ปลอดภัย)', () => {
    expect(mod.labelFormatForCat('')).toBe('a4');
    expect(mod.labelFormatForCat(null)).toBe('a4');
    expect(mod.labelFormatForCat(undefined)).toBe('a4');
  });
});

describe('groupOrdersForLabel — จัดกลุ่มตาม Format', () => {
  const O = (sku, cat, qty, prep) => ({ sku, product: { cat }, orderQty: qty, preparedQty: prep });

  it('หมวดสติ๊กเกอร์ล้วน → 1 กลุ่ม sticker3', () => {
    const g = mod.groupOrdersForLabel([O('VAS001', 'แจกันแก้ว', 5), O('DEC003', 'เรซิ่นและอื่นๆ', 2)]);
    expect(g.length).toBe(1);
    expect(g[0].mode).toBe('sticker3');
    expect(g[0].items.length).toBe(2);
  });

  it('หมวด A4 ล้วน → 1 กลุ่ม a4', () => {
    const g = mod.groupOrdersForLabel([O('FLW002', 'ดอกไม้', 3), O('LEF001', 'ใบ', 1)]);
    expect(g.length).toBe(1);
    expect(g[0].mode).toBe('a4');
  });

  it('หลายหมวดปน → 2 กลุ่ม · สติ๊กเกอร์มาก่อน A4', () => {
    const g = mod.groupOrdersForLabel([O('FLW002', 'ดอกไม้', 3), O('VAS001', 'แจกันแก้ว', 5)]);
    expect(g.length).toBe(2);
    expect(g[0].mode).toBe('sticker3');
    expect(g[1].mode).toBe('a4');
  });

  it('ใช้ preparedQty ก่อน orderQty · sku ซ้ำในกลุ่มเดียวรวมจำนวน', () => {
    const g = mod.groupOrdersForLabel([
      O('VAS001', 'แจกันแก้ว', 24, 10),
      O('VAS001', 'แจกันแก้ว', 24, 6),
    ]);
    expect(g.length).toBe(1);
    expect(g[0].items.length).toBe(1);       // รวมเป็น sku เดียว
    expect(g[0].items[0].qty).toBe(16);      // 10 + 6 (prep ชนะ order)
  });

  it('ไม่มี prepQty/orderQty → default 1', () => {
    const g = mod.groupOrdersForLabel([{ sku: 'X1', product: { cat: 'ดอกไม้' } }]);
    expect(g[0].items[0].qty).toBe(1);
  });

  it('อ่าน cat จาก o.cat ได้เมื่อไม่มี product (fallback)', () => {
    const g = mod.groupOrdersForLabel([{ sku: 'X1', cat: 'แจกันแก้ว', orderQty: 2 }]);
    expect(g[0].mode).toBe('sticker3');
  });

  it('order ไม่มี sku → ข้าม (ไม่พัง)', () => {
    const g = mod.groupOrdersForLabel([{ product: { cat: 'ดอกไม้' }, orderQty: 2 }]);
    expect(g.length).toBe(0);
  });

  it('array ว่าง/undefined → []', () => {
    expect(mod.groupOrdersForLabel([])).toEqual([]);
    expect(mod.groupOrdersForLabel(undefined)).toEqual([]);
  });
});

describe('meta — OrderSummaryView: checkbox + ปุ่มด้านบน (แทนปุ่มพิมพ์ราย Card)', () => {
  it('มี state การเลือก selected + helper toggle/selectAll/clear', () => {
    expect(VANA).toMatch(/const \[selected, setSelected\] = uS\(\{\}\);/);
    expect(VANA).toMatch(/const toggleSelect = \(id\) =>/);
    expect(VANA).toMatch(/const selectAllIn = \(arr\) =>/);
    expect(VANA).toMatch(/const clearSelectIn = \(arr\) =>/);
  });

  it('ปุ่มด้านบนครบ: ปริ้นที่เลือก / เลือกทั้งหมด / ล้างการเลือก / คง "ปริ้นทั้งหมด"', () => {
    expect(VANA).toMatch(/🖨️ ปริ้นที่เลือก \(\{selectedArr\.length\}\)/);
    expect(VANA).toMatch(/☑️ เลือกทั้งหมด/);
    expect(VANA).toMatch(/✕ ล้างการเลือก/);
    expect(VANA).toMatch(/🖨️ ปริ้นทั้งหมด \(\{printableOrders\.length\}\)/);
  });

  it('"ปริ้นที่เลือก" เรียก printOrders(selectedArr) · "ปริ้นทั้งหมด" เรียก printOrders(printableOrders)', () => {
    expect(VANA).toMatch(/onClick=\{\(\) => printOrders\(selectedArr\)\}/);
    expect(VANA).toMatch(/onClick=\{\(\) => printOrders\(printableOrders\)\}/);
  });

  it('printOrders ส่ง { groups } (ผ่าน groupOrdersForLabel) ไม่ใช่ array ดิบ', () => {
    const fn = grab(VANA, /const printOrders = \(ordersArr\) => \{[\s\S]*?\n  \};/, 'printOrders');
    expect(fn).toMatch(/groupOrdersForLabel\(ordersArr\)/);
    expect(fn).toMatch(/onPrintRequest\(\{ groups \}\)/);
  });

  it('checkbox ราย Card ผูกกับ toggleSelect(order.id) + selected[order.id]', () => {
    expect(VANA).toMatch(/onChange=\{\(\) => toggleSelect\(order\.id\)\}/);
    expect(VANA).toMatch(/const isSelected = !!selected\[order\.id\];/);
  });

  it('เอาปุ่มพิมพ์ราย Card ออกแล้ว (ไม่มี handlePrint(order) / "🖨️ Print Label" ปุ่มเดี่ยว)', () => {
    // handlePrint(order) เดิมถูกลบ — เหลือ handlePrint(q, ...) ของ QuoteFollowupView เท่านั้น
    expect(VANA).not.toMatch(/handlePrint\(order\)/);
    expect(VANA).not.toMatch(/🖨️ Print Label</);
    expect(VANA).not.toMatch(/const handlePrintAll =/);
  });
});

describe('meta — LabelPrintView รับ { groups } + จัดกลุ่มพิมพ์ทีละกลุ่ม', () => {
  it('effect init รองรับทั้ง array เดิม และ { groups }', () => {
    expect(VANA).toMatch(/if \(Array\.isArray\(initItems\)\) \{/);
    expect(VANA).toMatch(/const groups = \(initItems\.groups \|\| \[\]\)/);
  });

  it('มี state autoGroups + applyAutoGroup (ตั้ง printMode ตาม mode ของกลุ่ม)', () => {
    expect(VANA).toMatch(/const \[autoGroups, setAutoGroups\] = uS\(null\);/);
    const fn = grab(VANA, /const applyAutoGroup = uC\(\(groups, i, arr\) => \{[\s\S]*?\}, \[\]\);/, 'applyAutoGroup');
    expect(fn).toMatch(/setPrintMode\(g\.mode\)/);
    expect(fn).toMatch(/setItems\(g\.items\.map/);
  });

  it('กลุ่มเดียว → ไม่โชว์แผง (setAutoGroups(null)) · หลายกลุ่ม → โชว์แผงเลือกกลุ่ม', () => {
    expect(VANA).toMatch(/setAutoGroups\(groups\.length > 1 \? groups : null\)/);
    expect(VANA).toMatch(/autoGroups && autoGroups\.length > 1 &&/);
  });

  it('mode ของกลุ่มตรงกับ config: sticker3 = 32×25 3 ช่อง gap 3 · a4 มีจริง', () => {
    const fmt = grab(VANA, /const STICKER_FORMATS = \{[\s\S]*?\};/, 'STICKER_FORMATS');
    expect(fmt).toMatch(/sticker3:\s*\{ w: 32, h: 25, gap: 3, cols: 3 \}/);
    expect(VANA).toMatch(/const LABEL_MODE_META = \{/);
  });
});
