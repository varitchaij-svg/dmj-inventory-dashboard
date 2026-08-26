// tests/stockcheck-instant-patch.test.js — กด "ยืนยันเช็คเสร็จ" แล้วเว็บอัปเดต "เฉพาะ SKU ที่นับ" ทันที
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของถาม (ส.ค. 2026): "พนักงานกดยืนยันเช็คเสร็จ ให้เว็บอัปเดตแค่สินค้าที่นับใหม่ทันทีเลยได้มั้ย"
// เดิม onCheckComplete ทำแค่ POST completeStockCheck แล้ว fetchFromSheet() (reload ทั้งก้อน 4.2MB)
// → ตัวเลขบนเว็บค้างของเก่าจนกว่าจะโหลดเสร็จ · ตอนนี้ patch เฉพาะ SKU ที่นับเข้า data.products ทันที
// (optimistic) แล้วค่อย reconcile เบื้องหลัง
//
// เทสต์เป็น meta-test สแกนต้นทางจริง (เหมือน stockcheck-split / gasjson) — คุมจุดเชื่อมต่อที่
// "พังแล้วเงียบ": ถ้า patch qtyWH/qtyStore แต่ลืมคำนวณ qty/isOOS ใหม่ = ซ้ำรอยบั๊ก WL (มีของแต่โชว์หมด)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP  = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('หา function ในต้นทางไม่เจอ: ' + name);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}
const FRONTSTORE = grabFn(VANA, 'FrontStoreView');
const STOCKCOUNT = grabFn(VANA, 'StockCountView');

describe('app.jsx: patchProductQtys — patch เฉพาะ SKU ที่นับ + คำนวณสถานะสต็อกใหม่', () => {
  const m = APP.match(/const patchProductQtys = usC\(\(patchMap\)[\s\S]*?\n  \}, \[\]\);/);
  const fn = m ? m[0] : '';

  it('มีฟังก์ชัน patchProductQtys', () => {
    expect(fn, 'ต้องมี patchProductQtys ใน app.jsx').toBeTruthy();
  });

  it('patch qtyWH/qtyStore ตาม patchMap (ใส่คีย์ไหนแก้เฉพาะคอลัมน์นั้น)', () => {
    expect(fn).toContain('patch.qtyStore');
    expect(fn).toContain('patch.qtyWH');
    // จับคู่ด้วย SKU ตัวใหญ่ (ตรงกับที่ view ส่งมา)
    expect(fn).toMatch(/patchMap\[String\(p\.sku[^\]]*\)\.toUpperCase\(\)\]/);
  });

  it('⚠️ ต้องคำนวณ qty/isOOS/qtyStatus ใหม่ (ไม่งั้นซ้ำรอยบั๊ก WL: มีของแต่โชว์หมด)', () => {
    expect(fn).toMatch(/qty:\s*total/);
    expect(fn).toContain('isOOS:');
    expect(fn).toContain('qtyStatus:');
    expect(fn).toContain('const total = qtyStore + qtyWH');
    // ใช้อัตราขายส่งคำนวณมูลค่าสต็อกใหม่ให้ตรงกับ payload/stocklite
    expect(fn).toMatch(/stockValueWH:\s*qtyWH\s*\* price \* whR/);
  });

  it('ไม่ re-render ถ้าไม่มีอะไรเปลี่ยน (changed guard)', () => {
    expect(fn).toContain('if (!changed) return prev;');
  });
});

describe('app.jsx: onCheckComplete รับ counts + patch ทันทีก่อน reconcile', () => {
  it('ทั้ง 2 handler รับ (reqId, counts) และเรียก patchProductQtys(counts)', () => {
    const calls = APP.match(/onCheckComplete=\{async function\(reqId, counts\)\{/g) || [];
    expect(calls.length, 'ต้องมี onCheckComplete(reqId, counts) 2 ที่ (stockcount + frontstore)').toBe(2);
    const patches = APP.match(/patchProductQtys\(counts\)/g) || [];
    expect(patches.length, 'ทั้ง 2 handler ต้องเรียก patchProductQtys(counts)').toBe(2);
  });

  it('ยัง fetchFromSheet() เบื้องหลังเพื่อ reconcile (รีเฟรช pendingChecks + ค่าจริง)', () => {
    // patch เป็น optimistic — ยังต้อง reload จริงตามหลังเพื่อปิดคำขอ + ได้ค่าที่ authoritative
    const calls = APP.match(/fetchFromSheet\(\); \/\/ reconcile/g) || [];
    expect(calls.length, 'ทั้ง 2 handler ต้อง reconcile ตามหลัง').toBe(2);
  });
});

describe('app.jsx: markCheckSideDone — ปิดคำขอฝั่งตัวเองในมือทันที (แบนเนอร์หายเลย)', () => {
  const m = APP.match(/const markCheckSideDone = usC\(\(reqId, side\)[\s\S]*?\n  \}, \[\]\);/);
  const fn = m ? m[0] : '';

  it('มีฟังก์ชัน markCheckSideDone', () => {
    expect(fn, 'ต้องมี markCheckSideDone ใน app.jsx').toBeTruthy();
  });

  it('อัปเดตเฉพาะฝั่งที่ปิด (fsStatus/whStatus) ของ reqId นั้น เป็น "done"', () => {
    expect(fn).toMatch(/side === 'fs' \? 'fsStatus' : 'whStatus'/);
    expect(fn).toContain('stockCheckRequests');
    expect(fn).toContain("r[key] === 'done'");
    // จับคู่ด้วย reqId (ไม่แตะคำขออื่น)
    expect(fn).toMatch(/String\(r\.reqId\) !== String\(reqId\)/);
  });

  it('ทั้ง 2 handler เรียก markCheckSideDone ด้วย side ที่ถูก (wh / fs) + เคลียร์ activeCheckRequest ทันที', () => {
    expect(APP).toContain("markCheckSideDone(reqId, 'wh')");
    expect(APP).toContain("markCheckSideDone(reqId, 'fs')");
    // setActiveCheckRequest(null) ต้องอยู่ก่อน await POST (แบนเนอร์ในหน้าไม่รอเน็ต)
    const whIdx = APP.indexOf("markCheckSideDone(reqId, 'wh')");
    const seg = APP.slice(whIdx, whIdx + 800);
    expect(seg).toContain('setActiveCheckRequest(null)');
    expect(seg).toContain('await dmjFetch');
    expect(seg.indexOf('setActiveCheckRequest(null)')).toBeLessThan(seg.indexOf('await dmjFetch'));
  });
});

describe('StockCountView (คลัง): กดเสร็จ → flush ก่อน แล้ว patch qtyWH (รวมค่าที่เพิ่งปรับ)', () => {
  const m = STOCKCOUNT.match(/const finishCheck = async \(\) => \{[\s\S]*?\n  \};/);
  const fn = m ? m[0] : '';

  it('มี finishCheck ที่ await handleSave(true) ก่อน (flush ค่าที่ยังไม่ auto-save)', () => {
    expect(fn, 'ต้องมี finishCheck ใน StockCountView').toBeTruthy();
    expect(fn).toContain('await handleSave(true)');
  });

  it('flush ล้มเหลว → ไม่ปิดคำขอ (return ก่อน onCheckComplete)', () => {
    expect(fn).toContain('res.success === false');
    const iGuard = fn.indexOf('res.success === false');
    const iComplete = fn.indexOf('onCheckComplete(');
    expect(iGuard).toBeGreaterThan(-1);
    expect(iComplete).toBeGreaterThan(-1);
    expect(iGuard, 'guard ต้องอยู่ก่อน onCheckComplete').toBeLessThan(iComplete);
  });

  it('counts รวม savedQtys + res.saved (ค่าที่เพิ่ง flush) เป็น qtyWH', () => {
    expect(fn).toMatch(/qtyWH:\s*savedQtys\[sku\]/);
    expect(fn).toMatch(/qtyWH:\s*e\.qty/);
    expect(fn).toContain('res && res.saved');
  });

  it('handleSave คืน { success, saved } (ให้ finishCheck ได้ค่าที่เพิ่งเซฟทันที ไม่ต้องรอ state)', () => {
    expect(STOCKCOUNT).toContain('return { success: true, saved: entries };');
    expect(STOCKCOUNT).toContain('return { success: false, saved: [] };');
  });

  it('ทุกปุ่ม "ยืนยันเช็คเสร็จ" (4 render branch: product/step1/step2/step3) เรียก finishCheck()', () => {
    const calls = STOCKCOUNT.match(/onClick=\{function\(\)\{ finishCheck\(\); \}\}/g) || [];
    expect(calls.length, 'ต้องเรียก finishCheck ครบทุกปุ่มยืนยัน (4 branch — product-first เพิ่มมา)').toBe(4);
    // ต้องไม่มีปุ่มไหนส่งไปโดยไม่ flush หลงเหลือ (buildCheckCountsWH ถูกลบแล้ว)
    expect(STOCKCOUNT).not.toContain('buildCheckCountsWH');
  });
});

describe('FrontStoreView (หน้าร้าน): กดเสร็จ → flush ก่อน แล้ว patch qtyStore', () => {
  const m = FRONTSTORE.match(/const finishCheckFS = async \(\) => \{[\s\S]*?\n  \};/);
  const fn = m ? m[0] : '';

  it('มี finishCheckFS ที่ await handleSave(true) ก่อน + guard ล้มเหลว', () => {
    expect(fn, 'ต้องมี finishCheckFS ใน FrontStoreView').toBeTruthy();
    expect(fn).toContain('await handleSave(true)');
    expect(fn).toContain('res.success === false');
  });

  it('counts รวม savedSkus/checkedQtys + res.saved เป็น qtyStore', () => {
    expect(fn).toContain('savedSkus');
    expect(fn).toMatch(/qtyStore:\s*parseInt\(v\)/);
    expect(fn).toMatch(/qtyStore:\s*e\.qty/);
  });

  it('handleSave ของ FrontStoreView คืน { success, saved }', () => {
    expect(FRONTSTORE).toContain('return { success: true, saved: entries };');
    expect(FRONTSTORE).toContain('return { success: false, saved: [] };');
  });

  it('ปุ่ม "เสร็จแล้ว" เรียก finishCheckFS() (buildCheckCountsFS ถูกลบแล้ว)', () => {
    expect(FRONTSTORE).toContain('onClick={function(){ finishCheckFS(); }}');
    expect(FRONTSTORE).not.toContain('buildCheckCountsFS');
  });
});
