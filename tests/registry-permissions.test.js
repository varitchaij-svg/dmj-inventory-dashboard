// tests/registry-permissions.test.js — Phase G hardening · สิทธิ์ Product Registry (D06)
// ─────────────────────────────────────────────────────────────────────────────
// eval ฟังก์ชัน + ตารางสิทธิ์จริงจาก appsscript_complete.gs (ไม่ copy — เหมือน auth.test.js)
// ล็อกเมทริกซ์สิทธิ์แบบ "พฤติกรรมจริง" ไม่ใช่ string-scan:
//   A) canDoOrNull_ — เมทริกซ์เมื่อเปิด REQUIRE_LOGIN (list=ทุก role · save=admin · reserveForm=warehouse+admin)
//   B) self-gate ของ save*Registry handler — non-admin ถูกปฏิเสธ "ก่อนแตะชีต" (ป้องกันที่ทำงานจริง
//      ตอนนี้ เพราะ REQUIRE_LOGIN ยังปิด → canDoOrNull_ เป็น no-op · self-gate คือด่านเดียวที่เหลือ)
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

// ── A) เมทริกซ์ canDoOrNull_ (ยืมชุด stub เดียวกับ auth.test.js) ──
function loadAuth(requireLogin) {
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'REQUIRE_LOGIN' ? String(requireLogin) : null) }) },
    ContentService: { createTextOutput: (s) => ({ setMimeType: () => ({ _body: s }) }), MimeType: { JSON: 1 } },
    STAFF_ROLE_TH_: { owner: 'เจ้าของ', saler: 'Sale', warehouse: 'คลังสินค้า', frontstore: 'หน้าร้าน', employee: 'พนักงาน', dev: 'DEV' },
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
    grab(/function canDoOrNull_\(sess, action\) \{[\s\S]*?\n\}/),
    grab(/function forbidden_\(msg\) \{[\s\S]*?\n\}/),
    'return { canDoOrNull_, COMMON_ACTIONS_, ROLE_ACTIONS_ };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(ctx), code)(...Object.values(ctx));
}

const REAL_ROLES = ['saler', 'storedevice', 'warehouse', 'frontstore', 'employee'];
const LIST_ACTIONS = ['listPrefixRegistry', 'listFamilyRegistry', 'listFormRegistry', 'listVariantRegistry'];
const SAVE_ACTIONS = ['savePrefixRegistry', 'saveFamilyRegistry', 'saveVariantRegistry'];

describe('A) canDoOrNull_ — เมทริกซ์สิทธิ์ Registry เมื่อเปิด REQUIRE_LOGIN', () => {
  let A;
  beforeEach(() => { A = loadAuth(true); });

  it('list*Registry — ทุก role ที่ล็อกอินอ่านได้ (อยู่ใน COMMON_ACTIONS_)', () => {
    REAL_ROLES.concat(['owner', 'dev']).forEach(role => {
      LIST_ACTIONS.forEach(a => expect(A.canDoOrNull_({ role }, a), role + '/' + a).toBe(null));
    });
  });

  it('save*Registry — เฉพาะ owner/dev · role อื่นถูกปฏิเสธ (D06 governance)', () => {
    ['owner', 'dev'].forEach(role => {
      SAVE_ACTIONS.forEach(a => expect(A.canDoOrNull_({ role }, a), role + '/' + a).toBe(null));
    });
    REAL_ROLES.forEach(role => {
      SAVE_ACTIONS.forEach(a => expect(A.canDoOrNull_({ role }, a), role + '/' + a).not.toBe(null));
    });
  });

  it('reserveForm — warehouse + owner/dev สร้างแบบใหม่ได้ · role อื่นถูกปฏิเสธ', () => {
    ['warehouse', 'owner', 'dev'].forEach(role => expect(A.canDoOrNull_({ role }, 'reserveForm'), role).toBe(null));
    ['saler', 'storedevice', 'frontstore', 'employee'].forEach(role =>
      expect(A.canDoOrNull_({ role }, 'reserveForm'), role).not.toBe(null));
  });

  it('ไม่มี session → save*/reserveForm ถูกปฏิเสธ (fail closed)', () => {
    SAVE_ACTIONS.concat(['reserveForm']).forEach(a => expect(A.canDoOrNull_(null, a), a).not.toBe(null));
  });

  it('save* ต้องไม่หลุดเข้า COMMON_ACTIONS_ (เผลอเปิดสิทธิ์เขียนให้ทุก role)', () => {
    SAVE_ACTIONS.concat(['reserveForm']).forEach(a =>
      expect(A.COMMON_ACTIONS_.indexOf(a), a + ' ต้องไม่อยู่ใน COMMON').toBe(-1));
  });
});

describe('A2) canDoOrNull_ — REQUIRE_LOGIN ปิด (default วันนี้) save* เป็น no-op ที่ชั้นนี้', () => {
  // สำคัญ: ตอนนี้ canDoOrNull_ ไม่บล็อก save* (no-op) → ด่านจริงคือ self-gate ใน handler (ชุด B)
  let A;
  beforeEach(() => { A = loadAuth(false); });
  it('save*/reserveForm ผ่าน canDoOrNull_ เมื่อ REQUIRE_LOGIN ปิด (ป้องกันอยู่ที่ handler)', () => {
    SAVE_ACTIONS.concat(['reserveForm']).forEach(a =>
      expect(A.canDoOrNull_({ role: 'warehouse' }, a), a).toBe(null));
  });
});

// ── B) self-gate ในตัว handler — ด่านที่ทำงานจริง "วันนี้" (REQUIRE_LOGIN ปิด) ──
// พิสูจน์ว่า non-admin ถูกปฏิเสธ "ก่อนแตะ LockService/ชีต" — stub LockService ให้ throw
// ถ้า gate ถูก bypass จะไปโดน throw = เทสต์แดง (จับ regression ที่ลบ self-gate ออก)
function loadSaveHandlers(sessRole, sessStatus) {
  const calls = { sheetTouched: false, lockTaken: false };
  const unauthorizedMarker = { success: false, error: 'unauthorized', _gate: true };
  const ctx = {
    // enabled = true ทุก registry (จะได้ผ่านด่าน enabled ไปถึง gate จริง)
    prefixRegistryEnabled_: () => true,
    familyRegistryEnabled_: () => true,
    variantRegistryEnabled_: () => true,
    resolveSession_: () => (sessRole ? { staffId: 'S1', role: sessRole, status: sessStatus || 'active' } : null),
    unauthorized_: () => unauthorizedMarker,
    error: (m) => ({ success: false, error: m }),
    ok: (d) => ({ success: true, data: d }),
    // ด่านหลัง gate — ต้องไม่ถูกเรียกเมื่อ non-admin (ถ้าเรียก = throw ให้เทสต์แดง)
    LockService: { getScriptLock: () => { calls.lockTaken = true; throw new Error('LockService reached — self-gate bypassed!'); } },
    prefixRegValidate_: () => { throw new Error('validate reached — self-gate bypassed!'); },
    familyRegValidate_: () => { throw new Error('validate reached — self-gate bypassed!'); },
    variantRegValidate_: () => { throw new Error('validate reached — self-gate bypassed!'); },
    _calls: calls,
  };
  const code = [
    grab(/function isAdminRole_[\s\S]*?\n\}/),
    grab(/function savePrefixRegistryHandler_\(ss, data, actor\) \{[\s\S]*?\n\}/),
    grab(/function saveFamilyRegistryHandler_\(ss, data, actor\) \{[\s\S]*?\n\}/),
    grab(/function saveVariantRegistryHandler_\(ss, data, actor\) \{[\s\S]*?\n\}/),
    'return { savePrefixRegistryHandler_, saveFamilyRegistryHandler_, saveVariantRegistryHandler_, _calls, _un: ' +
      JSON.stringify(unauthorizedMarker) + ' };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(ctx), code)(...Object.values(ctx));
}

describe('B) self-gate ของ save*Registry — non-admin ถูกปฏิเสธก่อนแตะชีต (ป้องกันที่ทำงานวันนี้)', () => {
  const handlers = ['savePrefixRegistryHandler_', 'saveFamilyRegistryHandler_', 'saveVariantRegistryHandler_'];
  const data = { sessionToken: 'x', prefix: 'OL', name: 'ก', axis: 'COLOR', code: '01', label: 'แดง', status: 'ACTIVE' };

  it('non-admin (warehouse/saler/frontstore/employee) → unauthorized · ไม่แตะ LockService/validate', () => {
    ['warehouse', 'saler', 'frontstore', 'employee', 'storedevice'].forEach(role => {
      const H = loadSaveHandlers(role, 'active');
      handlers.forEach(fn => {
        const r = H[fn]({}, data, 'actor');   // ต้องไม่ throw (คือไม่ไปถึง LockService/validate)
        expect(r && r.success, fn + '/' + role + ' ต้องถูกปฏิเสธ').toBe(false);
        expect(H._calls.lockTaken, fn + '/' + role + ' ห้ามจับล็อกก่อนผ่าน gate').toBe(false);
      });
    });
  });

  it('session ไม่ active (เช่น รออนุมัติ) → unauthorized เช่นกัน', () => {
    const H = loadSaveHandlers('owner', 'pending');
    handlers.forEach(fn => {
      const r = H[fn]({}, data, 'actor');
      expect(r && r.success, fn).toBe(false);
      expect(H._calls.lockTaken, fn).toBe(false);
    });
  });

  it('ไม่มี session เลย → unauthorized (ไม่ปล่อยผ่านแม้ REQUIRE_LOGIN ปิด)', () => {
    const H = loadSaveHandlers(null);
    handlers.forEach(fn => {
      const r = H[fn]({}, data, 'actor');
      expect(r && r.success, fn).toBe(false);
      expect(H._calls.lockTaken, fn).toBe(false);
    });
  });

  it('admin (owner) active → ผ่าน gate ไปถึงด่านถัดไป (validate) — พิสูจน์ gate ไม่ได้บล็อกทุกคน', () => {
    // owner active ต้อง "ผ่าน" self-gate → ไปโดน validate stub ที่ throw = ยืนยันว่าผ่าน gate จริง
    const H = loadSaveHandlers('owner', 'active');
    handlers.forEach(fn => {
      expect(() => H[fn]({}, data, 'actor'), fn + ' owner ควรผ่าน gate ไปถึง validate').toThrow(/self-gate bypassed/);
    });
  });
});
