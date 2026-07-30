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
    grab(/var ROLE_ACTIONS_ = \{[\s\S]*?\n\};/),
    grab(/function canDoOrNull_\(sess, action\) \{[\s\S]*?\n\}/),
    grab(/function forbidden_\(msg\) \{[\s\S]*?\n\}/),
    grab(/var POST_FLAG_ACTIONS_ = \[[\s\S]*?\n\];/),
    grab(/function resolvePostAction_\(data\) \{[\s\S]*?\n\}/),
    'return { staffActorName_, canDoOrNull_, resolvePostAction_, ROLE_ACTIONS_, POST_FLAG_ACTIONS_ };',
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
  it('ทุก action ใน POST_FLAG_ACTIONS_ ผ่านหมดเมื่อไม่มี session', () => {
    const blocked = A.POST_FLAG_ACTIONS_.filter(a => A.canDoOrNull_(null, a) !== null);
    expect(blocked, 'ถูกบล็อกทั้งที่ยังไม่เปิด REQUIRE_LOGIN: ' + blocked.join(', ')).toEqual([]);
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
});
