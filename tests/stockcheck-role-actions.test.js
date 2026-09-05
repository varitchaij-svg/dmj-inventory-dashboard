// tests/stockcheck-role-actions.test.js — F03: หน้าจอเรียกคำสั่งที่บทบาทไม่มีสิทธิ์
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (รายงานตรวจระบบ 5 ก.ย. 2026 · ประเด็น F03)
//
// สิ่งที่พบ: `frontstore` ไม่มี `completeStockCheck` ใน ROLE_ACTIONS_ ทั้งที่เป็น role
// เดียวที่มีแท็บ "เช็คหน้าร้าน" เป็นงานหลัก · `warehouse` ไม่มี `recordUnscannedSale`
// ทั้งที่ StockCountView (แท็บ "stockcount" — owner/warehouse/dev เท่านั้น) แสดงปุ่มนี้ให้
// ทุกคนที่เข้าแท็บได้กด · ทั้งสองกรณีวันนี้เป็น no-op เพราะ REQUIRE_LOGIN default ปิด
// แต่เป็นเงื่อนไขบังคับก่อนวันเปิด flag — ไม่งั้นหน้าร้าน/คลังกดปุ่มที่เห็นอยู่ตรงหน้าไม่ได้
// ทั้งตำแหน่ง (ปฏิเสธเงียบเพราะ REQUIRE_LOGIN เปิดจะขึ้น "ไม่มีสิทธิ์" ทันที)
//
// เพิ่มเติม: callback ปิดคำขอใน app.jsx (`onCheckComplete` ของทั้ง StockCountView และ
// FrontStoreView) เดิม `await dmjFetch(...)` แล้วจบ ไม่เคยอ่านคำตอบ — ปฏิเสธจาก server
// (สิทธิ์ไม่พอ/เดา side ไม่ได้) ก็ยังโชว์ "ปิดคำขอสำเร็จ" เพราะ optimistic patch
// (`markCheckSideDone`) ทำไปแล้วก่อนยิง request บทเรียนข้อ 13 "สำเร็จปลอม" ตรง ๆ
//
// ไฟล์นี้ไม่ copy เงื่อนไข/ตาราง — ดึงมา eval/เทียบจากต้นทางจริงทั้ง .gs และ .jsx
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS  = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + what);
  return m[0];
}

const ROLE_ACTIONS_BLOCK = grab(GS, /var ROLE_ACTIONS_ = \{[\s\S]*?\n\};/, 'ROLE_ACTIONS_');
const ROLE_TABS_BLOCK    = grab(APP, /const ROLE_TABS = \{[\s\S]*?\n\};/, 'ROLE_TABS');

function actionsOf(role) {
  const m = ROLE_ACTIONS_BLOCK.match(new RegExp(`\\b${role}:\\s*\\[([\\s\\S]*?)\\]\\.concat`));
  if (!m) return null; // role ไม่มีแถวของตัวเอง (เช่น owner/dev ผ่านด้วย isAdminRole_ เสมอ)
  return m[1];
}
function tabsOf(role) {
  const m = ROLE_TABS_BLOCK.match(new RegExp(`\\b${role}:\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error('ไม่เจอ role ' + role + ' ใน ROLE_TABS');
  return m[1];
}

// role ที่ผ่าน canDoOrNull_ เสมอด้วย isAdminRole_ — ไม่ต้องมีแถวใน ROLE_ACTIONS_
const ADMIN_ROLES = ['owner', 'dev'];
const ALL_ROLES = ['owner', 'dev', 'employee', 'warehouse', 'frontstore', 'saler', 'storedevice'];

describe('F03 — สิทธิ์ completeStockCheck ต้องครบทุก role ที่มีแท็บ "frontstore"', () => {
  // side='fs' ถูกยิงจาก FrontStoreView (activeTab==="frontstore") เท่านั้น — role ที่ไม่มี
  // แท็บนี้ไม่มีทางยิง action นี้เลย จึงไม่ต้องมีสิทธิ์
  it('ทุก role ที่ ROLE_TABS มีแท็บ "frontstore" (ที่ไม่ใช่ owner/dev) ต้องมี completeStockCheck', () => {
    const withTab = ALL_ROLES.filter((r) => !ADMIN_ROLES.includes(r) && tabsOf(r).includes('"frontstore"'));
    expect(withTab.length, 'เทสต์นี้พังถ้าไม่มี role ไหนมีแท็บ frontstore เลย').toBeGreaterThan(0);
    withTab.forEach((r) => {
      const acts = actionsOf(r);
      expect(acts, `role ${r} ไม่มีแถวใน ROLE_ACTIONS_ เลย`).not.toBeNull();
      expect(acts, `role ${r} มีแท็บ "frontstore" แต่ไม่มีสิทธิ์ completeStockCheck`).toMatch(/"completeStockCheck"/);
    });
  });

  it('role ที่ไม่มีแท็บ "frontstore" (saler/storedevice) ไม่จำเป็นต้องมี completeStockCheck', () => {
    // ไม่ใช่ข้อห้าม แค่ยืนยันสมมติฐานของเทสต์ข้างบน — ถ้าวันหนึ่งมีแท็บนี้เพิ่ม เทสต์บนจะจับเอง
    ['saler', 'storedevice'].forEach((r) => {
      expect(tabsOf(r)).not.toMatch(/"frontstore"/);
    });
  });
});

describe('F03 — สิทธิ์ recordUnscannedSale ต้องครบทุก role ที่มีแท็บ "stockcount"', () => {
  // StockCountView ไม่รับ prop role มากรองปุ่ม — ใครเข้าแท็บได้ก็เห็นปุ่ม "ขายไม่สแกน" เหมือนกันหมด
  it('ทุก role ที่ ROLE_TABS มีแท็บ "stockcount" (ที่ไม่ใช่ owner/dev) ต้องมี recordUnscannedSale', () => {
    const withTab = ALL_ROLES.filter((r) => !ADMIN_ROLES.includes(r) && tabsOf(r).includes('"stockcount"'));
    expect(withTab.length, 'เทสต์นี้พังถ้าไม่มี role ไหนมีแท็บ stockcount เลย').toBeGreaterThan(0);
    withTab.forEach((r) => {
      const acts = actionsOf(r);
      expect(acts, `role ${r} ไม่มีแถวใน ROLE_ACTIONS_ เลย`).not.toBeNull();
      expect(acts, `role ${r} มีแท็บ "stockcount" แต่ไม่มีสิทธิ์ recordUnscannedSale`).toMatch(/"recordUnscannedSale"/);
      // side='wh' ก็ยิงจากแท็บเดียวกันนี้ — คุมไว้ในกลุ่มเดียวกัน
      expect(acts, `role ${r} มีแท็บ "stockcount" แต่ไม่มีสิทธิ์ completeStockCheck`).toMatch(/"completeStockCheck"/);
    });
  });
});

describe('F03 — StockCountView.markUnscanned เรียก recordUnscannedSale action name ตรงกับตาราง', () => {
  it('action ที่ frontend ยิงตรงกับ key ที่ backend ตรวจใน ROLE_ACTIONS_/canDoOrNull_', () => {
    const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
    expect(VANA).toMatch(/recordUnscannedSale:\s*true/);
    expect(GS).toMatch(/if \(data\.recordUnscannedSale\)/);
  });
});

describe('F03 — callback ปิดคำขอใน app.jsx ต้องอ่านคำตอบจริงก่อนถือว่าปิดสำเร็จ', () => {
  const blocks = APP.match(/onCheckComplete=\{async function\(reqId, counts\)\{[\s\S]*?\}\}\/>/g);

  it('มีคำนิยาม onCheckComplete ครบ 2 จุด (StockCountView side wh + FrontStoreView side fs)', () => {
    expect(blocks, 'หา onCheckComplete callback ไม่เจอเลย').not.toBeNull();
    expect(blocks.length).toBe(2);
  });

  it("side='wh' (StockCountView) อ่านคำตอบด้วย dmjJson แล้วถอย optimistic กลับเมื่อปฏิเสธ", () => {
    const b = blocks.find((x) => x.includes("side:'wh'"));
    expect(b, "หา callback side='wh' ไม่เจอ").toBeTruthy();
    expect(b).toMatch(/const res = await dmjFetch\(/);
    expect(b).toMatch(/const d = await dmjJson\(res\)/);
    expect(b).toMatch(/if \(!d \|\| d\.success === false\) setCheckSideStatus\(reqId, 'wh', 'pending'\)/);
    // catch ก็ต้องถอยกลับด้วย — เน็ตหลุด/throw ก็ไม่ต่างจากถูกปฏิเสธในแง่ผลลัพธ์ที่ผู้ใช้เห็น
    expect(b).toMatch(/catch\(e\)\{[^}]*setCheckSideStatus\(reqId, 'wh', 'pending'\)/);
  });

  it("side='fs' (FrontStoreView) อ่านคำตอบด้วย dmjJson แล้วถอย optimistic กลับเมื่อปฏิเสธ", () => {
    const b = blocks.find((x) => x.includes("side:'fs'"));
    expect(b, "หา callback side='fs' ไม่เจอ").toBeTruthy();
    expect(b).toMatch(/const res = await dmjFetch\(/);
    expect(b).toMatch(/const d = await dmjJson\(res\)/);
    expect(b).toMatch(/if \(!d \|\| d\.success === false\) setCheckSideStatus\(reqId, 'fs', 'pending'\)/);
    expect(b).toMatch(/catch\(e\)\{[^}]*setCheckSideStatus\(reqId, 'fs', 'pending'\)/);
  });

  it('ไม่มี await dmjFetch(...) แบบไม่อ่านคำตอบหลงเหลือในทั้ง 2 callback (กันถอยกลับไป "สำเร็จปลอม")', () => {
    blocks.forEach((b) => {
      expect(b).not.toMatch(/await dmjFetch\([^;]*\}\);\s*fetchFromSheet/);
    });
  });
});

describe('meta — setCheckSideStatus เป็นตัวกลางตัวเดียวของทั้ง optimistic-set และ revert', () => {
  it('markCheckSideDone เรียก setCheckSideStatus(..., "done") แทนการเขียน setData ซ้ำเอง', () => {
    const fn = grab(APP, /const markCheckSideDone = usC\([^;]*;/, 'markCheckSideDone');
    expect(fn).toMatch(/setCheckSideStatus\(reqId, side, 'done'\)/);
    expect(fn).toMatch(/\[setCheckSideStatus\]/);
  });

  it('setCheckSideStatus นิยามครั้งเดียว (ไม่มีสำเนาที่สอง)', () => {
    const defs = APP.match(/const setCheckSideStatus = usC\(/g) || [];
    expect(defs.length).toBe(1);
  });
});
