// tests/doc-item-image.test.js — หน้ากรอกเอกสาร (ใบเสนอราคา/ใบแจ้งหนี้ + POS) ต้องเห็นรูปสินค้า
// และกดดูรายละเอียดได้ ตาม UI Convention บังคับใน CLAUDE.md
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (ส.ค. 2026): เจ้าของส่งภาพหน้าจอ "📋 รายการ" ของใบเสนอราคาหลังกด "โหลดร่างแล้ว" —
// ทุกแถวเป็นกล่องเทา 📦 ไม่มีรูปสินค้าเลยสักตัว ทั้งที่สินค้าพวกนั้นมีรูปครบ
//
// ต้นเหตุ: `buildQuotePayload()` ส่งขึ้นชีตแค่ {sku,name,category,qty,price} — **ไม่มี imageUrl**
// (ถูกแล้ว รูปเป็นข้อมูล catalog ไม่ใช่ข้อมูลเอกสาร เก็บซ้ำจะค้างเก่าเมื่อเปลี่ยนรูปใน ZORT)
// แต่ `loadDraft` เดิม `setCart(d.items)` **ดิบ ๆ** → ไม่มีใครเติมรูปกลับ → 📦 ทั้งจอ
//
// ทำไมต้องมีเทสต์: พังแล้ว **ไม่มี error ให้เห็นเลย** — รายการเรนเดอร์ครบ ยอดเงินถูกทุกบาท
// กดบันทึกได้ปกติ ต่างกันแค่ "จำสินค้าไม่ได้" ซึ่งเป็นเรื่องใหญ่สำหรับพนักงานที่อ่านรหัสไม่คล่อง
// (ผู้ใช้หลักของระบบนี้) — แยกไม่ออกจาก "สินค้าพวกนี้ไม่มีรูปจริง ๆ"
//
// สิ่งที่คุมไว้:
//   1. attachCatalogInfo เติม imageUrl/หมวด จาก catalog ตาม SKU (eval ตัวจริงจาก .jsx)
//   2. ⚠️ ห้ามแตะ qty/price/name — นั่นคือสิ่งที่ผู้ใช้กรอกไว้ในร่าง (ทับเมื่อไหร่ = ยอดเงินเพี้ยน)
//   3. meta: loadDraft ต้องเรียก attachCatalogInfo ไม่ใช่ setCart(d.items) ดิบ ๆ
//   4. meta: ทั้ง 2 หน้ากรอกเอกสารต้องกดรายการแล้วเปิด ProductModal ได้ + ยัง render modal อยู่
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUOTE = readFileSync(join(ROOT, 'views-quote.jsx'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const VMAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + what);
  return m[0];
}

// ตัดคอมเมนต์ก่อนตรวจ "ต้อง/ห้ามมีแพทเทิร์นนี้" — ไม่งั้นคอมเมนต์ที่อธิบายว่าเดิมเคยพังยังไง
// จะไปทำให้เทสต์แดงเอง ทั้งที่โค้ดจริงถูกแล้ว
function codeOnly(s) {
  return String(s).split('\n').filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln)).join('\n');
}

// ── eval attachCatalogInfo ตัวจริงจาก views-quote.jsx (ไม่ copy สูตรมาไว้ในเทสต์) ──
function realAttach(products, items) {
  const fn = grab(QUOTE, /function attachCatalogInfo\(items\) \{[\s\S]*?\n {2}\}/, 'attachCatalogInfo');
  // eslint-disable-next-line no-new-func
  return new Function('products', 'items', `${fn}\nreturn attachCatalogInfo(items);`)(products, items);
}

const CATALOG = [
  { sku: 'SB13006', name: 'สโนว์บอล ขาว', imageUrl: 'https://img/sb13006.jpg', category: 'ดอกไม้', cat: 'ดอกไม้' },
  { sku: 'RT14051', name: 'แวนด้า ม่วง', imageUrl: 'https://img/rt14051.jpg', category: 'ดอกไม้', cat: 'ดอกไม้' },
  { sku: 'NOIMG01', name: 'ของไม่มีรูป', imageUrl: '', category: 'อุปกรณ์', cat: 'อุปกรณ์' },
];

describe('attachCatalogInfo — เติมรูปกลับตอนโหลดร่าง', () => {
  it('เติม imageUrl จาก catalog ตาม SKU (เคสจริงจากภาพหน้าจอ: ร่างไม่มี imageUrl เลย)', () => {
    const draftItems = [
      { sku: 'SB13006', name: 'สโนว์บอล ขาว', qty: 30, price: 122.5, category: 'ดอกไม้' },
      { sku: 'RT14051', name: 'แวนด้า ม่วง', qty: 30, price: 172.5, category: 'ดอกไม้' },
    ];
    const out = realAttach(CATALOG, draftItems);
    expect(out.map((it) => it.imageUrl)).toEqual(['https://img/sb13006.jpg', 'https://img/rt14051.jpg']);
  });

  it('⚠️ ห้ามแตะ qty/price/name — เป็นค่าที่ผู้ใช้กรอกไว้ในร่าง (ทับเมื่อไหร่ = ยอดเงินเพี้ยนเงียบ ๆ)', () => {
    // ราคาในร่าง (122.5) ต่างจากราคาตั้งใน catalog โดยตั้งใจ — ผู้ใช้ต่อรองราคาแล้ว
    const draftItems = [{ sku: 'SB13006', name: 'สโนว์บอล (ชื่อที่ลูกค้าเรียก)', qty: 17, price: 99.5, category: 'ดอกไม้' }];
    const out = realAttach([{ ...CATALOG[0], price: 250 }], draftItems);
    expect(out[0].qty).toBe(17);
    expect(out[0].price).toBe(99.5);
    expect(out[0].name).toBe('สโนว์บอล (ชื่อที่ลูกค้าเรียก)');
  });

  it('รูปที่ติดมากับร่างอยู่แล้ว ชนะ catalog (ไม่เขียนทับของที่มี)', () => {
    const out = realAttach(CATALOG, [{ sku: 'SB13006', imageUrl: 'https://img/เดิม.jpg', qty: 1, price: 1 }]);
    expect(out[0].imageUrl).toBe('https://img/เดิม.jpg');
  });

  it('SKU ที่ไม่มีใน catalog (เช่นงานจัดพิเศษตั้งชื่อเอง) ต้องไม่หายไปจากรายการ', () => {
    const out = realAttach(CATALOG, [{ sku: 'MTO-CUSTOM', name: 'จัดช่อพิเศษ', qty: 2, price: 3500 }]);
    expect(out.length).toBe(1);
    expect(out[0].sku).toBe('MTO-CUSTOM');
    expect(out[0].qty).toBe(2);
  });

  it('เทียบ SKU แบบไม่สนตัวพิมพ์เล็ก-ใหญ่/ช่องว่าง (ค่าจากชีตมี space ติดมาได้ง่าย)', () => {
    const out = realAttach(CATALOG, [{ sku: '  sb13006 ', qty: 1, price: 1 }]);
    expect(out[0].imageUrl).toBe('https://img/sb13006.jpg');
  });

  it('สินค้าที่ catalog เองก็ไม่มีรูป → imageUrl ว่าง (ไปโชว์ 📦 ตามเดิม ไม่ใช่ undefined)', () => {
    const out = realAttach(CATALOG, [{ sku: 'NOIMG01', qty: 1, price: 1 }]);
    expect(out[0].imageUrl).toBe('');
  });

  it('เติมหมวดให้ด้วยเมื่อร่างไม่มี — หมวดคุมกฎส่วนลด/MTO (isBillExcludedCat/isMtoCat)', () => {
    const out = realAttach(CATALOG, [{ sku: 'SB13006', qty: 1, price: 1 }]);
    expect(out[0].category).toBe('ดอกไม้');
  });

  it('items ว่าง/ไม่ใช่ array → คืน [] ไม่ throw (ร่างเก่าที่ไม่มี items)', () => {
    expect(realAttach(CATALOG, [])).toEqual([]);
    expect(realAttach(CATALOG, null)).toEqual([]);
    expect(realAttach(CATALOG, undefined)).toEqual([]);
  });
});

describe('meta: loadDraft ต้องเติมรูปกลับเสมอ', () => {
  it('loadDraft เรียก attachCatalogInfo — ไม่ใช่ setCart(d.items) ดิบ ๆ (ต้นเหตุเดิม)', () => {
    const fn = codeOnly(grab(QUOTE, /function loadDraft\(d\) \{[\s\S]*?\n {2}\}/, 'loadDraft'));
    expect(fn).toMatch(/setCart\(attachCatalogInfo\(d\.items\)\)/);
    expect(fn).not.toMatch(/setCart\(\s*Array\.isArray\(d\.items\)\s*\?\s*d\.items\s*:/);
  });

  it('buildQuotePayload ยังไม่ต้องเก็บ imageUrl ลงร่าง (รูปเป็นข้อมูล catalog — เก็บซ้ำจะค้างเก่า)', () => {
    const fn = codeOnly(grab(QUOTE, /function buildQuotePayload\(\) \{[\s\S]*?\n {2}\}/, 'buildQuotePayload'));
    expect(fn).not.toMatch(/imageUrl/);
  });
});

describe('meta: หน้ากรอกเอกสารต้องกดดูรายละเอียดสินค้าได้ (UI Convention บังคับ)', () => {
  it('ProductModal มีอยู่จริงใน views-main.jsx และโหลดก่อน 2 ไฟล์นี้ (global scope เดียวกัน)', () => {
    expect(VMAIN).toMatch(/function ProductModal\(\{ p, onClose, allCats \}\)/);
  });

  for (const [label, src] of [['ใบเสนอราคา/ใบแจ้งหนี้ (views-quote.jsx)', () => QUOTE],
                              ['POS ออกบิล (views-analytics.jsx)', () => VANA]]) {
    it(`${label}: มี openItemDetail ที่หยิบสินค้าตัวเต็มจาก catalog ตาม SKU`, () => {
      const fn = codeOnly(grab(src(), /function openItemDetail\(it\) \{[\s\S]*?\n {2}\}/, 'openItemDetail'));
      expect(fn).toMatch(/products\.find/);
      expect(fn).toMatch(/setModalP/);
      // ไม่เจอใน catalog ต้องยังเปิดดูได้ (ปุ่มกดแล้วเงียบ = ผู้ใช้นึกว่าแอปค้าง)
      expect(fn).toMatch(/p \|\| \{/);
    });

    it(`${label}: แถวในรายการผูก onClick เข้ากับ openItemDetail จริง`, () => {
      expect(codeOnly(src())).toMatch(/onClick=\{\(\) => openItemDetail\(it\)\}/);
    });

    it(`${label}: ยัง render <ProductModal> อยู่ (มี state แต่ไม่ render = กดแล้วไม่มีอะไรขึ้น)`, () => {
      expect(codeOnly(src())).toMatch(/\{modalP && <ProductModal p=\{modalP\} onClose=\{\(\) => setModalP\(null\)\}\/>\}/);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ปุ่มในหน้า "ติดตามใบเสนอราคา" ต้องครบเท่ากันทั้งจอแนวตั้ง (การ์ด) และแนวนอน (ตาราง)
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (ส.ค. 2026): เจ้าของเทียบภาพหน้าจอ 2 แบบแล้วเห็นว่าปุ่มไม่เท่ากัน —
//   · ใบรออนุมัติ: แนวตั้งมีแค่ อนุมัติ/ปิดใบ/🖨️ — **ขาด ✏️ แก้ไข และ 🧾 ใบแจ้งหนี้**
//   · ใบอนุมัติแล้ว: แนวตั้งมีปุ่มเดียว "🖨️ พิมพ์" — **ขาด 🧾 ใบแจ้งหนี้**
//
// ทำไมต้องมีเทสต์: `mobile ? (การ์ด) : (ตาราง)` เป็นโค้ด 2 ชุดแยกกันสนิท เพิ่มปุ่มฝั่งเดียว
// แล้วอีกฝั่งไม่ตามเป็นเรื่องปกติมาก · พังแล้ว **จอไม่มี error อะไรเลย** แค่ "ปุ่มไม่อยู่ตรงนั้น"
// ซึ่งคนใช้มือถือ (ผู้ใช้หลักของระบบนี้) แยกไม่ออกจาก "ระบบทำแบบนั้นไม่ได้"
// — เจ้าของจับได้เพราะบังเอิญเปิดจอคอมเทียบ ไม่ใช่เพราะระบบบอก
describe('meta: ปุ่มหน้าติดตามใบเสนอราคา — แนวตั้งต้องกดได้ครบเท่าแนวนอน', () => {
  // ตัดเอาเฉพาะบล็อกของแต่ละโหมด แล้วแยกฝั่ง mobile (ก่อน `) : (`) กับฝั่งตาราง
  function modeBlock(mode) {
    const re = new RegExp(`\\{mode === "${mode}" && \\([\\s\\S]*?\\n {10}\\)\\}`);
    return grab(VANA, re, `บล็อก mode="${mode}"`);
  }

  for (const [mode, needed] of [
    ['pending',  [/handleEdit\(q\)/, /handlePrint\(q, "quotation"\)/, /handlePrint\(q, "invoice"\)/,
                  /handleApprove\(q\)/, /handleVoid\(q\)/]],
    ['approved', [/handlePrint\(q, "quotation"\)/, /handlePrint\(q, "invoice"\)/]],
  ]) {
    it(`mode="${mode}": การ์ดแนวตั้งมีปุ่มครบทุกตัวที่ตารางมี`, () => {
      const block = codeOnly(modeBlock(mode));
      const split = block.indexOf('                ) : (');
      expect(split).toBeGreaterThan(0); // ต้องเจอรอยต่อ mobile/ตาราง จริง ๆ
      const mobilePart = block.slice(0, split);
      for (const re of needed) expect(mobilePart).toMatch(re);
    });
  }

  it('ไม่มี handlePrint(q) แบบไม่ระบุชนิดเอกสารเหลืออยู่ (เดิมแนวตั้งเรียกแบบนี้ = ได้ใบเสนอราคาเสมอ)', () => {
    expect(codeOnly(VANA)).not.toMatch(/handlePrint\(q\)/);
  });

  it('การ์ดแนวตั้งของใบรออนุมัติประกาศ editingThis ก่อนใช้ (ไม่งั้นจอขาวทั้งแท็บ)', () => {
    const block = codeOnly(modeBlock('pending'));
    const mobilePart = block.slice(0, block.indexOf('                ) : ('));
    expect(mobilePart).toMatch(/const editingThis = editingId === \(q\.id \|\| q\.number\)/);
  });
});
