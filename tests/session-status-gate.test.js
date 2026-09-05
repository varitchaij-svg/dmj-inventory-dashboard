// tests/session-status-gate.test.js — F02: บัญชีที่ถูกระงับ/ยังรออนุมัติ ต้องทำรายการไม่ได้
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (รายงานตรวจระบบ 5 ก.ย. 2026 · ประเด็น F02):
//   เจ้าของกด "ระงับ" พนักงานในแท็บพนักงานแล้วเข้าใจว่าสิทธิ์หมดทันที — แต่ไม่ใช่
//   · resolveSession_ ตรวจแค่ตัว session เอง (หมดอายุ / ถูก revoke) **ไม่เคยดู status
//     ของแถวพนักงาน** แล้วคืน staff object ออกมาตามปกติ
//   · saveStaffHandler_ ตอนกดระงับ ล้างแค่ session **cache** ไม่ได้ revoke token
//   · canDoOrNull_ เขียนคอมเมนต์ไว้ว่า "ไม่ต้องเช็ค status ซ้ำ เพราะ resolver ตรวจแล้ว"
//     ซึ่งเป็นสมมติฐานที่ผิด → คนที่ถูกระงับยังสั่งของ/โอนสต็อก/ออกบิลได้จนกว่า session
//     จะหมดอายุเอง (30 วัน) โดยหน้าจอเจ้าของขึ้นว่าระงับไปแล้ว
//
// ไฟล์นี้ **ไม่ copy โค้ด** — eval ฟังก์ชันจริงจาก appsscript_complete.gs เหมือน auth.test.js
// (ตรรกะความปลอดภัย ถ้าเก็บเป็นสำเนาแล้ว drift เทสต์จะเขียวทั้งที่ production เปิดช่องโหว่)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// อ่าน body ที่ forbidden_/ok ห่อไว้กลับมาเป็น object
function body(res) {
  if (res == null) return null;
  return JSON.parse(res._body);
}

function load(requireLogin) {
  const ctx = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'REQUIRE_LOGIN' ? String(requireLogin) : null),
      }),
    },
    ContentService: {
      createTextOutput: (s) => ({ setMimeType: () => ({ _body: s }) }),
      MimeType: { JSON: 1 },
    },
  };
  const code = [
    grab(/function isAdminRole_[\s\S]*?\n\}/),
    grab(/function requireLoginEnabled_\(\) \{[\s\S]*?\n\}/),
    grab(/var SESSION_EXEMPT_ACTIONS_ = \{[\s\S]*?\n\};/),
    grab(/var MTO_JOB_ACTIONS_ = \[[\s\S]*?\n *\];/),
    grab(/var COMMON_ACTIONS_ = \[[\s\S]*?\n *\];/),
    grab(/var ROLE_ACTIONS_ = \{[\s\S]*?\n\};/),
    grab(/var IMMEDIATE_GATE_ACTIONS_ = \{[\s\S]*?\n\};/),
    grab(/var IMMEDIATE_GATE_STRICT_ACTIONS_ = \{[\s\S]*?\n\};/),
    grab(/function sessionInactiveOrNull_\(sess\) \{[\s\S]*?\n\}/),
    grab(/function canDoOrNull_\(sess, action\) \{[\s\S]*?\n\}/),
    grab(/function forbidden_\(msg\) \{[\s\S]*?\n\}/),
    'return { canDoOrNull_, sessionInactiveOrNull_ };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(ctx), code)(...Object.values(ctx));
}

// action ที่ "เขียนข้อมูลจริง" ครอบทุกฝั่งงาน — คนถูกระงับต้องทำไม่ได้สักอย่าง
const WRITE_ACTIONS = [
  'order',                  // สั่งของ
  'updateOrderState',       // จัดของ / กด Done
  'transferStock',          // โอนสต็อก
  'transferStockBatch',
  'confirmShipmentReceive', // รับของ
  'updateFrontStore',       // บันทึกยอดนับหน้าร้าน
  'createSaleBill',         // ออกบิลขาย (เงินจริง)
  'createQuotation',
  'punch',                  // ลงเวลา
  'addNewProduct',
];

let OFF, ON;
beforeEach(() => { OFF = load(false); ON = load(true); });

describe('sessionInactiveOrNull_ — ด่านสถานะบัญชี', () => {
  it('active → ผ่าน', () => {
    expect(OFF.sessionInactiveOrNull_({ role: 'warehouse', status: 'active' })).toBe(null);
  });

  it('ไม่มี session เลย → ผ่าน ("ยังไม่ได้ล็อกอิน" ≠ "ถูกระงับ" — ของเดิมต้องไม่พัง)', () => {
    expect(OFF.sessionInactiveOrNull_(null)).toBe(null);
    expect(OFF.sessionInactiveOrNull_(undefined)).toBe(null);
  });

  it('disabled → ปฏิเสธ พร้อมข้อความที่บอกว่าต้องทำอะไรต่อ', () => {
    const b = body(OFF.sessionInactiveOrNull_({ role: 'owner', status: 'disabled' }));
    expect(b.success).toBe(false);
    expect(b.forbidden).toBe(true);
    expect(b.error).toMatch(/ระงับ/);
  });

  it('pending → ปฏิเสธ ด้วยข้อความคนละแบบกับ disabled (คนละสถานการณ์ ห้ามบอกเหมือนกัน)', () => {
    const p = body(OFF.sessionInactiveOrNull_({ role: 'saler', status: 'pending' }));
    const d = body(OFF.sessionInactiveOrNull_({ role: 'saler', status: 'disabled' }));
    expect(p.error).toMatch(/รอ.*อนุมัติ/);
    expect(p.error).not.toBe(d.error);
  });

  it('สถานะแปลกที่ไม่รู้จัก → ปฏิเสธ (deny-by-default ไม่เดาว่าใช้งานได้)', () => {
    expect(OFF.sessionInactiveOrNull_({ role: 'owner', status: 'suspended' })).not.toBe(null);
  });

  // ⚠️ ตั้งใจให้ "ว่าง = ไม่รู้ ไม่ใช่ถูกระงับ" — เส้นทางระงับจริงเขียนค่าลงคอลัมน์เสมอ
  //    (saveStaffHandler_ เขียนเฉพาะค่าใน VALID_STATUS · authLine_ ตั้ง pending/active ให้แถวใหม่)
  //    จึงไม่มีช่องโหว่ แต่แถวที่เจ้าของแก้ในชีตเองแล้วเผลอลบค่าทิ้ง จะไม่ถูกล็อกออกแบบไม่มีคำอธิบาย
  it('status ว่าง/หาย → ผ่าน (ไม่เปลี่ยนพฤติกรรมเดิม ไม่ล็อกคนออกเพราะเซลล์ว่าง)', () => {
    expect(OFF.sessionInactiveOrNull_({ role: 'warehouse' })).toBe(null);
    expect(OFF.sessionInactiveOrNull_({ role: 'warehouse', status: '' })).toBe(null);
    expect(OFF.sessionInactiveOrNull_({ role: 'warehouse', status: null })).toBe(null);
  });

  it('เว้นวรรคหน้าหลัง/ตัวพิมพ์ต่างกันไม่ทำให้หลุด', () => {
    expect(OFF.sessionInactiveOrNull_({ role: 'owner', status: ' active ' })).toBe(null);
    expect(OFF.sessionInactiveOrNull_({ role: 'owner', status: ' disabled ' })).not.toBe(null);
  });
});

describe('canDoOrNull_ — บัญชีที่ไม่ active ถูกปฏิเสธ **ไม่รอ REQUIRE_LOGIN**', () => {
  // นี่คือหัวใจของ F02: การกดระงับต้องมีผลทันที ไม่ใช่ฟีเจอร์ที่รอ rollout
  it('REQUIRE_LOGIN ปิด (ค่า default วันนี้) — disabled ก็ยังทำ write action ไม่ได้', () => {
    for (const a of WRITE_ACTIONS) {
      expect(OFF.canDoOrNull_({ role: 'warehouse', status: 'disabled' }, a), a).not.toBe(null);
    }
  });

  it('REQUIRE_LOGIN ปิด — pending ก็ยังทำ write action ไม่ได้', () => {
    for (const a of WRITE_ACTIONS) {
      expect(OFF.canDoOrNull_({ role: 'saler', status: 'pending' }, a), a).not.toBe(null);
    }
  });

  it('role owner ที่ถูกระงับ ก็ถูกปฏิเสธ — สิทธิ์สูงไม่ข้ามด่านสถานะ', () => {
    expect(OFF.canDoOrNull_({ role: 'owner', status: 'disabled' }, 'transferStock')).not.toBe(null);
    expect(OFF.canDoOrNull_({ role: 'dev', status: 'disabled' }, 'createSaleBill')).not.toBe(null);
    expect(ON.canDoOrNull_({ role: 'owner', status: 'disabled' }, 'deductStock')).not.toBe(null);
  });

  it('เปิด REQUIRE_LOGIN แล้วก็ยังปฏิเสธเหมือนเดิม', () => {
    for (const a of WRITE_ACTIONS) {
      expect(ON.canDoOrNull_({ role: 'warehouse', status: 'disabled' }, a), a).not.toBe(null);
    }
  });

  it('active ทำงานได้เหมือนเดิมทุกอย่าง (ด่านใหม่ต้องไม่ไปกันคนที่ทำงานอยู่)', () => {
    expect(OFF.canDoOrNull_({ role: 'warehouse', status: 'active' }, 'transferStock')).toBe(null);
    expect(OFF.canDoOrNull_({ role: 'saler', status: 'active' }, 'createSaleBill')).toBe(null);
    expect(ON.canDoOrNull_({ role: 'warehouse', status: 'active' }, 'deductStock')).toBe(null);
    expect(ON.canDoOrNull_({ role: 'saler', status: 'active' }, 'createSaleBill')).toBe(null);
  });

  it('ไม่มี session → ยังผ่านเหมือนเดิมตอน REQUIRE_LOGIN ปิด (migration-safe)', () => {
    expect(OFF.canDoOrNull_(null, 'transferStock')).toBe(null);
    expect(OFF.canDoOrNull_(null, 'updateOrderState')).toBe(null);
  });

  // ── ทางออกของคนที่ถูกระงับ: ต้องยัง "รู้ตัว" และ "ออกจากระบบ" ได้ ──
  // me/logout อยู่ใน SESSION_EXEMPT_ACTIONS_ — ปิดด้วยเมื่อไหร่ = จอค้างโดยไม่มีคำอธิบาย
  // และกดออกจากระบบไม่ได้ (frontend มีจอ "บัญชีถูกระงับ" ที่ขับด้วยผล me อยู่แล้ว)
  it('disabled ยังเรียก me/logout ได้ — ไม่งั้นเห็นแต่จอค้าง ออกจากระบบก็ไม่ได้', () => {
    for (const a of ['me', 'logout', 'authLine', 'claimLoginHandoff']) {
      expect(OFF.canDoOrNull_({ role: 'owner', status: 'disabled' }, a), a).toBe(null);
      expect(ON.canDoOrNull_({ role: 'owner', status: 'disabled' }, a), a).toBe(null);
    }
  });
});

describe('meta — จุดเชื่อมต่อที่หลุดแล้วช่องโหว่กลับมาโดยไม่มี error ให้เห็น', () => {
  it('canDoOrNull_ เรียกด่านสถานะ **ก่อน** ตาราง IMMEDIATE_GATE/ROLE_ACTIONS_', () => {
    const fn = grab(/function canDoOrNull_\(sess, action\) \{[\s\S]*?\n\}/);
    const iGate = fn.indexOf('sessionInactiveOrNull_(sess)');
    expect(iGate).toBeGreaterThan(-1);
    expect(iGate).toBeLessThan(fn.indexOf('IMMEDIATE_GATE_STRICT_ACTIONS_[action]'));
    expect(iGate).toBeLessThan(fn.indexOf('requireLoginEnabled_()'));
  });

  it('ด่านสถานะต้องไม่ถูกครอบด้วย requireLoginEnabled_ (กดระงับต้องมีผลทันที ไม่รอเปิด flag)', () => {
    const fn = grab(/function canDoOrNull_\(sess, action\) \{[\s\S]*?\n\}/);
    const head = fn.slice(0, fn.indexOf('sessionInactiveOrNull_(sess)'));
    expect(head).not.toMatch(/requireLoginEnabled_/);
  });

  it('คอมเมนต์เก่าที่บอกว่า "ไม่ต้องเช็ค status ซ้ำ" ต้องไม่กลับมา (เป็นสมมติฐานที่ผิด)', () => {
    expect(SRC).not.toMatch(/ไม่เช็ค sess\.status ซ้ำ/);
  });

  it('handleOrder_ (doGet — ไม่ผ่าน canDoOrNull_) ต้องกันด้วยด่านเดียวกัน', () => {
    const fn = grab(/function handleOrder_\(params\) \{[\s\S]*?\n\}\n/);
    expect(fn).toMatch(/sessionInactiveOrNull_\(sess\)/);
  });

  it('ทั้งระบบใช้ helper ตัวเดียว ไม่เขียนเงื่อนไข status ซ้ำในด่านกลาง', () => {
    // เขียนซ้ำสองที่แล้วแก้ที่เดียว = อีกที่ยังรั่วอยู่โดยไม่มีอะไรเตือน
    const defs = SRC.match(/function sessionInactiveOrNull_\(/g) || [];
    expect(defs.length).toBe(1);
  });
});
