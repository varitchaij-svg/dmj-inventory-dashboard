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

  it('บันทึกตำแหน่งได้ทั้งโหมดตามล็อค (selLockKey) และตามซัพพลายเออร์ (selSupplier)', () => {
    expect(handleSave).toContain('if (selLockKey)');
    expect(handleSave).toContain('else if (selSupplier)');
    // โหมดซัพพลายเออร์จัดกลุ่มตำแหน่งตาม skuToLock ของแต่ละ SKU
    expect(handleSave).toContain('skuToLock');
  });

  it('เส้นทางซัพพลายเออร์ยังเรียก syncLockData เพื่อบันทึกตำแหน่ง (ไม่ทิ้งของเดิม)', () => {
    expect(handleSave).toMatch(/syncLockData\(/);
  });
});

describe('ปุ่ม "บันทึก" โหมดซัพพลายเออร์ ต้องเรียก handleSave ไม่ใช่ตัวที่ตำแหน่งอย่างเดียว', () => {
  it('ปุ่มโหมดซัพพลายเออร์เรียก handleSave', () => {
    // ปุ่มนี้อยู่ในเฮดเดอร์โหมดซัพพลายเออร์ คู่กับ suppFilledCount
    const m = STOCKCOUNT.match(/onClick=\{\(\) => handleSave\(\)\}\s+disabled=\{saving\|\|suppFilledCount===0\}/);
    expect(m, 'ปุ่มบันทึกโหมดซัพพลายเออร์ไม่ได้เรียก handleSave (อาจถอยกลับไป handleSaveSupplier)').toBeTruthy();
  });

  it('handleSaveSupplier ถูกลบแล้ว (เดิมบันทึกตำแหน่งอย่างเดียว ไม่เข้า ZORT)', () => {
    expect(VANA).not.toMatch(/const handleSaveSupplier\s*=/);
    expect(VANA).not.toMatch(/onClick=\{handleSaveSupplier\}/);
  });
});

describe('auto-save ของ StockCountView ครอบคลุมทั้ง 2 โหมด', () => {
  it('auto-save ทำงานเมื่อเลือกล็อคหรือซัพพลายเออร์ แล้วยิง handleSave (ซึ่ง commit ZORT)', () => {
    // เงื่อนไข gate ของ effect: ทำงานเมื่อมี selLockKey หรือ selSupplier
    expect(STOCKCOUNT).toContain('if (!selLockKey && !selSupplier) return;');
    // ตัว effect ยิง handleSave(true)
    const effIdx = STOCKCOUNT.indexOf('if (!selLockKey && !selSupplier) return;');
    const eff = STOCKCOUNT.slice(effIdx, effIdx + 500);
    expect(eff).toContain('handleSave(true)');
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
