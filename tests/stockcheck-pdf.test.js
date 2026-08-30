// tests/stockcheck-pdf.test.js — ปุ่ม "📥 ดาวน์โหลด PDF" ต่อการ์ดคำขอเช็คสต็อก (TrackingView, ส.ค. 2026)
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน tracking-batch.test.js/stockcheck-split.test.js: **ไม่ copy โค้ดเข้า helpers.js**
// แต่ eval ฟังก์ชันจริงจาก views-analytics.jsx เพราะเป็นตัวตัดสินว่า PDF ของแต่ละคำขอมีสินค้า
// ครบ/ตรงตัวไหม — สำเนา drift แล้วเทสต์เขียวทั้งที่ PDF จริงพัง/ปนกันข้ามคำขอไม่มี error ให้เห็น
//
// สิ่งที่คุมไว้:
//   1. checkReqPdfItems — ใช้เฉพาะ SKU ที่ส่งเข้ามา, คืน product จริงจาก catalog เมื่อเจอ,
//      ประกอบ object ย่อ (ไม่ทิ้ง) เมื่อ SKU หลุดจาก catalog แล้ว, กรอง SKU ว่างทิ้ง
//   2. meta: ปุ่มอยู่ใน TrackingView, ใช้ downloadSupplierCardsPdf ตัวเดียวกับหน้า "สินค้า & สั่ง"
//      (ไม่มี PDF engine ใหม่), ส่ง cp.skus/cp.namesBySku ของการ์ดนั้นเอง (ไม่ปนข้ามคำขอ)
//   3. meta: checkProgress ผูก skus/namesBySku ต่อคำขอ (ไม่ใช่ list รวมกอง)
//   4. meta: gate เดิม (isCheckTracker) ไม่ถูกแตะ — ปุ่มสืบสิทธิ์ตามหน้า Track Status เดิม
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

function codeOnly(s) {
  return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// ── ฟังก์ชันจริงจาก .jsx ─────────────────────────────────────────────────────
const F_ITEMS = grab(VA, /function checkReqPdfItems\(skus, namesBySku, productMap\) \{[\s\S]*?\n\}/);
// eslint-disable-next-line no-new-func
const { checkReqPdfItems } = new Function(`${F_ITEMS}\nreturn { checkReqPdfItems };`)();

describe('checkReqPdfItems — สินค้าไว้พิมพ์ PDF ของคำขอเช็คสต็อก 1 ใบ', () => {
  it('คืน product จริงจาก catalog เมื่อ SKU เจอ (ตรงตัวพิมพ์ใหญ่-เล็ก)', () => {
    const productMap = {
      A001: { sku: 'A001', name: 'กุหลาบแดง', imageUrl: 'https://x/a.jpg' },
      A002: { sku: 'A002', name: 'กุหลาบขาว', imageUrl: 'https://x/b.jpg' },
    };
    const items = checkReqPdfItems(['A001', 'A002'], {}, productMap);
    expect(items).toEqual([productMap.A001, productMap.A002]);
  });

  it('SKU ไม่เจอใน catalog → ประกอบ object ย่อจากชื่อที่บันทึกไว้ ไม่ทิ้ง', () => {
    const items = checkReqPdfItems(['GONE01'], { GONE01: 'ของที่ถูกลบ' }, {});
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sku: 'GONE01', name: 'ของที่ถูกลบ', qtyWH: 0, qtyStore: 0 });
  });

  it('SKU ไม่เจอ + ไม่มีชื่อบันทึกไว้ → ใช้ SKU เป็นชื่อ (ยังไม่ใช่กล่องว่างเปล่า)', () => {
    const items = checkReqPdfItems(['GONE02'], {}, {});
    expect(items[0].name).toBe('GONE02');
  });

  it('เทียบด้วย SKU แบบ trim+uppercase เมื่อ SKU ตรงตัวไม่เจอ (เหมือนจุดอื่นในไฟล์)', () => {
    const productMap = { A001: { sku: 'A001', name: 'กุหลาบแดง' } };
    const items = checkReqPdfItems([' a001 '], {}, productMap);
    // ' a001 ' ตรงตัวไม่เจอ → คีย์ uppercase 'A001' เจอ → ต้องได้ product จริง ไม่ใช่ fallback
    expect(items[0]).toBe(productMap.A001);
  });

  it('กรอง SKU ว่าง/undefined ทิ้ง', () => {
    const items = checkReqPdfItems(['A001', '', null, undefined], {}, { A001: { sku: 'A001', name: 'x' } });
    expect(items).toHaveLength(1);
    expect(items[0].sku).toBe('A001');
  });

  it('skus ว่าง/ไม่ใช่ array → คืน array ว่าง ไม่ throw', () => {
    expect(checkReqPdfItems([], {}, {})).toEqual([]);
    expect(checkReqPdfItems(undefined, {}, {})).toEqual([]);
    expect(checkReqPdfItems(null, {}, {})).toEqual([]);
  });

  it('⚠️ ไม่ปนสินค้าที่ไม่ได้อยู่ใน skus ที่ส่งมา (แต่ละคำขอต้องได้ของตัวเองเท่านั้น)', () => {
    const productMap = {
      A001: { sku: 'A001', name: 'ของคำขอ A' },
      B001: { sku: 'B001', name: 'ของคำขอ B' },
    };
    const items = checkReqPdfItems(['A001'], {}, productMap);
    expect(items.map(p => p.sku)).toEqual(['A001']);
    expect(items.map(p => p.sku)).not.toContain('B001');
  });
});

describe('meta — จุดเชื่อมต่อปุ่มดาวน์โหลด PDF ในการ์ดคำขอเช็คสต็อก', () => {
  const view = codeOnly(grab(VA, /function TrackingView\(\{ data, role \}\) \{[\s\S]*?\n\}\n/));

  it('ใช้ downloadSupplierCardsPdf ตัวเดียวกับหน้า "สินค้า & สั่ง" — ไม่มี PDF engine ใหม่', () => {
    expect(view).toMatch(/downloadSupplierCardsPdf\(/);
  });

  it('เรียก checkReqPdfItems ด้วยข้อมูลของการ์ดนั้นเอง (cp.skus / cp.namesBySku) ไม่ใช่ก้อนรวม', () => {
    expect(view).toMatch(/checkReqPdfItems\(cp\.skus,\s*cp\.namesBySku,\s*productMap\)/);
  });

  it('ปุ่มอยู่ในลูป checkProgress.map(cp => ...) — เจนต่อการ์ด ไม่ใช่ปุ่มเดียวรวมทุกคำขอ', () => {
    expect(view).toMatch(/checkProgress\.map\(cp\s*=>/);
    const loopIdx = view.indexOf('checkProgress.map(cp =>');
    const btnIdx = view.indexOf('downloadSupplierCardsPdf(');
    expect(loopIdx).toBeGreaterThan(-1);
    expect(btnIdx).toBeGreaterThan(loopIdx); // ปุ่มต้องอยู่ข้างในลูป ไม่ใช่ก่อนลูป
  });

  it('ซ่อนปุ่มเมื่อคำขอนั้นไม่มี SKU เลย (กันดาวน์โหลด PDF ว่างเปล่า)', () => {
    expect(view).toMatch(/cp\.skus\.length > 0 &&/);
  });

  it('checkProgress ผูก skus/namesBySku เข้ากับคำขอแต่ละใบ (ไม่ใช่ list กองรวม)', () => {
    expect(view).toMatch(/skus:\s*skusSorted,\s*namesBySku/);
    expect(view).toMatch(/namesBySku\[s\]\s*=\s*\(req\.names \|\| \[\]\)\[i\]/);
  });

  it('⚠️ ไม่แตะ gate เดิมของ owner/saler — สิทธิ์เห็นปุ่มยังตามหน้า Track Status เดิม', () => {
    expect(view).toMatch(/const isCheckTracker = role === "owner" \|\| role === "saler";/);
  });

  it('ล้มเหลวแล้วต้องแจ้งผู้ใช้ + คืนสถานะปุ่ม (ห้ามค้างเป็น "กำลังสร้าง…" ตลอดไป)', () => {
    const btnBlock = view.slice(view.indexOf('downloadSupplierCardsPdf('), view.indexOf('downloadSupplierCardsPdf(') + 1200);
    expect(btnBlock).toMatch(/catch \(e\)/);
    expect(btnBlock).toMatch(/finally/);
    expect(btnBlock).toMatch(/setCheckPdfDl\(null\)/);
  });

  it('ห้ามเรียก res.json()/fetch ใหม่เอง — สร้าง PDF จากสินค้าที่มีอยู่แล้วใน data.products', () => {
    // downloadSupplierCardsPdf โหลดรูปผ่าน loadImgForCard เอง — ปุ่มนี้ต้องไม่ยิง endpoint ใหม่
    const btnBlock = view.slice(view.indexOf('cp.skus.length > 0'), view.indexOf('cp.skus.length > 0') + 1300);
    expect(btnBlock).not.toMatch(/dmjFetch|fetch\(/);
  });
});
