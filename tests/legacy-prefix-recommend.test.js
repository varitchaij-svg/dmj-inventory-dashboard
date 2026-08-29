// tests/legacy-prefix-recommend.test.js — ฟอร์มเพิ่มสินค้าเดิม (Legacy): แนะนำ Prefix + L แช่แข็ง
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง (ส.ค. 2026): พนักงานไม่ต้องรู้ว่า Prefix คืออะไร — ระบบเดาให้จาก
// "ชื่อสินค้า + หมวดที่เลือก" จากข้อมูลเดิมที่มีอยู่จริง · หาไม่ได้จริง ๆ → F ·
// L ใช้ตั้งรหัสใหม่ไม่ได้ (ของเดิมไม่กระทบ)
//
// eval ฟังก์ชันจริงจาก views-main.jsx (ไม่ copy — กัน drift เหมือน auth.test.js)
// + meta-test คุมจุดเชื่อมต่อที่พังแล้วเงียบ (auto-fill ทับค่าที่ผู้ใช้เลือกเอง /
//   ทับตอนล็อกแบบ / L หลุดเข้าไปสร้างของใหม่ได้)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWS = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

function grab(re, label) {
  const m = VIEWS.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

const F_FROZEN_LIST = grab(/const PREFIX_FROZEN_NEW = \[[^\]]*\];/, 'PREFIX_FROZEN_NEW');
const F_FALLBACK    = grab(/const PREFIX_FALLBACK_NEW = "[A-Z]+";/, 'PREFIX_FALLBACK_NEW');
const F_ISFROZEN    = grab(/function isFrozenPrefix\(pfx\) \{[\s\S]*?\n\}/, 'isFrozenPrefix');
const F_RECOMMEND   = grab(/function recommendPrefixFor\(name, category, products\) \{[\s\S]*?\n\}/, 'recommendPrefixFor');

// eslint-disable-next-line no-new-func
const { recommendPrefixFor, isFrozenPrefix, PREFIX_FALLBACK_NEW } = new Function(
  [F_FROZEN_LIST, F_FALLBACK, F_ISFROZEN, F_RECOMMEND,
   'return { recommendPrefixFor, isFrozenPrefix, PREFIX_FALLBACK_NEW };'].join('\n')
)();

// ชุดข้อมูลจำลองที่สะท้อนของจริง: OL=มะกอก (หมวดใบไม้), R=กุหลาบ (หมวดดอกไม้),
// L=ของเลิกใช้ (ยังมีอยู่ในระบบ), VAS=แจกัน
const PRODUCTS = [
  { sku: 'OL19001', name: 'มะกอกใหญ่ เขียว', category: 'ใบไม้' },
  { sku: 'OL01002', name: 'มะกอกเล็ก แดง',  category: 'ใบไม้' },
  { sku: 'OL10003', name: 'มะกอกกลาง',      category: 'ใบไม้' },
  { sku: 'R01025',  name: 'กุหลาบ แดง',      category: 'ดอกไม้' },
  { sku: 'R19025',  name: 'กุหลาบ ขาว',      category: 'ดอกไม้' },
  { sku: 'L01263',  name: 'มะกอกเก่า เลิกใช้', category: 'ใบไม้' },   // L — ห้ามแนะนำ
  { sku: 'L19264',  name: 'ของเก่า L',        category: 'ดอกไม้' },
  { sku: 'VAS001',  name: 'แจกันแก้วใส',      category: 'แจกัน' },     // ไม่เข้ารูป [A-Z]{1,3}\d{5}
];

describe('isFrozenPrefix — L แช่แข็งสำหรับสินค้าใหม่', () => {
  it('L (ทุกรูปแบบตัวพิมพ์/ช่องว่าง) = แช่แข็ง', () => {
    expect(isFrozenPrefix('L')).toBe(true);
    expect(isFrozenPrefix('l')).toBe(true);
    expect(isFrozenPrefix(' L ')).toBe(true);
  });
  it('prefix อื่นใช้ได้ตามปกติ', () => {
    ['OL', 'R', 'F', 'VAS', 'LL'].forEach(p => expect(isFrozenPrefix(p), p).toBe(false));
  });
  it('ค่าว่าง/null → ไม่ใช่ frozen (ไม่บล็อกตอนยังไม่ได้เลือก)', () => {
    expect(isFrozenPrefix('')).toBe(false);
    expect(isFrozenPrefix(null)).toBe(false);
    expect(isFrozenPrefix(undefined)).toBe(false);
  });
});

describe('recommendPrefixFor — เดา Prefix จากชื่อ + หมวด', () => {
  it('ชื่อตรงกับของเดิม → ใช้ prefix ของของเดิมนั้น', () => {
    const r = recommendPrefixFor('มะกอก', '', PRODUCTS);
    expect(r.prefix).toBe('OL');
    expect(r.source).toBe('name');
    expect(r.count).toBe(3);
  });
  it('ชื่อ + หมวดตรงกันทั้งคู่ → ชนะการเดาจากชื่ออย่างเดียว', () => {
    const r = recommendPrefixFor('มะกอก', 'ใบไม้', PRODUCTS);
    expect(r.prefix).toBe('OL');
    expect(r.source).toBe('name+cat');
  });
  it('multi-token AND-match (ตามธรรมเนียมช่องค้นหาทุกหน้า)', () => {
    const r = recommendPrefixFor('กุหลาบ ขาว', '', PRODUCTS);
    expect(r.prefix).toBe('R');
    expect(r.count).toBe(1);
  });
  it('★ ชื่อไม่ตรงใคร แม้เลือกหมวดไว้ → F (ห้ามเดาเป็น prefix ยอดนิยมของหมวด)', () => {
    // เจ้าของสั่ง: "ของใหม่ที่ระบบไม่รู้จัก" ต้องได้ F เท่านั้น
    // เดิมคืน OL เพราะหมวด "ใบไม้" ใช้ OL บ่อยสุด — ซึ่งไม่เกี่ยวกับตัวสินค้าเลย
    const r = recommendPrefixFor('ของใหม่เอี่ยม', 'ใบไม้', PRODUCTS);
    expect(r.prefix).toBe('F');
    expect(r.source).toBe('fallback');
  });
  it('★ ของใหม่จริงในหมวดที่มีของเยอะ → F (เคสที่เจ็บสุด: โคมไฟ ไม่ควรได้ prefix กุหลาบ)', () => {
    const r = recommendPrefixFor('โคมไฟ LED', 'ดอกไม้', PRODUCTS);
    expect(r.prefix).toBe('F');
    expect(r.prefix).not.toBe('R');
  });
  it('★ ยังไม่พิมพ์ชื่อ แต่เลือกหมวดแล้ว → F (ไม่เติม prefix ให้ก่อนรู้ว่าเป็นสินค้าอะไร)', () => {
    expect(recommendPrefixFor('', 'ดอกไม้', PRODUCTS).prefix).toBe('F');
  });
  it('ของใหม่จริง ๆ ไม่มีอะไรใกล้เคียงเลย → fallback F', () => {
    const r = recommendPrefixFor('สินค้าไม่เคยมี', 'หมวดใหม่ที่ไม่เคยมี', PRODUCTS);
    expect(r.prefix).toBe('F');
    expect(r.prefix).toBe(PREFIX_FALLBACK_NEW);
    expect(r.source).toBe('fallback');
  });
  it('ยังไม่กรอกอะไรเลย → F (ไม่เดามั่ว)', () => {
    expect(recommendPrefixFor('', '', PRODUCTS).prefix).toBe('F');
    expect(recommendPrefixFor('', '', []).prefix).toBe('F');
  });
  it('🔒 ไม่แนะนำ L เด็ดขาด แม้ชื่อจะตรงเป๊ะที่สุด → ตกไป F', () => {
    // "ของเก่า L" ตรงชื่อสินค้า L เท่านั้น · L ถูกตัดออกก่อนนับ → ไม่เหลือชื่อที่ตรง → F
    const r = recommendPrefixFor('ของเก่า L', 'ดอกไม้', PRODUCTS);
    expect(r.prefix).not.toBe('L');
    expect(r.prefix).toBe('F');
  });
  it('🔒 หมวดที่มีแต่สินค้า L → ไม่คืน L แต่ตกไป fallback F', () => {
    const onlyL = [{ sku: 'L01263', name: 'ของเก่า', category: 'หมวดL' }];
    const r = recommendPrefixFor('อะไรก็ได้', 'หมวดL', onlyL);
    expect(r.prefix).toBe('F');
  });
  it('ชื่อสั้นกว่า 2 ตัวอักษร → ไม่เดาจากชื่อ (กัน noise เหมือน prefixByName เดิม) → F', () => {
    const r = recommendPrefixFor('ม', 'ใบไม้', PRODUCTS);
    expect(r.source).toBe('fallback');
    expect(r.prefix).toBe('F');
  });
  it('ใช้กฎแยก prefix ตัวเดียวกับชิปเดิม (^[A-Z]{1,3} ตามด้วยตัวเลข)', () => {
    // VAS001 → prefix "VAS" เหมือนที่ prefixInfo/prefixByName เดิมมองเห็น
    // (ต้องตรงกัน ไม่งั้นระบบแนะนำตัวหนึ่ง แต่ชิปโชว์อีกชุด = สับสนเงียบ ๆ)
    const r = recommendPrefixFor('แจกันแก้วใส', 'แจกัน', PRODUCTS);
    expect(r.prefix).toBe('VAS');
  });
  it('SKU ที่ไม่มีตัวเลขต่อท้ายตัวอักษร → ไม่ถูกนับเป็น prefix', () => {
    const junk = [{ sku: 'ไม่มีรหัส', name: 'x', category: 'c' }, { sku: 'ABCDEF', name: 'x', category: 'c' }];
    expect(recommendPrefixFor('x', 'c', junk).prefix).toBe('F');
  });
  it('ผลลัพธ์คงที่ (tie → เรียงตามตัวอักษร) — เดิม ๆ ต้องได้คำตอบเดิมทุกครั้ง', () => {
    const tie = [
      { sku: 'B01001', name: 'ดอกไม้ทดสอบ', category: 'x' },
      { sku: 'A01001', name: 'ดอกไม้ทดสอบ', category: 'x' },
    ];
    expect(recommendPrefixFor('ดอกไม้ทดสอบ', 'x', tie).prefix).toBe('A');
    expect(recommendPrefixFor('ดอกไม้ทดสอบ', 'x', tie.slice().reverse()).prefix).toBe('A');
  });
  it('ไม่ล้มเมื่อข้อมูลพัง (null/ไม่มี sku/ไม่มีชื่อ)', () => {
    expect(() => recommendPrefixFor('x', 'y', [null, {}, { sku: null }, { sku: 'OL19001' }])).not.toThrow();
  });
});

// ── META: จุดเชื่อมต่อในฟอร์มจริง (พังแล้วไม่มี error ให้เห็น) ────────────────
describe('META — การต่อเข้าฟอร์มเดิม (LegacyAddProductView)', () => {
  it('★ ต้องไม่มีชั้น "เดาจากหมวดอย่างเดียว" กลับมาอีก (กันถอยกลับเงียบ ๆ)', () => {
    // เจ้าของตัดชั้นนี้ทิ้งโดยเจตนา — ของที่ระบบไม่รู้จักต้องได้ F ไม่ใช่ prefix ยอดนิยมของหมวด
    expect(/source: "category"/.test(F_RECOMMEND)).toBe(false);
  });
  it('เติม Prefix อัตโนมัติเฉพาะตอนผู้ใช้ยังไม่เลือกเอง และไม่ทับตอนล็อกแบบไว้', () => {
    expect(/if \(skuMode !== "new" \|\| prefixTouched \|\| heldDesign\) return;/.test(VIEWS)).toBe(true);
    expect(/if \(prefixRec\.prefix && prefixRec\.prefix !== prefix\) setPrefix\(prefixRec\.prefix\);/.test(VIEWS)).toBe(true);
  });
  it('ผู้ใช้เลือก/พิมพ์เอง → ตั้ง prefixTouched (หยุดเติมทับ)', () => {
    // ชิป prefix ทั้ง 2 ชุด (ในหมวด + อื่น ๆ) และรายการที่ค้นจากชื่อ
    expect((VIEWS.match(/setPrefix\(px\); setPrefixTouched\(true\);/g) || []).length).toBe(2);
    expect(/setPrefix\(pb\.prefix\); setPrefixTouched\(true\);/.test(VIEWS)).toBe(true);
    // พิมพ์เอง: ว่าง → กลับไปให้ระบบแนะนำต่อ
    expect(/setPrefixTouched\(v !== ""\)/.test(VIEWS)).toBe(true);
  });
  it('🔒 L บล็อกที่ปุ่มบันทึก (canSave) — กันทั้ง 2 โหมด', () => {
    expect(/const prefixFrozen = isFrozenPrefix\(effPrefix\);/.test(VIEWS)).toBe(true);
    expect(/const canSave = !saving &&[^\n]*&& !prefixFrozen/.test(VIEWS)).toBe(true);
  });
  it('🔒 L ไม่โผล่เป็นตัวเลือก: ชิป prefix / ค้นจากชื่อ / แบบเดิมที่จะเพิ่มสี', () => {
    expect((VIEWS.match(/if \(isFrozenPrefix\(m\[1\]\)\) return;/g) || []).length).toBe(2);
    expect(/if \(isFrozenPrefix\(parts\.prefix\)\) continue;/.test(VIEWS)).toBe(true);
  });
  it('ยังคงสร้างเลข Model อัตโนมัติเหมือนเดิม (ไม่ถูกแทนที่)', () => {
    expect(/nextModelForPrefix\(prefix, skuForCode\)/.test(VIEWS)).toBe(true);
  });
  it('ยังคงคิว batch 10 รายการ + โหมดสีใหม่ของแบบเดิม', () => {
    expect(/const MAX_BATCH = 10;/.test(VIEWS)).toBe(true);
    expect(/skuMode === "color"/.test(VIEWS)).toBe(true);
  });
  it('ยังส่งเข้า syncAddProduct เส้นทางเดิม (SKU/Barcode/ZORT ไม่เปลี่ยน)', () => {
    expect(/const r = await syncAddProduct\(it\);/.test(VIEWS)).toBe(true);
  });
  it('ฟอร์มพนักงานยังเป็น Legacy เสมอ (ไม่มีขั้นตอน Registry/Family/Form โผล่มา)', () => {
    expect(/function AddProductView\(\{ data, role, onAdded \}\) \{\s*return <LegacyAddProductView/.test(VIEWS)).toBe(true);
    expect(/<RegistryAddProduct /.test(VIEWS)).toBe(false);
  });
});
