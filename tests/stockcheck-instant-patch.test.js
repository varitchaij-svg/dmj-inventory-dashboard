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

describe('StockCountView (คลัง): ส่ง counts จาก savedQtys เป็น qtyWH', () => {
  it('มี buildCheckCountsWH ที่ map savedQtys → { qtyWH }', () => {
    expect(STOCKCOUNT).toContain('const buildCheckCountsWH = ()');
    const m = STOCKCOUNT.match(/const buildCheckCountsWH = \(\) => \{[\s\S]*?\n  \};/);
    expect(m).toBeTruthy();
    expect(m[0]).toContain('savedQtys');
    expect(m[0]).toMatch(/qtyWH:\s*savedQtys\[sku\]/);
    expect(m[0]).toContain('.toUpperCase()');
  });

  it('ทุกปุ่ม "ยืนยันเช็คเสร็จ" ของ StockCountView ส่ง buildCheckCountsWH()', () => {
    const calls = STOCKCOUNT.match(/onCheckComplete\(checkRequest\.reqId, buildCheckCountsWH\(\)\)/g) || [];
    expect(calls.length, 'ต้องส่ง counts ครบทุกปุ่มยืนยัน (3 render branch)').toBe(3);
    // ต้องไม่มีปุ่มไหนเรียกแบบไม่ส่ง counts หลงเหลือ
    expect(STOCKCOUNT).not.toMatch(/onCheckComplete\(checkRequest\.reqId\)(?!,)/);
  });
});

describe('FrontStoreView (หน้าร้าน): ส่ง counts จาก savedSkus/checkedQtys เป็น qtyStore', () => {
  it('มี buildCheckCountsFS ที่ map savedSkus → { qtyStore }', () => {
    expect(FRONTSTORE).toContain('const buildCheckCountsFS = ()');
    const m = FRONTSTORE.match(/const buildCheckCountsFS = \(\) => \{[\s\S]*?\n  \};/);
    expect(m).toBeTruthy();
    expect(m[0]).toContain('savedSkus');
    expect(m[0]).toContain('checkedQtys[sku]');
    expect(m[0]).toMatch(/qtyStore:\s*parseInt\(v\)/);
  });

  it('ปุ่ม "เสร็จแล้ว" ส่ง buildCheckCountsFS()', () => {
    expect(FRONTSTORE).toContain('onCheckComplete(checkRequest.reqId, buildCheckCountsFS())');
  });
});
