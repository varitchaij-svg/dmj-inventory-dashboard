// tests/add-product-registry.test.js — Phase C · Add Product two-track (D05/D07/D08/D09/D11)
// ─────────────────────────────────────────────────────────────────────────────
// eval ฟังก์ชัน pure จริงจาก views-main.jsx (ไม่ copy — กัน drift เหมือน auth.test.js)
// + meta-test คุม "จุดเชื่อมต่อที่พังแล้วเงียบ": SAFE ROLLOUT dormancy, dmjJson,
//   idempotency reqId, ไม่แตะ SKU เดิม, admin gating, preview→confirm
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWS = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

const F_PARSE   = grab(VIEWS, /function parseSkuParts\(sku\) \{[\s\S]*?\n\}/, 'parseSkuParts');
const F_COMPOSE = grab(VIEWS, /function registryComposeSku\(prefix, variantCode, model\) \{[\s\S]*?\n\}/, 'registryComposeSku');
const F_TAKEN   = grab(VIEWS, /function registryTakenVariants\(products, prefix, model\) \{[\s\S]*?\n\}/, 'registryTakenVariants');
const F_VOPTS   = grab(VIEWS, /function registryVariantOptions\(variants, axis\) \{[\s\S]*?\n\}/, 'registryVariantOptions');

// eslint-disable-next-line no-new-func
const { registryComposeSku, registryTakenVariants, registryVariantOptions } = new Function(
  F_PARSE + '\n' + F_COMPOSE + '\n' + F_TAKEN + '\n' + F_VOPTS +
  '\nreturn { registryComposeSku, registryTakenVariants, registryVariantOptions };'
)();

describe('registryComposeSku — ประกอบ SKU (grammar D05, mirror composeSku_)', () => {
  it('ประกอบครบ → [Prefix][Variant2][Model3]', () => {
    expect(registryComposeSku('OL', '19', '001')).toBe('OL19001');
    expect(registryComposeSku('R', '01', '025')).toBe('R01025');
    expect(registryComposeSku('ABC', '00', '999')).toBe('ABC00999');
  });
  it('normalize prefix เป็นตัวใหญ่ · pad variant 1 หลัก → 2 หลัก', () => {
    expect(registryComposeSku('ol', '9', '001')).toBe('OL09001');
  });
  it('ไม่ครบ/ผิดรูป → "" (ไม่เดา)', () => {
    expect(registryComposeSku('', '19', '001')).toBe('');
    expect(registryComposeSku('OLXY', '19', '001')).toBe('');   // prefix 4 ตัว
    expect(registryComposeSku('OL', '190', '001')).toBe('');    // variant 3 หลัก
    expect(registryComposeSku('OL', '19', '01')).toBe('');      // model 2 หลัก
    expect(registryComposeSku('OL', '', '001')).toBe('');
  });
});

describe('registryTakenVariants — variant ที่แบบ(prefix+model)นี้มีสินค้าจริงแล้ว', () => {
  const products = [
    { sku: 'R01025' }, { sku: 'R10025' }, { sku: 'R19025' },   // แบบ R…025 มี 3 สี
    { sku: 'R01099' },                                          // คนละแบบ (model 099)
    { sku: 'OL19001' },                                         // คนละ prefix
    { sku: 'ไม่มีรหัส' },                                        // ไม่เข้ารูป → ข้าม
  ];
  it('คืนเฉพาะ variant ของ prefix+model ที่ตรง', () => {
    const s = registryTakenVariants(products, 'R', '025');
    expect(s.has('01')).toBe(true);
    expect(s.has('10')).toBe(true);
    expect(s.has('19')).toBe(true);
    expect(s.has('99')).toBe(false);   // R01099 คนละ model
    expect(s.size).toBe(3);
  });
  it('prefix พิมพ์เล็ก → เทียบแบบ normalize', () => {
    expect(registryTakenVariants(products, 'r', '025').size).toBe(3);
  });
  it('ไม่มีสินค้าตรงเลย → Set ว่าง', () => {
    expect(registryTakenVariants(products, 'ZZ', '001').size).toBe(0);
    expect(registryTakenVariants([], 'R', '025').size).toBe(0);
  });
});

describe('registryVariantOptions — ค่า variant ที่อ่านได้ต่อ axis (ACTIVE เท่านั้น)', () => {
  const variants = {
    COLOR: [{ code: '01', label: 'แดง', status: 'ACTIVE' }, { code: '18', label: 'ดำ', status: 'FROZEN' }],
    SIZE: [{ code: '01', label: 'เล็ก' }],   // ไม่มี status → default ACTIVE
  };
  it('axis COLOR → เฉพาะ ACTIVE', () => {
    const o = registryVariantOptions(variants, 'COLOR');
    expect(o.map(x => x.code)).toEqual(['01']);   // 18 FROZEN ถูกตัด
  });
  it('status ว่าง → นับเป็น ACTIVE', () => {
    expect(registryVariantOptions(variants, 'SIZE').length).toBe(1);
  });
  it('axis NONE → ไม่มีตัวเลือก (variant เดียว)', () => {
    expect(registryVariantOptions(variants, 'NONE')).toEqual([]);
  });
  it('axis ไม่มีในทะเบียน → []', () => {
    expect(registryVariantOptions(variants, 'MATERIAL')).toEqual([]);
    expect(registryVariantOptions({}, 'COLOR')).toEqual([]);
  });
});

// ── META: จุดเชื่อมต่อที่พังแล้วไม่มี error ให้เห็น ──────────────────────────
describe('META — SAFE ROLLOUT + wiring', () => {
  it('dispatcher AddProductView เรนเดอร์ LegacyAddProductView เมื่อ !reg || reg.off', () => {
    expect(/if \(!reg \|\| reg\.off\) return <LegacyAddProductView/.test(VIEWS)).toBe(true);
  });
  it('LegacyAddProductView ยังคงอยู่ครบ (ไม่ถูกลบ) + PurchaseInPanel ในทั้ง 2 flow', () => {
    expect(/function LegacyAddProductView\(/.test(VIEWS)).toBe(true);
    // buy mode (PurchaseInPanel) ต้องมีทั้งใน Legacy และ Registry flow (ไม่ regression)
    expect((VIEWS.match(/<PurchaseInPanel /g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it('prefix registry off → ไม่ยิง list ที่เหลือ (โหลด prefix ก่อนเป็นตัวชี้ขาด)', () => {
    expect(/const rp = await syncListPrefixRegistry\(\);/.test(VIEWS)).toBe(true);
    expect(/if \(!rp \|\| !rp\.success \|\| !rp\.data \|\| rp\.data\.off\) \{ setReg\(\{ off: true \}\); return; \}/.test(VIEWS)).toBe(true);
  });
  it('sync helpers อ่านคำตอบด้วย dmjJson เสมอ (บทเรียนข้อ 13) ไม่มี res.json ดิบ', () => {
    // ทุก syncXxxRegistry / reserveForm ผ่าน syncListRegistry_/syncPostRegistry_ ที่ใช้ dmjJson
    expect(/async function syncListRegistry_\(action\) \{[\s\S]*?return await dmjJson\(res\);/.test(VIEWS)).toBe(true);
    expect(/async function syncPostRegistry_\(payload\) \{[\s\S]*?return await dmjJson\(res\);/.test(VIEWS)).toBe(true);
  });
  it('reserveForm ใช้ formReqId คงที่ (idempotency) — สร้างครั้งเดียวใน ref', () => {
    expect(/if \(!reqIdRef\.current\) reqIdRef\.current = /.test(VIEWS)).toBe(true);
    expect(/formReqId: reqIdRef\.current/.test(VIEWS)).toBe(true);
  });
  it('สร้างสินค้าผ่าน syncAddProduct (addNewProduct เดิม · barcode=sku · D01) ไม่มี path ZORT ใหม่', () => {
    expect(/const r = await syncAddProduct\(\{\s*sku: previewSku,/.test(VIEWS)).toBe(true);
  });
  it('SKU ที่ส่งไปสร้าง = previewSku (ประกอบจากทะเบียน) — human confirm ก่อน (D11)', () => {
    // ปุ่มสร้างเรียก doCreate · doCreate มี guard canCreate ที่เช็ค previewSku + !skuTaken
    expect(/const canCreate = !saving && !!activeForm && previewSku !== "" && !skuTaken/.test(VIEWS)).toBe(true);
  });
  it('กันสร้างทับ SKU เดิม — skuTaken เช็คทั้ง takenVariants และ products จริง', () => {
    expect(/const skuTaken = previewSku && \(takenVariants\.has\(effVariant\) \|\|/.test(VIEWS)).toBe(true);
    expect(/products\.some\(p => String\(p\.sku \|\| ""\)\.trim\(\)\.toUpperCase\(\) === previewSku\)/.test(VIEWS)).toBe(true);
  });
  it('admin gating — RegistryAdminPanel เรนเดอร์เฉพาะ isAdmin (warehouse/staff ไม่เห็น)', () => {
    expect(/const isAdmin = !!\(reg\.me && reg\.me\.admin\);/.test(VIEWS)).toBe(true);
    expect(/topMode === "add" && isAdmin && showAdmin && \(\s*<RegistryAdminPanel/.test(VIEWS)).toBe(true);
    // ปุ่มเปิด admin ก็ gate ด้วย isAdmin
    expect(/topMode === "add" && isAdmin && \(\s*<button type="button" onClick=\{\(\) => setShowAdmin/.test(VIEWS)).toBe(true);
  });
  it('registry ยังไม่มี Prefix ACTIVE → แสดง fallback/incomplete ไม่ปล่อยให้สร้างของพัง', () => {
    expect(/activePrefixes\.length === 0 && \(/.test(VIEWS)).toBe(true);
    expect(/ยังไม่มี Prefix ที่ใช้งานได้/.test(VIEWS)).toBe(true);
  });
  it('axis NONE → variant คงที่ "00" (grammar ต้องมี 2 หลัก)', () => {
    expect(/const REGISTRY_NONE_VARIANT = "00";/.test(VIEWS)).toBe(true);
    expect(/const effVariant = axis === "NONE" \? REGISTRY_NONE_VARIANT : variantCode;/.test(VIEWS)).toBe(true);
  });
  it('Track 2 disable variant ที่ "มีแล้ว" (takenVariants) — กันสร้างซ้ำ', () => {
    expect(/const taken = takenVariants\.has\(v\.code\);/.test(VIEWS)).toBe(true);
    expect(/disabled=\{taken\}/.test(VIEWS)).toBe(true);
  });
});
