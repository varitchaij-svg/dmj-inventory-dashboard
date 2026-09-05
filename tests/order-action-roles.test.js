// tests/order-action-roles.test.js — F04/F06: ปุ่มในเส้นทาง "ออเดอร์ → จัดของ → รับของ"
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (รายงานตรวจระบบ 5 ก.ย. 2026 · ประเด็น F04 และ F06)
//
// F04 — เครื่องร้านเห็นปุ่มผิดบทบาท และไม่มีปุ่มรับของ
//   สิทธิ์ปุ่มเดิมเขียนเป็น **blacklist** (`role !== "frontstore" && role !== "saler"`)
//   → `storedevice` ซึ่งเพิ่มเข้าระบบทีหลัง หลุดเข้ามาเห็นปุ่ม ✕ ยกเลิก / ✅ Done เอง
//     ทั้งที่ `deleteOrder` ฝั่ง server เปิดให้แค่ employee/warehouse → กดแล้วขึ้นแดงทุกครั้ง
//   กลับกัน `canConfirm` เป็น whitelist ที่ลืม storedevice → เครื่องกลางที่ยืนอยู่หน้าร้าน
//     **กดรับของไม่ได้เลย** ทั้งที่ `confirmShipmentReceive` อยู่ใน COMMON_ACTIONS_ (ทุก role ยิงได้)
//
// F06 — ปุ่มเปลี่ยนสถานะทันทีแต่ไม่ตรวจว่าบันทึกผ่าน
//   PRINT/SKIP · หิ้ว↔ขึ้นรถ · Central · ย้อนกลับเป็นรอ ยิงแล้วไม่เคยอ่านคำตอบ
//   GAS ตอบหน้า HTML ได้เมื่อ execution ซ้อนกัน (บทเรียนข้อ 13) → จอนี้เปลี่ยนแล้ว
//   แต่ชีตยังเป็นค่าเดิม → เครื่องอื่นเห็นคนละอย่าง งานถูกส่งต่อผิด **โดยไม่มี error ให้เห็น**
//
// ไฟล์นี้ **ไม่ copy เงื่อนไข** — ดึงตาราง/นิพจน์จริงจาก .jsx และ .gs มา eval
// (สำเนาเงื่อนไขด้านสิทธิ์ drift แล้วเทสต์จะเขียวทั้งที่ของจริงพัง — หลักเดียวกับ auth.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const GS   = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP  = readFileSync(join(ROOT, 'app.jsx'), 'utf8');

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + what);
  return m[0];
}

// eval ตารางสิทธิ์ + ฟังก์ชันตัดสินจริงจาก views-analytics.jsx
const CAP = (() => {
  const code = [
    grab(VANA, /const ORDER_PREPARE_ROLES\s*=\s*\[[^\]]*\];/, 'ORDER_PREPARE_ROLES'),
    grab(VANA, /const ORDER_CANCEL_ROLES\s*=\s*\[[^\]]*\];/, 'ORDER_CANCEL_ROLES'),
    grab(VANA, /const SHIPMENT_RECEIVE_ROLES\s*=\s*\[[^\]]*\];/, 'SHIPMENT_RECEIVE_ROLES'),
    grab(VANA, /const SHIPMENT_EDIT_ROLES\s*=\s*\[[^\]]*\];/, 'SHIPMENT_EDIT_ROLES'),
    grab(VANA, /function canPrepareOrder\(role\)[^\n]*\n/, 'canPrepareOrder'),
    grab(VANA, /function canCancelOrder\(role\)[^\n]*\n/, 'canCancelOrder'),
    grab(VANA, /function canReceiveShipment\(role\)[^\n]*\n/, 'canReceiveShipment'),
    grab(VANA, /function canEditShipment\(role\)[^\n]*\n/, 'canEditShipment'),
    'return { canPrepareOrder, canCancelOrder, canReceiveShipment, canEditShipment };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(code)();
})();

// role ทั้งหมดที่ส่งเข้า View ได้ — dev ถูกยุบเป็น "owner" มาก่อนแล้วจาก app.jsx (viewRole)
const VIEW_ROLES = ['owner', 'warehouse', 'employee', 'frontstore', 'saler', 'storedevice'];

describe('F04 — เครื่องร้าน (storedevice) เห็นปุ่มตรงกับสิ่งที่ทำได้จริง', () => {
  it('กดรับของได้ — เดิมทำไม่ได้เลยทั้งที่เป็นเครื่องที่ยืนอยู่หน้าร้าน', () => {
    expect(CAP.canReceiveShipment('storedevice')).toBe(true);
  });

  it('แก้จำนวนที่รับย้อนหลังได้ — รับเองแล้วต้องแก้ของตัวเองได้', () => {
    expect(CAP.canEditShipment('storedevice')).toBe(true);
  });

  it('ไม่เห็นปุ่มยกเลิกจัดของ — server ปฏิเสธอยู่แล้ว โชว์ไว้ = กดแล้วขึ้นแดงทุกครั้ง', () => {
    expect(CAP.canCancelOrder('storedevice')).toBe(false);
  });

  it('ไม่เห็นปุ่มจัดของ/Done — เครื่องกลางหน้าร้านไม่ใช่คนจัดของ (เท่า saler ตามที่ออกแบบไว้)', () => {
    expect(CAP.canPrepareOrder('storedevice')).toBe(false);
    expect(CAP.canPrepareOrder('saler')).toBe(false);
  });

  it('ของเดิมต้องไม่เปลี่ยน — คลัง/พนักงาน/เจ้าของ ยังจัดของและยกเลิกได้', () => {
    for (const r of ['owner', 'warehouse', 'employee']) {
      expect(CAP.canPrepareOrder(r), r).toBe(true);
      expect(CAP.canCancelOrder(r), r).toBe(true);
    }
    for (const r of ['frontstore', 'saler']) {
      expect(CAP.canPrepareOrder(r), r).toBe(false);
      expect(CAP.canCancelOrder(r), r).toBe(false);
    }
    expect(CAP.canReceiveShipment('frontstore')).toBe(true);
    expect(CAP.canReceiveShipment('saler')).toBe(true);
  });
});

describe('F04 — ปุ่มยกเลิกต้องตรงกับตารางสิทธิ์ฝั่ง .gs เป๊ะ (คนละไฟล์ ต้องไม่ drift)', () => {
  // ⚠️ ไม่ตรงเมื่อไหร่ = ปุ่มโชว์แล้วกดโดนปฏิเสธ หรือคนที่ทำได้จริงหาปุ่มไม่เจอ
  const GATE = (() => {
    const code = [
      grab(GS, /var IMMEDIATE_GATE_ACTIONS_ = \{[\s\S]*?\n\};/, 'IMMEDIATE_GATE_ACTIONS_'),
      'return IMMEDIATE_GATE_ACTIONS_;',
    ].join('\n');
    // eslint-disable-next-line no-new-func
    return new Function(code)();
  })();

  it('deleteOrder / deleteOrders เปิดให้ role เดียวกับที่ UI โชว์ปุ่ม (+ owner/dev ที่ผ่านเสมอ)', () => {
    for (const action of ['deleteOrder', 'deleteOrders']) {
      const allowed = GATE[action];
      expect(allowed, action + ' หายจากตาราง gate').toBeTruthy();
      for (const r of VIEW_ROLES) {
        // owner ผ่านด้วย isAdminRole_ ไม่ได้อยู่ในลิสต์ — รวมเข้ามาเองตอนเทียบ
        const serverOk = r === 'owner' || allowed.indexOf(r) >= 0;
        expect(CAP.canCancelOrder(r), `${action} · ${r}: UI กับ server ไม่ตรงกัน`).toBe(serverOk);
      }
    }
  });
});

describe('meta — จุดที่พังแล้วหน้าจอยังดูปกติทุกประการ', () => {
  it('ไม่มี blacklist role หลงเหลือในเส้นทางออเดอร์/รับของ (role ใหม่ต้องไม่ได้สิทธิ์ฟรี)', () => {
    // ยกเว้นบรรทัดคอมเมนต์ที่อธิบายว่าของเดิมเคยเขียนแบบไหน
    const lines = VANA.split('\n').filter(l => !l.trim().startsWith('//'));
    const bad = lines.filter(l => /role !== "(frontstore|saler|storedevice|warehouse|employee)"/.test(l));
    expect(bad, 'พบ blacklist role: ' + bad.join(' | ')).toEqual([]);
  });

  it('ปุ่มจริงในต้นทางเรียกฟังก์ชันความสามารถ ไม่ได้เทียบ role เอง', () => {
    expect(VANA).toMatch(/\{!isPending && canPrepareOrder\(role\) \? \(/);
    expect(VANA).toMatch(/\{isPending && !canceled && canCancelOrder\(role\) && \(/);
    expect(VANA).toMatch(/\{isPending && canPrepareOrder\(role\) && \(/);
    expect(VANA).toMatch(/const canConfirm = canReceiveShipment\(role\);/);
    expect(VANA).toMatch(/const canEdit = canEditShipment\(role\);/);
  });

  it('role ที่ส่งเข้า OrderListView คือ viewRole (dev ถูกยุบเป็น owner มาแล้ว)', () => {
    // ถ้าเปลี่ยนไปส่ง role ดิบ dev จะไม่เข้าเงื่อนไขไหนเลย = ปุ่มหายหมดทั้งแท็บ
    expect(APP).toMatch(/<OrderListView data=\{data\} role=\{viewRole\}\/>/);
    expect(APP).toMatch(/const viewRole = isAdminRole\(role\) \? "owner" : role;/);
  });
});

describe('F06 — สถานะที่กดแล้วต้อง "ดูผลจริง" ก่อนถือว่าสำเร็จ', () => {
  const saveOrderField = grab(
    VANA, /const saveOrderField = async \([\s\S]*?\n  \};/, 'saveOrderField');

  it('await ผลจริง แล้วถอย optimistic patch กลับเมื่อบันทึกไม่ผ่าน', () => {
    expect(saveOrderField).toMatch(/await syncOrderUpdate\(order, updates\)/);
    expect(saveOrderField).toMatch(/res\.success === false/);
    expect(saveOrderField).toMatch(/onPatch\(order\.id, prevUpdates\)/);
  });

  it('บอกผู้ใช้ว่ายังไม่ได้บันทึก ไม่ใช่เงียบ', () => {
    expect(saveOrderField).toMatch(/showToast\("warn"/);
    expect(saveOrderField).toMatch(/ยังไม่ได้บันทึก/);
  });

  it('ห้ามยิงซ้ำอัตโนมัติ — updateOrderState ยังไม่ idempotent (ไม่มี cid เหมือน action=order)', () => {
    expect(saveOrderField).not.toMatch(/for\s*\(|while\s*\(|retry/i);
  });

  it('ไม่แตะ saveFailed — ธงนั้นเป็นของช่อง "จัด" ใช้ร่วมกัน = ล้างคำเตือนของจำนวนที่ยังไม่เข้าระบบ', () => {
    expect(saveOrderField).not.toMatch(/setSaveFailed/);
  });

  it('ทั้ง 4 ปุ่มเดินผ่านตัวกลางตัวเดียวกัน ไม่มีตัวไหนแอบยิงตรง', () => {
    expect(VANA).toMatch(/const setPrintFlag = f => saveOrderField\(\{printFlag: f\}, \{printFlag: order\.printFlag\}/);
    expect(VANA).toMatch(/const setCarryMode = m => saveOrderField\(\{carryMode: m\}, \{carryMode: order\.carryMode\}/);
    expect(VANA).toMatch(/const setToCentral = v => saveOrderField\(\{toCentral: v\}, \{toCentral: order\.toCentral\}/);
    expect(VANA).toMatch(/await saveOrderField\(\{ status: "รอ" \}, \{ status: order\.status \}/);
  });

  it('undoComplete ขึ้น "ย้อนกลับแล้ว" เฉพาะตอนบันทึกผ่านจริง', () => {
    const fn = grab(VANA, /const undoComplete = async \(\) => \{[\s\S]*?\n  \};/, 'undoComplete');
    expect(fn).toMatch(/const okUndo = await saveOrderField\(/);
    expect(fn).toMatch(/if \(okUndo\) showToast\("success"/);
  });

  it('ไม่เหลือ fire-and-forget syncOrderUpdate ใน OrderItemRow (ยิงแล้วไม่ดูผล)', () => {
    const i = VANA.indexOf('function OrderItemRow(');
    const j = VANA.indexOf('\nfunction ', i + 1);
    const rowFn = VANA.slice(i, j < 0 ? VANA.length : j);
    // ทุกการเรียกต้องมี await หรือรับค่ากลับไปตรวจ
    const calls = rowFn.match(/^[^\n]*syncOrderUpdate\(/gm) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c, 'เรียกแบบไม่ดูผล: ' + c.trim()).toMatch(/await syncOrderUpdate\(/);
    }
  });
});
