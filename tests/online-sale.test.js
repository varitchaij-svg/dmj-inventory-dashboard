// tests/online-sale.test.js — โหมด "ขายออนไลน์" ของแท็บ ขาย/ออกบิล (ส.ค. 2026)
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน auth.test.js / order-idempotent.test.js: **ไม่ copy โค้ดเข้า helpers.js** แต่ eval
// ฟังก์ชันจริงจาก .jsx/.gs — นี่คือเส้นทางที่ "คิดเงินลูกค้าจริง" สำเนา drift แล้วเทสต์จะเขียว
// ทั้งที่ยอดที่ส่งให้ลูกค้าไม่ตรงกับที่ระบบบันทึก
//
// สิ่งที่คุมไว้ (ทุกข้อคือเคสที่พังแล้ว **ไม่มี error ให้เห็น**):
//   1. ค่าจัดส่งบวกท้ายสุด — ห้ามเข้าสูตรส่วนลดขายส่ง/ขั้นบาท/ถอด VAT
//   2. ข้อความสรุปที่ส่งลูกค้าต้องมีเลขบัญชีเมื่อเลือก "โอน" (ทางถอยตอนแชร์รูปไม่ได้)
//   3. COD ("เก็บเงินปลายทาง") ต้องไม่ถูกบันทึกรับชำระใน ZORT — และรายชื่อวิธีชำระ
//      ฝั่ง .jsx กับ .gs ต้องตรงกันเป๊ะ (ไม่ตรง = เงินยังไม่เข้าแต่ระบบว่าจ่ายแล้ว)
//   4. บรรทัด "ค่าจัดส่ง" ที่ยิงเข้า ZORT ต้องไม่ถูกเอาไปหักสต็อก
//   5. ชีต "บิลขาย" ต่อคอลัมน์ท้ายเท่านั้น + จำนวนค่าในแถวต้องเท่าจำนวนหัวคอลัมน์
//   6. โหมดขายหน้าร้านเดิม (เงินสด/ทอน/ใบเสร็จ 80mm/Bluetooth) ต้องยังอยู่ครบ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

// ── ฟังก์ชันจริงจาก views-analytics.jsx ──────────────────────────────────────
const FE = (() => {
  const parts = [
    grab(VA, /const POS_TRANSFER_INFO = \{[^\n]*\};/, 'POS_TRANSFER_INFO'),
    grab(VA, /const POS_ONLINE_CHANNELS = \[[^\n]*\];/, 'POS_ONLINE_CHANNELS'),
    grab(VA, /const POS_SHIP_METHODS = \[[^\n]*\];/, 'POS_SHIP_METHODS'),
    grab(VA, /const POS_ONLINE_PAY = \[[\s\S]*?\n\];/, 'POS_ONLINE_PAY'),
    grab(VA, /const POS_SHIP_NO_ADDRESS = \[[^\n]*\];/, 'POS_SHIP_NO_ADDRESS'),
    grab(VA, /const POS_SELLER = \{[\s\S]*?\n\};/, 'POS_SELLER'),
    grab(VA, /const POS_CONTACT = \{[^\n]*\};/, 'POS_CONTACT'),
    grab(VA, /function initialSaleMode\(role\) \{[\s\S]*?\n\}/, 'initialSaleMode'),
    grab(VA, /function onlineOrderTotal\(totals, shipFee\) \{[\s\S]*?\n\}/, 'onlineOrderTotal'),
    grab(VA, /function onlineOrderText\(o\) \{[\s\S]*?\n\}/, 'onlineOrderText'),
  ];
  // eslint-disable-next-line no-new-func
  return new Function('localStorage', parts.join('\n') +
    '\nreturn { POS_TRANSFER_INFO, POS_ONLINE_PAY, POS_SHIP_METHODS, POS_SHIP_NO_ADDRESS,' +
    ' POS_ONLINE_CHANNELS, initialSaleMode, onlineOrderTotal, onlineOrderText };');
})();
const fe = (store) => FE({ getItem: (k) => (store && k in store ? store[k] : null), setItem: () => {} });
const feDefault = fe({});

// ── ฟังก์ชันจริงจาก appsscript_complete.gs ───────────────────────────────────
const { POS_UNPAID_METHODS_, shippingRemark_, SALE_BILL_HEADERS_, appendSaleBillRow_,
        buildZortLineItems_, computeBillTotalsGs_, zortOrderAmounts_ } = (() => {
  const parts = [
    grab(GS, /var POS_UNPAID_METHODS_ = \[[^\]]*\];/, 'POS_UNPAID_METHODS_'),
    grab(GS, /function shippingRemark_\(shipping, shipInZort\) \{[\s\S]*?\n\}/, 'shippingRemark_'),
    grab(GS, /function buildZortLineItems_\(items, factor\) \{[\s\S]*?\n\}/, 'buildZortLineItems_'),
    grab(GS, /function zortOrderAmounts_\(goodsTotal, shipFeeInZort, vatRate\) \{[\s\S]*?\n\}/, 'zortOrderAmounts_'),
    grab(GS, /function computeBillTotalsGs_\(items, opts\) \{[\s\S]*?\n\}/, 'computeBillTotalsGs_'),
    grab(GS, /var SALE_BILL_HEADERS_ = \[[\s\S]*?\n\];/, 'SALE_BILL_HEADERS_'),
    grab(GS, /var COL_SB_CID\s+= \d+;/, 'COL_SB_CID'),   // appendSaleBillRow_ ตั้ง numberFormat คอลัมน์นี้
    grab(GS, /function saleBillsSheet_\(ss\) \{[\s\S]*?\n\}/, 'saleBillsSheet_'),
    grab(GS, /function saleBillNextId_\(sh, dateStr\) \{[\s\S]*?\n\}/, 'saleBillNextId_'),
    grab(GS, /function appendSaleBillRow_\(ss, rec\) \{[\s\S]*?\n\}/, 'appendSaleBillRow_'),
  ];
  // eslint-disable-next-line no-new-func
  return new Function('getOrCreateSheet_', 'Utilities', 'Logger', 'SHEET_SALE_BILLS',
    parts.join('\n') +
    '\nreturn { POS_UNPAID_METHODS_, shippingRemark_, SALE_BILL_HEADERS_, appendSaleBillRow_,' +
    ' buildZortLineItems_, computeBillTotalsGs_, zortOrderAmounts_ };'
  )(
    (ss) => ss.__sheet,
    { formatDate: (d, tz, fmt) => (fmt === 'yyyy-MM-dd' ? '2026-08-08' : '12:00:00'), getUuid: () => 'abcd1234' },
    { log: () => {} },
    'บิลขาย',
  );
})();

// ชีตปลอมของ "บิลขาย" — เก็บแถวที่ append + คำสั่ง setNumberFormat ที่ถูกเรียก
function fakeBillSheet() {
  const rows = [];
  const formats = [];
  return {
    rows, formats,
    getLastRow: () => rows.length + 1,
    getLastColumn: () => SALE_BILL_HEADERS_.length,
    appendRow: (r) => rows.push(r),
    getRange: (row, col, nRows, nCols) => ({
      getValues: () => rows.slice(row - 2, row - 2 + nRows).map(r => r.slice(col - 1, col - 1 + nCols)),
      setValues: () => {},
      setFontWeight: () => {},
      setNumberFormat: (f) => { formats.push({ row, col, nCols, f }); },
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('onlineOrderTotal — ค่าจัดส่งบวกท้ายสุด ไม่เข้าสูตรส่วนลด/VAT', () => {
  const T = (g) => ({ grandTotal: g });

  it('ยอดสินค้า + ค่าส่ง = ยอดที่ลูกค้าจ่าย', () => {
    expect(feDefault.onlineOrderTotal(T(1200), 50)).toEqual({ shipFee: 50, goodsTotal: 1200, payTotal: 1250 });
  });
  it('ไม่มีค่าส่ง → ยอดเท่าค่าสินค้า', () => {
    expect(feDefault.onlineOrderTotal(T(980), 0).payTotal).toBe(980);
    expect(feDefault.onlineOrderTotal(T(980), '').payTotal).toBe(980);
  });
  it('ค่าส่งเป็นข้อความตัวเลข (มาจาก input) → แปลงให้', () => {
    expect(feDefault.onlineOrderTotal(T(100), '45').payTotal).toBe(145);
  });
  it('ค่าส่งติดลบ/ไม่ใช่ตัวเลข → นับเป็น 0 ไม่ใช่ NaN', () => {
    expect(feDefault.onlineOrderTotal(T(100), -50).payTotal).toBe(100);
    expect(feDefault.onlineOrderTotal(T(100), 'ฟรี').payTotal).toBe(100);
    expect(feDefault.onlineOrderTotal(T(100), null).payTotal).toBe(100);
  });
  it('totals ว่าง/undefined → 0 ไม่พัง (ตะกร้าว่างระหว่างพิมพ์)', () => {
    expect(feDefault.onlineOrderTotal(null, 50)).toEqual({ shipFee: 50, goodsTotal: 0, payTotal: 50 });
    expect(feDefault.onlineOrderTotal({}, 0).payTotal).toBe(0);
  });
  it('ค่าส่งไม่ถูกลดตามส่วนลดขายส่ง — ยอดสินค้าเท่าเดิม ค่าส่งเท่าเดิมเสมอ', () => {
    // ยอดสินค้าที่ผ่านส่วนลดมาแล้ว 100,000 + ค่าส่ง 200 ต้องได้ 100,200 พอดี
    // (ถ้ามีใครเอาค่าส่งไปรวมก่อนคิดส่วนลด ตัวเลขนี้จะน้อยกว่า 100,200)
    expect(feDefault.onlineOrderTotal(T(100000), 200).payTotal).toBe(100200);
  });
});

describe('onlineOrderText — ข้อความสรุปที่ส่งลูกค้าในแชท', () => {
  const base = {
    orderNumber: 'RC-3-2026080001', dateStr: '8 สิงหาคม 2569 17:45',
    cart: [{ name: 'แจกันแก้วใส', qty: 2, price: 500 }, { name: 'ดอกไม้ PRO', qty: 1, price: 1202 }],
    goodsTotal: 2202, shipFee: 50, payTotal: 2252, payMethod: 'โอน',
    ship: { recipient: 'คุณเอ', phone: '0812345678', address: '99 ถ.พัฒนาการ กทม 10250', method: 'Flash', tracking: 'TH123456789' },
  };

  it('มีเลขที่คำสั่งซื้อ + ชื่อร้าน + รายการสินค้า', () => {
    const t = feDefault.onlineOrderText(base);
    expect(t).toContain('RC-3-2026080001');
    expect(t).toContain('แจกันแก้วใส');
    expect(t).toContain('x2');
    expect(t).toContain('ดอกไม้ PRO');
  });
  it('แยกค่าสินค้า / ค่าจัดส่ง / ยอดที่ต้องชำระ ครบ 3 บรรทัด', () => {
    const t = feDefault.onlineOrderText(base);
    expect(t).toContain('ค่าสินค้า ฿2,202.00');
    expect(t).toContain('ค่าจัดส่ง ฿50.00');
    expect(t).toContain('ยอดที่ต้องชำระ ฿2,252.00');
  });
  it('ไม่มีค่าจัดส่ง → ไม่โชว์บรรทัดค่าจัดส่ง (ไม่ใช่ ฿0.00 ให้ลูกค้างง)', () => {
    const t = feDefault.onlineOrderText({ ...base, shipFee: 0, payTotal: 2202 });
    expect(t).not.toContain('ค่าจัดส่ง ฿');
    expect(t).toContain('ยอดที่ต้องชำระ ฿2,202.00');
  });
  it('เลือก "โอน" → ต้องมีเลขบัญชีในข้อความ (ทางถอยตอนแชร์รูปไม่ได้ ลูกค้าต้องโอนได้เลย)', () => {
    const t = feDefault.onlineOrderText(base);
    expect(t).toContain(feDefault.POS_TRANSFER_INFO.acctNo);
    expect(t).toContain(feDefault.POS_TRANSFER_INFO.bank);
  });
  it('เก็บปลายทาง → ไม่แปะเลขบัญชี (ลูกค้าจ่ายกับขนส่ง โอนมาคือจ่ายซ้ำ)', () => {
    const t = feDefault.onlineOrderText({ ...base, payMethod: 'เก็บเงินปลายทาง' });
    expect(t).not.toContain(feDefault.POS_TRANSFER_INFO.acctNo);
    expect(t).toContain('เก็บเงินปลายทาง');
  });
  it('มีบล็อกจัดส่ง: ผู้รับ/ที่อยู่/ขนส่ง/เลขพัสดุ', () => {
    const t = feDefault.onlineOrderText(base);
    expect(t).toContain('คุณเอ');
    expect(t).toContain('99 ถ.พัฒนาการ กทม 10250');
    expect(t).toContain('Flash');
    expect(t).toContain('TH123456789');
  });
  it('ไม่มีข้อมูลจัดส่งเลย → ไม่โชว์หัวข้อจัดส่งเปล่า ๆ', () => {
    const t = feDefault.onlineOrderText({ ...base, ship: {} });
    expect(t).not.toContain('🚚 จัดส่ง');
  });
  it('มีช่องทางติดต่อร้านท้ายข้อความเสมอ (ลูกค้าต้องทักกลับถูกที่)', () => {
    const t = feDefault.onlineOrderText({ ...base, ship: {} });
    expect(t).toContain('@doomuenjing');
  });
});

describe('initialSaleMode — โหมดตั้งต้นของเครื่อง', () => {
  it('ไม่เคยเลือก + เป็นเครื่องกลางที่ร้าน (storedevice) → หน้าร้าน', () => {
    expect(fe({}).initialSaleMode('storedevice')).toBe('store');
  });
  it('ไม่เคยเลือก + role อื่น → ออนไลน์ (ค่าตั้งต้นตามที่เจ้าของสั่ง)', () => {
    ['saler', 'owner', 'dev', 'frontstore', undefined].forEach(r => {
      expect(fe({}).initialSaleMode(r)).toBe('online');
    });
  });
  it('เคยเลือกไว้ → ใช้ค่าที่จำไว้ ไม่สนใจ role', () => {
    expect(fe({ dmj_sale_mode: 'store' }).initialSaleMode('saler')).toBe('store');
    expect(fe({ dmj_sale_mode: 'online' }).initialSaleMode('storedevice')).toBe('online');
  });
  it('ค่าที่จำไว้เพี้ยน → ไม่เชื่อ ถอยไปใช้ค่าตาม role', () => {
    expect(fe({ dmj_sale_mode: 'xxx' }).initialSaleMode('storedevice')).toBe('store');
    expect(fe({ dmj_sale_mode: '' }).initialSaleMode('saler')).toBe('online');
  });
  it('localStorage โยน error (private mode) → ยังคืนค่าได้ ไม่พังทั้งหน้า', () => {
    const boom = FE({ getItem: () => { throw new Error('denied'); }, setItem: () => {} });
    expect(boom.initialSaleMode('saler')).toBe('online');
  });
});

describe('COD — วิธีชำระที่เงินยังไม่เข้า (สองฝั่งต้องตรงกัน)', () => {
  it('.gs รู้จัก "เก็บเงินปลายทาง"', () => {
    expect(POS_UNPAID_METHODS_).toContain('เก็บเงินปลายทาง');
  });
  it('ทุกวิธีชำระที่ .jsx ตั้ง paid:false ต้องอยู่ใน POS_UNPAID_METHODS_ ของ .gs', () => {
    // ไม่ตรงกัน = หน้าจอบอกว่า "ยังไม่ชำระ" แต่ ZORT ถูกบันทึกว่าจ่ายแล้ว → ยอดค้างรับหายเงียบ ๆ
    const unpaidFE = feDefault.POS_ONLINE_PAY.filter(p => !p.paid).map(p => p.id);
    expect(unpaidFE.length).toBeGreaterThan(0);
    unpaidFE.forEach(id => expect(POS_UNPAID_METHODS_).toContain(id));
  });
  it('วิธีชำระที่ paid:true ต้องไม่หลุดเข้าไปใน POS_UNPAID_METHODS_', () => {
    // หลุดเข้าไป = โอนเงินมาแล้วแต่ระบบไม่บันทึกรับชำระ → ตามเก็บเงินซ้ำจากลูกค้าที่จ่ายแล้ว
    feDefault.POS_ONLINE_PAY.filter(p => p.paid).forEach(p => {
      expect(POS_UNPAID_METHODS_).not.toContain(p.id);
    });
  });
});

// เจ้าของทักไว้ (ส.ค. 2026): "ในระบบ ZORT ต้องหักเงินตามที่เราคิดนะ" — ยอดที่ ZORT บันทึก
// (= ยอดที่ถูกหัก/เรียกเก็บจริงจากบิลนั้น) ต้องตรงกับ totals.grandTotal ที่แอปคิดให้เห็นเป๊ะ
// ถึงสตางค์สุดท้าย ไม่ใช่แค่ "ใกล้เคียง" — ของเดิมปัดเศษราคาต่อหน่วยก่อนคูณจำนวนแยกทีละชิ้น
// (Math.round(price*factor*100)/100 แล้วค่อยคูณ qty) ซึ่งสะสมความคลาดเคลื่อนได้หลายสตางค์
// เมื่อบิลมีหลายรายการ — พิสูจน์ได้จริงด้วย factor=1/3 (ดูเทสต์ตัวแรกข้างล่าง)
describe('buildZortLineItems_ — ปัดเศษสะสม กัน ZORT หักเงินเพี้ยนจากที่คิด', () => {
  const sumTotal = (list) => Math.round(list.reduce((s, it) => s + it.totalprice, 0) * 100) / 100;

  it('เคสที่ของเดิมพัง: 3 รายการ ราคา 10 จำนวน 1 factor=1/3 → ต้องได้ยอดรวม 10.00 เป๊ะ', () => {
    // ของเดิม: แต่ละชิ้น netUnit=round(10×0.3333...×100)/100=3.33 → รวม 9.99 (ขาดไป 1 สตางค์)
    const items = [
      { sku: 'A', name: 'A', qty: 1, price: 10 },
      { sku: 'B', name: 'B', qty: 1, price: 10 },
      { sku: 'C', name: 'C', qty: 1, price: 10 },
    ];
    const list = buildZortLineItems_(items, 1 / 3);
    expect(sumTotal(list)).toBe(10);
    expect(list.map(it => it.totalprice)).toEqual([3.33, 3.34, 3.33]);
  });

  it('pricepernumber × qty ต้องเท่ากับ totalprice เป๊ะทุกแถว (ZORT คิดยอดจาก pricepernumber×number)', () => {
    const items = [
      { sku: 'A', qty: 7, price: 99 }, { sku: 'B', qty: 13, price: 149 }, { sku: 'C', qty: 3, price: 33.5 },
    ];
    buildZortLineItems_(items, 0.876543).forEach(it => {
      expect(it.pricepernumber * it.number).toBeCloseTo(it.totalprice, 9);
    });
  });

  it('ยอดรวมทุกแถว = round(factor × ยอดตั้งต้น × 100)/100 เป๊ะ — หลายเคส/หลายจำนวนต่อชิ้น', () => {
    const cases = [
      { items: [{ qty: 1, price: 250 }], factor: 1 },
      { items: [{ qty: 24, price: 41 }, { qty: 12, price: 17 }], factor: 0.88 },      // ขายส่ง 12%
      { items: [{ qty: 6, price: 99 }, { qty: 6, price: 199 }, { qty: 1, price: 500 }], factor: 0.941 },
      { items: [{ qty: 100, price: 12.5 }], factor: 0.95 },
      { items: Array.from({ length: 17 }, (_, i) => ({ qty: (i % 5) + 1, price: 37 + i * 3 })), factor: 0.8234567 },
    ];
    cases.forEach(({ items, factor }) => {
      const expected = Math.round(items.reduce((s, it) => s + it.qty * it.price, 0) * factor * 100) / 100;
      expect(sumTotal(buildZortLineItems_(items, factor))).toBe(expected);
    });
  });

  it('qty ≤ 0 ถูกตัดทิ้ง ไม่กินโควตาการปัดเศษของแถวอื่น', () => {
    const items = [{ sku: 'A', qty: 0, price: 999 }, { sku: 'B', qty: 1, price: 10 }, { sku: 'C', qty: -1, price: 5 }];
    const list = buildZortLineItems_(items, 1);
    expect(list.length).toBe(1);
    expect(list[0].sku).toBe('B');
    expect(list[0].totalprice).toBe(10);
  });

  it('array ว่าง → คืน array ว่าง ไม่พัง', () => {
    expect(buildZortLineItems_([], 1)).toEqual([]);
    expect(buildZortLineItems_(null, 1)).toEqual([]);
  });

  it('ต่อเนื่องกับ computeBillTotalsGs_ จริง (เส้นทางที่ createSaleBill ใช้จริง) — รวมส่วนลดขายส่ง+ขั้นบาท', () => {
    // มัดจำเดียวกับที่ createSaleBill ทำ: totals จาก computeBillTotalsGs_ → factor = grandTotal/gross
    // → buildZortLineItems_(items, factor) ต้องได้ sum(totalprice) === grandTotal เป๊ะ แม้ผ่านสูตร
    // ส่วนลดขายส่ง 20% + ขั้นบาทมาก่อนแล้ว (ตัวเลขไม่ "นิ่ง" เหมือนเทสต์ข้างบนที่ตั้ง factor เอง)
    const items = [
      { sku: 'R01', category: 'ดอกไม้', qty: 24, price: 41 },
      { sku: 'R02', category: 'ดอกไม้', qty: 17, price: 133 },
      { sku: 'OL1', category: 'ใบไม้', qty: 9, price: 67.5 },
      { sku: 'MTO', category: 'Made to Order', qty: 3, price: 250 },   // ยกเว้นส่วนลด — ยังต้องรวมยอดตรง
    ];
    const totals = computeBillTotalsGs_(items, { manualDiscount: 37 });
    const gross = totals.retailEligible + totals.retailExcluded;
    const factor = gross > 0 ? totals.grandTotal / gross : 1;
    const list = buildZortLineItems_(items, factor);
    expect(sumTotal(list)).toBe(Math.round(totals.grandTotal * 100) / 100);
  });
});

// เจอจริงจากหน้า ZORT (ส.ค. 2026): บิล RC-202608007 ยอด ฿476 ออกสำเร็จ แต่หน้ารายการขาย
// ขึ้น **"มูลค่า 0"** → ยอดขายไม่เข้าระบบ ZORT เลย · ต้นเหตุเดียวกับที่เคยเจอกับ AddQuotation
// (ยืนยันแล้วด้วย exploreZortQuotationAmountFix): ZORT ไม่คำนวณยอดรวมหัวเอกสารจาก
// list[].totalprice ให้เอง ต้องส่ง amount/amount_pretax/vatamount เอง
describe('zortOrderAmounts_ — ยอดหัวเอกสารที่ต้องส่งให้ AddOrder (กัน "มูลค่า 0")', () => {
  it('ไม่มีค่าส่ง → amount = ยอดสินค้า · แตกฐานภาษีด้วย 7/107', () => {
    const a = zortOrderAmounts_(476, 0);
    expect(a.amount).toBe(476);
    expect(a.vat).toBe(31.14);        // 476 × 7/107
    expect(a.preVat).toBe(444.86);
  });
  it('preVat + vat = amount เป๊ะเสมอ (ไม่งั้นเอกสารการเงินขัดกันเอง)', () => {
    [0, 1, 9.99, 476, 1250, 33333.33, 1000000].forEach(v => {
      const a = zortOrderAmounts_(v, 0);
      expect(Math.round((a.preVat + a.vat) * 100) / 100).toBe(a.amount);
    });
  });
  it('ค่าส่งที่เข้า ZORT ต้องรวมในยอดหัวเอกสาร (ไม่งั้นหัวไม่ตรงผลรวมบรรทัด)', () => {
    expect(zortOrderAmounts_(250, 50).amount).toBe(300);
  });
  it('ค่าส่งที่ไม่ได้เข้า ZORT ต้องไม่ถูกนับ (ผู้เรียกส่ง 0 มา)', () => {
    expect(zortOrderAmounts_(250, 0).amount).toBe(250);
  });
  it('ค่าว่าง/ไม่ใช่ตัวเลข → 0 ไม่ใช่ NaN (NaN ไปถึง ZORT = บิลพังทั้งใบ)', () => {
    expect(zortOrderAmounts_(null, undefined).amount).toBe(0);
    expect(zortOrderAmounts_('ฟรี', 'x').amount).toBe(0);
  });
  it('ยอดหัวเอกสารตรงกับผลรวม line item ที่ buildZortLineItems_ สร้าง (จุดที่ ZORT เอาไปเทียบ)', () => {
    const items = [
      { sku: 'R01', category: 'ดอกไม้', qty: 24, price: 41 },
      { sku: 'R02', category: 'ดอกไม้', qty: 17, price: 133 },
      { sku: 'MTO', category: 'Made to Order', qty: 3, price: 250 },
    ];
    const totals = computeBillTotalsGs_(items, { manualDiscount: 37 });
    const gross = totals.retailEligible + totals.retailExcluded;
    const list = buildZortLineItems_(items, gross > 0 ? totals.grandTotal / gross : 1);
    const lineSum = Math.round(list.reduce((s, it) => s + it.totalprice, 0) * 100) / 100;
    expect(zortOrderAmounts_(totals.grandTotal, 0).amount).toBe(lineSum);
  });
});

describe('shippingRemark_ — หมายเหตุจัดส่งที่ติดไปกับ order ใน ZORT', () => {
  const s = { recipient: 'คุณเอ', phone: '0812345678', address: '99 ถ.พัฒนาการ', method: 'Flash', tracking: 'TH1', fee: 50, note: 'ห่อกันกระแทก' };

  it('รวมข้อมูลที่คนแพ็คของต้องใช้ครบ', () => {
    const r = shippingRemark_(s, true);
    expect(r).toContain('คุณเอ');
    expect(r).toContain('99 ถ.พัฒนาการ');
    expect(r).toContain('Flash');
    expect(r).toContain('TH1');
    expect(r).toContain('ห่อกันกระแทก');
  });
  it('บอกชัดว่าค่าส่งรวมในยอด order นี้แล้ว', () => {
    expect(shippingRemark_(s, true)).toContain('รวมในยอดแล้ว');
  });
  it('บอกชัดว่าค่าส่งเก็บนอกยอด (ไม่ได้ตั้ง SHIPPING_FEE_SKU)', () => {
    // คนกระทบยอดเงินต้องไม่ต้องเดาว่ายอดใน ZORT รวมค่าส่งหรือยัง
    expect(shippingRemark_(s, false)).toContain('ไม่รวมในยอดนี้');
  });
  it('ไม่มีค่าส่ง → ไม่พูดถึงค่าส่งเลย', () => {
    expect(shippingRemark_({ recipient: 'ก', fee: 0 }, false)).not.toContain('ค่าจัดส่ง');
  });
  it('ไม่มีข้อมูลจัดส่ง (ขายหน้าร้าน) → คืนค่าว่าง ไม่ไปเปื้อน remark เดิม', () => {
    expect(shippingRemark_({}, false)).toBe('');
    expect(shippingRemark_(null, false)).toBe('');
    expect(shippingRemark_(undefined, true)).toBe('');
  });
});

describe('ชีต "บิลขาย" — ต่อคอลัมน์ท้ายเท่านั้น', () => {
  it('22 คอลัมน์แรกยังเป็นชุดเดิมเรียงเดิมเป๊ะ (แถวเก่าอ่านตามตำแหน่ง)', () => {
    expect(SALE_BILL_HEADERS_.slice(0, 22)).toEqual([
      'id', 'วันที่', 'เวลา', 'เลขบิล', 'เลขใบกำกับ', 'ผู้ขาย', 'ช่องทาง', 'วิธีชำระ',
      'ยอดสุทธิ', 'ก่อน VAT', 'VAT', 'ส่วนลดรวม', 'จำนวนรายการ', 'จำนวนชิ้น',
      'ลูกค้า', 'เลขผู้เสียภาษี', 'ใบกำกับภาษี', 'รับเงินสด', 'เงินทอน',
      'zortOrderId', 'สถานะ', 'หมายเหตุ',
    ]);
  });
  it('คอลัมน์ใหม่ของขายออนไลน์ต่อท้าย W..AC', () => {
    expect(SALE_BILL_HEADERS_.slice(22, 29)).toEqual([
      'ค่าจัดส่ง', 'ยอดเก็บลูกค้า', 'ขนส่ง', 'เลขพัสดุ', 'ผู้รับ', 'ที่อยู่จัดส่ง', 'โหมดขาย',
    ]);
  });
  it('billCid ต่อท้ายเป็นคอลัมน์ AD (ตัวกันออกบิลซ้ำ) — ต่อท้ายเท่านั้น', () => {
    expect(SALE_BILL_HEADERS_[29]).toBe('billCid');
    expect(SALE_BILL_HEADERS_.length).toBe(30);
  });

  it('appendSaleBillRow_ เขียนค่าครบเท่าจำนวนหัวคอลัมน์ (ขาด/เกิน = ทุกคอลัมน์หลังจากนั้นเลื่อน)', () => {
    const sh = fakeBillSheet();
    const r = appendSaleBillRow_({ __sheet: sh }, { orderNumber: 'RC-1', grandTotal: 100 });
    expect(r.ok).toBe(true);
    expect(sh.rows[0].length).toBe(SALE_BILL_HEADERS_.length);
  });

  it('ค่าจัดส่ง/ยอดเก็บลูกค้า/ขนส่ง/เลขพัสดุ ลงตรงคอลัมน์ W X Y Z', () => {
    const sh = fakeBillSheet();
    appendSaleBillRow_({ __sheet: sh }, {
      orderNumber: 'RC-2', grandTotal: 1200, shipFee: 50, payTotal: 1250,
      shipMethod: 'Flash', shipTracking: '0123456789012', shipRecipient: 'คุณเอ',
      shipAddress: '99 ถ.พัฒนาการ', saleMode: 'online',
    });
    const row = sh.rows[0];
    expect(row[22]).toBe(50);          // W ค่าจัดส่ง
    expect(row[23]).toBe(1250);        // X ยอดเก็บลูกค้า
    expect(row[24]).toBe('Flash');     // Y ขนส่ง
    expect(row[25]).toBe('0123456789012'); // Z เลขพัสดุ
    expect(row[26]).toBe('คุณเอ');      // AA ผู้รับ
    expect(row[28]).toBe('online');    // AC โหมดขาย
  });

  it('ไม่ส่งค่าจัดส่งมา (ขายหน้าร้าน) → ยอดเก็บลูกค้า = ยอดสุทธิ ไม่ใช่ 0', () => {
    const sh = fakeBillSheet();
    appendSaleBillRow_({ __sheet: sh }, { orderNumber: 'RC-3', grandTotal: 890 });
    expect(sh.rows[0][22]).toBe(0);
    expect(sh.rows[0][23]).toBe(890);
  });

  it('เลขพัสดุถูกตั้งเป็น text — เลขล้วนยาวจะกลายเป็น 1.23E+12 ถ้าไม่ตั้ง (บทเรียนข้อ 2)', () => {
    const sh = fakeBillSheet();
    appendSaleBillRow_({ __sheet: sh }, { orderNumber: 'RC-4', shipTracking: '822304641234' });
    expect(sh.formats.some(f => f.col === 26 && f.f === '@')).toBe(true);
  });
});

// ═══ meta-test: จุดเชื่อมต่อที่พังแล้วไม่มี error ให้เห็น ═══════════════════════
describe('meta — createSaleBill ต่อสายถูกจุด', () => {
  const fn = grab(GS, /function createSaleBill\(ss, data, actor\) \{[\s\S]*?\n\}\n/, 'createSaleBill');

  it('หักสต็อกด้วย productList ไม่ใช่ list (list มีบรรทัดค่าจัดส่งปน)', () => {
    expect(fn).toMatch(/deductFrontStoreForSale_\(ss,\s*productList\)/);
    expect(fn).not.toMatch(/deductFrontStoreForSale_\(ss,\s*list\)/);
  });
  it('ค่าจัดส่งเข้า ZORT เป็น line item เฉพาะเมื่อตั้ง SHIPPING_FEE_SKU ไว้', () => {
    expect(fn).toMatch(/shipInZort\s*=\s*!!\(shipSku && shipFee > 0\)/);
    expect(GS).toMatch(/function readShippingFeeSku_\(\)/);
    expect(GS).toMatch(/SHIPPING_FEE_SKU/);
  });
  it('ค่าจัดส่ง **ไม่** ถูกส่งเข้า computeBillTotalsGs_ (กันโดนส่วนลด/ถอด VAT)', () => {
    const call = grab(fn, /computeBillTotalsGs_\(items, \{[\s\S]*?\}\)/, 'computeBillTotalsGs_ call');
    expect(call).not.toMatch(/ship/i);
  });
  it('COD ไม่ถูกบันทึกรับชำระใน ZORT', () => {
    expect(fn).toMatch(/POS_UNPAID_METHODS_\.indexOf/);
    expect(fn).toMatch(/if \(data\.paymentMethod && !unpaidMethod && orderId != null\)/);
  });
  it('ยอดรับชำระที่ส่ง ZORT ต้องเป็นยอดที่ ZORT รู้จัก (ไม่บวกค่าส่งที่ไม่ได้ส่งเข้าไป)', () => {
    // ค่าส่งจะถูกนับก็ต่อเมื่อ shipInZort — ตรรกะนี้อยู่ที่จุดเรียก zortOrderAmounts_ จุดเดียว
    // แล้ว paymentamount ใช้ผลตัวเดียวกัน (zAmt.amount) ไม่คิดซ้ำ
    expect(fn).toMatch(/zortOrderAmounts_\(totals\.grandTotal, shipInZort \? shipFee : 0\)/);
    expect(fn).toMatch(/paymentamount: zortOrderTotal/);
    expect(zortOrderAmounts_(1000, 0).amount).toBe(1000);      // ค่าส่งไม่เข้า ZORT → ไม่นับ
    expect(zortOrderAmounts_(1000, 50).amount).toBe(1050);     // เข้า ZORT → นับ
  });
  it('คืน shipFee/payTotal กลับไปให้ frontend ใช้โชว์บนสรุปของลูกค้า', () => {
    expect(fn).toMatch(/shipFee: shipFee, payTotal: payTotal/);
  });
  it('นับจำนวนรายการ/ชิ้นจาก productList (ไม่นับบรรทัดค่าจัดส่งเป็นสินค้าที่ขายได้)', () => {
    expect(fn).toMatch(/lineCount: productList\.length/);
    expect(fn).toMatch(/unitCount: productList\.reduce/);
  });
  // 🔴 บั๊กจริง ส.ค. 2026: บิล ฿476 ขึ้น "มูลค่า 0" ในหน้ารายการขายของ ZORT
  it('ส่งยอดหัวเอกสาร amount/amount_pretax/vatamount ไปกับ AddOrder (ไม่ส่ง = ZORT ขึ้นมูลค่า 0)', () => {
    expect(fn).toMatch(/zAmt\s*=\s*zortOrderAmounts_\(totals\.grandTotal, shipInZort \? shipFee : 0\)/);
    expect(fn).toMatch(/payload\[F\.orderAmount\]\s*=\s*zAmt\.amount/);
    expect(fn).toMatch(/payload\[F\.orderAmountPreVat\]\s*=\s*zAmt\.preVat/);
    expect(fn).toMatch(/payload\[F\.orderVatAmount\]\s*=\s*zAmt\.vat/);
    expect(GS).toMatch(/orderAmount:\s*"amount"/);
    expect(GS).toMatch(/orderAmountPreVat:\s*"amount_pretax"/);
    expect(GS).toMatch(/orderVatAmount:\s*"vatamount"/);
  });
  it('ห้ามส่ง vattype/vatpercent/discount ที่ header — ZORT จะ recompute ยอดทับเป็นค่าผิด', () => {
    // บทเรียนที่ยืนยันแล้วกับ AddQuotation — ส่งปนไปแล้วแย่กว่าไม่ส่งเลย
    const payloadBlock = grab(fn, /var payload = \{[\s\S]*?payload\[F\.orderVatAmount\][^\n]*\n/, 'AddOrder payload');
    expect(payloadBlock).not.toMatch(/vattype|vatpercent/);
    expect(payloadBlock).not.toMatch(/\bdiscount\b/);
  });
  it('ยอดรับชำระใช้ตัวเดียวกับยอดหัวเอกสาร (คิดซ้ำ 2 ที่ = ZORT ขึ้นรับเงินเกิน/ขาด)', () => {
    expect(fn).toMatch(/zortOrderTotal = zAmt\.amount/);
  });
  it('ช่องทางขายใช้ field เดียวกับ createQuotation ที่เวิร์กจริง (saleschannel ไม่ใช่ channel)', () => {
    // หน้า ZORT จริงขึ้นช่องทางเป็น "–" ทุกบิล เพราะส่งชื่อ field ที่ ZORT ไม่รู้จัก
    expect(GS).toMatch(/orderChannel:\s*"saleschannel"/);
    expect(GS).toMatch(/payload\.saleschannel\s*=\s*String\(data\.channel\)/);   // createQuotation ต้นแบบ
  });
  it('สร้าง line items ด้วย buildZortLineItems_ (ปัดเศษสะสม) ไม่ใช่ปัดแยกทีละชิ้นแบบเดิม', () => {
    // กันถอยกลับไปปัด unit price ทีละชิ้นก่อนคูณ qty — ของเดิมสะสมความคลาดเคลื่อนได้หลายสตางค์
    // (ดู "เคสที่ของเดิมพัง" ใน describe('buildZortLineItems_' ข้างบน)
    expect(fn).toMatch(/productList\s*=\s*buildZortLineItems_\(items, factor\)/);
    expect(fn).not.toMatch(/Math\.round\(\(Number\(it\.price\)/);
  });

  // 🔴 บั๊กจริง ส.ค. 2026: ออกบิลสำเร็จแล้วจอขึ้น "ไม่สำเร็จ" (GAS ตอบ HTML/browser ตัดสาย)
  //    → ผู้ขายกดใหม่ = บิลซ้ำ + สต็อกหักซ้ำ + ใบกำกับซ้ำ (ไม่มีตัวกันซ้ำเหมือน order/transfer)
  it('เช็ค billCid ซ้ำ "ในล็อก" ก่อนแตะ ZORT — เจอแล้วคืนผลเดิม ไม่ยิงใหม่', () => {
    // การเช็คต้องอยู่ "หลัง" tryLock และ "ก่อน" การยิง AddOrder ตัวแรก
    const lockIdx = fn.indexOf('lock.tryLock');
    const dedupIdx = fn.indexOf('findBillCidRow_');
    const addOrderIdx = fn.indexOf('/Order/AddOrder');
    expect(lockIdx).toBeGreaterThan(-1);
    expect(dedupIdx).toBeGreaterThan(lockIdx);      // เช็คในล็อก
    expect(dedupIdx).toBeLessThan(addOrderIdx);     // เช็คก่อนแตะ ZORT
    expect(fn).toMatch(/return ok\(Object\.assign\(\{\}, _replay, \{ dedup: true \}\)\)/);
  });
  it('เก็บผลไว้ตอบซ้ำ (cache) หลังออกบิลสำเร็จ — action=billCheck ใช้ตอบ', () => {
    expect(fn).toMatch(/CacheService\.getScriptCache\(\)\.put\('sbill_' \+ billCid/);
    expect(fn).toMatch(/billCid: billCid/);   // ส่ง billCid ลงชีตด้วย (ถาวรกว่า cache)
  });
  it('createSaleBill อยู่ใน IMMEDIATE_GATE_ACTIONS_ (action กระทบเงิน/สต็อกจริง)', () => {
    const gate = grab(GS, /var IMMEDIATE_GATE_ACTIONS_ = \{[\s\S]*?\n\};/, 'IMMEDIATE_GATE_ACTIONS_');
    expect(gate).toMatch(/createSaleBill:\s*\["saler", "storedevice"\]/);
  });
});

// findBillCidRow_ + billCheckHandler_ — รันจริงกับชีตจำลอง
describe('findBillCidRow_ / billCheckHandler_ — ยืนยันบิลจากชีตเมื่อ cache หลุด', () => {
  // ประกอบสภาพแวดล้อม eval เฉพาะ findBillCidRow_ (pure พอที่จะรันกับ mock ได้)
  const findBillCidRow_ = (() => {
    const src = grab(GS, /function findBillCidRow_\(ss, cid\) \{[\s\S]*?\n\}/, 'findBillCidRow_') +
                grab(GS, /var COL_SB_CID\s+= \d+;/, 'COL_SB_CID') +
                grab(GS, /var SB_CID_SCAN_ROWS\s+= \d+;/, 'SB_CID_SCAN_ROWS');
    // eslint-disable-next-line no-new-func
    return new Function('SHEET_SALE_BILLS', src + '\nreturn findBillCidRow_;')('บิลขาย');
  })();

  // ชีตจำลอง: 1 แถวบิล ยอด 476 billCid=SB-x อยู่คอลัมน์ที่ 30 (index 29)
  function sheetWith(cidVal) {
    const row = new Array(30).fill('');
    row[0] = 'SB-20260810-0001'; row[3] = 'RC-202608007'; row[4] = 'IV-1';
    row[8] = 476; row[9] = 444.86; row[10] = 31.14;
    row[22] = 0; row[23] = 476; row[29] = cidVal;
    return {
      getSheetByName: () => ({
        getLastRow: () => 2,
        getRange: (from, c, n, w) => ({ getValues: () => [row.slice(c - 1, c - 1 + w)] }),
      }),
    };
  }

  it('เจอ billCid → คืนเลขบิล/ยอด/ธง fromSheet', () => {
    const hit = findBillCidRow_(sheetWith('SB-x'), 'SB-x');
    expect(hit).toBeTruthy();
    expect(hit.orderNumber).toBe('RC-202608007');
    expect(hit.totals.grandTotal).toBe(476);
    expect(hit.payTotal).toBe(476);
    expect(hit.fromSheet).toBe(true);
  });
  it('ไม่เจอ billCid → null (frontend จะถือว่า "ยังไม่ออก")', () => {
    expect(findBillCidRow_(sheetWith('SB-x'), 'SB-other')).toBe(null);
  });
  it('cid ว่าง → null (ไม่ไล่ทั้งชีตฟรี ๆ)', () => {
    expect(findBillCidRow_(sheetWith('SB-x'), '')).toBe(null);
  });
});

describe('meta — frontend ส่งข้อมูลครบและโหมดหน้าร้านยังอยู่', () => {
  const posView = grab(VA, /function PosView\(\{ data, role \}\) \{[\s\S]*?\n\}\n\n\/\/ ═══ ผลลัพธ์หลังบันทึกการขายออนไลน์/, 'PosView');

  it('ส่ง shipping + saleMode ไปกับ syncCreateSaleBill (ไม่ส่ง = ฝั่ง GAS ไม่รู้เรื่องค่าส่งเลย)', () => {
    expect(posView).toMatch(/shipping: online \? shipOut : undefined/);
    expect(posView).toMatch(/saleMode: saleMode/);
  });
  it('ยอดบนปุ่มบันทึกของโหมดออนไลน์ = payTotal (รวมค่าส่ง) ไม่ใช่ grandTotal', () => {
    expect(posView).toMatch(/บันทึกการขาย · \$\{fmtBfull\(payTotal\)\}/);
  });
  it('ค่าจัดส่งมีผลเฉพาะโหมดออนไลน์ — สลับกลับหน้าร้านแล้วต้องไม่ตามไปบวกยอด', () => {
    expect(posView).toMatch(/shipFeeNum = online \?/);
  });
  it('โหมดขายหน้าร้านเดิมยังครบ: เงินสด/เงินทอน/ใบเสร็จ 80mm/ใบกำกับ A4/Bluetooth', () => {
    expect(posView).toMatch(/cashChange/);
    expect(posView).toMatch(/<PosReceipt80/);
    expect(posView).toMatch(/<PosReceipt\s/);
    expect(posView).toMatch(/printReceipt80ViaBluetooth/);
    expect(posView).toMatch(/ยิงบาร์โค้ด/);
  });
  it('เส้นทางออนไลน์คืน OnlineSaleResult ก่อนถึงหน้าใบเสร็จปริ้น (ไม่ปนกัน)', () => {
    const iOnline = posView.indexOf('if (result && online)');
    const iStore = posView.indexOf('if (result) {');
    expect(iOnline).toBeGreaterThan(0);
    expect(iStore).toBeGreaterThan(iOnline);
  });
  it('เงินสด/เงินทอนถูกส่งขึ้น server เฉพาะโหมดหน้าร้าน', () => {
    expect(posView).toMatch(/cashReceived: \(!online && payMethod === "เงินสด"\)/);
  });
  // เจ้าของสั่ง (ส.ค. 2026): "จัดส่งมีให้กรอกแต่ไม่จำเป็นต้องกรอก" — ห้ามบล็อกปุ่มบันทึกด้วย
  // ship.method/address เด็ดขาด แม้เลือกขนส่งที่ต้องมีที่อยู่จริงก็ตาม (ต่างจาก recipient/payMethod
  // ที่ยังบังคับ เพราะจำเป็นต่อการตามงาน/บัญชี) — ป้าย shipAddressHint เป็นแค่ข้อความชวนกรอก
  // ไม่ใช่เงื่อนไข block
  it('ปุ่มบันทึกไม่ถูกบล็อกด้วยขนส่ง/ที่อยู่ (จัดส่งเป็นข้อมูลเสริม ไม่บังคับ)', () => {
    expect(posView).not.toMatch(/if \(!ship\.method\)/);
    expect(posView).not.toMatch(/!shipOut\.address\) \{ showToast/);
  });
  it('ยังบังคับผู้รับ/ชื่อลูกค้า + วิธีชำระ (จำเป็นต่อการตามงาน/บัญชี)', () => {
    expect(posView).toMatch(/if \(!shipOut\.recipient\)/);
    expect(posView).toMatch(/if \(!payMethod\)/);
  });
  it('POS_SHIP_NO_ADDRESS ทุกตัวยังอยู่ใน POS_SHIP_METHODS (ใช้เป็นป้ายบอก ไม่ใช่ตัวบล็อก)', () => {
    expect(feDefault.POS_SHIP_NO_ADDRESS).toContain('ลูกค้ามารับเอง');
    feDefault.POS_SHIP_NO_ADDRESS.forEach(m => expect(feDefault.POS_SHIP_METHODS).toContain(m));
  });
});

describe('meta — OnlineSaleResult (สรุปที่ส่งให้ลูกค้า)', () => {
  const cmp = grab(VA, /function OnlineSaleResult\(\{[\s\S]*?\n\}\n\nfunction FieldLabel_/, 'OnlineSaleResult');

  it('มีทั้งบันทึกรูป + แชร์ + คัดลอกข้อความ', () => {
    expect(cmp).toMatch(/บันทึกรูป/);
    expect(cmp).toMatch(/แชร์ให้ลูกค้า/);
    expect(cmp).toMatch(/คัดลอกเป็นข้อความ/);
  });
  it('แชร์ไฟล์ไม่ได้ → ถอยไปแชร์ข้อความ → ถอยไปคัดลอก (ห้ามกดแล้วเงียบ)', () => {
    expect(cmp).toMatch(/navigator\.canShare && navigator\.canShare\(\{ files: \[file\] \}\)/);
    expect(cmp).toMatch(/else if \(navigator\.share\)/);
    expect(cmp).toMatch(/await copyText\(\)/);
  });
  it('ผู้ใช้กดยกเลิกแผงแชร์ (AbortError) ต้องไม่ขึ้นแถบแดง', () => {
    expect(cmp).toMatch(/AbortError/);
  });
  it('ยอดบนสรุปยึดค่าที่ server คืนมา ไม่ใช่ที่หน้าจอคำนวณเอง', () => {
    const posView = grab(VA, /if \(result && online\) \{[\s\S]*?\n  \}/, 'online result branch');
    expect(posView).toMatch(/result\.shipFee != null/);
    expect(posView).toMatch(/result\.payTotal != null/);
  });
  it('ไม่มีการเรียกพิมพ์/ใบเสร็จความร้อนในเส้นทางนี้เลย', () => {
    expect(cmp).not.toMatch(/window\.print\(/);
    expect(cmp).not.toMatch(/PosReceipt80/);
    expect(cmp).not.toMatch(/setPosPrintPageSize/);
  });
  it('ใช้ inline style ล้วน ไม่พึ่ง CSS ใน HTML (บทเรียนข้อ 15: HTML เก่า + jsx ใหม่ = จอไม่มีสไตล์)', () => {
    expect(cmp).not.toMatch(/className="(?!no-print)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔎 checkSaleBillInZort — เครื่องมือตรวจ "ทำไม ZORT ขึ้นมูลค่า 0"
// ⚠️ GAS editor **ส่ง argument ไม่ได้** → กดรันจาก dropdown จะได้ number = undefined เสมอ
//    ซึ่งเป็นทางเดียวที่เจ้าของรันตัวนี้จริง ๆ · ถ้าไม่รองรับเคสไม่มี argument = เครื่องมือ
//    ที่มองเห็นใน dropdown แต่กดแล้วได้แต่ข้อความบอกให้ใส่เลขที่ใส่ไม่ได้ (หลักเดียวกับ
//    listCategoryBreakdown() ที่บังคับไว้แล้วว่าต้องทำงานได้เมื่อไม่มี argument)
// ─────────────────────────────────────────────────────────────────────────────
describe('checkSaleBillInZort — เจ้าของกดรันจาก dropdown ได้จริง (ไม่ต้องใส่ argument)', () => {
  const SRC_LATEST = grab(GS, /function latestSaleBillNumber_\(\) \{[\s\S]*?\n\}/, 'latestSaleBillNumber_');

  function runLatest(rows) {
    const calls = [];
    const logs = [];
    const sheet = {
      getLastRow: () => rows.length + 1,                    // +1 = แถวหัวคอลัมน์
      getRange: (r, c, nr, nc) => {
        calls.push({ r, c, nr, nc });
        const out = [];
        for (let i = 0; i < nr; i++) out.push([rows[r - 2 + i]]);
        return { getValues: () => out };
      },
      getDataRange: () => { throw new Error('ห้ามอ่านทั้งใบ — ชีตบิลขายโต 1 แถวต่อ 1 บิล'); },
    };
    const SpreadsheetApp = { openById: () => ({ getSheetByName: () => sheet }) };
    const Logger = { log: (m) => logs.push(String(m)) };
    // eslint-disable-next-line no-new-func
    const fn = new Function('SpreadsheetApp', 'Logger', 'SHEET_ID', 'SHEET_SALE_BILLS',
      SRC_LATEST + '\nreturn latestSaleBillNumber_();');
    return { val: fn(SpreadsheetApp, Logger, 'sid', 'บิลขาย'), calls, logs };
  }

  it('คืนเลขบิลล่าสุด (แถวท้ายสุดของชีต)', () => {
    expect(runLatest(['RC-202608001', 'RC-202608007']).val).toBe('RC-202608007');
  });

  it('แถวท้ายเลขบิลว่าง → ไล่ขึ้นไปหาตัวที่มีจริง ไม่คืนค่าว่าง', () => {
    expect(runLatest(['RC-202608001', 'RC-202608007', '', '  ']).val).toBe('RC-202608007');
  });

  it('ชีตว่าง/มีแต่หัวคอลัมน์ → คืน "" เฉย ๆ ไม่ throw', () => {
    expect(runLatest([]).val).toBe('');
  });

  it('อ่าน "คอลัมน์ D คอลัมน์เดียว" ไม่ใช่ทั้งแถว (เลขบิลอยู่ D)', () => {
    const { calls } = runLatest(['RC-1', 'RC-2']);
    expect(calls.length).toBe(1);
    expect(calls[0].c).toBe(4);
    expect(calls[0].nc).toBe(1);
  });

  it('ชีตใหญ่ → อ่านแค่ ~200 แถวท้าย ไม่ getDataRange ทั้งใบ', () => {
    const rows = Array.from({ length: 500 }, (_, i) => 'RC-' + i);
    const { val, calls } = runLatest(rows);
    expect(val).toBe('RC-499');
    expect(calls[0].nr).toBe(200);          // ไม่ใช่ 500
    expect(calls[0].r).toBe(302);           // เริ่มที่แถวท้าย ๆ ไม่ใช่แถว 2
  });

  it('meta — ไม่มี argument แล้วต้องไปหาบิลล่าสุด "ก่อน" ขึ้นข้อความให้ใส่เลข', () => {
    const fn = grab(GS, /function checkSaleBillInZort\(number\) \{[\s\S]*?\n\}\n/, 'checkSaleBillInZort');
    const iLatest = fn.indexOf('latestSaleBillNumber_()');
    const iErr = fn.indexOf('❌ ใส่เลขบิลด้วย');
    expect(iLatest).toBeGreaterThan(-1);
    expect(iErr).toBeGreaterThan(-1);
    // หาบิลล่าสุดต้องมาก่อน — สลับลำดับ = กดจาก dropdown แล้วได้แต่ข้อความที่ทำตามไม่ได้
    expect(iLatest).toBeLessThan(iErr);
  });

  it('meta — ยังเป็น READ-ONLY (ห้ามเขียน/สร้างชีตในเครื่องมือวินิจฉัย)', () => {
    const fn = grab(GS, /function checkSaleBillInZort\(number\) \{[\s\S]*?\n\}\n/, 'checkSaleBillInZort');
    expect(fn).not.toMatch(/setValue|appendRow|insertSheet|deleteRow|getOrCreateSheet_/);
    expect(SRC_LATEST).not.toMatch(/setValue|appendRow|insertSheet|deleteRow|getOrCreateSheet_/);
  });

  it('meta — ชื่อไม่มี "_" ต่อท้าย จึงโผล่ใน dropdown (บทเรียนข้อ 1)', () => {
    expect(GS).toMatch(/^function checkSaleBillInZort\(/m);
    expect(GS).not.toMatch(/^function checkSaleBillInZort_\(/m);
  });
});
