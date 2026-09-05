// tests/auto-owner.test.js — F01: สิทธิ์เจ้าของถูกให้จาก "ชื่อที่โชว์ใน LINE"
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (รายงานตรวจระบบ 5 ก.ย. 2026 · ประเด็น F01)
//
// สิ่งที่พบ: `authLine_` ใช้ `AUTO_OWNER_LINE_NAMES = ["tah","jeed"]` เทียบกับ **ชื่อที่โชว์
// ใน LINE ซึ่งใครก็เปลี่ยนเองได้** แล้วให้ role=owner/status=active ทันที ทั้งแถวใหม่และแถวเดิม
//   · คนนอกตั้งชื่อ LINE ว่า "tah" แล้วล็อกอิน = ได้ owner ทันที
//   · แถวที่เจ้าของ **กดระงับไว้แล้ว** กลับเป็น active เอง → ปุ่ม "ระงับ" ไม่มีความหมาย
//
// เกณฑ์ปิดงานของรายงาน 3 ข้อ — คุมครบในไฟล์นี้:
//   1. ชื่อแสดงผลซ้ำไม่ให้สิทธิ์เพิ่ม
//   2. disabled ไม่ถูกเปิดกลับเพราะชื่อ
//   3. เจ้าของเดิมยังเข้าได้
//
// ⚠️ CLAUDE.md เตือนว่าแก้พลาดตรงนี้ = **เจ้าของเข้าระบบตัวเองไม่ได้** → เทสต์นี้จึงรัน
// ฟังก์ชันจริงจาก `.gs` (eval ไม่ copy) กับชีตจำลอง ไม่ใช่แค่จับ string
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(re, what) {
  const m = GS.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + what);
  return m[0];
}

const SRC = [
  grab(/const AUTO_OWNER_LINE_NAMES = \[[^\]]*\];/, 'AUTO_OWNER_LINE_NAMES'),
  grab(/function isAutoOwnerLineName_\(name\) \{[\s\S]*?\n\}/, 'isAutoOwnerLineName_'),
  grab(/function autoOwnerLineIds_\(\) \{[\s\S]*?\n\}/, 'autoOwnerLineIds_'),
  grab(/function isAutoOwnerLineId_\(providerUserId\) \{[\s\S]*?\n\}/, 'isAutoOwnerLineId_'),
  grab(/function autoOwnerNameTakenBy_\(sh, lineDisplayName, providerUserId\) \{[\s\S]*?\n\}/, 'autoOwnerNameTakenBy_'),
].join('\n\n');

// สร้าง sandbox ที่มี PropertiesService ปลอม (คุมค่า AUTO_OWNER_LINE_IDS ได้)
function load(props) {
  const PropertiesService = {
    getScriptProperties: () => ({ getProperty: (k) => (props && props[k] != null ? props[k] : null) }),
  };
  // eslint-disable-next-line no-new-func
  return new Function('PropertiesService',
    SRC + '\nreturn { isAutoOwnerLineName_, isAutoOwnerLineId_, autoOwnerLineIds_, autoOwnerNameTakenBy_ };'
  )(PropertiesService);
}

// ชีต "พนักงาน" จำลอง — A..K, getRange(row, col, nRows, nCols) แบบเดียวกับที่โค้ดจริงเรียก
function fakeStaffSheet(rows) {
  const header = ['staffId', 'provider', 'providerUserId', 'displayName', 'lineDisplayName', 'role', 'status'];
  const all = [header].concat(rows);
  return {
    getLastRow: () => all.length,
    getRange: (row, col, nRows, nCols) => ({
      getValues: () => all.slice(row - 1, row - 1 + nRows).map((r) => r.slice(col - 1, col - 1 + nCols)),
    }),
  };
}
const row = (id, pid, name, role, status) => [id, 'line', pid, name, name, role, status];

describe('F01 — ตาราง/ตัวเทียบพื้นฐาน', () => {
  const A = load({});
  it('isAutoOwnerLineName_ ไม่สนตัวพิมพ์และช่องว่างหัวท้าย', () => {
    expect(A.isAutoOwnerLineName_('tah')).toBe(true);
    expect(A.isAutoOwnerLineName_('  TAH  ')).toBe(true);
    expect(A.isAutoOwnerLineName_('Jeed')).toBe(true);
    expect(A.isAutoOwnerLineName_('somchai')).toBe(false);
    expect(A.isAutoOwnerLineName_('')).toBe(false);
    expect(A.isAutoOwnerLineName_(null)).toBe(false);
  });
});

describe('F01 — เส้นทางรหัสถาวร (AUTO_OWNER_LINE_IDS) = ช่องทางกู้บัญชีเจ้าของ', () => {
  it('ไม่ตั้ง property → ไม่มีใครผ่านเส้นทางนี้', () => {
    const A = load({});
    expect(A.autoOwnerLineIds_()).toEqual([]);
    expect(A.isAutoOwnerLineId_('Uabc')).toBe(false);
  });

  it('รับได้ทั้งคั่นด้วย , เว้นวรรค และขึ้นบรรทัดใหม่ (เจ้าของพิมพ์เองในช่อง property)', () => {
    const A = load({ AUTO_OWNER_LINE_IDS: 'Uaaa, Ubbb\nUccc;Uddd' });
    expect(A.autoOwnerLineIds_()).toEqual(['Uaaa', 'Ubbb', 'Uccc', 'Uddd']);
    ['Uaaa', 'Ubbb', 'Uccc', 'Uddd'].forEach((id) => expect(A.isAutoOwnerLineId_(id)).toBe(true));
  });

  it('id ว่าง/ไม่อยู่ในรายการ → false (ไม่ปล่อยผ่านค่าว่าง)', () => {
    const A = load({ AUTO_OWNER_LINE_IDS: 'Uaaa' });
    expect(A.isAutoOwnerLineId_('')).toBe(false);
    expect(A.isAutoOwnerLineId_(null)).toBe(false);
    expect(A.isAutoOwnerLineId_('Uzzz')).toBe(false);
  });

  it('property พังอ่านไม่ได้ → คืน [] ไม่ throw (ล็อกอินต้องไม่ล้มทั้งร้าน)', () => {
    // eslint-disable-next-line no-new-func
    const broken = new Function('PropertiesService',
      SRC + '\nreturn { autoOwnerLineIds_ };')({ getScriptProperties: () => { throw new Error('boom'); } });
    expect(broken.autoOwnerLineIds_()).toEqual([]);
  });
});

describe('F01 เกณฑ์ข้อ 1 — ชื่อแสดงผลซ้ำไม่ให้สิทธิ์เพิ่ม', () => {
  const A = load({});

  it('ยังไม่มีใครใช้ชื่อนี้ → ไม่ถูกจอง (คนแรกยังได้สิทธิ์ตามเดิม)', () => {
    const sh = fakeStaffSheet([row('ST0001', 'Usomchai', 'สมชาย', 'warehouse', 'active')]);
    expect(A.autoOwnerNameTakenBy_(sh, 'tah', 'Unew')).toBe('');
  });

  it('มีบัญชีอื่นใช้ชื่อ "tah" อยู่แล้ว → คืน providerUserId ของเจ้าของชื่อ (คนที่ 2 ไม่ได้สิทธิ์)', () => {
    const sh = fakeStaffSheet([
      row('ST0001', 'Uowner', 'tah', 'owner', 'active'),
      row('ST0002', 'Usomchai', 'สมชาย', 'warehouse', 'active'),
    ]);
    expect(A.autoOwnerNameTakenBy_(sh, 'tah', 'Uattacker')).toBe('Uowner');
  });

  it('แถวของ **ตัวเอง** ไม่นับว่า "ถูกใช้" (เจ้าของตัวจริงล็อกอินซ้ำต้องไม่โดนบล็อกตัวเอง)', () => {
    const sh = fakeStaffSheet([row('ST0001', 'Uowner', 'tah', 'owner', 'active')]);
    expect(A.autoOwnerNameTakenBy_(sh, 'tah', 'Uowner')).toBe('');
  });

  it('เทียบทั้งคอลัมน์ D (displayName) และ E (lineDisplayName)', () => {
    // เจ้าของแก้ชื่อในชีตเองได้ → สองคอลัมน์ต่างกันได้จริง
    const shD = fakeStaffSheet([['ST0001', 'line', 'Uowner', 'tah', 'ชื่อไลน์อื่น', 'owner', 'active']]);
    const shE = fakeStaffSheet([['ST0001', 'line', 'Uowner', 'ชื่อในชีต', 'tah', 'owner', 'active']]);
    expect(A.autoOwnerNameTakenBy_(shD, 'tah', 'Uattacker')).toBe('Uowner');
    expect(A.autoOwnerNameTakenBy_(shE, 'tah', 'Uattacker')).toBe('Uowner');
  });

  it('ไม่สนตัวพิมพ์/ช่องว่าง (ตั้งชื่อ "TAH " แล้วเลี่ยงการจองไม่ได้)', () => {
    const sh = fakeStaffSheet([row('ST0001', 'Uowner', 'tah', 'owner', 'active')]);
    expect(A.autoOwnerNameTakenBy_(sh, ' TAH ', 'Uattacker')).toBe('Uowner');
  });

  it('ชีตว่าง / ชื่อว่าง → ไม่ถูกจอง', () => {
    expect(A.autoOwnerNameTakenBy_(fakeStaffSheet([]), 'tah', 'Ux')).toBe('');
    expect(A.autoOwnerNameTakenBy_(fakeStaffSheet([row('ST0001', 'Uo', 'tah', 'owner', 'active')]), '', 'Ux')).toBe('');
  });

  it('แถวที่ providerUserId ว่าง (แถวขยะ) ไม่ถูกนับเป็นเจ้าของชื่อ', () => {
    const sh = fakeStaffSheet([['ST0001', 'line', '', 'tah', 'tah', '', 'pending']]);
    expect(A.autoOwnerNameTakenBy_(sh, 'tah', 'Ux')).toBe('');
  });
});

describe('F01 — เส้นทางตัดสินใน authLine_ (โครงสร้างที่พังแล้วเงียบ)', () => {
  const AUTH = grab(/function authLine_\(ss, data\) \{[\s\S]*?\n\}\n\nfunction meHandler_/, 'authLine_');

  it('id ตัดสินก่อนชื่อ และรวมกันเป็น autoOwner ตัวเดียว', () => {
    expect(AUTH).toMatch(/const autoOwnerById = isAutoOwnerLineId_\(providerUserId\);/);
    expect(AUTH).toMatch(/const autoOwnerByName = isAutoOwnerLineName_\(lineDisplayName\) && !nameTakenBy;/);
    expect(AUTH).toMatch(/const autoOwner = autoOwnerById \|\| autoOwnerByName;/);
  });

  it('เกณฑ์ข้อ 2 — แถวเดิมยกระดับด้วย "ชื่อ" ได้เฉพาะตอน pending เท่านั้น', () => {
    expect(AUTH).toMatch(/const canUpgrade = autoOwnerById \|\| \(autoOwnerByName && staffObj\.status === "pending"\);/);
    // ของเดิมคือ `if (autoOwner && (...))` ซึ่งเปิด disabled กลับได้ — ต้องไม่กลับมา
    expect(AUTH).not.toMatch(/if \(autoOwner && \(staffObj\.role !== "owner"/);
  });

  it('เกณฑ์ข้อ 2 — เขียน role/status ทับได้เฉพาะเมื่อ canUpgrade', () => {
    const i = AUTH.indexOf('const canUpgrade =');
    const j = AUTH.indexOf('sh.getRange(rowIdx, 7).setValue("active")');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(AUTH.slice(i, j)).toMatch(/if \(canUpgrade &&/);
  });

  it('ปฏิเสธแล้วต้องไม่เงียบ — ชื่อซ้ำแจ้ง LINE + audit · ถูกระงับเขียน audit', () => {
    expect(AUTH).toMatch(/ปฏิเสธ auto-owner \(ชื่อซ้ำ\)/);
    expect(AUTH).toMatch(/ปฏิเสธ auto-owner \(บัญชีถูกระงับ\)/);
    expect(AUTH).toMatch(/enqueueNoti_\(\{[\s\S]*?dedupKey: 'autoowner-dup-'/);
    // ข้อความต้องบอกทางกู้ (ใส่ id ใน property) ไม่ใช่แค่บอกว่าปฏิเสธ
    expect(AUTH).toMatch(/AUTO_OWNER_LINE_IDS/);
  });

  it('เกณฑ์ข้อ 3 — แถวที่เป็น owner/active อยู่แล้วไม่ถูกแตะเลย (เจ้าของเดิมเข้าได้เสมอ)', () => {
    // เงื่อนไขเขียนทับมี `staffObj.role !== "owner" || staffObj.status !== "active"` คุมอยู่
    expect(AUTH).toMatch(/canUpgrade && \(staffObj\.role !== "owner" \|\| staffObj\.status !== "active"\)/);
  });

  it('ยกระดับแล้วต้องล้าง session cache (ไม่งั้นถือสิทธิ์เก่าไปอีก 5 นาที)', () => {
    expect(AUTH).toMatch(/sessionCacheClearForStaff_\(ss, staffObj\.staffId\)/);
  });

  it('แถวใหม่ยังได้ owner เมื่อเป็นคนแรกของระบบ (ตั้งร้านใหม่ต้องเข้าได้)', () => {
    expect(AUTH).toMatch(/const role = \(isFirstEver \|\| autoOwner\) \? "owner" : "";/);
    expect(AUTH).toMatch(/const status = \(isFirstEver \|\| autoOwner\) \? "active" : "pending";/);
  });
});

describe('F01 — เครื่องมือกู้บัญชีสำหรับเจ้าของ', () => {
  it('มี listStaffLineIds() ให้รันใน GAS editor (ชื่อไม่มี "_" ต่อท้าย — บทเรียนข้อ 1)', () => {
    expect(GS).toMatch(/\nfunction listStaffLineIds\(\) \{/);
  });

  it('เป็นเครื่องมืออ่านอย่างเดียว — ไม่เขียนชีต/ไม่ตั้ง property', () => {
    const fn = grab(/function listStaffLineIds\(\) \{[\s\S]*?\n\}/, 'listStaffLineIds');
    ['setValue(', 'appendRow(', 'setProperty(', 'deleteRow('].forEach((needle) => {
      expect(fn, 'เครื่องมือตรวจต้องไม่แก้ข้อมูล: ' + needle).not.toContain(needle);
    });
  });

  it('ไม่ hard-code รหัส LINE ของเจ้าของลงไฟล์ที่ push ขึ้น repo', () => {
    // ตัวตนจริงต้องอยู่ใน Script Property เท่านั้น (กติกา "ความลับ" ของโปรเจกต์)
    expect(GS).not.toMatch(/AUTO_OWNER_LINE_IDS\s*=\s*\[/);
    expect(GS).toMatch(/getProperty\('AUTO_OWNER_LINE_IDS'\)/);
  });
});
