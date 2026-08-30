// tests/stockcheck-keyword.test.js — เพิ่มวิธีเลือก SKU ด้วยการค้นชื่อสินค้า ในปุ่มลอย
// 📤 "ส่งคำขอเช็คสต็อก" (CategoryView, views-main.jsx) — Phase 1 + Phase 2 ของ
// docs/PLAN-STOCKCHECK-KEYWORD-SELECT.md (โครงตะกร้า + โหมดค้นชื่อ + union + Thai normalize)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง: "ช่วยนับ เบอร์รี่แดง / สน / คริสต์มาส / โบตั๋น / ซากุระ" — ต้องเลือก SKU ที่จะ
// ส่งไปนับได้โดยไม่ต้องรู้ Supplier · เดิมมีแค่โหมดเลือกร้านค้า (checkSuppliers)
//
// สถาปัตยกรรม Option B (Union, ล็อกแล้ว): 🏭 ร้านค้า (checkSuppliers, live-toggle, ของเดิม)
// กับ 🔍 ค้นชื่อ (checkPicked, ตะกร้าสะสม) เป็นคนละแหล่งเด็ดขาด ไม่ผสมกัน รวมกันแค่ตอนคำนวณ
// checkFinalSkus (union) ตอนกดส่งเท่านั้น — ห้ามมี provenance tracking ข้ามโหมด
//
// eval ฟังก์ชันจริงจาก views-main.jsx/ui.jsx (ไม่ copy) เหมือน tests/mto-group.test.js /
// tests/saler-fs-count.test.js · ที่เหลือเป็น meta-test สแกนต้นทางจริง (จุดที่พังแล้วเงียบ
// สำคัญกว่าตรรกะล้วน — เช่นลืม repoint dependency หรือลืม reset state)
//
// ⚠️ ไฟล์นี้ครอบ Phase 1-4 ครบแล้ว — โครงตะกร้า/union (1), ค้นชื่อ+Thai normalize (2),
// หมวด/สี (3), sourceLabel (4 — แตะ appsscript_complete.gs ด้วย ดู describe ท้ายไฟล์)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VMAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const UI = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');
const GAS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

// ตัดเอาเฉพาะตัวฟังก์ชัน (ถึง top-level function ตัวถัดไป) — เหมือน grabFn ของ
// tests/saler-fs-count.test.js
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('หาฟังก์ชันในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + name);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}

const F_MATCH = grab(
  VMAIN,
  /function checkMatchTerms\(text\) \{[\s\S]*?\n\}/,
  'checkMatchTerms'
);
// eslint-disable-next-line no-new-func
const { checkMatchTerms } = new Function(F_MATCH + '\nreturn { checkMatchTerms };')();

const F_THAIKEY = grab(UI, /function dmjThaiKey\(s\) \{[\s\S]*?\n\}/, 'dmjThaiKey');
// eslint-disable-next-line no-new-func
const { dmjThaiKey } = new Function(F_THAIKEY + '\nreturn { dmjThaiKey };')();

const CATEGORY_VIEW = grabFn(VMAIN, 'CategoryView');

// ดึง "ตัวจับคู่จริง" ของ checkKeywordResult ออกมาเป็นฟังก์ชันเรียกตรงได้ — ไม่ copy ตรรกะ แค่ตัด
// body ของ uM(() => {...}) ที่ปิดด้วย deps array ตัวเดิมมาห่อเป็นฟังก์ชันพารามิเตอร์ตัวแปรที่มันปิดไว้
// (checkKeyword/checkBase) + inject checkMatchTerms/dmjThaiKey ที่มันเรียกจริง — วิธีเดียวกับที่
// tests/mto-group.test.js ห่อฟังก์ชันจริงด้วย new Function ไม่ใช่พิมพ์ตรรกะใหม่
const F_KEYWORD_BODY = grab(
  CATEGORY_VIEW,
  /const checkKeywordResult = uM\(\(\) => \{[\s\S]*?\n  \}, \[checkKeyword, checkBase\]\);/,
  'checkKeywordResult'
).replace(/^const checkKeywordResult = uM\(\(\) => \{/, '').replace(/\n  \}, \[checkKeyword, checkBase\]\);$/, '');
const keywordMatchFn = new Function('checkKeyword', 'checkBase', 'checkMatchTerms', 'dmjThaiKey', F_KEYWORD_BODY);
function keywordMatch(checkKeyword, checkBase) {
  return keywordMatchFn(checkKeyword, checkBase, checkMatchTerms, dmjThaiKey);
}

// เดียวกับ F_KEYWORD_BODY — ห่อ body ของ checkCategoryChips/checkColorChips (Phase 3) เป็น
// ฟังก์ชันเรียกตรงได้ ไม่ copy ตรรกะ
const F_CATCHIPS_BODY = grab(
  CATEGORY_VIEW,
  /const checkCategoryChips = uM\(\(\) => \{[\s\S]*?\n  \}, \[allCats, checkBase\]\);/,
  'checkCategoryChips'
).replace(/^const checkCategoryChips = uM\(\(\) => \{/, '').replace(/\n  \}, \[allCats, checkBase\]\);$/, '');
const categoryChips = new Function('allCats', 'checkBase', F_CATCHIPS_BODY);

const F_COLORCHIPS_BODY = grab(
  CATEGORY_VIEW,
  /const checkColorChips = uM\(\(\) => \{[\s\S]*?\n  \}, \[checkBase\]\);/,
  'checkColorChips'
).replace(/^const checkColorChips = uM\(\(\) => \{/, '').replace(/\n  \}, \[checkBase\]\);$/, '');
const colorChipsFn = new Function('checkBase', 'COLOR_ORDER', F_COLORCHIPS_BODY);
function colorChips(checkBase) {
  // COLOR_ORDER ตัวจริงจาก views-main.jsx (top-level const) — ดึงมาเทียบให้ตรงลำดับจริง
  const F_COLOR_ORDER = grab(VMAIN, /const COLOR_ORDER = \[[\s\S]*?\];/, 'COLOR_ORDER');
  const order = new Function(F_COLOR_ORDER + '\nreturn COLOR_ORDER;')();
  return colorChipsFn(checkBase, order);
}

// checkFinalSkus (union จุดเดียวของทั้งระบบ) — ห่อแบบเดียวกัน เพื่อทดสอบการผสมหลายแหล่งแบบ
// end-to-end จริง (ไม่ใช่แค่ meta-test สแกน source อย่างเดียว)
const F_FINAL_BODY = grab(
  CATEGORY_VIEW,
  /const checkFinalSkus = uM\(\(\) => \{[\s\S]*?\n  \}, \[checkSupplierSkus, checkPicked, checkExcluded\]\);/,
  'checkFinalSkus'
).replace(/^const checkFinalSkus = uM\(\(\) => \{/, '').replace(/\n  \}, \[checkSupplierSkus, checkPicked, checkExcluded\]\);$/, '');
const finalSkus = new Function('checkSupplierSkus', 'checkPicked', 'checkExcluded', F_FINAL_BODY);

// ── A. checkMatchTerms — behavioral (รันฟังก์ชันจริง) ──────────────────────────
describe('checkMatchTerms — แยกข้อความค้นชื่อเป็นเทอม (OR) × token (AND)', () => {
  it('ขึ้นบรรทัดใหม่ / "," / "/" = OR ระหว่างเทอม', () => {
    expect(checkMatchTerms('เบอร์รี่แดง / สน\nโบตั๋น')).toEqual([
      ['เบอร์รี่แดง'],
      ['สน'],
      ['โบตั๋น'],
    ]);
    expect(checkMatchTerms('a,b,c')).toEqual([['a'], ['b'], ['c']]);
  });

  it('ช่องว่างภายในเทอม = AND ระหว่าง token', () => {
    expect(checkMatchTerms('ฟาแลน 148')).toEqual([['ฟาแลน', '148']]);
  });

  it('เทอมว่าง/ช่องว่างล้วนถูกตัดทิ้ง ไม่ได้ array ว่างลอย', () => {
    expect(checkMatchTerms('เบอร์รี่,, ,สน')).toEqual([['เบอร์รี่'], ['สน']]);
    expect(checkMatchTerms('   ')).toEqual([]);
    expect(checkMatchTerms('')).toEqual([]);
    expect(checkMatchTerms(null)).toEqual([]);
    expect(checkMatchTerms(undefined)).toEqual([]);
  });

  it('ผสมตัวคั่นหลายแบบพร้อมกันในข้อความเดียว', () => {
    expect(checkMatchTerms('เบอร์รี่แดง,สน/โบตั๋น\nซากุระ')).toEqual([
      ['เบอร์รี่แดง'],
      ['สน'],
      ['โบตั๋น'],
      ['ซากุระ'],
    ]);
  });

  it('ไม่ lowercase/normalize ในตัวมันเอง (เก็บตัวสะกดเดิมไว้ให้ทั้งแสดงผลและจับคู่ที่จุดเรียก)', () => {
    expect(checkMatchTerms('ABC')).toEqual([['ABC']]);
  });
});

// ── A2. dmjThaiKey (Phase 2) — behavioral (รันฟังก์ชันจริงจาก ui.jsx) ──────────────────
describe('dmjThaiKey — คีย์เทียบคำไทยแบบผ่อนการสะกด (ชั้นสำรอง)', () => {
  it('ครบทั้ง 5 คำของเจ้าของ — คำที่พิมพ์กับคำใน catalog ต้องได้คีย์เดียวกัน', () => {
    const cases = [
      ['เบอร์รี่', 'เบอรี่', 'เบอร'],
      ['คริสต์มาส', 'คริสมาส', 'ครสมาส'],
      ['ฟาแลนด์', 'ฟาแลน', 'ฟาแลน'],
      ['ซากุระ', 'ซากุระ', 'ซากระ'],
      ['โบตั๋น', 'โบตั๋น', 'โบตน'],
    ];
    for (const [typed, catalog, key] of cases) {
      expect(dmjThaiKey(typed)).toBe(key);
      expect(dmjThaiKey(catalog)).toBe(key);
    }
  });

  it('ยุบตัวอักษรซ้ำติดกัน + ตัดช่องว่าง + lowercase', () => {
    expect(dmjThaiKey('ABC  abc')).toBe('abcabc');
    expect(dmjThaiKey('aabbcc')).toBe('abc');
    expect(dmjThaiKey('  ฟาแลน  148 ')).toBe(dmjThaiKey('ฟาแลน148'));
  });

  it('ค่าว่าง/null/undefined ไม่พัง คืนสตริงว่าง', () => {
    expect(dmjThaiKey('')).toBe('');
    expect(dmjThaiKey(null)).toBe('');
    expect(dmjThaiKey(undefined)).toBe('');
  });

  it('⚠️ ยอมรับ false positive ที่รู้อยู่แล้วตามที่ Plan ระบุไว้ — "ขาว"/"ข้าว" ยุบเป็นคีย์เดียวกัน (ตัดวรรณยุกต์) — ใช้เป็นชั้นสำรองเท่านั้นจึงยอมรับได้', () => {
    expect(dmjThaiKey('ขาว')).toBe(dmjThaiKey('ข้าว'));
  });

  it('ไม่มี \\p{...} (Unicode property escape) ในนิพจน์ — กัน syntax error ทั้งไฟล์บน runtime ที่ไม่รองรับ', () => {
    expect(F_THAIKEY).not.toMatch(/\\p\{/);
  });
});

// ── A3. checkKeywordResult ผลค้นชื่อจริง (Phase 1 strict + Phase 2 fallback) ───────────
describe('checkKeywordResult — ชั้นสำรอง (loose match) ทำงานเฉพาะเมื่อค้นตรงได้ 0 ทั้งเทอม', () => {
  const PRODUCTS = [
    { sku: 'BE001', name: 'เบอรี่แดง 148', cat: 'ดอกไม้' },
    { sku: 'BE002', name: 'เบอรี่ฟ้า 120', cat: 'ดอกไม้' },
    { sku: 'PN001', name: 'โบตั๋น ขาว 200', cat: 'ดอกไม้' },
    { sku: 'PN002', name: 'ไอวี่ 90', cat: 'ใบไม้แขวน' },
  ];

  it('เทอมที่ค้นตรงเจอผลอยู่แล้ว (spelled ถูก) — ไม่เข้าชั้นสำรองเลย loose:false', () => {
    const [r] = keywordMatch('โบตั๋น', PRODUCTS);
    expect(r.skus).toEqual(['PN001']);
    expect(r.loose).toBe(false);
  });

  it('เทอมสะกดผิดทั้งเทอม (0 ผลจากการค้นตรง) → ตกไปชั้นสำรอง loose:true', () => {
    const [r] = keywordMatch('เบอร์รี่แดง', PRODUCTS); // spelled เบอร์รี่ (มี ร์) ผิดจาก catalog เบอรี่
    expect(r.skus).toEqual(['BE001']);
    expect(r.loose).toBe(true);
  });

  it('เคสผสม token ถูก+ผิดในเทอมเดียว ("แดง" สะกดถูก, "เบอร์รี่" สะกดผิด) — ยัง match ได้โดยไม่ต้องมี logic แยกราย token', () => {
    const [r] = keywordMatch('เบอร์รี่ แดง', PRODUCTS);
    expect(r.skus).toEqual(['BE001']);
    expect(r.loose).toBe(true);
  });

  it('คำที่ normalize แล้วสั้นกว่า 2 ตัวอักษร ไม่เข้าชั้นสำรอง (กว้างเกินจนไร้ความหมาย)', () => {
    const [r] = keywordMatch('ก', PRODUCTS); // dmjThaiKey('ก') ยาว 1 ตัวอักษร
    expect(r.skus).toEqual([]);
    expect(r.loose).toBe(false);
  });

  it('คำที่ไม่มีจริงแม้ผ่อนการสะกดแล้วก็ยัง 0 ผล → skus ว่าง loose:false (ไม่เดา)', () => {
    const [r] = keywordMatch('ทุเรียน', PRODUCTS);
    expect(r.skus).toEqual([]);
    expect(r.loose).toBe(false);
  });

  it('หลายเทอมพร้อมกัน — แต่ละเทอมตัดสิน strict/loose อิสระจากกัน', () => {
    const results = keywordMatch('โบตั๋น\nเบอร์รี่แดง\nทุเรียน', PRODUCTS);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ skus: ['PN001'], loose: false });
    expect(results[1]).toMatchObject({ skus: ['BE001'], loose: true });
    expect(results[2]).toMatchObject({ skus: [], loose: false });
  });
});

// ── A3b. checkKeywordResult — ชื่อ/รหัสที่ตรงคำค้นเป๊ะต้องมาก่อน substring (ส.ค. 2026) ─────
// เจ้าของแจ้งจากการใช้งานจริง: สินค้าชื่อเฉพาะสั้น ๆ อย่าง "สน" พิมพ์ค้นแล้วขึ้นทุกตัวที่สะกด
// ปนคำนี้อยู่ (เช่น "สนิม") เพราะภาษาไทยไม่มีช่องว่างคั่นคำ ทำให้ substring กว้างเกินไป
describe('checkKeywordResult — ชื่อ/รหัสตรงเป๊ะมาก่อน substring (กัน "สน" ไปโดน "สนิม")', () => {
  const PINE_PRODUCTS = [
    { sku: 'PN100', name: 'สน', cat: 'ต้นไม้' },
    { sku: 'PN101', name: 'สนิม สีทอง', cat: 'ของตกแต่ง' },
    { sku: 'PN102', name: 'ต้นสนประดิษฐ์', cat: 'ต้นไม้' },
  ];

  it('มีสินค้าชื่อตรงคำค้นเป๊ะ + มี substring อื่นปนอยู่ด้วย → เอาเฉพาะตัวที่ตรงเป๊ะเป็นค่าเริ่มต้น', () => {
    const [r] = keywordMatch('สน', PINE_PRODUCTS);
    expect(r.exact).toBe(true);
    expect(r.skus).toEqual(['PN100']);
    expect(r.broaderSkus).toEqual(['PN101', 'PN102']);
    expect(r.loose).toBe(false);
  });

  it('ชื่อสินค้าตรงคำค้นเป๊ะ (ตัดช่องว่าง/ตัวพิมพ์ใหญ่-เล็ก) ก็นับเป็นตรงเป๊ะ', () => {
    const [r] = keywordMatch('  SN  ', [{ sku: 'X1', name: 'sn', cat: 'ก' }, { sku: 'X2', name: 'snow', cat: 'ก' }]);
    expect(r.exact).toBe(true);
    expect(r.skus).toEqual(['X1']);
    expect(r.broaderSkus).toEqual(['X2']);
  });

  it('รหัส (sku) ตรงคำค้นเป๊ะก็ใช้ tier นี้ได้เหมือนชื่อ', () => {
    const [r] = keywordMatch('pn100', [
      { sku: 'PN100', name: 'สนแคระ', cat: 'ต้นไม้' },
      { sku: 'PN100B', name: 'สนแคระรุ่นใหญ่', cat: 'ต้นไม้' },
    ]);
    expect(r.exact).toBe(true);
    expect(r.skus).toEqual(['PN100']);
  });

  it('ไม่มีสินค้าไหนตรงคำค้นเป๊ะเลย → ไม่ติด exact ถอยไปใช้ substring ตามเดิมทุกประการ', () => {
    const [r] = keywordMatch('สนิม', PINE_PRODUCTS);
    expect(r.exact).toBeUndefined();
    expect(r.skus).toEqual(['PN101']);
  });

  it('ตรงเป๊ะเป็นตัวเดียวที่ match substring ด้วย (ไม่มี noise เพิ่ม) → ไม่ติด exact/broaderSkus (คงรูปแบบเดิมเป๊ะ)', () => {
    const ONLY_ONE = [{ sku: 'PN001', name: 'โบตั๋น ขาว 200', cat: 'ดอกไม้' }];
    const [r] = keywordMatch('โบตั๋น ขาว 200', ONLY_ONE); // ตรงกับชื่อเต็มเป๊ะ และเป็นตัวเดียวที่ match
    expect(r.exact).toBeUndefined();
    expect(r.broaderSkus).toBeUndefined();
    expect(r.skus).toEqual(['PN001']);
    expect(r.loose).toBe(false);
  });

  it('exactSkus ⊆ strictSkus เสมอ — broaderSkus ไม่ซ้ำกับ skus (dedup โดยธรรมชาติของการ filter ออก)', () => {
    const [r] = keywordMatch('สน', PINE_PRODUCTS);
    r.broaderSkus.forEach(sku => expect(r.skus).not.toContain(sku));
  });
});

// ── A4. checkCategoryChips / checkColorChips (Phase 3) — behavioral ───────────────────
describe('checkCategoryChips / checkColorChips — จับกลุ่ม SKU จาก checkBase ตามหมวด/สี', () => {
  const ALL_CATS = ['ดอกไม้', 'ใบไม้แขวน', 'บูช'];
  const PRODUCTS = [
    { sku: 'A1', cat: 'ดอกไม้', color: { name: 'แดง', hex: '#c5352a' } },
    { sku: 'A2', cat: 'ดอกไม้', color: { name: 'แดง', hex: '#c5352a' } },
    { sku: 'A3', cat: 'ดอกไม้', color: null },
    { sku: 'B1', cat: 'ใบไม้แขวน', color: null },
  ]; // ไม่มีสินค้าหมวด 'บูช' เลย — ทดสอบว่าหมวดว่างยังโผล่เป็นชิป count/skus = 0 ไม่หายไปจากลิสต์

  it('checkCategoryChips คืนครบทุกหมวดใน allCats พร้อม SKU ที่ถูกต้อง แม้หมวดว่างก็ยังอยู่', () => {
    const chips = categoryChips(ALL_CATS, PRODUCTS);
    expect(chips).toEqual([
      { name: 'ดอกไม้', skus: ['A1', 'A2', 'A3'] },
      { name: 'ใบไม้แขวน', skus: ['B1'] },
      { name: 'บูช', skus: [] },
    ]);
  });

  it('checkColorChips จับกลุ่มเฉพาะสินค้าที่มี p.color เท่านั้น (ไม่มีสี = ไม่นับ)', () => {
    const chips = colorChips(PRODUCTS);
    expect(chips).toEqual([{ name: 'แดง', hex: '#c5352a', skus: ['A1', 'A2'] }]);
  });

  it('checkColorChips คืน [] เมื่อไม่มีสินค้าตัวไหนมีสีเลย', () => {
    expect(colorChips([{ sku: 'X1', cat: 'ดอกไม้', color: null }])).toEqual([]);
  });
});

// ── A5. ผสมหลายแหล่งแบบ end-to-end จริง (Option B union) — ใช้ฟังก์ชันที่ extract มาทั้งหมด ──
describe('ผสมหลายแหล่ง (Supplier + Keyword + Category + Color) — union จริง ไม่ใช่แค่สแกน source', () => {
  const ALL_CATS = ['ดอกไม้', 'ใบไม้แขวน'];
  const PRODUCTS = [
    { sku: 'BE001', name: 'เบอรี่แดง 148', cat: 'ดอกไม้', color: { name: 'แดง', hex: '#c5352a' }, vendor: 'DS' },
    { sku: 'PN001', name: 'โบตั๋น ขาว 200', cat: 'ดอกไม้', color: { name: 'ขาว', hex: '#f4f4f4' }, vendor: 'ACME' },
    { sku: 'IV001', name: 'ไอวี่ 90', cat: 'ใบไม้แขวน', color: null, vendor: 'ACME' },
    { sku: 'IV002', name: 'ไอวี่ใหญ่ 120', cat: 'ใบไม้แขวน', color: null, vendor: 'DS' },
  ];

  it('ผสม Keyword + Category + Color (ไม่มีร้านค้าเลย) — union ครบทุกแหล่ง ไม่ซ้ำ', () => {
    const checkPicked = new Set();
    keywordMatch('โบตั๋น', PRODUCTS)[0].skus.forEach(s => checkPicked.add(s)); // PN001
    categoryChips(ALL_CATS, PRODUCTS).find(c => c.name === 'ใบไม้แขวน').skus.forEach(s => checkPicked.add(s)); // IV001, IV002
    colorChips(PRODUCTS).find(c => c.name === 'แดง').skus.forEach(s => checkPicked.add(s)); // BE001 (ซ้ำกับ keyword? ไม่ซ้ำ ต่างตัว)
    const result = finalSkus([], checkPicked, new Set()); // ไม่มี supplier เลือกเลย
    expect([...result].sort()).toEqual(['BE001', 'IV001', 'IV002', 'PN001']);
  });

  it('ผสม Supplier + Keyword — ร้านค้า DS (BE001, IV002) + ค้นชื่อ "โบตั๋น" (PN001) รวมกันแบบไม่ผูก provenance', () => {
    const checkSuppliers = new Set(['DS']);
    const supplierSkus = PRODUCTS.filter(p => checkSuppliers.has(p.vendor));
    const checkPicked = new Set(keywordMatch('โบตั๋น', PRODUCTS)[0].skus); // PN001
    const result = finalSkus(supplierSkus, checkPicked, new Set());
    expect([...result].sort()).toEqual(['BE001', 'IV002', 'PN001']);
  });

  it('ผสม Supplier + Category + Color พร้อมกันทั้ง 3 แหล่ง', () => {
    const checkSuppliers = new Set(['ACME']);
    const supplierSkus = PRODUCTS.filter(p => checkSuppliers.has(p.vendor)); // PN001, IV001
    const checkPicked = new Set();
    categoryChips(ALL_CATS, PRODUCTS).find(c => c.name === 'ใบไม้แขวน').skus.forEach(s => checkPicked.add(s)); // IV001, IV002
    colorChips(PRODUCTS).find(c => c.name === 'แดง').skus.forEach(s => checkPicked.add(s)); // BE001
    const result = finalSkus(supplierSkus, checkPicked, new Set());
    expect([...result].sort()).toEqual(['BE001', 'IV001', 'IV002', 'PN001']);
  });

  it('SKU ที่มาจากหลายแหล่งพร้อมกัน (เช่น อยู่ทั้งร้านค้าและถูกเลือกจากหมวดด้วย) ถูกส่งครั้งเดียว ไม่ซ้ำ', () => {
    const checkSuppliers = new Set(['DS']);
    const supplierSkus = PRODUCTS.filter(p => checkSuppliers.has(p.vendor)); // BE001, IV002
    const checkPicked = new Set(['BE001', 'IV002']); // ตัวเดียวกันเป๊ะถูกเลือกซ้ำจากแท็บอื่นด้วย
    const result = finalSkus(supplierSkus, checkPicked, new Set());
    expect([...result].sort()).toEqual(['BE001', 'IV002']); // ไม่ใช่ 4 ตัว ไม่มีการนับซ้ำเพราะเป็น Set
  });

  it('ถอนชิปร้านค้าออก (supplierSkus กลายเป็น []) ไม่กระทบ SKU ที่มาจาก checkPicked เลย', () => {
    const checkPicked = new Set(['PN001', 'IV001']);
    const before = finalSkus(PRODUCTS.filter(p => p.vendor === 'DS'), checkPicked, new Set());
    const after = finalSkus([], checkPicked, new Set()); // ถอนร้านค้าออกทั้งหมด
    expect([...after].sort()).toEqual([...checkPicked].sort());
    expect([...before].sort()).toContain('BE001'); // ก่อนถอนมี BE001 จากร้าน DS ด้วย
    expect([...after]).not.toContain('BE001'); // หลังถอนต้องไม่มี BE001 อีก (มาจากร้านค้าล้วน ไม่เคยอยู่ใน checkPicked)
  });

  it('checkExcluded ตัด SKU ออกจาก union ได้ไม่ว่าจะมาจากแหล่งไหน (ร้านค้า/ตะกร้า)', () => {
    const checkSuppliers = new Set(['DS']);
    const supplierSkus = PRODUCTS.filter(p => checkSuppliers.has(p.vendor)); // BE001, IV002
    const checkPicked = new Set(['PN001']);
    const result = finalSkus(supplierSkus, checkPicked, new Set(['BE001', 'PN001']));
    expect([...result].sort()).toEqual(['IV002']); // ตัด BE001 (จากร้าน) และ PN001 (จากตะกร้า) ออกทั้งคู่
  });
});

// ── B. Meta-test: จุดเชื่อมต่อที่พังแล้วเงียบ (สแกนต้นทางจริง ไม่ copy ตรรกะ) ──────────
describe('โครงตะกร้า + union (Option B) — จุดเชื่อมต่อใน CategoryView', () => {
  it('checkBase คำนวณจาก products ทั้งคลังตรง ๆ ไม่ใช่ refineBase (ไม่ผูกหมวด/คำค้นหน้าหลัก)', () => {
    expect(CATEGORY_VIEW).toContain(
      'const checkBase = uM(() =>\n    products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า")\n  , [products]);'
    );
  });

  it('checkSupplierList (ใหม่) อิง checkBase — ไม่ใช่ supplierList (เดิม) ที่ยังอิง refineBase ต่อไป', () => {
    expect(CATEGORY_VIEW).toContain('const checkSupplierList = uM(() => {');
    // supplierList เดิมต้องยังอยู่ไม่ถูกแตะ (dropdown ตัวกรองร้านของหน้าหลักยังใช้ตัวนี้)
    expect(CATEGORY_VIEW).toContain('const supplierList = uM(() => {');
    expect(CATEGORY_VIEW).toContain('}, [refineBase]);');
  });

  it('checkSupplierFiltered repoint ไป checkSupplierList แล้ว ไม่ใช่ supplierList เดิม', () => {
    expect(CATEGORY_VIEW).toContain('}, [checkSupplierList, checkSearch]);');
    expect(CATEGORY_VIEW).not.toContain('}, [supplierList, checkSearch]);');
  });

  it('checkFinalSkus เป็น union ของ checkSupplierSkus (🏭) กับ checkPicked (🔍) แล้วตัดด้วย checkExcluded', () => {
    expect(CATEGORY_VIEW).toContain('const checkFinalSkus = uM(() => {');
    expect(CATEGORY_VIEW).toContain('const merged = new Set(checkSupplierSkus.map(p => p.sku));');
    expect(CATEGORY_VIEW).toContain('checkPicked.forEach(sku => merged.add(sku));');
    expect(CATEGORY_VIEW).toContain('checkExcluded.forEach(sku => merged.delete(sku));');
  });

  it('checkSupplierSkus derive จาก checkSuppliers ตรง ๆ (เหมือนของเดิมทุกประการ) ไม่ผ่าน checkPicked', () => {
    expect(CATEGORY_VIEW).toContain(
      'const checkSupplierSkus = uM(() =>\n    checkBase.filter(p => checkSuppliers.has(p.vendor || p.lastSupplier))\n  , [checkBase, checkSuppliers]);'
    );
  });

  it('ปุ่มส่งอ่านจาก checkFinalProducts/checkFinalSkus ที่เดียว — ไม่มี products.filter(...) ซ้ำในโมดัลอีก', () => {
    const modalStart = CATEGORY_VIEW.indexOf('Check Send Modal');
    const modalEnd = CATEGORY_VIEW.indexOf('Floating button (owner');
    expect(modalStart).toBeGreaterThan(-1);
    expect(modalEnd).toBeGreaterThan(modalStart);
    const modalBlock = CATEGORY_VIEW.slice(modalStart, modalEnd);
    // (คอมเมนต์อธิบายในโมดัลอ้างคำว่า "products.filter(...)" เป็นข้อความล้วน — เช็คเฉพาะ
    // การเรียกจริงที่มีรูปแบบฟังก์ชันตามหลัง ไม่ใช่ substring เปล่า ๆ)
    expect(modalBlock).not.toMatch(/products\.filter\(function/);
    expect(modalBlock).toContain('var ps = checkFinalProducts;');
    expect(modalBlock).toContain('disabled={!checkFinalSkus.size || sendingCheck}');
  });
});

describe('Option B — แท็บ 🏭 ร้านค้า กับ 🔍/🏷️/🎨 (ตะกร้า) เป็นคนละแหล่งเด็ดขาด', () => {
  function extractModeBlock(mode) {
    const marker = `{checkMode === "${mode}" && (`;
    const start = CATEGORY_VIEW.indexOf(marker);
    if (start < 0) throw new Error('หาบล็อกโหมด ' + mode + ' ไม่เจอ');
    // นับวงเล็บปีกกาแบบง่าย ๆ จนกว่าจะปิดบล็อก JSX conditional นี้ (เพียงพอสำหรับเนื้อหาที่รู้จักโครงสร้าง)
    let depth = 0, i = start, end = -1;
    for (; i < CATEGORY_VIEW.length; i++) {
      const c = CATEGORY_VIEW[i];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error('หาจุดปิดบล็อกโหมด ' + mode + ' ไม่เจอ');
    return CATEGORY_VIEW.slice(start, end);
  }

  it('บล็อกแท็บ 🏭 ร้านค้า ไม่แตะ checkPicked เลย (ห้ามมีเส้นทางไหนเขียน SKU จากแท็บร้านค้าลงตะกร้า)', () => {
    const supplierBlock = extractModeBlock('supplier');
    expect(supplierBlock).not.toContain('checkPicked');
    expect(supplierBlock).not.toContain('checkFinalSkus');
    expect(supplierBlock).toContain('setCheckSuppliers');
  });

  it('บล็อกแท็บ 🔍 ค้นชื่อ เขียนเข้า checkPicked เท่านั้น ไม่แตะ checkSuppliers', () => {
    const keywordBlock = extractModeBlock('keyword');
    expect(keywordBlock).toContain('setCheckPicked');
    expect(keywordBlock).not.toContain('setCheckSuppliers');
    // เทอมที่ 0 ผลต้องเตือน ห้ามเงียบ
    expect(keywordBlock).toContain('ไม่พบสินค้าที่ตรงกับคำนี้');
    // ผลที่มาจากชั้นสำรอง (Phase 2) ต้องมี indication แยกจากผลค้นตรง — ห้ามให้ผู้ใช้เข้าใจว่า
    // เจอแบบตรงเป๊ะทั้งที่จริงเป็นการผ่อนการสะกด
    expect(keywordBlock).toContain('r.loose &&');
    expect(keywordBlock).toContain('≈ ค้นแบบผ่อนการสะกด');
  });

  it('checkKeywordResult ใช้ multi-token AND-match แบบเดียวกับทั้งแอป (คอนเวนชันเดิม lesson ข้อ 10)', () => {
    expect(CATEGORY_VIEW).toContain('lowerTokens.every(t => hay.includes(t))');
  });

  it('บล็อกแท็บ 🏷️ หมวด เขียนเข้า checkPicked เท่านั้น ไม่แตะ checkSuppliers', () => {
    const categoryBlock = extractModeBlock('category');
    expect(categoryBlock).toContain('setCheckPicked');
    expect(categoryBlock).not.toContain('setCheckSuppliers');
    // เลขบนชิปต้องมาจาก checkCategoryChips (อิง checkBase) ไม่ใช่ค่าที่คำนวณแยกที่อื่น
    expect(categoryBlock).toContain('checkCategoryChips.map');
  });

  it('บล็อกแท็บ 🎨 สี เขียนเข้า checkPicked เท่านั้น ไม่แตะ checkSuppliers', () => {
    const colorBlock = extractModeBlock('color');
    expect(colorBlock).toContain('setCheckPicked');
    expect(colorBlock).not.toContain('setCheckSuppliers');
    expect(colorBlock).toContain('checkColorChips.map');
  });

  it('เลขบนชิปหมวด/สี กับเลขบน checkFinalSkus ต้องมาจากฐานเดียวกัน (checkBase) — ไม่ใช้ refineBase/navCats', () => {
    expect(CATEGORY_VIEW).toContain('const checkCategoryChips = uM(() => {');
    expect(CATEGORY_VIEW).toContain('}, [allCats, checkBase]);');
    expect(CATEGORY_VIEW).toContain('const checkColorChips = uM(() => {');
  });

  it('payload ที่ส่งจริงยัง suppliers: Array.from(checkSuppliers) เป๊ะเหมือนเดิม (Option B ไม่ต้องแก้บรรทัดนี้)', () => {
    // ผูกกับ tests/stockcheck-split.test.js:332 โดยตรง — literal นี้เปลี่ยนเมื่อไหร่ที่นั่นจะแดง
    expect(VMAIN).toContain('suppliers: Array.from(checkSuppliers)');
  });
});

describe('Reset state ตอนปิดโมดัล/ส่งสำเร็จ — ต้องครบทั้ง 5 state ใหม่ทุกจุด', () => {
  it('resetCheckPicker ตั้งค่าเริ่มต้นให้ครบ 5 state (checkMode/checkKeyword/checkPicked/checkExcluded/checkShowAll)', () => {
    const fn = grab(CATEGORY_VIEW, /function resetCheckPicker\(\) \{[\s\S]*?\n  \}/, 'resetCheckPicker');
    expect(fn).toContain('setCheckMode("supplier");');
    expect(fn).toContain('setCheckKeyword("");');
    expect(fn).toContain('setCheckPicked(new Set());');
    expect(fn).toContain('setCheckExcluded(new Set());');
    expect(fn).toContain('setCheckShowAll(false);');
  });

  it('เรียก resetCheckPicker() ครบทั้ง 3 จุด (backdrop, ปุ่ม X, ส่งสำเร็จ)', () => {
    // "resetCheckPicker();" (มี ; ต่อท้ายทันที) นับเฉพาะจุดเรียกจริง — declaration เป็น
    // "function resetCheckPicker() {" (ตามด้วย " {" ไม่ใช่ ";") จึงไม่ถูกนับปน
    const count = (CATEGORY_VIEW.match(/resetCheckPicker\(\);/g) || []).length;
    expect(count).toBe(3);
  });

  it('ไม่แตะ reset ของ checkSuppliers/checkSearch เดิม (quirk เดิมของ Supplier mode คงไว้ตามแผน)', () => {
    // backdrop/X ปุ่มเดิม reset แค่ checkSearch ไม่ reset checkSuppliers — ต้องยังเป็นแบบนั้น
    expect(CATEGORY_VIEW).toContain(
      'onClick={function(e){ if(e.target===e.currentTarget){ setCheckSendOpen(false); setCheckSearch(""); resetCheckPicker(); } }}'
    );
    expect(CATEGORY_VIEW).toContain(
      'onClick={function(){ setCheckSendOpen(false); setCheckSearch(""); resetCheckPicker(); }}'
    );
  });
});

describe('เพดาน render ของบล็อก "รายการที่จะส่ง"', () => {
  it('มีค่าคงที่ CHECK_PREVIEW_CAP และใช้ slice ตัดรายการก่อน render', () => {
    expect(CATEGORY_VIEW).toMatch(/const CHECK_PREVIEW_CAP = \d+;/);
    expect(CATEGORY_VIEW).toContain(
      'const checkPreviewShown = checkShowAll ? checkFinalProducts : checkFinalProducts.slice(0, CHECK_PREVIEW_CAP);'
    );
  });

  it('มีปุ่ม "ดูทั้งหมด" เมื่อรายการเกินเพดาน', () => {
    expect(CATEGORY_VIEW).toContain('(แตะเพื่อดูทั้งหมด)');
    expect(CATEGORY_VIEW).toContain('setCheckShowAll(true)');
  });

  it('การ์ดพรีวิวมีรูป + fallback (กติกา UI: ห้ามโชว์แค่รหัส+ชื่อ)', () => {
    const previewStart = CATEGORY_VIEW.indexOf('checkFinalSkus.size > 0 && (');
    const previewEnd = CATEGORY_VIEW.indexOf('padding:"16px",borderTop:"1px solid #e5e7eb"}}>\n              {/*');
    expect(previewStart).toBeGreaterThan(-1);
    expect(previewEnd).toBeGreaterThan(previewStart);
    const previewBlock = CATEGORY_VIEW.slice(previewStart, previewEnd);
    expect(previewBlock).toContain('p.imageUrl');
    expect(previewBlock).toContain("CAT_EMOJI[p.cat] || \"📦\"");
  });
});

describe('ขอบเขต Phase 1-3 — dmjThaiKey + หมวด/สี ต่อสายครบ', () => {
  it('dmjThaiKey ถูก export จาก ui.jsx ผ่าน Object.assign(window,...) และ module.exports จริง', () => {
    expect(UI).toMatch(/Object\.assign\(window, \{[\s\S]*dmjThaiKey[\s\S]*?\}\);/);
    expect(UI).toContain('module.exports = { resetCatColorMap, catColor, CAT_COLORS, notiAgo, dmjThaiKey };');
  });
  it('views-main.jsx เรียกใช้ dmjThaiKey จริงใน checkKeywordResult (ไม่ใช่แค่มีแต่ไม่ได้ต่อสาย)', () => {
    expect(CATEGORY_VIEW).toContain('dmjThaiKey(t)');
    expect(CATEGORY_VIEW).toContain('dmjThaiKey((p.sku||"") + " " + (p.name||""))');
  });
  it('มีแท็บหมวด/สี (Phase 3) แล้วจริง', () => {
    expect(CATEGORY_VIEW).toContain('checkMode === "category"');
    expect(CATEGORY_VIEW).toContain('checkMode === "color"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — sourceLabel: ข้อความสรุป "เลือกด้วยวิธีไหน" ให้แจ้งเตือน/การ์ดติดตามคำขอ
// (docs/PLAN-STOCKCHECK-KEYWORD-SELECT.md Phase 4) — แตะ appsscript_complete.gs (GAS) ด้วย
// eval ฟังก์ชันจริงจาก .gs เหมือน tests/stockcheck-split.test.js (ไม่ copy ตรรกะ)
// ─────────────────────────────────────────────────────────────────────────────
function grabGas(re, label) { return grab(GAS, re, label); }

const F_GAS_PREVIEW = grabGas(
  /function stockCheckPreviewText_\(suppliers, names, sourceLabel\) \{[\s\S]*?\n\}/,
  'stockCheckPreviewText_'
);
// eslint-disable-next-line no-new-func
const { stockCheckPreviewText_ } = new Function(F_GAS_PREVIEW + '\nreturn { stockCheckPreviewText_ };')();

// ดึง body ของ checkSourceLabel (uM) ออกมาห่อเป็นฟังก์ชันพารามิเตอร์ตรง — วิธีเดียวกับ
// checkKeywordResult/checkCategoryChips/checkColorChips ด้านบน
const F_SOURCE_LABEL_BODY = (() => {
  const marker = 'const checkSourceLabel = uM(() => {';
  const i = CATEGORY_VIEW.indexOf(marker);
  if (i < 0) throw new Error('หา checkSourceLabel ใน CategoryView ไม่เจอ');
  const bodyStart = i + marker.length;
  const bodyEnd = CATEGORY_VIEW.indexOf('\n  }, [checkSuppliers, checkKeywordResult, checkCategoryChips, checkColorChips, checkPicked, checkColorFilter, checkKeywordExpand, checkSkuColorMap]);', bodyStart);
  if (bodyEnd < 0) throw new Error('หาจุดจบของ checkSourceLabel ไม่เจอ (deps array เปลี่ยน?)');
  return CATEGORY_VIEW.slice(bodyStart, bodyEnd);
})();
// checkSourceLabel เรียก checkKeywordEffSkus/checkCategoryEffSkus (ตัวกรองสี + toggle รวมของ
// สะกดคล้ายกัน) ตรง ๆ โดยชื่อ — ต้อง eval source จริงของทั้งคู่มาประกบไว้ก่อน ไม่ copy ตรรกะ
const F_KEYWORD_EFF = grab(CATEGORY_VIEW, /function checkKeywordEffSkus\(r\) \{[\s\S]*?\n  \}/, 'checkKeywordEffSkus');
const F_CATEGORY_EFF = grab(CATEGORY_VIEW, /function checkCategoryEffSkus\(c\) \{[\s\S]*?\n  \}/, 'checkCategoryEffSkus');
function computeSourceLabel(checkSuppliers, checkKeywordResult, checkCategoryChips, checkColorChips, checkPicked,
                             checkColorFilter, checkKeywordExpand, checkSkuColorMap) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'checkSuppliers', 'checkKeywordResult', 'checkCategoryChips', 'checkColorChips', 'checkPicked',
    'checkColorFilter', 'checkKeywordExpand', 'checkSkuColorMap',
    F_KEYWORD_EFF + '\n' + F_CATEGORY_EFF + '\n' + F_SOURCE_LABEL_BODY
  );
  return fn(checkSuppliers, checkKeywordResult, checkCategoryChips, checkColorChips, checkPicked,
            checkColorFilter === undefined ? null : checkColorFilter,
            checkKeywordExpand === undefined ? new Set() : checkKeywordExpand,
            checkSkuColorMap === undefined ? {} : checkSkuColorMap);
}

describe('stockCheckPreviewText_ (.gs) — ลำดับ sourceLabel → suppliers → names', () => {
  it('sourceLabel ชนะทุกอย่าง เมื่อมีค่า', () => {
    expect(stockCheckPreviewText_(['DS'], ['ของ A'], '🏭 DS · 🔍 โบตั๋น')).toBe('🏭 DS · 🔍 โบตั๋น');
  });
  it('sourceLabel ว่าง → ถอยไปใช้ suppliers เหมือน Phase ก่อนหน้า', () => {
    expect(stockCheckPreviewText_(['DS', 'ACME'], ['ของ A'], '')).toBe('🏭 DS, ACME');
  });
  it('sourceLabel และ suppliers ว่างทั้งคู่ → ถอยไปใช้ names (fallback สุดท้าย)', () => {
    expect(stockCheckPreviewText_([], ['ของ A', 'ของ B'], '')).toBe('ของ A, ของ B');
  });
  it('sourceLabel เป็น undefined (client เก่าไม่ส่งมา) ไม่พัง → ทำงานเหมือนก่อน Phase 4', () => {
    expect(stockCheckPreviewText_(['DS'], ['ของ A'], undefined)).toBe('🏭 DS');
  });
});

describe('COL_CHK_SOURCE (.gs) — คอลัมน์ใหม่ต่อท้ายเท่านั้น ไม่ขยับ COL_CHK_SUPPLIERS เดิม', () => {
  it('COL_CHK_SUPPLIERS ยังเป็น 15 และมี COL_CHK_SOURCE = 16 ต่อท้าย', () => {
    expect(GAS).toContain('var COL_CHK_SUPPLIERS = 15;');
    expect(GAS).toContain('var COL_CHK_SOURCE = 16;');
  });
  it('STOCK_CHECK_HEADERS_ ยาวขึ้นแบบต่อท้าย — 14 หัวคอลัมน์เดิมยังอยู่ตำแหน่งเดิมก่อน sourceLabel', () => {
    const m = GAS.match(/var STOCK_CHECK_HEADERS_ = \[[\s\S]*?\];/);
    expect(m).toBeTruthy();
    const headerLine = m[0];
    expect(headerLine.indexOf('"supplierList"')).toBeLessThan(headerLine.indexOf('"sourceLabel"'));
    expect(headerLine.endsWith('"sourceLabel"];')).toBe(true);
  });
  it('createStockCheckRequest_ / completeStockCheckRequest_ ต่างส่ง sourceLabel ให้ stockCheckPreviewText_ ทั้งคู่ (ไม่ใช่แค่จุดสร้าง)', () => {
    expect(GAS).toContain('stockCheckPreviewText_(supplierList, nameList, srcLabel)');
    expect(GAS).toContain('stockCheckPreviewText_(suppliersRow, names, sourceLabelRow)');
  });
  it('dispatch ส่ง data.sourceLabel เข้า createStockCheckRequest_ เป็น argument ที่ 5', () => {
    expect(GAS).toContain('createStockCheckRequest_(data.skus, data.names, actor, data.suppliers, data.sourceLabel)');
  });
  it('readStockCheckRequests_ คืน sourceLabel ออกไปด้วย (migration-safe — แถวเก่าไม่มีคอลัมน์นี้ = "")', () => {
    expect(GAS).toContain('sourceLabel: String(r[COL_CHK_SOURCE - 1] || "")');
  });
});

describe('checkSourceLabel (views-main.jsx) — ประกอบจากทุกแท็บที่มีส่วนร่วมจริง ไม่ใช่แค่แท็บที่เปิดอยู่', () => {
  it('เลือกร้านค้าอย่างเดียว → เฉพาะ segment 🏭', () => {
    const label = computeSourceLabel(
      new Set(['DS']), [], [{ name: 'ดอกไม้', skus: [] }], [{ name: 'แดง', skus: [] }], new Set()
    );
    expect(label).toBe('🏭 DS');
  });
  it('ค้นชื่อที่มีผล (ทุก SKU อยู่ใน checkPicked ครบ) → segment 🔍', () => {
    const label = computeSourceLabel(
      new Set(), [{ term: 'โบตั๋น', skus: ['A1', 'A2'] }], [], [], new Set(['A1', 'A2'])
    );
    expect(label).toBe('🔍 โบตั๋น');
  });
  it('เลือกหมวด → segment 🏷️ · เลือกสี → segment 🎨', () => {
    const catLabel = computeSourceLabel(
      new Set(), [], [{ name: 'ดอกไม้', skus: ['A1'] }], [], new Set(['A1'])
    );
    expect(catLabel).toBe('🏷️ ดอกไม้');
    const colorLabel = computeSourceLabel(
      new Set(), [], [], [{ name: 'แดง', skus: ['A1'] }], new Set(['A1'])
    );
    expect(colorLabel).toBe('🎨 แดง');
  });
  it('ผสมร้านค้า + ค้นชื่อพร้อมกัน (Option B สะสมข้ามแท็บ) → ทั้ง 2 segment ต้องอยู่ครบ ตัวอย่างตรงกับ Plan §Phase 4 ข้อ 6', () => {
    const label = computeSourceLabel(
      new Set(['DS']), [{ term: 'โบตั๋น', skus: ['A1'] }], [{ name: 'ดอกไม้', skus: [] }], [], new Set(['A1'])
    );
    expect(label).toBe('🏭 DS · 🔍 โบตั๋น');
  });
  it('เทอมค้นชื่อที่ยังไม่มีผล (0 SKU) ไม่ถูกนับเป็น segment', () => {
    const label = computeSourceLabel(
      new Set(), [{ term: 'ไม่มีจริง', skus: [] }], [], [], new Set()
    );
    expect(label).toBe('');
  });
  it('หมวดที่เลือกไว้บางส่วน (SKU ในหมวดยังไม่ครบใน checkPicked) → ยังไม่นับเป็น segment ของหมวดนั้น', () => {
    const label = computeSourceLabel(
      new Set(), [], [{ name: 'ดอกไม้', skus: ['A1', 'A2'] }], [], new Set(['A1'])
    );
    expect(label).toBe('');
  });
  it('ไม่มีอะไรถูกเลือกเลย → คืนสตริงว่าง', () => {
    expect(computeSourceLabel(new Set(), [], [], [], new Set())).toBe('');
  });
});

describe('จุดเชื่อมต่อ Phase 4 ใน CategoryView — ปุ่มส่งแนบ sourceLabel จริง', () => {
  it('body ของ fetch สร้างคำขอมี sourceLabel: checkSourceLabel', () => {
    expect(CATEGORY_VIEW).toContain('sourceLabel: checkSourceLabel');
  });
  it('checkSourceLabel ยังเป็น memo เดียว (uM) ไม่ใช่คำนวณซ้ำหลายจุด', () => {
    const count = (CATEGORY_VIEW.match(/const checkSourceLabel = uM\(/g) || []).length;
    expect(count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// งานต่อยอดหลัง merge (ส.ค. 2026) — เจ้าของลองใช้งานจริงแล้วขอ 2 เรื่อง:
// 1. กรองต่อด้วยสีจากแท็บ 🔍/🏷️ ได้ (ไม่ใช่แค่แท็บ 🎨 เดี่ยว ๆ)
// 2. "สน" (ชื่อเฉพาะสั้น ๆ) ไม่ควรไปโดน "สนิม"/"ต้นสน" (ดู describe ด้านบน)
// checkKeywordEffSkus/checkCategoryEffSkus = จุดคำนวณ "ผลจริงหลังกรอง" ที่เดียวที่ทั้ง
// render และ checkSourceLabel เรียกใช้ร่วมกัน (eval source จริงจาก CategoryView ไม่ copy)
// ─────────────────────────────────────────────────────────────────────────────
function keywordEffSkus(r, checkColorFilter, checkKeywordExpand, checkSkuColorMap) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('r', 'checkColorFilter', 'checkKeywordExpand', 'checkSkuColorMap',
    F_KEYWORD_EFF + '\nreturn checkKeywordEffSkus(r);');
  return fn(r, checkColorFilter, checkKeywordExpand, checkSkuColorMap);
}
function categoryEffSkus(c, checkColorFilter, checkSkuColorMap) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('c', 'checkColorFilter', 'checkSkuColorMap',
    F_CATEGORY_EFF + '\nreturn checkCategoryEffSkus(c);');
  return fn(c, checkColorFilter, checkSkuColorMap);
}

describe('checkKeywordEffSkus / checkCategoryEffSkus — กรองต่อด้วยสี + toggle รวมของสะกดคล้ายกัน', () => {
  const SKU_COLOR = { A1: 'แดง', A2: 'แดง', A3: 'ขาว' }; // A4 ไม่มีสี (ไม่อยู่ใน map)

  it('ไม่มีตัวกรองสี + ไม่ได้กด expand → คืน r.skus เดิมเป๊ะ (แท็บ 🔍 ทำงานเหมือนก่อนมี feature นี้)', () => {
    const r = { term: 'x', skus: ['A1', 'A2'], loose: false };
    expect(keywordEffSkus(r, null, new Set(), SKU_COLOR)).toEqual(['A1', 'A2']);
  });

  it('exact tier + ยังไม่กด "รวม" → เห็นแค่ r.skus (exact) ไม่รวม broaderSkus', () => {
    const r = { term: 'สน', skus: ['A1'], broaderSkus: ['A3', 'A4'], exact: true, loose: false };
    expect(keywordEffSkus(r, null, new Set(), SKU_COLOR)).toEqual(['A1']);
  });

  it('exact tier + กด "รวม" แล้ว (checkKeywordExpand มี term นี้) → รวม broaderSkus เข้ามาด้วย', () => {
    const r = { term: 'สน', skus: ['A1'], broaderSkus: ['A3', 'A4'], exact: true, loose: false };
    expect(keywordEffSkus(r, null, new Set(['สน']), SKU_COLOR)).toEqual(['A1', 'A3', 'A4']);
  });

  it('กด "รวม" ของเทอมอื่นไม่กระทบเทอมนี้ (เก็บด้วย term string อิสระต่อกัน)', () => {
    const r = { term: 'สน', skus: ['A1'], broaderSkus: ['A3'], exact: true, loose: false };
    expect(keywordEffSkus(r, null, new Set(['คำอื่น']), SKU_COLOR)).toEqual(['A1']);
  });

  it('ตั้งสีกรอง → เหลือเฉพาะ SKU ที่ตรงสีนั้นจริง (ตัดที่ไม่มีสีออกด้วย)', () => {
    const r = { term: 'x', skus: ['A1', 'A2', 'A3', 'A4'], loose: false };
    expect(keywordEffSkus(r, 'แดง', new Set(), SKU_COLOR)).toEqual(['A1', 'A2']);
  });

  it('ผสม exact+expand+สี พร้อมกัน — กรองสีทำงานบนฐานที่รวม broaderSkus แล้ว', () => {
    const r = { term: 'สน', skus: ['A1'], broaderSkus: ['A3', 'A4'], exact: true, loose: false };
    expect(keywordEffSkus(r, 'ขาว', new Set(['สน']), SKU_COLOR)).toEqual(['A3']);
  });

  it('checkCategoryEffSkus: ไม่มีตัวกรองสี → คืน c.skus เดิมเป๊ะ', () => {
    expect(categoryEffSkus({ name: 'ดอกไม้', skus: ['A1', 'A3'] }, null, SKU_COLOR)).toEqual(['A1', 'A3']);
  });

  it('checkCategoryEffSkus: ตั้งสีกรอง → เหลือเฉพาะสีที่ตรง', () => {
    expect(categoryEffSkus({ name: 'ดอกไม้', skus: ['A1', 'A2', 'A3'] }, 'แดง', SKU_COLOR)).toEqual(['A1', 'A2']);
  });

  it('checkCategoryEffSkus: กรองแล้วไม่เหลือเลย → array ว่าง (ไม่ throw)', () => {
    expect(categoryEffSkus({ name: 'ดอกไม้', skus: ['A3'] }, 'แดง', SKU_COLOR)).toEqual([]);
  });
});

describe('checkSourceLabel + กรองสี — ต้องยังรายงานว่ามีส่วนร่วมแม้เพิ่มแค่ SKU ที่ตรงสีบางส่วน (บั๊กคลาส "หายเงียบ")', () => {
  // ⚠️ นี่คือจุดเสี่ยงที่สุดของ feature นี้: ถ้า checkSourceLabel ยังเช็คด้วย c.skus/r.skus แบบเดิม
  // (ไม่ผ่านสี) การเพิ่มแค่ "หมวด ∩ สี" (ไม่ใช่ทั้งหมวด) จะไม่มีวันถูกนับเป็น segment เลย —
  // ทำให้แจ้งเตือน/การ์ดติดตามไม่บอกอะไรเลยทั้งที่มีการเลือกจริง (ตรงกับคลาสบั๊กที่ CLAUDE.md เตือนไว้)
  it('เลือกหมวดแล้วกรองสี เพิ่มแค่ SKU ที่ตรงสี (ไม่ใช่ทั้งหมวด) → segment 🏷️ ต้องยังขึ้น พร้อมบอกสีที่ใช้กรอง', () => {
    const cats = [{ name: 'ดอกไม้', skus: ['A1', 'A2', 'A3'] }]; // A3 ไม่ใช่สีแดง
    const skuColor = { A1: 'แดง', A2: 'แดง', A3: 'ขาว' };
    const picked = new Set(['A1', 'A2']); // เพิ่มแค่ 2 ตัวที่เป็นสีแดง ไม่ใช่ทั้งหมวด (3 ตัว)
    const label = computeSourceLabel(new Set(), [], cats, [], picked, 'แดง', new Set(), skuColor);
    expect(label).toBe('🏷️ ดอกไม้ (สีแดง)');
  });

  it('เลือกค้นชื่อ (exact tier) แล้วกรองสี → segment 🔍 บอกสีที่ใช้กรองด้วย', () => {
    const results = [{ term: 'สน', skus: ['A1', 'A2'], broaderSkus: [], exact: true, loose: false }];
    const skuColor = { A1: 'แดง', A2: 'ขาว' };
    const picked = new Set(['A1']); // เพิ่มแค่ตัวที่ตรงสีแดง
    const label = computeSourceLabel(new Set(), results, [], [], picked, 'แดง', new Set(), skuColor);
    expect(label).toBe('🔍 สน (สีแดง)');
  });

  it('ไม่ได้ตั้งสีกรอง → segment ไม่มีวงเล็บสีต่อท้าย (ไม่กระทบพฤติกรรมเดิม)', () => {
    const cats = [{ name: 'ดอกไม้', skus: ['A1'] }];
    const label = computeSourceLabel(new Set(), [], cats, [], new Set(['A1']), null, new Set(), {});
    expect(label).toBe('🏷️ ดอกไม้');
  });

  it('กรองสีแล้วยังไม่ครบตามที่กรองได้ (เพิ่มแค่บางส่วนของ effSkus) → ยังไม่นับเป็น segment', () => {
    const cats = [{ name: 'ดอกไม้', skus: ['A1', 'A2'] }]; // ทั้งคู่สีแดง
    const skuColor = { A1: 'แดง', A2: 'แดง' };
    const picked = new Set(['A1']); // ได้แค่ตัวเดียวจาก 2 ตัวที่ตรงสี
    const label = computeSourceLabel(new Set(), [], cats, [], picked, 'แดง', new Set(), skuColor);
    expect(label).toBe('');
  });
});

describe('meta: UI กรองต่อด้วยสี + toggle รวมของสะกดคล้ายกัน ต่อสายครบใน CategoryView', () => {
  it('แถบกรองสีโผล่เฉพาะแท็บ 🔍/🏷️ เท่านั้น (ไม่ใช่ 🏭/🎨)', () => {
    expect(CATEGORY_VIEW).toContain('(checkMode === "keyword" || checkMode === "category") && checkColorChips.length > 0');
  });
  it('resetCheckPicker ล้าง checkColorFilter และ checkKeywordExpand ด้วย (กันค้างข้ามการเปิดโมดัลใหม่)', () => {
    const m = CATEGORY_VIEW.match(/function resetCheckPicker\(\) \{[\s\S]*?\n  \}/);
    expect(m).toBeTruthy();
    expect(m[0]).toContain('setCheckColorFilter(null)');
    expect(m[0]).toContain('setCheckKeywordExpand(new Set())');
  });
  it('ปุ่ม "รวมสินค้าที่สะกดคล้ายกัน" มีจริงและผูกกับ checkKeywordExpand', () => {
    expect(CATEGORY_VIEW).toContain('มีสินค้าอื่นสะกดคล้ายกันอีก');
    expect(CATEGORY_VIEW).toContain('setCheckKeywordExpand(function(prev){');
  });
  it('แถวค้นชื่อและชิปหมวดเรียก checkKeywordEffSkus/checkCategoryEffSkus จริง ไม่ใช่ใช้ r.skus/c.skus ตรง ๆ ในการนับ/เพิ่ม', () => {
    expect(CATEGORY_VIEW).toContain('var effSkus = checkKeywordEffSkus(r);');
    expect(CATEGORY_VIEW).toContain('var effSkus = checkCategoryEffSkus(c);');
  });
  it('แท็บ 🎨 เดี่ยว ๆ ไม่ถูกแตะ — ยังใช้ c.skus ตรง ๆ เหมือนเดิมทุกประการ (ไม่ผ่าน checkColorFilter)', () => {
    const m = CATEGORY_VIEW.match(/\{checkMode === "color" && \([\s\S]*?\n            \)\}/);
    expect(m).toBeTruthy();
    expect(m[0]).toContain('c.skus.every(function(sku){ return checkPicked.has(sku); })');
    expect(m[0]).not.toContain('checkColorFilter');
    expect(m[0]).not.toContain('EffSkus');
  });
});
