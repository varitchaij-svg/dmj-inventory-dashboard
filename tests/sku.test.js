// tests/sku.test.js — ทดสอบ parseSkuParts, nextModelForPrefix (SKU builder ตาม business rule)
import { describe, it, expect } from 'vitest';
import { parseSkuParts, nextModelForPrefix } from './helpers.js';

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
function composeSku({ skuMode, prefix, baseDesignSku, variantCode, products }) {
  const designInfo = (() => {
    const parts = parseSkuParts(baseDesignSku);
    return parts ? { prefix: parts.prefix, model: parts.model } : null;
  })();
  const effPrefix = skuMode === 'color' ? (designInfo ? designInfo.prefix : '') : String(prefix || '').trim().toUpperCase();
  const effModel  = skuMode === 'color' ? (designInfo ? designInfo.model : '') : nextModelForPrefix(prefix, products);
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
});
