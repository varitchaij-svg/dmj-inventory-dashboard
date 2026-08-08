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
const { POS_UNPAID_METHODS_, shippingRemark_, SALE_BILL_HEADERS_, appendSaleBillRow_ } = (() => {
  const parts = [
    grab(GS, /var POS_UNPAID_METHODS_ = \[[^\]]*\];/, 'POS_UNPAID_METHODS_'),
    grab(GS, /function shippingRemark_\(shipping, shipInZort\) \{[\s\S]*?\n\}/, 'shippingRemark_'),
    grab(GS, /var SALE_BILL_HEADERS_ = \[[\s\S]*?\n\];/, 'SALE_BILL_HEADERS_'),
    grab(GS, /function saleBillsSheet_\(ss\) \{[\s\S]*?\n\}/, 'saleBillsSheet_'),
    grab(GS, /function saleBillNextId_\(sh, dateStr\) \{[\s\S]*?\n\}/, 'saleBillNextId_'),
    grab(GS, /function appendSaleBillRow_\(ss, rec\) \{[\s\S]*?\n\}/, 'appendSaleBillRow_'),
  ];
  // eslint-disable-next-line no-new-func
  return new Function('getOrCreateSheet_', 'Utilities', 'Logger', 'SHEET_SALE_BILLS',
    parts.join('\n') +
    '\nreturn { POS_UNPAID_METHODS_, shippingRemark_, SALE_BILL_HEADERS_, appendSaleBillRow_ };'
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
    expect(SALE_BILL_HEADERS_.slice(22)).toEqual([
      'ค่าจัดส่ง', 'ยอดเก็บลูกค้า', 'ขนส่ง', 'เลขพัสดุ', 'ผู้รับ', 'ที่อยู่จัดส่ง', 'โหมดขาย',
    ]);
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
    expect(fn).toMatch(/zortOrderTotal[\s\S]{0,120}shipInZort \? shipFee : 0/);
    expect(fn).toMatch(/paymentamount: zortOrderTotal/);
  });
  it('คืน shipFee/payTotal กลับไปให้ frontend ใช้โชว์บนสรุปของลูกค้า', () => {
    expect(fn).toMatch(/shipFee: shipFee, payTotal: payTotal/);
  });
  it('นับจำนวนรายการ/ชิ้นจาก productList (ไม่นับบรรทัดค่าจัดส่งเป็นสินค้าที่ขายได้)', () => {
    expect(fn).toMatch(/lineCount: productList\.length/);
    expect(fn).toMatch(/unitCount: productList\.reduce/);
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
