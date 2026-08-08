// tests/quote-item-image.test.js — รูปสินค้า + กดดูรายละเอียด ในหน้ากรอกเอกสาร
// ─────────────────────────────────────────────────────────────────────────────
// กติกา UI ของโปรเจกต์ (CLAUDE.md): **ทุกที่ที่แสดง "SKU + ชื่อ" ต้องมีรูปสินค้า และกดดู
// รายละเอียดได้** เพราะผู้ใช้หลักคือพนักงานที่จำสินค้าจากรูป ไม่ใช่จากรหัส
//
// ที่มา (ส.ค. 2026): เจ้าของกด "โหลดร่าง" ในหน้าสร้างใบเสนอราคา แล้ว **ทุกแถวกลายเป็น
// กล่อง 📦** ทั้งที่สินค้ามีรูปครบ · ต้นเหตุ: `buildQuotePayload` ไม่ได้เก็บ `imageUrl` ลงร่าง
// (ตั้งใจ — URL ยาว + รูปเปลี่ยนทีหลังได้) แต่ `loadDraft` เซ็ต cart จาก `d.items` ตรง ๆ
// โดยไม่หารูปคืนจาก catalog → รูปหายทั้งใบ **ไม่มี error ให้เห็นเลย**
// เส้นทาง `editQuote` ทำถูกอยู่แล้ว (หา imageUrl จาก products ตาม SKU) — หลุดแค่ทางร่าง
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUOTE = readFileSync(join(ROOT, 'views-quote.jsx'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

// eval ฟังก์ชันจริงจาก .jsx (ไม่ copy ตรรกะเข้า helpers.js — กันสำเนา drift แบบ auth.test.js)
const F_HYDRATE = grab(QUOTE, /function quoteHydrateItems_\(items, products\) \{[\s\S]*?\n\}/, 'quoteHydrateItems_');
// eslint-disable-next-line no-new-func
const { quoteHydrateItems_ } = new Function(F_HYDRATE + '\nreturn { quoteHydrateItems_ };')();

const CATALOG = [
  { sku: 'SB13006', name: 'สโนว์บอล ขาว', category: 'ดอกไม้', imageUrl: 'https://img/sb.jpg', price: 122.5 },
  { sku: 'T13001',  name: 'ทิวลิป7ดอก',   category: 'ดอกไม้', imageUrl: 'https://img/t.jpg',  price: 197.5 },
  { sku: 'NOIMG01', name: 'ของไม่มีรูป',   category: 'อุปกรณ์', imageUrl: '',                 price: 50 },
];

describe('quoteHydrateItems_ — เติมรูปคืนให้รายการที่โหลดจากร่าง', () => {
  it('ร่างที่ไม่มี imageUrl → ได้รูปคืนจาก catalog ตาม SKU', () => {
    const out = quoteHydrateItems_([{ sku: 'SB13006', name: 'สโนว์บอล ขาว', qty: 30, price: 122.5 }], CATALOG);
    expect(out[0].imageUrl).toBe('https://img/sb.jpg');
  });

  it('เทียบ SKU แบบไม่สนตัวพิมพ์/ช่องว่าง (ร่างเก่าอาจเก็บมาไม่สะอาด)', () => {
    const out = quoteHydrateItems_([{ sku: ' sb13006 ', qty: 1, price: 1 }], CATALOG);
    expect(out[0].imageUrl).toBe('https://img/sb.jpg');
  });

  it('เติมหมวดให้ด้วยเมื่อร่างไม่มี (ใช้ตัดสิน "ยกเว้นส่วนลด"/ปุ่ม MTO)', () => {
    const out = quoteHydrateItems_([{ sku: 'T13001', qty: 2, price: 197.5 }], CATALOG);
    expect(out[0].category).toBe('ดอกไม้');
  });

  // ── ข้อที่พังแล้วเจ็บที่สุด: ทับค่าที่ผู้ใช้แก้เอง ──
  it('ห้ามทับ "ราคา" ที่ผู้ใช้ตั้งไว้ในร่าง แม้ catalog จะมีราคาอื่น', () => {
    const out = quoteHydrateItems_([{ sku: 'SB13006', name: 'x', qty: 30, price: 99 }], CATALOG);
    expect(out[0].price).toBe(99);            // ไม่ใช่ 122.5 จาก catalog
  });

  it('ห้ามทับ "ชื่อ" ที่ผู้ใช้แก้เอง (ใบเสนอราคาแก้ชื่อได้ เผื่อ MTO)', () => {
    const out = quoteHydrateItems_([{ sku: 'SB13006', name: 'ชื่อที่ลูกค้าขอ', qty: 1, price: 1 }], CATALOG);
    expect(out[0].name).toBe('ชื่อที่ลูกค้าขอ');
  });

  it('ห้ามทับ "จำนวน" ที่ผู้ใช้กรอก', () => {
    const out = quoteHydrateItems_([{ sku: 'T13001', qty: 17, price: 310 }], CATALOG);
    expect(out[0].qty).toBe(17);
  });

  it('ห้ามทับ imageUrl ที่ร่างมีอยู่แล้ว (ร่างใหม่กว่าอาจเก็บมา)', () => {
    const out = quoteHydrateItems_([{ sku: 'SB13006', imageUrl: 'https://img/เดิม.jpg', qty: 1, price: 1 }], CATALOG);
    expect(out[0].imageUrl).toBe('https://img/เดิม.jpg');
  });

  // ── ของที่หาไม่เจอ ต้องไม่หายไปจากใบ ──
  it('SKU ที่ไม่มีใน catalog แล้ว → คงรายการไว้ ไม่ตัดทิ้ง', () => {
    const out = quoteHydrateItems_([{ sku: 'GONE999', name: 'ของเลิกขาย', qty: 5, price: 20 }], CATALOG);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('ของเลิกขาย');
    expect(out[0].qty).toBe(5);
  });

  it('สินค้าที่ catalog ไม่มีรูป → imageUrl ว่าง (ไปโชว์ placeholder 📦 ต่อ ไม่ใช่ undefined)', () => {
    const out = quoteHydrateItems_([{ sku: 'NOIMG01', qty: 1, price: 50 }], CATALOG);
    expect(out[0].imageUrl).toBe('');
  });

  it('รับ items ที่ไม่ใช่ array (ร่างเสีย) → คืน [] ไม่ throw', () => {
    expect(quoteHydrateItems_(null, CATALOG)).toEqual([]);
    expect(quoteHydrateItems_(undefined, CATALOG)).toEqual([]);
  });

  it('ไม่มี products (ข้อมูลยังโหลดไม่เสร็จ) → คืนรายการเดิมครบ ไม่ throw', () => {
    const items = [{ sku: 'SB13006', name: 'a', qty: 1, price: 1 }];
    expect(quoteHydrateItems_(items, null)).toHaveLength(1);
    expect(quoteHydrateItems_(items, [])).toHaveLength(1);
  });

  it('ไม่แก้ object เดิม (ไม่ mutate ของที่ React ถืออยู่)', () => {
    const items = [{ sku: 'SB13006', qty: 1, price: 1 }];
    quoteHydrateItems_(items, CATALOG);
    expect(items[0].imageUrl).toBeUndefined();
  });
});

// ── จุดเชื่อมต่อ: พังแล้วเทสต์ข้างบนยังเขียวหมด ──
describe('meta — loadDraft ต้องเรียกตัวเติมรูปจริง', () => {
  it('loadDraft เซ็ต cart ผ่าน quoteHydrateItems_ ไม่ใช่ d.items ตรง ๆ', () => {
    const fn = grab(QUOTE, /function loadDraft\(d\) \{[\s\S]*?\n  \}/, 'loadDraft');
    expect(fn).toMatch(/setCart\(quoteHydrateItems_\(d\.items, products\)\)/);
    expect(fn).not.toMatch(/setCart\(Array\.isArray\(d\.items\)/);   // รูปแบบเดิมที่ทำรูปหาย
  });

  it('buildQuotePayload ยังไม่เก็บ imageUrl ลงร่าง (ตั้งใจ — ตัวเติมรูปจึงจำเป็น)', () => {
    const fn = grab(QUOTE, /function buildQuotePayload\(\) \{[\s\S]*?\n  \}/, 'buildQuotePayload');
    expect(fn).not.toMatch(/imageUrl/);
  });

  it('เส้นทาง editQuote ยังหารูปจาก catalog เหมือนเดิม', () => {
    expect(QUOTE).toMatch(/imageUrl: \(p && p\.imageUrl\) \|\| ""/);
  });
});

describe('meta — กดดูรายละเอียดได้ทั้ง 2 หน้าเอกสาร', () => {
  it('ใบเสนอราคา: แถวสินค้ากดเปิดรายละเอียดได้ + มี ProductModal', () => {
    expect(QUOTE).toMatch(/onClick=\{\(\) => setDetailSku\(it\.sku\)\}/);
    expect(QUOTE).toMatch(/<ProductModal p=\{detailProduct\} onClose=\{\(\) => setDetailSku\(null\)\}/);
  });

  it('POS (ออกบิล): แถวสินค้ากดเปิดรายละเอียดได้ + มี ProductModal', () => {
    expect(VANA).toMatch(/onClick=\{\(\) => setDetailSku\(it\.sku\)\}/);
    expect(VANA).toMatch(/<ProductModal p=\{detailProduct\} onClose=\{\(\) => setDetailSku\(null\)\}/);
  });

  it('ทั้ง 2 หน้าเก็บเป็น sku ไม่ใช่ product object (กันค้างค่าเก่าเมื่อ products อัปเดต)', () => {
    expect(QUOTE).toMatch(/const \[detailSku, setDetailSku\] = uS\(null\)/);
    expect(VANA).toMatch(/const \[detailSku, setDetailSku\] = uS\(null\)/);
  });

  it('หา product จาก catalog ก่อน แล้วค่อย fallback เป็นรายการในใบ (SKU ที่ถูกลบไปแล้ว)', () => {
    [QUOTE, VANA].forEach(src => {
      const fn = grab(src, /const detailProduct = uM\(\(\) => \{[\s\S]*?\}, \[detailSku, products, cart\]\);/, 'detailProduct');
      expect(fn).toMatch(/products\.find/);
      expect(fn).toMatch(/cart\.find/);
      expect(fn).toMatch(/cat: it\.category/);   // ProductModal อ่าน p.cat ไม่ใช่ p.category
    });
  });
});

// ── หน้าพิมพ์ป้าย: เดิมโชว์แต่ SKU+ชื่อ ไม่มีรูปเลย (ผิดกติกาชัดที่สุดในบรรดาหน้ารายการสินค้า) ──
describe('meta — หน้าพิมพ์ป้าย (LabelPrintView) ต้องมีรูป + กดดูรายละเอียด', () => {
  const fn = grab(VANA, /function LabelPrintView\(\{[\s\S]*?\n\}/, 'LabelPrintView');

  it('แถว "รายการที่จะพิมพ์" มี thumbnail (ไม่ใช่โชว์แต่รหัส+ชื่อ)', () => {
    expect(fn).toMatch(/p\?\.imageUrl\s*\n?\s*\?\s*<img/);
  });

  it('ไม่มีรูป → placeholder 📦 ขนาดเท่ากัน ห้ามปล่อยว่าง', () => {
    expect(fn).toMatch(/📦/);
  });

  it('กดแถว/รูปแล้วเปิด ProductModal ได้', () => {
    expect(fn).toMatch(/onClick=\{\(\) => p && setDetailSku\(item\.sku\)\}/);
    expect(fn).toMatch(/<ProductModal p=\{detailProduct\} onClose=\{\(\) => setDetailSku\(null\)\}/);
  });

  it('ช่องจำนวนใบ (พรีฟิลค่าไว้) select ตอนแตะ — บทเรียนข้อ 14', () => {
    expect(fn).toMatch(/value=\{item\.qty\}[^]*?onFocus=\{e => e\.target\.select\(\)\}/);
  });
});
