// tests/product-owner.test.js
// ─────────────────────────────────────────────────────────────────────────────
// ⭐ ผู้ดูแลสินค้า ("สินค้าตัวนี้ใครดูแล") — ตรรกะที่พลาดแล้วพังเงียบ ๆ:
//   1. อ่านแถว → แมพผู้ดูแล (พลาด = ดาวของคนอื่นโผล่เป็นของเรา / ถอดแล้วไม่หาย)
//   2. ใครเปลี่ยนคนดูแลได้ (พลาด = แย่งดาวกันเงียบ ๆ ไม่มีใครรู้ว่าของหายไปไหน)
//   3. meta — จุดเชื่อมต่อที่ลืมแล้วฟีเจอร์ไม่ทำงานทั้งฟีเจอร์ (สิทธิ์/dispatch/cache)
//
// ⚠️ ข้อตกลงสำคัญของฟีเจอร์นี้: ดาวเป็น "ป้ายบอก" ไม่ใช่ "สิทธิ์" — ห้ามมี guard ที่ไหน
//    ที่ห้ามคนอื่นเช็ค/สั่ง/โอนสินค้าที่ไม่ใช่ของตัวเอง (เจ้าของยืนยัน 2026-07-31)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { productOwnerMapFromRows, productOwnerCanSet } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS  = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VA  = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const VM  = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

// แถว: [sku, staffId, name, updatedAt, status, note]
const row = (sku, staffId, name, status) => [sku, staffId, name, new Date(), status, ''];

describe('productOwnerMapFromRows — แถวในชีต → ใครดูแลอะไร', () => {
  it('แถว active → เข้าแมพพร้อมชื่อ', () => {
    const m = productOwnerMapFromRows([row('R01025', 'ST0003', 'ส้ม', 'active')]);
    expect(m['R01025']).toEqual({ staffId: 'ST0003', name: 'ส้ม' });
  });

  it('status=off → ไม่มีคนดูแล (ถอดดาวแล้วต้องหายจริง)', () => {
    const m = productOwnerMapFromRows([
      row('R01025', 'ST0003', 'ส้ม', 'active'),
      row('R01025', '', '', 'off'),
    ]);
    expect(m['R01025']).toBeUndefined();
  });

  it('staffId ว่างทั้งที่ status=active → ไม่นับ (แถวเสีย ไม่ควรโชว์ดาวลอย)', () => {
    const m = productOwnerMapFromRows([row('OL00001', '', '', 'active')]);
    expect(m['OL00001']).toBeUndefined();
  });

  it('SKU เดียวกันหลายแถว → แถวล่างสุดชนะ (1 สินค้า = 1 คนดูแล)', () => {
    const m = productOwnerMapFromRows([
      row('OL19001', 'ST0001', 'เอ', 'active'),
      row('OL19001', 'ST0002', 'บี', 'active'),
    ]);
    expect(m['OL19001'].staffId).toBe('ST0002');
  });

  it('แถวว่าง/ไม่มี SKU → ข้าม ไม่ระเบิด', () => {
    expect(productOwnerMapFromRows([['', '', '', '', '', '']])).toEqual({});
    expect(productOwnerMapFromRows(null)).toEqual({});
    expect(productOwnerMapFromRows([])).toEqual({});
  });
});

describe('productOwnerCanSet — ใครเปลี่ยน "คนดูแล" ของ SKU นี้ได้', () => {
  const mine = { staffId: 'ST0003', name: 'ส้ม' };

  it('ยังไม่มีคนดูแล → ใครกดก็ได้', () => {
    expect(productOwnerCanSet(null, 'ST0009', 'frontstore', false)).toBe(true);
    expect(productOwnerCanSet({ staffId: '', name: '' }, 'ST0009', 'saler', false)).toBe(true);
  });

  it('ของตัวเอง → ถอด/แก้ได้เสมอ', () => {
    expect(productOwnerCanSet(mine, 'ST0003', 'frontstore', false)).toBe(true);
  });

  it('ของคนอื่น → ต้องยืนยันรับช่วงต่อก่อน (กันแย่งดาวเงียบ ๆ)', () => {
    expect(productOwnerCanSet(mine, 'ST0009', 'frontstore', false)).toBe(false);
    expect(productOwnerCanSet(mine, 'ST0009', 'frontstore', true)).toBe(true);
  });

  it('owner/dev จัดสรรแทนคนอื่นได้เสมอ ไม่ต้องยืนยัน', () => {
    expect(productOwnerCanSet(mine, 'ST0001', 'owner', false)).toBe(true);
    expect(productOwnerCanSet(mine, 'ST0001', 'dev', false)).toBe(true);
  });

  it('takeover ต้องเป็น true จริง ๆ เท่านั้น (ค่า truthy อื่นไม่นับ — กันส่งมั่วจาก client)', () => {
    expect(productOwnerCanSet(mine, 'ST0009', 'frontstore', 'yes')).toBe(false);
    expect(productOwnerCanSet(mine, 'ST0009', 'frontstore', 1)).toBe(false);
  });
});

describe('การเชื่อมต่อ (meta)', () => {
  it('setProductOwner อยู่ใน COMMON_ACTIONS_ — ดาวมีทุก role ที่มีแท็บหน้าร้าน', () => {
    const m = GS.match(/var COMMON_ACTIONS_ = \[[\s\S]*?\];/);
    expect(m, 'หา COMMON_ACTIONS_ ไม่เจอ').toBeTruthy();
    expect(m[0]).toContain('setProductOwner');
  });

  it('doPost dispatch setProductOwner อยู่เหนือ invalidateCache_ (กดดาวต้องไม่ล้าง cache ทั้งก้อน)', () => {
    const iDispatch = GS.indexOf(`data.action === 'setProductOwner'`);
    const iInvalidate = GS.indexOf('invalidateCache_(true);');
    expect(iDispatch, 'ไม่มี dispatch setProductOwner ใน doPost').toBeGreaterThan(0);
    expect(iDispatch).toBeLessThan(iInvalidate);
  });

  it('doGet มี action=productOwners + handler', () => {
    expect(GS).toContain(`e.parameter.action === 'productOwners'`);
    expect(GS).toContain('function listProductOwnersHandler_');
  });

  it('ทั้ง 2 endpoint ตรวจ session จริง ไม่เชื่อ staffId/role จาก client', () => {
    const get  = GS.match(/function listProductOwnersHandler_[\s\S]*?\n}/)[0];
    const post = GS.match(/function setProductOwnerHandler_[\s\S]*?\n^}/m)[0];
    expect(get).toContain('resolveSession_');
    expect(post).toContain('resolveSession_');
    // staffId ต้องมาจาก session — รับจาก client ได้เฉพาะ targetStaffId ของ owner/dev
    expect(post).toContain('String(sess.staffId');
    expect(post).toMatch(/isAdmin\s*&&\s*data\.targetStaffId/);
  });

  it('gate ด้วย PRODUCT_OWNER_ENABLED — ยังไม่เปิดต้องไม่เขียนอะไร', () => {
    expect(GS).toContain(`getProperty('PRODUCT_OWNER_ENABLED')`);
    const post = GS.match(/function setProductOwnerHandler_[\s\S]*?\n^}/m)[0];
    expect(post).toContain('productOwnerEnabled_()');
    expect(GS).toContain('function setupProductOwner()');    // ห้ามลงท้าย _ ไม่งั้นไม่โผล่ใน GAS dropdown
    expect(GS).toContain('function disableProductOwner()');
  });

  it('ข้อมูลผู้ดูแลไม่หลุดเข้า payload หลัก (cache แยกตาม role ไม่ใช่ตามคน)', () => {
    const build = GS.match(/function buildFullData_[\s\S]*?\n^}/m);
    expect(build, 'หา buildFullData_ ไม่เจอ').toBeTruthy();
    expect(build[0]).not.toContain('SHEET_PRODUCT_OWNER');
    expect(build[0]).not.toContain('productOwner');
  });

  it('frontend: ดึงผ่าน endpoint แยก + ส่ง sessionToken ของตัวเอง', () => {
    expect(VA).toContain('action=productOwners');
    expect(VA).toContain('dmj_session_token');
    expect(VA).toContain('function useProductOwners');
  });

  it('frontend: ปุ่มดาวซ่อนเมื่อระบบยังไม่เปิด (off) — ไม่ให้กดแล้วเงียบ', () => {
    expect(VA).toContain('prodOwner.off ? undefined');
    // FSCard ไม่มี onToggleOwner = ไม่เรนเดอร์ปุ่มเลย
    expect(VM).toMatch(/function OwnerStar[\s\S]*?if \(!onToggle\) return null;/);
  });

  it('หน้า "สินค้า & สั่ง" มีทางเข้า "ของฉัน" ครบ 2 จุด (การ์ดบนสุด + ตัวเลือกใน dropdown หมวด)', () => {
    // 2 จุดนี้คือทางที่พนักงานใช้จริง — หายไปจุดใดจุดหนึ่ง = คนที่จำอีกทางไม่ได้หาไม่เจอเลย
    expect(VM, 'ไม่มีการ์ด "สินค้าที่ฉันดูแล" บนสุดของ CategoryView')
      .toMatch(/สินค้าที่ฉันดูแล — \{fmtN\(mySkus\.size\)\}/);
    expect(VM, 'ไม่มีตัวเลือก "⭐ ของฉัน" ใน dropdown หมวด')
      .toContain('<option value="__MINE__">⭐ ของฉัน ({mySkus.size})</option>');
    // ทั้งคู่ต้องซ่อนเมื่อระบบปิด/ยังไม่เคยกดดาว — ไม่งั้นกดแล้วได้หน้าว่างเปล่า
    expect(VM).toContain('const showMineUI = !prodOwner.off && mySkus.size > 0;');
  });

  it('"ของฉัน" เป็น filter เสริม ไม่ใช่หมวด — ไม่ไปทับ logic ของ active', () => {
    // ถ้าเผลอเก็บเป็นค่าใน active ("__MINE__") จะไปโผล่เป็นชื่อหมวดในป้าย/สถิติ/ตัวกรอง
    // อีกหลายสิบจุดที่อ่าน active อยู่ → ต้องแปลงเป็น mineOnly + active="" เสมอ
    expect(VM).toContain('setMineOnly(v === "__MINE__");');
    expect(VM).toContain('setActive(v === "__MINE__" ? "" : v);');
    // กรองใน applyCommon จุดเดียว → มีผลทุกโหมด (ค้นหาทั้งระบบ / เลือกร้าน / เลือกหมวด)
    const applyCommon = VM.match(/const applyCommon = \(arr\) => \{[\s\S]*?\n    \};/)[0];
    expect(applyCommon).toContain('if (mineOnly) f = f.filter(p => mySkus.has(p.sku));');
  });

  it('ดาวเป็นป้ายบอก ไม่ใช่สิทธิ์ — ปุ่มเช็ค/สั่ง/โอนไม่ถูก disable ตามเจ้าของ', () => {
    // FSCard รับ owner/isMine ไว้แค่แสดงผล — ห้ามเอาไปคุม disabled ของ input/ปุ่มใด ๆ
    const card = VM.match(/const FSCard = React\.memo[\s\S]*?\n\}\);/)[0];
    expect(card).not.toMatch(/disabled[^\n]*isMine/);
    expect(card).not.toMatch(/disabled[^\n]*owner/);
  });
});
