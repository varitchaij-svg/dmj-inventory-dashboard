// tests/stockcount-product-first.test.js — Product-first Stock Count UX (นับตามสินค้า = DEFAULT)
// ─────────────────────────────────────────────────────────────────────────────
// ครอบ UX ที่เพิ่มใน StockCountView (views-analytics.jsx): โหมด product-first เป็น default,
// data-visibility (ทุก SKU non-hidden เข้าถึงได้แม้ qtyWH=0 / ไม่มี location / supplier / category),
// filter (location/ซอย/ชั้น/ไม่มีตำแหน่ง/stock=0/หมวด/ไม่มีหมวด), pagination 24/หน้า, session,
// checkRequest scope — และ **การ์ดยันว่า R1 save engine ไม่ถูกแตะ**.
//
// **ไม่ copy โค้ด** — eval นิพจน์/บล็อกจริงจาก .jsx (หลักเดียวกับ auth.test.js / stockcount-r1-merge.test.js)
// ต้นทาง drift = เทสต์พังทันที ไม่เขียวลวง
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compareSku } from './helpers.js';

const ROOT  = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA  = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const VMAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// whQty ตัวจริงจาก views-main.jsx (pure) — eval มาใช้ ไม่ copy
const whQty = (() => {
  const src = grab(VMAIN, /function whQty\(p\) \{[\s\S]*?\n\}/);
  // eslint-disable-next-line no-new-func
  return new Function(src + '; return whQty;')();
})();

// ═══════════════════════════════════════════════════════════════════════════
// pfList filter — eval บล็อก memo จริงจาก .jsx (ตัวตัดสิน data-visibility)
// ═══════════════════════════════════════════════════════════════════════════
describe('pfList — data visibility + filters (eval บล็อกจริงจาก .jsx)', () => {
  // จับ arrow ของ memo: uM(() => { ... }, [products, pfSearch, ...]) — เอาเฉพาะ arrow (group 1)
  const arrowSrc = (() => {
    const m = VANA.match(/const pfList = uM\((\(\) => \{[\s\S]*?\n  \}), \[products, pfSearch/);
    if (!m) throw new Error('หา pfList memo ในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?)');
    return m[1];
  })();
  // wrap: params = closures ที่ arrow อ้าง → nested arrow ปิดทับได้ (products/whQty/compareSku/pfLockOf/filters)
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'products', 'whQty', 'compareSku', 'pfLockOf', 'pfSearch', 'pfLoc', 'pfShelf', 'pfCat', 'pfStockZero',
    'return (' + arrowSrc + ')();'
  );

  // fixture ครอบ edge cases ทุกแบบที่ requirement บังคับ
  const P = [
    { sku: 'VAS001', name: 'แจกันแก้วใส',  cat: 'แจกันแก้ว', vendor: 'ACME',  qtyWH: 25, isMTO: false }, // lock A1/5
    { sku: 'FLW002', name: 'ดอกไม้แดง',    cat: 'ดอกไม้',    vendor: 'BLOOM', qtyWH: 5,  isMTO: false }, // lock A0 (floor)
    { sku: 'DEC003', name: 'ของตกแต่ง',    cat: '',          vendor: '',      qtyWH: 20, isMTO: false }, // ไม่มี loc/cat/vendor
    { sku: 'ZERO04', name: 'ของหมดคลัง',   cat: 'อุปกรณ์',   vendor: 'X',     qtyWH: 0,  isMTO: false }, // qty=0
    { sku: 'MTO900', name: 'งานพิเศษ',     cat: 'งานพิเศษ',  vendor: '',      qtyWH: 0,  isMTO: true  }, // MTO → ตัด
  ];
  const lockMap = { VAS001: 'A1/5', FLW002: 'A0' }; // DEC003/ZERO04/MTO900 ไม่มีล็อค
  const pfLockOf = (sku) => lockMap[sku] || null;
  const run = (opts = {}) => fn(
    P, whQty, compareSku, pfLockOf,
    opts.pfSearch || '', opts.pfLoc || 'all', opts.pfShelf || '',
    opts.pfCat || '__all__', !!opts.pfStockZero
  ).map(p => p.sku);

  it('bucket "ทั้งหมด" — เห็นทุก SKU non-MTO (แม้ไม่มี loc/supplier/category/qty=0) · MTO ถูกตัด', () => {
    const out = run();
    expect(out).toContain('VAS001');
    expect(out).toContain('FLW002');
    expect(out).toContain('DEC003');  // ไม่มี location + ไม่มี supplier + ไม่มี category
    expect(out).toContain('ZERO04');  // qtyWH = 0
    expect(out).not.toContain('MTO900'); // MTO ไม่ใช่ physical stock
  });

  it('SKU ไม่มี supplier ต้องไม่หาย (supplier ไม่ใช่ filter)', () => {
    expect(run()).toContain('DEC003');
  });

  it('SKU ไม่มี category ต้องไม่หาย ใน bucket ทั้งหมด', () => {
    expect(run()).toContain('DEC003');
  });

  it('filter stock=0 → เฉพาะ qtyWH === 0', () => {
    expect(run({ pfStockZero: true })).toEqual(['ZERO04']);
  });

  it('filter ไม่มีตำแหน่ง → เฉพาะ SKU ที่ไม่มีล็อค (รวม qty=0 · ไม่รวมของมีล็อค)', () => {
    const out = run({ pfLoc: 'noloc' });
    expect(out).toContain('DEC003');
    expect(out).toContain('ZERO04');
    expect(out).not.toContain('VAS001');
    expect(out).not.toContain('FLW002');
  });

  it('filter ซอย A → เฉพาะ SKU ฝั่ง A (VAS001=A1/5, FLW002=A0)', () => {
    const out = run({ pfLoc: 'A' });
    expect(out).toContain('VAS001');
    expect(out).toContain('FLW002');
    expect(out).not.toContain('DEC003');
  });

  it('filter ซอย A + ชั้น A1 → เฉพาะล็อคที่ชั้น A1 (A0 ถูกตัด)', () => {
    expect(run({ pfLoc: 'A', pfShelf: 'A1' })).toEqual(['VAS001']);
  });

  it('filter ไม่มีหมวด (__none__) → เฉพาะ category ว่าง', () => {
    expect(run({ pfCat: '__none__' })).toEqual(['DEC003']);
  });

  it('filter หมวดจริง → เฉพาะหมวดนั้น', () => {
    expect(run({ pfCat: 'ดอกไม้' })).toEqual(['FLW002']);
  });

  it('search SKU (= barcode) หาเจอ', () => {
    expect(run({ pfSearch: 'DEC003' })).toEqual(['DEC003']);
  });

  it('search ชื่อสินค้า (multi-token AND) หาเจอ', () => {
    expect(run({ pfSearch: 'ของ ตกแต่ง' })).toEqual(['DEC003']);
  });

  it('search + filter ผสมกัน (ยังกรองถูก ไม่ทำ SKU หายเกิน)', () => {
    // ค้น "ของ" ในโหมด stock=0 → DEC003(ของตกแต่ง) มี qty>0 จึงหลุด, ZERO04(ของหมดคลัง) qty=0 คงอยู่
    expect(run({ pfSearch: 'ของ', pfStockZero: true })).toEqual(['ZERO04']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// pagination — eval นิพจน์ slice จริง
// ═══════════════════════════════════════════════════════════════════════════
describe('pagination — 24/หน้า, render เฉพาะหน้าปัจจุบัน', () => {
  it('PF_PAGE_SIZE = 24', () => {
    expect(VANA).toMatch(/const PF_PAGE_SIZE = 24;/);
  });

  it('pfVisible slice นิพจน์จริง — page1=24, page2=ที่เหลือ', () => {
    const sliceSrc = grab(VANA, /pfList\.slice\(\(pfPage - 1\) \* PF_PAGE_SIZE, pfPage \* PF_PAGE_SIZE\)/);
    // eslint-disable-next-line no-new-func
    const fn = new Function('pfList', 'pfPage', 'PF_PAGE_SIZE', 'return ' + sliceSrc + ';');
    const list = Array.from({ length: 30 }, (_, i) => i);
    expect(fn(list, 1, 24).length).toBe(24);
    expect(fn(list, 2, 24)).toEqual([24, 25, 26, 27, 28, 29]);
  });

  it('reset หน้าเมื่อ search/filter เปลี่ยน (effect setPfPage(1))', () => {
    expect(VANA).toMatch(/uE\(\(\) => \{ setPfPage\(1\); \}, \[pfSearch, pfLoc, pfShelf, pfCat, pfStockZero\]\);/);
  });

  it('ใช้ Pagination component เดิม (ไม่เพิ่ม virtualization lib)', () => {
    expect(VANA).toMatch(/<Pagination page=\{pfPage\} total=\{pfList\.length\} pageSize=\{PF_PAGE_SIZE\}/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// meta — โครงสร้าง UX + save engine ไม่ถูกแตะ (R1 preserved by construction)
// ═══════════════════════════════════════════════════════════════════════════
describe('meta — product-first เป็น default + save เดินผ่าน handleSave เดิม', () => {
  it('viewMode default = "product"', () => {
    expect(VANA).toMatch(/const \[viewMode, setViewMode\]\s*=\s*uS\('product'\)/);
  });

  it('มี render block product-first (if viewMode === "product")', () => {
    expect(VANA).toMatch(/if \(viewMode === 'product'\) \{/);
  });

  it('product-first save เรียก handleSave เดิม (ไม่มี save handler ใหม่)', () => {
    // ปุ่มบันทึกในบล็อก product-first
    expect(VANA).toMatch(/onClick=\{\(\) => handleSave\(\)\} disabled=\{saving\|\|pfUnsaved===0\}/);
  });

  it('confirmStockCount call site ยัง = 3 (ไม่มี call ที่ 4 จาก product-first)', () => {
    const n = (VANA.match(/[^.]confirmStockCount\((?:confirmEntries|entries), sessionIdRef\.current\)/g) || []).length;
    expect(n).toBe(3);
  });

  it('R1 filter ยัง = 3 จุด · ไม่มี localEditsRef.clear', () => {
    const n = (VANA.match(/\.filter\(e => e\.qty !== savedQtys\[e\.sku\]\)/g) || []).length;
    expect(n).toBe(3);
    expect(VANA.includes('localEditsRef.current.clear()')).toBe(false);
  });

  it('pfList ตัด MTO (!p.isMTO)', () => {
    expect(VANA).toMatch(/\.filter\(p => p && p\.sku && !p\.isMTO\)/);
  });

  it('มี bucket เข้าถึงของไม่มี metadata: noloc / __none__ / stock=0', () => {
    expect(VANA).toMatch(/pfLoc === 'noloc'/);
    expect(VANA).toMatch(/pfCat === '__none__'/);
    expect(VANA).toMatch(/pfStockZero && whQty\(p\) !== 0/);
  });

  it('การ์ด product-first แสดง "ไม่มีตำแหน่ง" เมื่อไม่มีล็อค', () => {
    // อยู่ในบล็อก product-first (หลัง if viewMode === 'product')
    const block = VANA.slice(VANA.indexOf("if (viewMode === 'product') {"));
    expect(block).toMatch(/ไม่มีตำแหน่ง/);
    expect(block).toMatch(/const lockKey = pfLockOf\(p\.sku\);/);
  });
});

describe('meta — session lifecycle', () => {
  it('มี product session (startStockCountSession ... "product")', () => {
    expect(VANA).toMatch(/startStockCountSession\(id, 'product', 'product', 'นับตามสินค้า', null\)/);
  });

  it('product session gated: viewMode!=="product" || preShelfMode || supplierMode || selLockKey || selSupplier → return (กัน session ซ้อน)', () => {
    expect(VANA).toMatch(/if \(viewMode !== 'product' \|\| preShelfMode \|\| supplierMode \|\| selLockKey \|\| selSupplier\) return;/);
  });

  it('sku ที่นับผูกกับ session ผ่าน handleSave เดิม (confirmAll.forEach → sessionSkuSetRef) — ยังอยู่', () => {
    expect(VANA).toMatch(/confirmAll\.forEach\(e => sessionSkuSetRef\.current\.add/);
  });
});

describe('meta — checkRequest scope + finishCheck ในโหมด product-first', () => {
  it('product-first อ้าง checkRequest + finishCheck (ไม่ bypass)', () => {
    const block = VANA.slice(VANA.indexOf("if (viewMode === 'product') {"),
                             VANA.indexOf('// ── STEP 1: เลือกชั้น'));
    expect(block).toMatch(/checkRequest &&/);
    expect(block).toMatch(/finishCheck\(\)/);
  });
});

describe('meta — workflow เดิมไม่ถูกลบ (location/supplier/preshelf/A0-B0/เจอในล็อค)', () => {
  it('step 1/2/3 ยังอยู่', () => {
    expect(VANA).toMatch(/\/\/ ── STEP 1: เลือกชั้น/);
    expect(VANA).toMatch(/\/\/ ── STEP 2: เลือกล็อค/);
    expect(VANA).toMatch(/\/\/ ── STEP 3: นับสินค้า/);
  });
  it('supplier mode + pre-shelf mode ยังอยู่', () => {
    expect(VANA).toMatch(/if \(supplierMode\) \{/);
    expect(VANA).toMatch(/if \(preShelfMode\) \{/);
  });
  it('A0/B0 (floorLockKey) + "เจอสินค้าอื่นในล็อค" ยังอยู่', () => {
    expect(VANA).toMatch(/floorLockKey\(side\)/);
    expect(VANA).toMatch(/เจอสินค้าอื่นในล็อคนี้/);
  });
  it('มีปุ่มสลับ product ⟷ location (goProductMode/goLocationMode)', () => {
    expect(VANA).toMatch(/const goProductMode = \(\) =>/);
    expect(VANA).toMatch(/const goLocationMode = \(\) =>/);
    expect(VANA).toMatch(/onClick=\{goLocationMode\}/);
    expect(VANA).toMatch(/onClick=\{goProductMode\}/);
  });
});
