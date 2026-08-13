// tests/saler-fs-count.test.js — saler/storedevice กด "นับหน้าร้าน" ได้ แต่ไม่ถูกบังคับให้นับก่อนสั่ง
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง (ส.ค. 2026): "เพิ่มปุ่มกดเช็คสินค้าให้ตำแหน่ง saler" แล้วตามด้วย "เปิดเครื่องกลางด้วย"
//
// saler/storedevice ยืนอยู่หน้าร้านเห็นชั้นวางจริง → ควรนับ/บันทึกยอดหน้าร้านได้เหมือน
// frontstore/employee **แต่ห้ามบังคับ** เพราะงานหลักคือปิดการขายให้ทันลูกค้าที่ยืนรออยู่ตรงหน้า —
// บังคับนับก่อนสั่งเมื่อไหร่ = เอางานคนอื่นไปขวางการขาย
//
// เดิมมีธงตัวเดียว (`needFsCheck`) ทำหน้าที่ทั้ง "โชว์การ์ดนับ" และ "กั้นปุ่มยืนยัน" พร้อมกัน
// จึงต้องแยกเป็น `canFsCheck` (นับได้) กับ `mustFsCheck` (ต้องนับก่อน) · เทสต์ชุดนี้กัน 3 อย่าง
// ที่พังแล้ว **ไม่มี error ให้เห็น**:
//   1. ยุบ 2 ธงกลับเป็นตัวเดียว → saler โดนกั้นปุ่มยืนยันทันที กดสั่งของไม่ได้ทั้งตำแหน่ง
//   2. `canCountFs` (ProductCard — ปุ่มกดได้ไหม) กับ `canFsCheck` (OrderModal — มีการ์ดนับไหม)
//      หลุดจากกัน → กดปุ่มเข้าไปเจอ modal ที่บอกว่าสั่งไม่ได้ แต่ไม่มีอะไรให้ทำต่อ = ทางตัน
//   3. `fsBlocked` เผลอกลับไปผูกกับ `canFsCheck` → ข้อ 1 ซ้ำอีกรอบ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VMAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const I18N = readFileSync(join(ROOT, 'i18n.jsx'), 'utf8');

// ตัดเอาเฉพาะตัวฟังก์ชัน (ถึง top-level function ตัวถัดไป) — ของข้างในถูก indent จึงไม่ตัดพลาด
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('หาฟังก์ชันในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + name);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}

const ORDER_MODAL = grabFn(VMAIN, 'OrderModal');
const PRODUCT_CARD = grabFn(VMAIN, 'ProductCard');

// ดึง "นิพจน์จริง" จากต้นทางมา eval — ไม่ copy เงื่อนไขมาเขียนซ้ำในเทสต์
// (หลักเดียวกับ auth.test.js: สำเนาเงื่อนไขด้านสิทธิ์จะ drift โดยไม่มีใครรู้)
function rolePredicate(block, name, argName) {
  const m = block.match(new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('หา ' + name + ' ในต้นทางไม่เจอ (เปลี่ยนชื่อ/โครงสร้าง?)');
  return new Function(argName, 'return !!(' + m[1] + ');');
}

const canFsCheck = rolePredicate(ORDER_MODAL, 'canFsCheck', 'effRole');
const mustFsCheck = rolePredicate(ORDER_MODAL, 'mustFsCheck', 'effRole');
const canCountFs = rolePredicate(PRODUCT_CARD, 'canCountFs', 'role');

const ALL_ROLES = ['owner', 'dev', 'employee', 'warehouse', 'frontstore', 'saler', 'storedevice'];

describe('ใครนับหน้าร้านได้ (canFsCheck)', () => {
  for (const r of ['frontstore', 'employee', 'saler', 'storedevice']) {
    it(`${r} → นับได้`, () => expect(canFsCheck(r)).toBe(true));
  }
  for (const r of ['owner', 'dev', 'warehouse']) {
    it(`${r} → ไม่มีการ์ดนับ`, () => expect(canFsCheck(r)).toBe(false));
  }
  it('role ว่าง/ไม่รู้จัก → ไม่โชว์การ์ดนับ (ไม่เดา)', () => {
    expect(canFsCheck('')).toBe(false);
    expect(canFsCheck('somethingelse')).toBe(false);
  });
});

describe('ใครถูกบังคับให้นับก่อนสั่ง (mustFsCheck)', () => {
  for (const r of ['frontstore', 'employee']) {
    it(`${r} → ยังบังคับเหมือนเดิม`, () => expect(mustFsCheck(r)).toBe(true));
  }
  // ⭐ ข้อที่สำคัญที่สุดของไฟล์นี้ — saler/storedevice นับได้ แต่ต้องไม่ถูกกั้นปุ่มยืนยันสั่ง
  for (const r of ['saler', 'storedevice']) {
    it(`${r} → นับได้ แต่ไม่ถูกบังคับ (ห้ามยุบ 2 ธงเป็นตัวเดียว)`, () => {
      expect(canFsCheck(r)).toBe(true);
      expect(mustFsCheck(r)).toBe(false);
    });
  }
  it('ไม่มี role ไหนที่ "ถูกบังคับ" แต่ "นับไม่ได้" (เป็นไปไม่ได้เชิงตรรกะ)', () => {
    for (const r of ALL_ROLES) {
      if (mustFsCheck(r)) expect(canFsCheck(r)).toBe(true);
    }
  });
});

describe('ปุ่มบนการ์ดสินค้า ต้องตรงกับการ์ดนับใน modal', () => {
  // ProductCard ตัดสินว่า "ปุ่มกดได้ไหมตอนของหมด" · OrderModal ตัดสินว่า "เปิดมาแล้วมีอะไรให้ทำไหม"
  // สองที่นี้ไม่ตรงกัน = กดปุ่มเข้าไปเจอทางตัน (จอดูปกติ ไม่มี error)
  it('canCountFs (ProductCard) === canFsCheck (OrderModal) ทุก role', () => {
    for (const r of ALL_ROLES) {
      expect([r, canCountFs(r)]).toEqual([r, canFsCheck(r)]);
    }
  });
});

describe('จุดเชื่อมต่อในโค้ดจริง (พังแล้วเงียบ)', () => {
  it('fsBlocked ผูกกับ mustFsCheck ไม่ใช่ canFsCheck', () => {
    const m = ORDER_MODAL.match(/const\s+fsBlocked\s*=\s*([^;]+);/);
    expect(m, 'หา fsBlocked ไม่เจอ').toBeTruthy();
    expect(m[1]).toContain('mustFsCheck');
    expect(m[1]).not.toContain('canFsCheck');
  });

  it('fsDirty ผูกกับ canFsCheck (ไม่งั้น saler นับแล้วไม่บันทึก)', () => {
    const m = ORDER_MODAL.match(/const\s+fsDirty\s*=\s*([^;]+);/);
    expect(m, 'หา fsDirty ไม่เจอ').toBeTruthy();
    expect(m[1]).toContain('canFsCheck');
  });

  it('การ์ดนับเรนเดอร์ด้วย canFsCheck (ไม่ใช่ mustFsCheck)', () => {
    expect(ORDER_MODAL).toContain('{canFsCheck && !fsSkipped && (');
    expect(ORDER_MODAL).toContain('{canFsCheck && fsSkipped && (');
  });

  it('ป้าย "②" ขึ้นเฉพาะตอนมีขั้น ① บังคับจริง', () => {
    // saler ไม่มีขั้นบังคับ → ถ้าโชว์ ② ให้ด้วยจะเป็นลำดับที่ขาดขั้นแรก อ่านแล้วงงว่าตกอะไรไป
    expect(ORDER_MODAL).toContain('mustFsCheck && !fsSkipped ? `②');
  });

  it('ไม่เหลือธงเก่า needFsCheck ค้างอยู่', () => {
    expect(VMAIN).not.toContain('needFsCheck');
  });

  it('กรอบสีเตือน (ส้ม) ผูกกับ fsBlocked ไม่ใช่ "ยังไม่กรอก"', () => {
    // ผูกกับ fsQtyNum == null เมื่อไหร่ saler จะเห็นกรอบส้มเตือนทั้งที่กดสั่งได้ปกติ
    expect(ORDER_MODAL).toContain('border: fsBlocked ?');
    expect(ORDER_MODAL).toContain('background: fsBlocked ?');
  });
});

describe('ข้อความที่เพิ่มใหม่ต้องมีคำแปลครบ', () => {
  // เพื่อนร่วมงานที่อ่านไทยไม่คล่องเป็นผู้ใช้หลักของแอปนี้ — ข้อความข้าง ๆ กันแปลไว้หมดแล้ว
  for (const key of ['นับหน้าร้าน — เหลือกี่ชิ้น?', 'ไม่บังคับ — นับแล้วระบบบันทึกให้เลย']) {
    it(`"${key}" มีใน i18n ครบทั้ง en/my`, () => {
      const i = I18N.indexOf('"' + key + '"');
      expect(i, 'ไม่มี key นี้ใน i18n.jsx').toBeGreaterThan(-1);
      const entry = I18N.slice(i, i + 400);
      expect(entry).toMatch(/en:\s*"/);
      expect(entry).toMatch(/my:\s*"/);
    });
  }
});
