// tests/stockcheck-keyword.test.js — เพิ่มวิธีเลือก SKU ด้วยการค้นชื่อสินค้า ในปุ่มลอย
// 📤 "ส่งคำขอเช็คสต็อก" (CategoryView, views-main.jsx) — Phase 1 ของ
// docs/PLAN-STOCKCHECK-KEYWORD-SELECT.md เท่านั้น (โครงตะกร้า + โหมดค้นชื่อ + union)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง: "ช่วยนับ เบอร์รี่แดง / สน / คริสต์มาส / โบตั๋น / ซากุระ" — ต้องเลือก SKU ที่จะ
// ส่งไปนับได้โดยไม่ต้องรู้ Supplier · เดิมมีแค่โหมดเลือกร้านค้า (checkSuppliers)
//
// สถาปัตยกรรม Option B (Union, ล็อกแล้ว): 🏭 ร้านค้า (checkSuppliers, live-toggle, ของเดิม)
// กับ 🔍 ค้นชื่อ (checkPicked, ตะกร้าสะสม) เป็นคนละแหล่งเด็ดขาด ไม่ผสมกัน รวมกันแค่ตอนคำนวณ
// checkFinalSkus (union) ตอนกดส่งเท่านั้น — ห้ามมี provenance tracking ข้ามโหมด
//
// eval ฟังก์ชันจริงจาก views-main.jsx (ไม่ copy) เหมือน tests/mto-group.test.js /
// tests/saler-fs-count.test.js · ที่เหลือเป็น meta-test สแกนต้นทางจริง (จุดที่พังแล้วเงียบ
// สำคัญกว่าตรรกะล้วน — เช่นลืม repoint dependency หรือลืม reset state)
//
// ⚠️ ไฟล์นี้ครอบเฉพาะ Phase 1 — ไม่ทดสอบ dmjThaiKey (Phase 2), หมวด/สี (Phase 3),
// sourceLabel (Phase 4) เพราะยังไม่ได้ implement ในรอบนี้ตามขอบเขตที่ระบุไว้
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VMAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

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

const CATEGORY_VIEW = grabFn(VMAIN, 'CategoryView');

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

describe('Option B — แท็บ 🏭 ร้านค้า กับ 🔍 ค้นชื่อ เป็นคนละแหล่งเด็ดขาด', () => {
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
  });

  it('checkKeywordResult ใช้ multi-token AND-match แบบเดียวกับทั้งแอป (คอนเวนชันเดิม lesson ข้อ 10)', () => {
    expect(CATEGORY_VIEW).toContain('lowerTokens.every(t => hay.includes(t))');
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

describe('ขอบเขต Phase 1 — ต้องไม่มี Phase 2/3/4 หลุดเข้ามาก่อนกำหนด', () => {
  it('ไม่มี dmjThaiKey ใน views-main.jsx (Thai normalize เป็นงานของ Phase 2)', () => {
    expect(VMAIN).not.toContain('dmjThaiKey');
  });
  it('ไม่มีแท็บหมวด/สี (Phase 3) และไม่มี sourceLabel (Phase 4) ในโมดัลนี้', () => {
    expect(CATEGORY_VIEW).not.toContain('checkMode === "category"');
    expect(CATEGORY_VIEW).not.toContain('checkMode === "color"');
    expect(CATEGORY_VIEW).not.toContain('sourceLabel');
  });
});
