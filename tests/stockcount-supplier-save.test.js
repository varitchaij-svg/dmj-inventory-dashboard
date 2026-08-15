// tests/stockcount-supplier-save.test.js — นับ stock คลัง "ตามซัพพลายเออร์" ต้องเข้าคลัง + ZORT
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของแจ้ง (ส.ค. 2026, พร้อมภาพ): เลือกซัพพลายเออร์ (เช่น 🏭 GX2312) แล้วนับสต็อกคลัง →
// กด "บันทึก" ขึ้น "✓ บันทึกแล้ว" แต่ **จำนวนไม่เข้าคลัง/ไม่ถูกส่งไป ZORT**
//
// ต้นเหตุ: `StockCountView` มี 2 โหมด — ตามล็อค (selLockKey) กับตามซัพพลายเออร์ (selSupplier)
//   · โหมดตามล็อค: ปุ่มเรียก `handleSave` → syncLockData (ตำแหน่ง) + `confirmStockCount` (คลัง+ZORT)
//   · โหมดตามซัพพลายเออร์ **เดิม**: ปุ่มเรียก `handleSaveSupplier` ที่บันทึก **ตำแหน่งอย่างเดียว**
//     (syncLockData ต่อล็อค) **ไม่เคยเรียก confirmStockCount เลย** → คลัง/ZORT ไม่ขยับ
//   · ส่วน auto-save เรียก `handleSave` ซึ่ง commit ZORT ได้ แต่ไม่บันทึกตำแหน่ง → 2 เส้นทาง
//     ทำคนละครึ่ง ผู้ใช้กดปุ่มเห็น "บันทึกแล้ว" แล้วออกจากหน้าไปก่อน auto-save ยิง = ไม่ถึง ZORT
//
// การแก้: รวมทั้ง 2 โหมดมาที่ `handleSave` ตัวเดียว — บันทึกตำแหน่ง (ตามล็อค หรือจัดกลุ่มตาม
// skuToLock ในโหมดซัพพลายเออร์) **แล้ว** confirmStockCount เสมอ · ลบ `handleSaveSupplier` ทิ้ง ·
// ปุ่มโหมดซัพพลายเออร์เรียก `handleSave` · auto-save (เดิมเรียก handleSave อยู่แล้ว) จึงครบทั้งคู่
//
// เทสต์นี้เป็น meta-test สแกนต้นทางจริง (เหมือน gasjson.test.js) — กันการถอยกลับไปเส้นทางที่
// "บันทึกแล้วแต่ไม่ถึง ZORT" ซึ่งเป็นความพังที่จอขึ้น ✓ ทุกอย่างดูปกติ ไม่มี error ให้เห็น
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('หา view/function ในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + name);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}

const STOCKCOUNT = grabFn(VANA, 'StockCountView');

// ดึงเฉพาะตัว handleSave ของ StockCountView (ตัวที่รับ isAuto และเรียก confirmStockCount)
// StockCountView มี handleSave/handleConfirm หลายตัวในไฟล์ แต่ในขอบเขต view นี้มีตัวเดียว
function grabHandler(block, name) {
  const m = block.match(new RegExp('const ' + name + ' = async[\\s\\S]*?\\n  \\};'));
  if (!m) throw new Error('หา handler ' + name + ' ใน StockCountView ไม่เจอ');
  return m[0];
}

describe('handleSave ของ StockCountView commit เข้าคลัง + ZORT ทั้ง 2 โหมด', () => {
  const handleSave = grabHandler(STOCKCOUNT, 'handleSave');

  it('เรียก confirmStockCount (= อัปเดตคลังจริง + push ZORT)', () => {
    expect(handleSave).toMatch(/confirmStockCount\(/);
  });

  it('บันทึกตำแหน่งได้ทุกโหมด — ตามล็อค (selLockKey) หรือจัดกลุ่มตาม skuToLock ในโหมดอื่น', () => {
    expect(handleSave).toContain('if (selLockKey)');
    // สาขา else = ทุกโหมดที่ไม่ได้อยู่ในล็อคเดียว (ซัพพลายเออร์ / คำขอเช็คหลายซัพ / นับก่อนขึ้นชั้น)
    expect(handleSave).toMatch(/\}\s*else\s*\{/);
    // จัดกลุ่มตำแหน่งตาม skuToLock ของแต่ละ SKU
    expect(handleSave).toContain('skuToLock');
  });

  it('เส้นทางซัพพลายเออร์ยังเรียก syncLockData เพื่อบันทึกตำแหน่ง (ไม่ทิ้งของเดิม)', () => {
    expect(handleSave).toMatch(/syncLockData\(/);
  });
});

describe('ปุ่ม "บันทึก" โหมดซัพพลายเออร์ ต้องเรียก handleSave ไม่ใช่ตัวที่ตำแหน่งอย่างเดียว', () => {
  it('ปุ่มโหมดซัพพลายเออร์เรียก handleSave', () => {
    // ปุ่มนี้อยู่ในเฮดเดอร์โหมดซัพพลายเออร์ · disabled ผูกกับ suppUnsavedCount (จำนวนที่ยังไม่เซฟ)
    const m = STOCKCOUNT.match(/onClick=\{\(\) => handleSave\(\)\}\s+disabled=\{saving\|\|suppUnsavedCount===0\}/);
    expect(m, 'ปุ่มบันทึกโหมดซัพพลายเออร์ไม่ได้เรียก handleSave (อาจถอยกลับไป handleSaveSupplier)').toBeTruthy();
  });

  it('handleSaveSupplier ถูกลบแล้ว (เดิมบันทึกตำแหน่งอย่างเดียว ไม่เข้า ZORT)', () => {
    expect(VANA).not.toMatch(/const handleSaveSupplier\s*=/);
    expect(VANA).not.toMatch(/onClick=\{handleSaveSupplier\}/);
  });
});

describe('auto-save ของ StockCountView ครอบคลุมทุกโหมด (ไม่ผูกกับ selLockKey/selSupplier)', () => {
  it('gate ด้วย scSavableCount (ของที่เครื่องนี้นับเอง) ไม่ใช่โหมด — ยิง handleSave(true)', () => {
    // เดิมกั้นด้วย `if (!selLockKey && !selSupplier) return;` ทำให้โหมดนับตามคำขอหลายซัพ /
    // นับก่อนขึ้นชั้น ไม่ auto-save เลย · ตอนนี้กั้นด้วย scSavableCount → มีของนับก็ save ทุกโหมด
    expect(STOCKCOUNT).toContain('if (scSavableCount === 0 || saving) return;');
    // ต้องไม่กลับไปกั้นด้วยโหมดอีก (regression)
    expect(STOCKCOUNT).not.toContain('if (!selLockKey && !selSupplier) return;');
    const effIdx = STOCKCOUNT.indexOf('if (scSavableCount === 0 || saving) return;');
    const eff = STOCKCOUNT.slice(effIdx, effIdx + 500);
    expect(eff).toContain('handleSave(true)');
  });

  it('scSavableCount คิดจาก localEditsRef (เฉพาะที่เครื่องนี้นับ) ไม่ใช่ค่าที่ merge มา', () => {
    const m = STOCKCOUNT.match(/const scSavableCount\s*=\s*[\s\S]*?localEditsRef\.current\.has\(sku\)[\s\S]*?\.length;/);
    expect(m, 'scSavableCount ต้องกรองด้วย localEditsRef').toBeTruthy();
  });
});

describe('การ์ดนับ ต้องบอกชัดว่า "บันทึกเข้าคลังแล้ว" (ตอบ "นับต่างจากระบบแล้วแก้จำนวนจริงไหม")', () => {
  it('การ์ดคิด saved จาก savedQtys[sku] === num (ค่าจริงที่เซฟ) ไม่ใช่แค่ savedSkus.has', () => {
    // เจ้าของถาม "มันบันทึกแค่ที่นับตรง แต่แก้จำนวนจริงไม่ได้หรอ" → ต้องโชว์ให้เห็นว่านับต่างจาก
    // ระบบ (mismatch) ก็ถูกบันทึกเข้าคลังจริง · saved ผูกกับ savedQtys (ค่าที่เซฟ) ไม่ใช่ match/mismatch
    expect(STOCKCOUNT).toContain('const saved = has && savedQtys[p.sku] === num;');
  });
  it('badge มุมขวาบนไม่ใช้ "!" แดงตอน mismatch อีก (เข้าใจผิดว่าเซฟไม่ได้)', () => {
    // การ์ดต้องไม่ตัดสิน badge/สีจาก matched แบบ error — ใช้ saved/failed/pending แทน
    // ✓ = บันทึกเข้าคลังแล้ว · ⚠️ = พยายามเซฟแต่ล้มเหลว (ยังไม่เข้า ZORT) · ⏳ = รอ auto-save
    const m = STOCKCOUNT.match(/\{saved \? '✓' : failed \? '⚠️' : '⏳'\}/);
    expect(m, "badge ต้องเป็น ✓ (saved) / ⚠️ (failed) / ⏳ (รอเซฟ) — mismatch ไม่ใช่ error").toBeTruthy();
  });
  it('savedQtys ถูกอัปเดตในทุก handler ที่เซฟสำเร็จ (handleSave/handleConfirm/handleSavePreShelf)', () => {
    const count = (STOCKCOUNT.match(/setSavedQtys\(prev => \{ const n = \{ \.\.\.prev \};/g) || []).length;
    expect(count, 'ต้องมี setSavedQtys อย่างน้อย 3 จุด (3 handler)').toBeGreaterThanOrEqual(3);
  });
  it('ปุ่มบันทึกโชว์จำนวน "ที่ยังไม่เซฟ" (suppUnsavedCount) ไม่ใช่จำนวนรวม', () => {
    expect(STOCKCOUNT).toContain('suppUnsavedCount');
    expect(STOCKCOUNT).toContain('✓ บันทึกครบแล้ว');
  });
});

describe('save ล้มเหลวต้องเห็นชัด ไม่ค้าง "⏳ กำลังบันทึก…" เงียบ ๆ (จอโกหก)', () => {
  const handleSave = grabHandler(STOCKCOUNT, 'handleSave');

  it('มี state failedSkus + saveErr (ติดตามการ์ดที่เซฟพลาด + เหตุผลจริง)', () => {
    expect(STOCKCOUNT).toMatch(/const \[failedSkus, setFailedSkus\]\s*=\s*uS\(new Set\(\)\)/);
    expect(STOCKCOUNT).toMatch(/const \[saveErr, setSaveErr\]\s*=\s*uS\(''\)/);
  });

  it('handleSave: save พลาด (success===false) → set failedSkus + saveErr จากเหตุผลจริง', () => {
    expect(handleSave).toContain('result.success === false');
    expect(handleSave).toContain('setFailedSkus(');
    expect(handleSave).toMatch(/setSaveErr\(result\.error/);
  });

  it('handleSave: สำเร็จ → เคลียร์ failedSkus ของ SKU นั้น + เคลียร์ saveErr', () => {
    // ต้องมีทั้ง add (ตอนพลาด) และ delete (ตอนสำเร็จ)
    expect(handleSave).toMatch(/n\.delete\(e\.sku\)/);
    expect(handleSave).toContain("setSaveErr('')");
  });

  it('confirmStockCount (เข้าคลัง+ZORT) รันก่อน syncLockData (ตำแหน่ง) — ของสำคัญไม่ถูก POST ตำแหน่งบัง/หน่วง', () => {
    const iConfirm = handleSave.indexOf('confirmStockCount(');
    const iLock    = handleSave.indexOf('syncLockData(');
    expect(iConfirm).toBeGreaterThan(-1);
    expect(iLock).toBeGreaterThan(-1);
    expect(iConfirm, 'confirmStockCount ต้องอยู่ก่อน syncLockData ใน handleSave').toBeLessThan(iLock);
  });

  it('การ์ดคิด failed = has && !saved && failedSkus.has(sku) และโชว์ "ยังไม่บันทึก"', () => {
    expect(STOCKCOUNT).toContain('const failed = has && !saved && failedSkus.has(p.sku);');
    expect(STOCKCOUNT).toContain('ยังไม่บันทึก');
  });

  it('แถบสถานะโชว์เหตุผลจริง (saveErr) แบบค้าง ไม่ผูกกับ saveStatus ที่ cycle กลับ pending', () => {
    // เดิมโชว์เฉพาะตอน saveStatus === "error" ซึ่ง cycle หายไปตอน auto-save ลองใหม่
    const m = STOCKCOUNT.match(/\{saveErr && \(/);
    expect(m, 'ต้องโชว์ saveErr เมื่อมีค่า (ไม่ผูกกับ saveStatus)').toBeTruthy();
  });
});

describe('syncLockData อ่านคำตอบจริง (ไม่ใช่ "สำเร็จปลอม" — บทเรียนข้อ 13)', () => {
  const fnIdx = VANA.indexOf('async function syncLockData(');
  const syncLockData = VANA.slice(fnIdx, VANA.indexOf('\nasync function', fnIdx + 1));

  it('เรียก dmjJson อ่านผลจาก GAS (เดิม await fetch แล้ว return {success:true} ทิ้ง)', () => {
    expect(syncLockData).toMatch(/dmjJson\(/);
  });
  it('คืน success:false เมื่อ GAS ตอบ success:false (ไม่กลืนเป็นสำเร็จ)', () => {
    expect(syncLockData).toMatch(/success:\s*false/);
    expect(syncLockData).toContain('json.success !== false');
  });
  it('ไม่มี return { success: true } แบบไม่มีเงื่อนไขหลง await fetch อีก', () => {
    // ต้องไม่ใช่รูปแบบเดิม: await dmjFetch(...) ตามด้วย return { success: true } ตรง ๆ
    expect(syncLockData).not.toMatch(/await dmjFetch\([\s\S]*?\}\);\s*return \{ success: true \};/);
  });
});
