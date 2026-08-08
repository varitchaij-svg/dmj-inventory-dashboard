// tests/order-rowshift.test.js — กันจำนวนที่จัด/การลบ ไปลงผิดใบเมื่อ "แถวเลื่อน"
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน auth.test.js / order-idempotent.test.js: **ไม่ copy โค้ดเข้า helpers.js**
// แต่ eval ฟังก์ชันจริงจาก .gs — นี่คือตรรกะที่ตัดสินว่าจะ "เขียนทับแถวไหน"
// สำเนา drift แล้วเทสต์เขียวทั้งที่ของจริงเขียนผิดใบ (ของหาย + ของคนอื่นเพี้ยน)
//
// ที่มา (ส.ค. 2026 — เจ้าของแจ้งพร้อมภาพหน้าจอ):
//   "เวลาเปลี่ยนจำนวนสินค้าที่จัด ระบบจะเด้งจำนวนอื่นที่ไม่ใช่จำนวนที่พนักงานกรอก"
//
//   ต้นเหตุ: readOrders_ ตั้ง id = `R${i+1}` = **เลขแถวในชีต** ซึ่งเป็น "ตำแหน่ง"
//   ไม่ใช่รหัสถาวร · พอมีคนกด ❌ ยกเลิก order (deleteRow) แถวล่างเลื่อนขึ้นทั้งหมด
//   เครื่องที่ยังถือรายการชุดเดิมอยู่จะส่ง orderId เก่ามา = ชี้ไปคนละใบ
//   เดิม updateOrderState เขียนทับตามเลขแถวทันทีโดยไม่ตรวจอะไรเลย
//   → จำนวนที่พนักงานกรอกไปลงสินค้าตัวอื่น **โดยไม่มี error ให้เห็น**
//
// สิ่งที่คุมไว้:
//   1. orderRowMatchesSku_ — เทียบ SKU ของแถวจริงกับที่ client ส่งมา (trim/ตัวพิมพ์/นอกช่วง)
//   2. sku ว่าง → false เสมอ (ยอมตกไปเส้นทาง match by sku+date ดีกว่าเขียนมั่ว)
//   3. meta: updateOrderState ต้องเรียก orderRowMatchesSku_ คร่อมเส้นทางเขียนตาม orderId
//   4. meta: เส้นทาง fallback ต้องเลือกแถวที่ "ใกล้เลขแถวเดิมที่สุด" ไม่ใช่แถวแรกที่เจอ
//   5. meta: deleteOrderRow/deleteOrderRows ต้องเทียบ SKU ก่อนลบ (ลบผิดใบกู้ไม่ได้)
//   6. meta: frontend ต้องส่ง sku ไปกับทั้ง updateOrderState และ deleteOrders
//   7. meta: React key ของ OrderItemRow ต้องมี orderSig ไม่ใช่ order.id เดี่ยว ๆ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VMAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const { orderRowMatchesSku_ } = (() => {
  const colSku = grab(/const COL_ORD_SKU\s*=\s*\d+;/);
  const fn = grab(/function orderRowMatchesSku_\(sheet, rowNum, sku\) \{[\s\S]*?\n\}/);
  // eslint-disable-next-line no-new-func
  return new Function(`${colSku}\n${fn}\nreturn { orderRowMatchesSku_ };`)();
})();

// ชีตปลอม: skus[i] = SKU (col F) ของแถวที่ 3+i — ข้อมูลเริ่มแถว 3 เหมือนชีตจริง
function fakeSheet(skus) {
  return {
    getLastRow: () => 2 + skus.length,
    getRange(row) {
      return { getDisplayValue: () => skus[row - 3] ?? '' };
    },
  };
}

describe('orderRowMatchesSku_ — แถวนี้ยังเป็นสินค้าตัวเดิมอยู่ไหม', () => {
  it('SKU ตรง → true', () => {
    expect(orderRowMatchesSku_(fakeSheet(['RB05094', 'GR31035']), 3, 'RB05094')).toBe(true);
    expect(orderRowMatchesSku_(fakeSheet(['RB05094', 'GR31035']), 4, 'GR31035')).toBe(true);
  });

  it('แถวเลื่อนขึ้น (มีคนลบใบข้างบนทิ้ง) → false ไม่เขียนทับ', () => {
    // ก่อนลบ: R3=RB05094, R4=GR31035 · หลังลบ R3 → GR31035 เลื่อนมาอยู่ R3
    const afterDelete = fakeSheet(['GR31035', 'RB14067']);
    // เครื่องที่ถือข้อมูลชุดเก่ายังคิดว่า RB05094 อยู่ R3
    expect(orderRowMatchesSku_(afterDelete, 3, 'RB05094')).toBe(false);
  });

  it('ตัวพิมพ์เล็ก/ช่องว่างหัวท้ายจากชีต ไม่ทำให้จับคู่พลาด', () => {
    expect(orderRowMatchesSku_(fakeSheet(['  rb05094 ']), 3, 'RB05094')).toBe(true);
    expect(orderRowMatchesSku_(fakeSheet(['RB05094']), 3, ' rb05094  ')).toBe(true);
  });

  it('sku ว่าง/ไม่ส่งมา → false (ยอมตก fallback ดีกว่าเขียนมั่ว)', () => {
    const sh = fakeSheet(['RB05094']);
    expect(orderRowMatchesSku_(sh, 3, '')).toBe(false);
    expect(orderRowMatchesSku_(sh, 3, null)).toBe(false);
    expect(orderRowMatchesSku_(sh, 3, undefined)).toBe(false);
  });

  it('แถวว่าง / เลยท้ายชีต / เลขแถวไม่ถูกต้อง → false (ไม่ throw)', () => {
    const sh = fakeSheet(['RB05094', '']);
    expect(orderRowMatchesSku_(sh, 4, 'RB05094')).toBe(false);   // แถวว่าง
    expect(orderRowMatchesSku_(sh, 99, 'RB05094')).toBe(false);  // เลยท้ายชีต
    expect(orderRowMatchesSku_(sh, 0, 'RB05094')).toBe(false);
    expect(orderRowMatchesSku_(sh, NaN, 'RB05094')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// meta-test: จุดเชื่อมต่อในโค้ดจริง — ฟังก์ชันข้างบนถูกต้องแต่ไม่มีใครเรียก = ไม่ได้แก้อะไร
// ─────────────────────────────────────────────────────────────────────────────
describe('meta: updateOrderState ต้องตรวจ SKU ก่อนเขียนตามเลขแถว', () => {
  const fn = grab(/function updateOrderState\(ss, body\) \{[\s\S]*?\n\}\n/);

  it('เส้นทาง orderId ต้องผ่าน orderRowMatchesSku_ ก่อนเขียน', () => {
    expect(fn).toMatch(/if\s*\(\s*rowNum >= 1 && orderRowMatchesSku_\(sheet, rowNum, body\.sku\)\s*\)/);
  });

  it('ห้ามกลับไปเขียนทับด้วยเงื่อนไข rowNum อย่างเดียว', () => {
    // เงื่อนไขเดิมที่เป็นต้นเหตุ: `if (rowNum >= 1) {` แล้วเขียนเลย
    expect(fn).not.toMatch(/if\s*\(\s*rowNum >= 1\s*\)\s*\{/);
  });

  it('fallback เลือกแถวที่ใกล้เลขแถวเดิมที่สุด (ไม่ใช่แถวแรกที่เจอ)', () => {
    // สินค้าเดียวกันสั่งซ้ำวันเดียวกันได้ → sku+date ตรงกัน 2 แถว การหยิบแถวแรก
    // เสมอจะแก้ผิดใบเงียบ ๆ · ระยะห่างจากเลขแถวเดิมคือตัวชี้ที่แม่นที่สุดที่มี
    expect(fn).toMatch(/bestDist/);
    expect(fn).toMatch(/Math\.abs\(\(i \+ 1\) - expectRow\)/);
  });

  it('ยังมีเส้นทาง fallback อยู่จริง (ไม่ได้ตัดทิ้งจนแก้จำนวนไม่ได้เลยหลังแถวเลื่อน)', () => {
    // ถ้าตัด fallback ทิ้ง พนักงานจะกรอกจำนวนไม่ได้เลยทุกครั้งที่มีคนลบ order —
    // "ปลอดภัยแต่ใช้งานไม่ได้" ไม่ใช่คำตอบที่ยอมรับได้
    expect(fn).toMatch(/match by sku\+date/);
  });
});

describe('meta: ลบ order ต้องเทียบ SKU ก่อน (ลบผิดใบกู้ไม่ได้)', () => {
  it('deleteOrderRow รับ expectSku แล้วปฏิเสธเมื่อไม่ตรง', () => {
    const fn = grab(/function deleteOrderRow\(ss, orderId, actor, expectSku\) \{[\s\S]*?\n\}\n/);
    expect(fn).toMatch(/expectSku && String\(expectSku\)\.trim\(\)\.toUpperCase\(\) !== sku\.toUpperCase\(\)/);
    expect(fn).toMatch(/return error\(/);
  });

  it('deleteOrderRows (batch) ข้ามใบที่ SKU ไม่ตรง และรายงานกลับ ไม่เงียบ', () => {
    const fn = grab(/function deleteOrderRows\(ss, orderIds, actor, orderSkus\) \{[\s\S]*?\n\}\n/);
    expect(fn).toMatch(/mismatched/);
    expect(fn).toMatch(/continue;/);
    // ต้องส่ง mismatched กลับไปให้ client รู้ว่าใบไหนยังไม่ถูกลบ
    expect(fn).toMatch(/return ok\(\{ deleted, mismatched \}\)/);
  });

  it('doPost ส่ง sku / orderSkus ต่อเข้าไปให้ทั้ง 2 ฟังก์ชัน', () => {
    expect(SRC).toMatch(/deleteOrderRow\(ss, data\.orderId, actor, data\.sku\)/);
    expect(SRC).toMatch(/deleteOrderRows\(ss, data\.orderIds \|\| \[\], actor, data\.orderSkus \|\| \[\]\)/);
  });
});

describe('meta: frontend ต้องส่ง sku ไปด้วยเสมอ', () => {
  it('syncOrderUpdate ส่ง sku (ฝั่ง GAS ใช้ตัวนี้ตรวจว่าแถวยังถูกใบ)', () => {
    const fn = VANA.match(/async function syncOrderUpdate\(order, updates\) \{[\s\S]*?\n\}/)[0];
    expect(fn).toMatch(/sku:\s*order\.sku/);
    expect(fn).toMatch(/orderId:\s*order\.id/);
  });

  it('syncDeleteOrders ส่ง orderSkus คู่กับ orderIds', () => {
    const fn = VANA.match(/async function syncDeleteOrders\(orders\) \{[\s\S]*?\n\}/)[0];
    expect(fn).toMatch(/orderSkus/);
    expect(fn).toMatch(/JSON\.stringify\(\{ deleteOrders: true, orderIds, orderSkus \}\)/);
  });

  it('ทุก call site ของ syncDeleteOrders ส่ง order object ไม่ใช่ id ล้วน', () => {
    // ส่ง id ล้วน (เช่น .map(o => o.id)) = orderSkus เป็นสตริงว่างทั้งชุด → guard ฝั่ง GAS
    // ปล่อยผ่านหมดเพราะ `if (item.sku && ...)` เป็นเท็จ = กลับไปลบผิดใบเหมือนเดิมเงียบ ๆ
    const calls = [...VANA.matchAll(/syncDeleteOrders\(([^)]*)\)/g)]
      .map(m => m[1].trim())
      .filter(a => a && a !== 'orders');   // ตัดตัวประกาศฟังก์ชันเองออก
    expect(calls.length).toBeGreaterThan(0);
    calls.forEach(arg => {
      expect(arg, `syncDeleteOrders(${arg}) ส่ง id ล้วน — ต้องส่ง order object`).not.toMatch(/\.id\b/);
    });
  });
});

describe('meta: React key ของแถว order ต้องไม่ใช่เลขแถวเดี่ยว ๆ', () => {
  it('key มี orderSig ผสมอยู่ด้วย', () => {
    // key={order.id} เดี่ยว ๆ → React ใช้ component instance เดิมต่อเมื่อแถวถูก reuse
    // → เลขในช่อง "จัด" (state ภายในแถว) ของใบเก่าค้างมาโชว์บนใบใหม่
    //
    // ⚠️ ตาม "key" ไม่ใช่ชื่อ element — key ย้ายไปอยู่บนตัวห่อได้ (ตอนใส่หัวข้อคั่นกลุ่ม
    //    หิ้ว/ขึ้นรถ ก็ย้ายไป <React.Fragment>) แต่ข้อบังคับยังเป็นเรื่องเดียวกันเป๊ะ:
    //    element ที่ React ใช้จับคู่ order แต่ละใบ ต้องมี orderSig อยู่ใน key
    const m = VANA.match(/key=\{([^}]*)\}\s*>\s*(?:\{[^\n]*\}\s*)?\n?\s*(?:<OrderGroupHead[\s\S]{0,200}?)?<OrderItemRow/)
           || VANA.match(/<OrderItemRow key=\{([^}]*)\}/);
    expect(m, 'หา key ของแถว order ไม่เจอ (โครงสร้างเปลี่ยน?)').toBeTruthy();
    expect(m[1], 'key ของแถว order ไม่มี orderSig — แถวถูก reuse แล้ว state ค้างข้ามใบ')
      .toMatch(/orderSig\(order\)/);
  });

  it('แถว order มีจุดจอดให้ "กดแจ้งเตือนแล้วพามาที่ของชิ้นนี้"', () => {
    // ไม่มี attribute นี้ = dmjScrollToSku หาไม่เจอตลอดกาล → กดแจ้งเตือนแล้วได้แค่สลับแท็บ
    // เงียบ ๆ เหมือนเดิม โดยไม่มี error ให้เห็นเลยสักบรรทัด
    expect(VANA).toMatch(/data-order-sku=\{order\.sku/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ช่องกรอกจำนวนใน OrderModal — "กรอกถูกแล้วแต่ระบบบันทึกผิด"
// ─────────────────────────────────────────────────────────────────────────────
describe('OrderModal — ช่องกรอกจำนวนต้องไม่เด้งเลขเอง', () => {
  const modal = VMAIN.match(/function OrderModal\(\{[\s\S]*?\n\}\n\nfunction ProductCard/)[0];

  it('ห้าม clamp ค่าระหว่างพิมพ์ (ต้นเหตุ: ลบจนว่าง → เด้งเป็น 1 → พิมพ์ 6 ได้ 16)', () => {
    expect(modal).not.toMatch(/setQty\(Math\.max\(1,\s*parseInt\(ev\.target\.value\)\s*\|\|\s*1\)\)/);
  });

  it('input ผูกกับ qtyDraft (ข้อความดิบ) ไม่ใช่ qty โดยตรง', () => {
    expect(modal).toMatch(/value=\{qtyDraft\}/);
    expect(modal).toMatch(/setQtyDraft\(raw\)/);
  });

  it('ว่าง/ไม่ใช่ตัวเลข → qty = 0 (ไม่เดาแทนผู้ใช้)', () => {
    expect(modal).toMatch(/setQty\(n > 0 \? Math\.min\(n, 9999\) : 0\)/);
  });

  it('ไม่ตั้งค่าเริ่มต้นเป็น 24 อีกต่อไป', () => {
    expect(modal).not.toMatch(/uS\(defaultQty > 0 \? defaultQty : 24\)/);
    expect(modal).toMatch(/uS\(defaultQty > 0 \? defaultQty : 0\)/);
  });

  it('ปุ่มยืนยันกดไม่ได้เมื่อยังไม่เลือกจำนวน', () => {
    expect(modal).toMatch(/disabled=\{loading \|\| fsBlocked \|\| qty < 1\}/);
    expect(modal).toMatch(/เลือกจำนวนที่จะสั่งก่อน/);
  });

  it('handleSubmit ยังกัน qty < 1 ไว้อีกชั้น (ปุ่ม "สั่งเลยโดยไม่บันทึก" ก็ผ่านทางนี้)', () => {
    expect(modal).toMatch(/if \(qty < 1\) \{ setErr\(/);
  });

  it('ปุ่มลัดมีจำนวนที่น้อยกว่า 24 ให้เลือก (ของบางอย่างสั่งน้อยกว่านั้น)', () => {
    const m = VMAIN.match(/const QUICK_QTYS = \[([^\]]*)\]/);
    expect(m, 'หา QUICK_QTYS ไม่เจอ').toBeTruthy();
    const qtys = m[1].split(',').map(s => Number(s.trim()));
    expect(Math.min(...qtys)).toBeLessThan(24);
    expect(qtys.every(n => n > 0)).toBe(true);
  });

  it('กดปุ่มลัดแล้ว draft ต้องตามไปด้วย (ไม่งั้นสลับไปโหมดกรอกเองจะเห็นเลขเก่า)', () => {
    expect(modal).toMatch(/setQty\(q\); setQtyDraft\(String\(q\)\); setCustomMode\(false\)/);
  });
});
