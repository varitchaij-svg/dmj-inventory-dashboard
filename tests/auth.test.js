// tests/auth.test.js — เฟส 4 ระบบล็อกอิน: ตัวตนที่ server ยืนยันเอง + สิทธิ์ฝั่ง server
// ─────────────────────────────────────────────────────────────────────────────
// ต่างจากไฟล์เทสต์อื่นตรงที่ **ไม่ copy โค้ดเข้า tests/helpers.js**
// แต่ดึงฟังก์ชันจาก appsscript_complete.gs ตัวจริงมา eval แล้วทดสอบเลย
// เหตุผล: ตรรกะสิทธิ์เป็นเรื่องความปลอดภัย ถ้าเก็บเป็น "สำเนา" แล้ว drift
// เทสต์จะเขียวทั้งที่ production เปิดช่องโหว่ — วิธีนี้ไม่มีสำเนาให้ drift
// (ยืมเทคนิคอ่านไฟล์ต้นทางมาจาก drift-guard.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

// ดึง block โค้ดจากต้นทางตาม regex — ไม่เจอ = โครงสร้างต้นทางเปลี่ยน ต้องมาอัปเดตเทสต์
function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// ── สร้าง sandbox ที่ stub GAS globals แล้ว eval ฟังก์ชันจริงเข้าไป ──
function loadAuth(requireLogin) {
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
    STAFF_ROLE_TH_: {
      owner: 'เจ้าของ', saler: 'Sale', warehouse: 'คลังสินค้า',
      frontstore: 'หน้าร้าน', employee: 'พนักงาน', dev: 'DEV',
    },
  };
  const code = [
    grab(/function isAdminRole_[\s\S]*?\n\}/),
    grab(/function staffActorName_\(s\) \{[\s\S]*?\n\}/),
    grab(/function requireLoginEnabled_\(\) \{[\s\S]*?\n\}/),
    grab(/var SESSION_EXEMPT_ACTIONS_ = \{[\s\S]*?\n\};/),
    grab(/var MTO_JOB_ACTIONS_ = \[[\s\S]*?\n *\];/),
    grab(/var COMMON_ACTIONS_ = \[[\s\S]*?\n *\];/),
    grab(/var ROLE_ACTIONS_ = \{[\s\S]*?\n\};/),
    grab(/var IMMEDIATE_GATE_ACTIONS_ = \{[\s\S]*?\n\};/),
    grab(/var IMMEDIATE_GATE_STRICT_ACTIONS_ = \{[\s\S]*?\n\};/),
    grab(/function canDoOrNull_\(sess, action\) \{[\s\S]*?\n\}/),
    grab(/function forbidden_\(msg\) \{[\s\S]*?\n\}/),
    grab(/var POST_FLAG_ACTIONS_ = \[[\s\S]*?\n\];/),
    grab(/function resolvePostAction_\(data\) \{[\s\S]*?\n\}/),
    'return { staffActorName_, canDoOrNull_, resolvePostAction_, ROLE_ACTIONS_, POST_FLAG_ACTIONS_, IMMEDIATE_GATE_ACTIONS_, IMMEDIATE_GATE_STRICT_ACTIONS_ };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(ctx), code)(...Object.values(ctx));
}

let A;
beforeEach(() => { A = loadAuth(false); });

describe('staffActorName_ — ชื่อ actor ที่ server ประกอบเอง', () => {
  it('รูปแบบ "ชื่อ (ตำแหน่ง)" ตรงกับ window._currentUser ฝั่ง frontend', () => {
    expect(A.staffActorName_({ displayName: 'แนน', role: 'saler' })).toBe('แนน (Sale)');
  });
  it('dev → "DEV" (ต้องตรงกับ ROLE_TH_PLAIN ใน app.jsx)', () => {
    expect(A.staffActorName_({ displayName: 'ต้า', role: 'dev' })).toBe('ต้า (DEV)');
  });
  it('ไม่มี displayName → fallback lineDisplayName', () => {
    expect(A.staffActorName_({ lineDisplayName: 'Jeed', role: 'owner' })).toBe('Jeed (เจ้าของ)');
  });
  it('ไม่มีชื่อเลย → "ไม่ระบุ" ไม่คืน undefined', () => {
    expect(A.staffActorName_({ role: 'owner' })).toBe('ไม่ระบุ (เจ้าของ)');
  });
  it('ยังไม่ได้ตั้งตำแหน่ง → "รอตำแหน่ง"', () => {
    expect(A.staffActorName_({ displayName: 'ใหม่' })).toBe('ใหม่ (รอตำแหน่ง)');
  });
  it('null → null (ให้ caller fallback ไป data.actor)', () => {
    expect(A.staffActorName_(null)).toBe(null);
  });
});

describe('resolvePostAction_ — รวม 2 แบบ dispatch ให้เหลือชื่อเดียว', () => {
  it('แบบ data.action', () => {
    expect(A.resolvePostAction_({ action: 'punch' })).toBe('punch');
  });
  it('แบบ boolean flag', () => {
    expect(A.resolvePostAction_({ createSaleBill: true })).toBe('createSaleBill');
  });
  it('flag ที่ยังไม่รู้จัก → null (ไม่บล็อก ของเดิมไม่พัง)', () => {
    expect(A.resolvePostAction_({ brandNewAction: true })).toBe(null);
  });
  it('payload ว่าง/null → null', () => {
    expect(A.resolvePostAction_({})).toBe(null);
    expect(A.resolvePostAction_(null)).toBe(null);
  });
  it('ลิสต์ flag ครอบคลุม dispatch จริงใน doPost ครบทุกตัว', () => {
    // อ่าน `if (data.xxx)` เฉพาะ "ในตัว doPost" แล้วเทียบกับ POST_FLAG_ACTIONS_
    // เพิ่ม dispatch ใหม่แล้วลืมเติมลิสต์ → เทสต์แดง
    // (ไม่งั้น action ใหม่จะหลุดการตรวจสิทธิ์เงียบ ๆ ตอนเปิด REQUIRE_LOGIN)
    //
    // ต้องจำกัดขอบเขตแค่ doPost — `if (data.dryRun)` / `if (data.channel)` ใน
    // handler อื่นเป็น "field ข้อมูล" ไม่ใช่คำสั่ง ถ้าสแกนทั้งไฟล์จะ false-positive
    const start = SRC.indexOf('function doPost(e)');
    const end = SRC.indexOf('function doGet(e)');
    expect(start, 'หา doPost ไม่เจอ').toBeGreaterThan(-1);
    expect(end, 'หา doGet ไม่เจอ').toBeGreaterThan(start);
    const body = SRC.slice(start, end);

    const dispatched = new Set();
    const re = /^\s*if \(data\.([a-zA-Z]+)\)/gm;
    let m;
    while ((m = re.exec(body)) !== null) dispatched.add(m[1]);
    // 'events' = LINE webhook (ไม่ใช่ action ของแอป) · 'action' = dispatch อีกแบบ
    ['events', 'action'].forEach(k => dispatched.delete(k));

    const listed = new Set(A.POST_FLAG_ACTIONS_);
    const missing = [...dispatched].filter(a => !listed.has(a));
    expect(missing, 'dispatch ใน doPost ที่ยังไม่อยู่ใน POST_FLAG_ACTIONS_: ' + missing.join(', ')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// สำคัญที่สุด: REQUIRE_LOGIN ปิด (ค่า default) ต้องเป็น no-op สมบูรณ์
// ถ้าข้อนี้พัง = merge แล้วพนักงานทำงานไม่ได้ทั้งร้าน
// ─────────────────────────────────────────────────────────────────────────────
describe('canDoOrNull_ — โหมด rollout (REQUIRE_LOGIN ปิด) ต้องไม่บล็อกอะไรเลย', () => {
  beforeEach(() => { A = loadAuth(false); });

  it('ไม่มี session + write action → ผ่าน', () => {
    expect(A.canDoOrNull_(null, 'transferStock')).toBe(null);
  });
  it('role ผิดฝั่งก็ยังผ่าน (ยังไม่บังคับสิทธิ์)', () => {
    expect(A.canDoOrNull_({ role: 'saler' }, 'deductStock')).toBe(null);
  });
  it('ทุก action ใน POST_FLAG_ACTIONS_ ผ่านหมดเมื่อไม่มี session (ยกเว้น action ที่ deny-by-default อยู่แล้วก่อนเฟส 4)', () => {
    // resetNegativeStock/zeroStock ไม่มี legitimate caller จาก UI เลย — เดิม (ก่อนเฟส 4)
    // ก็ปฏิเสธเสมออยู่แล้วเพราะไม่มีใครส่ง role/session มา ต้องรักษาพฤติกรรม deny-by-default นี้ไว้
    // ไม่ใช่ "ผ่านหมดตอน REQUIRE_LOGIN ปิด" เหมือน action ที่มี caller จาก UI จริงตัวอื่น
    const STRICT = Object.keys(A.IMMEDIATE_GATE_STRICT_ACTIONS_);
    const blocked = A.POST_FLAG_ACTIONS_.filter(a => STRICT.indexOf(a) < 0 && A.canDoOrNull_(null, a) !== null);
    expect(blocked, 'ถูกบล็อกทั้งที่ยังไม่เปิด REQUIRE_LOGIN: ' + blocked.join(', ')).toEqual([]);
    STRICT.forEach(a => {
      expect(A.canDoOrNull_(null, a), a + ' ต้องถูกปฏิเสธเสมอ (deny-by-default)').not.toBe(null);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMMEDIATE_GATE — action ที่กระทบเงิน/สต็อกจริง (อนุมัติ/ปิดใบเสนอราคา ZORT, ปรับสต็อกเป็น 0,
// ลบ order, ออกใบกำกับภาษี, reset stock ติดลบ) ต้องเช็คสิทธิ์ "ทันที" ไม่รอเปิด REQUIRE_LOGIN
// เหมือน action อื่น — เดิม endpoint พวกนี้ไม่เคยเช็คสิทธิ์อะไรเลย เสี่ยงเกินกว่าจะรอ rollout
// ─────────────────────────────────────────────────────────────────────────────
describe('canDoOrNull_ — IMMEDIATE_GATE เช็คทันทีแม้ REQUIRE_LOGIN ยังปิดอยู่ (ค่า default วันนี้)', () => {
  beforeEach(() => { A = loadAuth(false); });

  it('resetNegativeStock/zeroStock: deny-by-default เสมอเมื่อไม่มี session', () => {
    expect(A.canDoOrNull_(null, 'resetNegativeStock')).not.toBe(null);
    expect(A.canDoOrNull_(null, 'zeroStock')).not.toBe(null);
  });
  it('zeroStock: owner/dev/warehouse ผ่าน role อื่นถูกบล็อก', () => {
    expect(A.canDoOrNull_({ role: 'owner', status: 'active' }, 'zeroStock')).toBe(null);
    expect(A.canDoOrNull_({ role: 'warehouse', status: 'active' }, 'zeroStock')).toBe(null);
    expect(A.canDoOrNull_({ role: 'saler', status: 'active' }, 'zeroStock')).not.toBe(null);
  });
  it('resetNegativeStock: เฉพาะ owner/dev', () => {
    expect(A.canDoOrNull_({ role: 'owner', status: 'active' }, 'resetNegativeStock')).toBe(null);
    expect(A.canDoOrNull_({ role: 'warehouse', status: 'active' }, 'resetNegativeStock')).not.toBe(null);
  });
  it('voidQuotation/approveQuotation/issueFullTaxInvoice: ไม่มี session → ผ่าน (migration-safe เหมือน action อื่น)', () => {
    ['voidQuotation', 'approveQuotation', 'issueFullTaxInvoice'].forEach(a => {
      expect(A.canDoOrNull_(null, a), a).toBe(null);
    });
  });
  it('voidQuotation/approveQuotation/issueFullTaxInvoice: มี session แต่ role ผิด → ถูกบล็อกทันที', () => {
    ['voidQuotation', 'approveQuotation', 'issueFullTaxInvoice'].forEach(action => {
      expect(A.canDoOrNull_({ role: 'frontstore', status: 'active' }, action), action).not.toBe(null);
      expect(A.canDoOrNull_({ role: 'warehouse', status: 'active' }, action), action).not.toBe(null);
      expect(A.canDoOrNull_({ role: 'saler', status: 'active' }, action), action).toBe(null);
      expect(A.canDoOrNull_({ role: 'owner', status: 'active' }, action), action).toBe(null);
    });
  });
  it('deleteOrder/deleteOrders: ไม่มี session → ผ่าน (migration-safe)', () => {
    expect(A.canDoOrNull_(null, 'deleteOrder')).toBe(null);
    expect(A.canDoOrNull_(null, 'deleteOrders')).toBe(null);
  });
  it('deleteOrder/deleteOrders: frontstore/saler ถูกบล็อกแม้มี session (ตรงกับ UI ที่ซ่อนปุ่มยกเลิกให้ 2 role นี้)', () => {
    ['deleteOrder', 'deleteOrders'].forEach(action => {
      expect(A.canDoOrNull_({ role: 'frontstore', status: 'active' }, action), action).not.toBe(null);
      expect(A.canDoOrNull_({ role: 'saler', status: 'active' }, action), action).not.toBe(null);
      expect(A.canDoOrNull_({ role: 'employee', status: 'active' }, action), action).toBe(null);
      expect(A.canDoOrNull_({ role: 'warehouse', status: 'active' }, action), action).toBe(null);
    });
  });
  // หมายเหตุ: canDoOrNull_ ไม่เช็ค sess.status ซ้ำ — resolveSession_ ต้นทางคืนค่าเฉพาะ session
  // ที่ active อยู่แล้ว (หมดอายุ/ถูก revoke = คืน null ไปตั้งแต่ต้นทาง) จึงไม่มี sess ที่ status
  // ไม่ active หลุดมาถึงจุดนี้ในโค้ดจริง — ไม่ต้องเทสต์เคสที่เกิดขึ้นไม่ได้
});

describe('canDoOrNull_ — IMMEDIATE_GATE ยังคงบังคับเหมือนเดิมตอนเปิด REQUIRE_LOGIN แล้ว', () => {
  beforeEach(() => { A = loadAuth(true); });

  it('migration-safe action ไม่มี session → ปฏิเสธ (พฤติกรรมเหมือน action อื่นทั้งหมดตอนเปิด REQUIRE_LOGIN)', () => {
    expect(A.canDoOrNull_(null, 'voidQuotation')).not.toBe(null);
    expect(A.canDoOrNull_(null, 'deleteOrder')).not.toBe(null);
  });
  it('role ถูกต้อง → ยังผ่านเหมือนเดิม', () => {
    expect(A.canDoOrNull_({ role: 'saler', status: 'active' }, 'approveQuotation')).toBe(null);
    expect(A.canDoOrNull_({ role: 'employee', status: 'active' }, 'deleteOrders')).toBe(null);
  });
});

describe('canDoOrNull_ — โหมดบังคับล็อกอิน (REQUIRE_LOGIN เปิด)', () => {
  beforeEach(() => { A = loadAuth(true); });

  it('ไม่มี session → ปฏิเสธ', () => {
    expect(A.canDoOrNull_(null, 'transferStock')).not.toBe(null);
  });
  it('action ยกเว้น (ล็อกอิน) ผ่านได้แม้ไม่มี session — ไม่งั้นล็อกอินไม่ได้เลย', () => {
    ['authLine', 'claimLoginHandoff', 'me', 'logout', 'verifyPin'].forEach(a => {
      expect(A.canDoOrNull_(null, a), a).toBe(null);
    });
  });
  it('owner / dev ผ่านทุก action', () => {
    ['owner', 'dev'].forEach(role => {
      const blocked = A.POST_FLAG_ACTIONS_.filter(a => A.canDoOrNull_({ role }, a) !== null);
      expect(blocked, role + ' ถูกบล็อก: ' + blocked.join(', ')).toEqual([]);
    });
  });
  it('saler: ออกบิลได้ แต่ห้ามยุ่งสต็อกคลัง', () => {
    expect(A.canDoOrNull_({ role: 'saler' }, 'createSaleBill')).toBe(null);
    expect(A.canDoOrNull_({ role: 'saler' }, 'deductStock')).not.toBe(null);
    expect(A.canDoOrNull_({ role: 'saler' }, 'confirmStockCount')).not.toBe(null);
  });
  it('warehouse: จัดการสต็อกได้ แต่ห้ามออกบิลขาย', () => {
    expect(A.canDoOrNull_({ role: 'warehouse' }, 'confirmStockCount')).toBe(null);
    expect(A.canDoOrNull_({ role: 'warehouse' }, 'createSaleBill')).not.toBe(null);
  });
  it('frontstore: นับหน้าร้าน/โอนได้ แต่ห้ามเพิ่มสินค้าใหม่', () => {
    expect(A.canDoOrNull_({ role: 'frontstore' }, 'updateFrontStore')).toBe(null);
    expect(A.canDoOrNull_({ role: 'frontstore' }, 'addNewProduct')).not.toBe(null);
  });
  it('ทุก role กดลงเวลา (punch/myToday) ได้', () => {
    ['saler', 'warehouse', 'frontstore', 'employee'].forEach(role => {
      expect(A.canDoOrNull_({ role }, 'punch'), role).toBe(null);
      expect(A.canDoOrNull_({ role }, 'myToday'), role).toBe(null);
    });
  });
  it('ทุก role เปิด "เวลาของฉัน" (myAttendanceSummary) ได้ — อยู่ในแท็บลงเวลาที่ทุก role มี', () => {
    ['saler', 'storedevice', 'warehouse', 'frontstore', 'employee'].forEach(role => {
      expect(A.canDoOrNull_({ role }, 'myAttendanceSummary'), role).toBe(null);
    });
  });
  it('storedevice (เครื่องร้าน) ดู attendanceToday ได้ — เหตุผลหลักที่มี role นี้', () => {
    expect(A.canDoOrNull_({ role: 'storedevice' }, 'attendanceToday')).toBe(null);
  });
  it('ทุก role ที่มีแท็บ mtojobs สร้าง/ปิด/มอบหมายงาน MTO ได้เท่ากันหมด (เจ้าของยืนยัน 2026-07-30)', () => {
    ['saler', 'storedevice', 'frontstore', 'warehouse', 'employee'].forEach(role => {
      ['createMtoJob', 'closeMtoJob', 'saveMtoJobItems', 'deleteMtoJob', 'assignMtoJob', 'listActiveStaffNames'].forEach(action => {
        expect(A.canDoOrNull_({ role }, action), role + '/' + action).toBe(null);
      });
    });
  });
  it('role ที่ไม่รู้จัก → ปฏิเสธ (fail closed)', () => {
    expect(A.canDoOrNull_({ role: 'ghost' }, 'order')).not.toBe(null);
    expect(A.canDoOrNull_({}, 'order')).not.toBe(null);
  });
  it('action ที่ยังไม่รู้จัก (null) → ไม่บล็อก (fail open โดยตั้งใจ)', () => {
    // เจตนา: dispatch ใหม่ที่ลืมขึ้นทะเบียน ต้องไม่ทำให้พนักงานทำงานไม่ได้
    // ความปลอดภัยชั้นจริงคือ meta-test ด้านบนที่บังคับให้ลิสต์ครบ
    expect(A.canDoOrNull_({ role: 'saler' }, null)).toBe(null);
  });
  it('ทุก role ที่ใช้จริงมีสิทธิ์สั่งของ (order) — งานพื้นฐานร่วมกัน', () => {
    ['saler', 'warehouse', 'frontstore', 'employee'].forEach(role => {
      expect(A.canDoOrNull_({ role }, 'order'), role).toBe(null);
    });
  });

  // ⚠️ กันเหตุการณ์ 2026-07-30 ซ้ำ: เปิด REQUIRE_LOGIN แล้วทั้งร้านใช้งานไม่ได้ เพราะ role
  // ขาด action พื้นฐานที่ view ร่วม (ProductCard/OrderModal/StockView) เรียกอยู่ทุกวัน
  it('ทุก role ที่ไม่ใช่ owner ต้องมี COMMON_ACTIONS_ ครบ — ไม่งั้นเปิด REQUIRE_LOGIN แล้วงานหยุด', () => {
    ['saler', 'storedevice', 'frontstore', 'warehouse', 'employee'].forEach(role => {
      ['order', 'updateOrderState', 'transferStock', 'transferStockBatch',
       'confirmShipmentReceive', 'updateFrontStore', 'fetchProductImage',
       'punch', 'myToday', 'myAttendanceSummary'].forEach(action => {
        expect(A.canDoOrNull_({ role }, action), role + '/' + action).toBe(null);
      });
    });
  });
});
