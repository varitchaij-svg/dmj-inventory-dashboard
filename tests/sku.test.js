// tests/sku.test.js — ทดสอบ parseSkuParts, nextModelForPrefix (SKU builder ตาม business rule)
import { describe, it, expect } from 'vitest';
import { parseSkuParts, nextModelForPrefix, resolveCategoryPrefix, findNameDuplicates } from './helpers.js';

const P = (sku, category) => ({ sku, category: category || 'ดอกไม้' });

describe('parseSkuParts', () => {
  it('แยก [Prefix][Variant2][Model3] ถูกต้อง', () => {
    expect(parseSkuParts('OL19001')).toEqual({ prefix: 'OL', variant: '19', model: '001' });
    expect(parseSkuParts('R01025')).toEqual({ prefix: 'R', variant: '01', model: '025' });
    expect(parseSkuParts('R10025')).toEqual({ prefix: 'R', variant: '10', model: '025' });
    expect(parseSkuParts('OL00001')).toEqual({ prefix: 'OL', variant: '00', model: '001' });
  });

  it('รองรับ prefix ยาว 3 ตัว', () => {
    expect(parseSkuParts('ABC12345')).toEqual({ prefix: 'ABC', variant: '12', model: '345' });
  });

  it('normalize ตัวพิมพ์เล็ก + เว้นวรรค', () => {
    expect(parseSkuParts('  ol19001 ')).toEqual({ prefix: 'OL', variant: '19', model: '001' });
  });

  it('คืน null เมื่อไม่เข้ารูปแบบมาตรฐาน', () => {
    expect(parseSkuParts('HL003006')).toBeNull();   // 6 หลัก (scheme เก่า)
    expect(parseSkuParts('OL1901')).toBeNull();      // เลขไม่ครบ 5
    expect(parseSkuParts('OLLL19001')).toBeNull();   // prefix เกิน 3
    expect(parseSkuParts('19001')).toBeNull();       // ไม่มี prefix
    expect(parseSkuParts('')).toBeNull();
    expect(parseSkuParts(null)).toBeNull();
    expect(parseSkuParts(undefined)).toBeNull();
  });
});

describe('nextModelForPrefix', () => {
  it('หา Model ถัดไปจาก max ของ prefix นั้น', () => {
    const products = [P('R01025'), P('R10025'), P('R19025'), P('R01026')];
    expect(nextModelForPrefix('R', products)).toBe('027');
  });

  it('สีต่างกันของแบบเดียวกันไม่ดันเลข Model (max อิงเลข Model จริง)', () => {
    // 3 สีของแบบ 025 → Model ถัดไปยังเป็น 026
    const products = [P('R01025'), P('R10025'), P('R19025')];
    expect(nextModelForPrefix('R', products)).toBe('026');
  });

  it('prefix ที่ยังไม่มีสินค้ามาตรฐาน → เริ่ม 001', () => {
    expect(nextModelForPrefix('OL', [P('R01025')])).toBe('001');
    expect(nextModelForPrefix('XX', [])).toBe('001');
  });

  it('นับเฉพาะ prefix ที่ตรง — ไม่ปนกับ prefix อื่น', () => {
    const products = [P('R01025'), P('OL19001'), P('OL19002')];
    expect(nextModelForPrefix('OL', products)).toBe('003');
    expect(nextModelForPrefix('R', products)).toBe('026');
  });

  it('ข้าม SKU รูปแบบเก่า (ไม่เข้ามาตรฐาน) ทิ้ง', () => {
    const products = [P('HL003006'), P('R01025')];
    expect(nextModelForPrefix('R', products)).toBe('026');
    expect(nextModelForPrefix('HL', products)).toBe('001'); // HL003006 ไม่ parse → ไม่มีแบบมาตรฐาน
  });

  it('case-insensitive prefix', () => {
    expect(nextModelForPrefix('r', [P('R01025')])).toBe('026');
  });

  it('prefix ว่าง → คืน ""', () => {
    expect(nextModelForPrefix('', [P('R01025')])).toBe('');
  });
});

// ── จำลองการประกอบ SKU ใน AddProductView (effPrefix/effModel/variantCode2/assembledSku) ──
// mirror ตรรกะจริงในคอมโพเนนต์ เพื่อ guard ปลายทางว่า "ประกอบ SKU ถูกตาม business rule"
function composeSku({ skuMode, prefix, baseDesignSku, variantCode, products, heldDesign }) {
  const designInfo = (() => {
    const parts = parseSkuParts(baseDesignSku);
    return parts ? { prefix: parts.prefix, model: parts.model } : null;
  })();
  const effPrefix = skuMode === 'color' ? (designInfo ? designInfo.prefix : '') : String(prefix || '').trim().toUpperCase();
  const held = (skuMode === 'new' && heldDesign && heldDesign.prefix === effPrefix) ? heldDesign.model : null;
  const effModel  = skuMode === 'color' ? (designInfo ? designInfo.model : '') : (held || nextModelForPrefix(prefix, products));
  const variantCode2 = /^\d$/.test(variantCode) ? '0' + variantCode : variantCode;
  return (/^[A-Z]{1,3}$/.test(effPrefix) && /^\d{2}$/.test(variantCode2) && /^\d{3}$/.test(effModel))
    ? effPrefix + variantCode2 + effModel : '';
}

describe('composeSku (AddProductView)', () => {
  const base = [P('R01025'), P('R10025'), P('R19025'), P('OL19001')];

  it('แบบใหม่: prefix + สี + Model ถัดไป', () => {
    expect(composeSku({ skuMode: 'new', prefix: 'R', variantCode: '01', products: base })).toBe('R01026');
    expect(composeSku({ skuMode: 'new', prefix: 'OL', variantCode: '19', products: base })).toBe('OL19002');
  });

  it('แบบใหม่: prefix ใหม่เริ่ม Model 001', () => {
    expect(composeSku({ skuMode: 'new', prefix: 'TL', variantCode: '31', products: base })).toBe('TL31001');
  });

  it('แบบใหม่: pad variant 1 หลัก → 2 หลัก', () => {
    expect(composeSku({ skuMode: 'new', prefix: 'R', variantCode: '9', products: base })).toBe('R09026');
  });

  it('สีใหม่ของแบบเดิม: คงเลข Model ของแบบเดิม เปลี่ยนแค่สี', () => {
    // เพิ่มสี 09 ให้แบบ R··025 → R09025 (ไม่ใช่ 026)
    expect(composeSku({ skuMode: 'color', baseDesignSku: 'R01025', variantCode: '09', products: base })).toBe('R09025');
    expect(composeSku({ skuMode: 'color', baseDesignSku: 'OL19001', variantCode: '01', products: base })).toBe('OL01001');
  });

  it('ยังไม่ครบ → คืน "" (ปุ่มบันทึกจะ disable)', () => {
    expect(composeSku({ skuMode: 'new', prefix: '', variantCode: '01', products: base })).toBe('');
    expect(composeSku({ skuMode: 'new', prefix: 'R', variantCode: '', products: base })).toBe('');
    expect(composeSku({ skuMode: 'color', baseDesignSku: '', variantCode: '01', products: base })).toBe('');
  });

  it('แบบใหม่หลายสี: ล็อกเลข Model ไว้ → สีถัดไปไม่รันหนี (บั๊กที่ผู้ใช้เจอ)', () => {
    // สร้างแบบใหม่ R··026 สีแรก 01 → บันทึก → products มี R01026 แล้ว
    const afterFirst = [...base, P('R01026')];
    // ถ้าไม่ล็อก: nextModel = 027 → สีที่ 2 จะเป็น R19027 (ผิด — คนละแบบ)
    expect(composeSku({ skuMode: 'new', prefix: 'R', variantCode: '19', products: afterFirst })).toBe('R19027');
    // เมื่อล็อกแบบไว้ (heldDesign): สีที่ 2 คงเลข 026 → R19026 (ถูก)
    expect(composeSku({ skuMode: 'new', prefix: 'R', variantCode: '19', products: afterFirst, heldDesign: { prefix: 'R', model: '026' } })).toBe('R19026');
    // สีที่ 3 ก็ยังคง 026
    const afterSecond = [...afterFirst, P('R19026')];
    expect(composeSku({ skuMode: 'new', prefix: 'R', variantCode: '10', products: afterSecond, heldDesign: { prefix: 'R', model: '026' } })).toBe('R10026');
  });

  it('ล็อกใช้เฉพาะ prefix ที่ตรงกัน — เปลี่ยน prefix แล้วล็อกไม่มีผล', () => {
    // heldDesign เป็นของ R แต่ตอนนี้ prefix = OL → ต้องใช้ nextModel ของ OL
    expect(composeSku({ skuMode: 'new', prefix: 'OL', variantCode: '19', products: base, heldDesign: { prefix: 'R', model: '026' } })).toBe('OL19002');
  });
});

// ── Feature 2 (Add Product Assistant) ────────────────────────────────────────
// resolveCategoryPrefix — "Existing Prefix Wins" → CATEGORY_SKU_PREFIX → none (ห้ามเดา)
describe('resolveCategoryPrefix', () => {
  const N = (sku, category) => ({ sku, category });
  const catalog = [
    N('OL19001', 'มะกอก'), N('OL10001', 'มะกอก'), N('OL01002', 'มะกอก'),
    N('R01025', 'กุหลาบ'), N('R19025', 'กุหลาบ'),
    N('X99001', 'มะกอก'),  // prefix ส่วนน้อยในหมวดมะกอก
  ];

  it('existing prefix wins — คืน prefix เด่นสุดในหมวด', () => {
    const r = resolveCategoryPrefix('มะกอก', catalog, {});
    expect(r.prefix).toBe('OL');
    expect(r.source).toBe('existing');
    expect(r.count).toBe(3);
  });

  it('หมวดอื่นได้ prefix ของหมวดตัวเอง', () => {
    expect(resolveCategoryPrefix('กุหลาบ', catalog, {}).prefix).toBe('R');
  });

  it('หมวดที่ยังไม่มีของ → ใช้ map ถ้ามี (source:map)', () => {
    const r = resolveCategoryPrefix('ทานตะวัน', catalog, { 'ทานตะวัน': 'SF' });
    expect(r).toEqual({ prefix: 'SF', source: 'map', count: 0 });
  });

  it('หมวดใหม่ไม่มีทั้งของและ map → source:none (ไม่เดา)', () => {
    const r = resolveCategoryPrefix('ทานตะวัน', catalog, {});
    expect(r).toEqual({ prefix: '', source: 'none', count: 0 });
  });

  it('หมวดว่าง → none', () => {
    expect(resolveCategoryPrefix('', catalog, {}).source).toBe('none');
    expect(resolveCategoryPrefix('   ', catalog, {}).source).toBe('none');
  });

  it('existing ชนะ map เสมอ (แม้จะตั้ง map ไว้)', () => {
    const r = resolveCategoryPrefix('มะกอก', catalog, { 'มะกอก': 'ZZ' });
    expect(r.source).toBe('existing');
    expect(r.prefix).toBe('OL');
  });

  it('map ที่รูปแบบไม่ถูกต้อง (ไม่ใช่ 1–3 ตัวอักษร) → ไม่ใช้ → none', () => {
    expect(resolveCategoryPrefix('ทานตะวัน', catalog, { 'ทานตะวัน': 'sf1' }).source).toBe('none');
    expect(resolveCategoryPrefix('ทานตะวัน', catalog, { 'ทานตะวัน': 'ABCD' }).source).toBe('none');
  });

  it('เสมอกัน → เลือกตามตัวอักษร (ผลคงที่ ไม่สุ่ม)', () => {
    const tie = [N('AA01001', 'x'), N('BB01001', 'x')];
    const r1 = resolveCategoryPrefix('x', tie, {});
    const r2 = resolveCategoryPrefix('x', tie.slice().reverse(), {});
    expect(r1.prefix).toBe('AA');
    expect(r2.prefix).toBe('AA');
  });
});

// findNameDuplicates — เตือน soft เท่านั้น (multi-token AND-match)
describe('findNameDuplicates', () => {
  const catalog = [
    { sku: 'OL19001', name: 'มะกอก ขาว 68' },
    { sku: 'OL10001', name: 'มะกอก เหลือง 68' },
    { sku: 'R01025', name: 'กุหลาบ แดง 120' },
    { sku: 'X1', name: '' },   // ไม่มีชื่อ — ต้องถูกข้าม
  ];

  it('จับชื่อคล้าย (token เดียว)', () => {
    const r = findNameDuplicates('มะกอก', catalog);
    expect(r.map(x => x.sku)).toEqual(['OL19001', 'OL10001']);
  });

  it('multi-token AND — ต้องเจอทุก token', () => {
    expect(findNameDuplicates('มะกอก เหลือง', catalog).map(x => x.sku)).toEqual(['OL10001']);
    expect(findNameDuplicates('มะกอก ฟ้า', catalog)).toEqual([]);
  });

  it('น้อยกว่า 2 ตัวอักษร → ไม่เตือน', () => {
    expect(findNameDuplicates('ม', catalog)).toEqual([]);
    expect(findNameDuplicates('', catalog)).toEqual([]);
  });

  it('ข้ามสินค้าที่ไม่มีชื่อ', () => {
    expect(findNameDuplicates('', catalog)).toEqual([]);
    // token ที่ไม่ตรงใคร
    expect(findNameDuplicates('ทานตะวัน', catalog)).toEqual([]);
  });

  it('เคารพ limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ sku: 'S' + i, name: 'ดอก ' + i }));
    expect(findNameDuplicates('ดอก', many, 3)).toHaveLength(3);
  });

  it('คืน sku ตัวพิมพ์ใหญ่', () => {
    expect(findNameDuplicates('กุหลาบ', catalog)[0].sku).toBe('R01025');
  });
});
