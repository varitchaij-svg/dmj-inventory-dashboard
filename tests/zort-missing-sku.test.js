// tests/zort-missing-sku.test.js — SKU มีอยู่จริงใน ZORT แต่ syncNewProductsFromZort ไม่เคยเห็น
// ─────────────────────────────────────────────────────────────────────────────
// เจอจริง ก.ย. 2026: พนักงานหา SKU ไม่เจอในแอป · checkMissingSku บอกว่า "มีใน ZORT ไม่มีในชีตเรา"
// กดปุ่ม ⬇️ (syncZortNow → syncZortBoth → syncNewProductsFromZort) กี่ครั้งก็ไม่เข้า
// ต้นเหตุ: syncNewProductsFromZort เดิมดูแค่ productsWH/productsFS ที่ fetchAllZortProducts_
// กรองด้วย `warehousecode=` — SKU ที่ไม่มี stock record ในคลังทั้ง WH_SAI5/WH_FRONTSTORE เลย
// (เช่นสินค้าใหม่ที่ยังไม่ถูกจัดเข้าคลังไหน) จะไม่โผล่ในทั้ง 2 รายการนี้เลย — ปัญหาที่
// debugFindMissingSkusByPrefix (เครื่องมือ diagnostic เดิม) เคยบันทึกไว้แต่ตัว sync จริงไม่เคยแก้
//
// eval ฟังก์ชันจริงจาก .gs (ไม่ copy — เหมือน auth.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(re, label) {
  const m = GS.match(re);
  if (!m) throw new Error('หาโค้ดใน .gs ไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

const F_ROW = grab(/function newProductRowFromZort_\(p, sku\) \{[\s\S]*?\n\}/, 'newProductRowFromZort_');
// eslint-disable-next-line no-new-func
const { newProductRowFromZort_ } = new Function(F_ROW + '\nreturn { newProductRowFromZort_ };')();

describe('newProductRowFromZort_ — แถวที่เขียนตอนพบสินค้าใหม่จาก ZORT', () => {
  it('ประกอบแถวตามตำแหน่งคอลัมน์ที่ readProducts_ คาดหวัง (A..I)', () => {
    const row = newProductRowFromZort_({
      name: 'กุหลาบแดง', category: 'ดอกไม้', subCategory: 'พรีเมียม',
      tag: ['DS', 'ACME'], availablestock: 12, sellprice: 199,
    }, 'R01025');
    expect(row).toEqual(['', 'R01025', 'กุหลาบแดง', 'ดอกไม้', 'พรีเมียม', 'DS,ACME', 0, 12, 199]);
  });

  it('qtyStore (col G) seed เป็น 0 เสมอ — ไม่รู้ว่าอยู่คลังไหนจนกว่า syncZortToColumn_ จะแก้', () => {
    const row = newProductRowFromZort_({ name: 'x' }, 'X001');
    expect(row[6]).toBe(0);
  });

  it('ค่าที่ขาด (name/category/tag/availablestock/sellprice) ไม่พังเป็น undefined', () => {
    const row = newProductRowFromZort_({}, 'X002');
    expect(row).toEqual(['', 'X002', '', '', '', '', 0, 0, 0]);
  });

  it('tag string เดี่ยว (ไม่ใช่ array) ก็ทำงานได้', () => {
    const row = newProductRowFromZort_({ tag: 'ACME' }, 'X003');
    expect(row[5]).toBe('ACME');
  });
});

// ── meta-test: SKU ที่ไม่มี stock record ในคลังที่กำหนดไว้ ต้องยังถูกจับได้ ──
describe('meta: syncNewProductsFromZort ต้องไม่พลาด SKU ที่ไม่มี stock ในคลังทั้ง 2 ที่กำหนด', () => {
  const FN = grab(/function syncNewProductsFromZort\(cachedWH, cachedFS\) \{[\s\S]*?\n\}/, 'syncNewProductsFromZort');

  it('ยังเรียก fetchAllZortProducts_ 2 ครั้งแบบกรองคลัง (WH_SAI5/WH_FRONTSTORE) เหมือนเดิม', () => {
    expect(FN).toMatch(/fetchAllZortProducts_\(WH_SAI5\)/);
    expect(FN).toMatch(/fetchAllZortProducts_\(WH_FRONTSTORE\)/);
  });

  it('มีรอบดึงสินค้าทั้งหมดแบบไม่กรอง warehouse เป็นตาข่ายกันพลาดเพิ่มขึ้นมา', () => {
    // ต้องเป็นคนละ call จาก 2 อันข้างบน — เรียกลอยๆ ไม่มี argument
    expect(FN).toMatch(/fetchAllZortProducts_\(\)/);
  });

  it('รอบดึงทั้งหมดห่อ try/catch — พังแล้วห้ามทำให้ทั้ง sync ล้ม (ยังต้องเห็นผล 2 รอบแรก)', () => {
    expect(FN).toMatch(/try \{\s*\n\s*const allZort = fetchAllZortProducts_\(\);[\s\S]*?\} catch \(e\)/);
  });

  it('เช็ค existingSKUs ก่อนเขียนทั้ง 2 รอบ (กันซ้ำ ทั้งกับชีตเดิมและกับที่เพิ่งเพิ่มในรอบแรก)', () => {
    const hits = (FN.match(/!existingSKUs\[sku\]/g) || []).length;
    expect(hits).toBe(2);
    // รอบแรกต้องอัปเดต existingSKUs ทันทีหลังเพิ่ม ไม่งั้นรอบ 2 (unfiltered) เพิ่มซ้ำ SKU เดียวกัน
    expect(FN).toMatch(/existingSKUs\[sku\] = true;/);
  });

  it('ใช้ newProductRowFromZort_ ร่วมกันทั้ง 2 รอบ — ไม่มีแถวที่ประกอบเองแยกอีกชุด', () => {
    const hits = (FN.match(/newProductRowFromZort_\(p, sku\)/g) || []).length;
    expect(hits).toBe(2);
  });
});
