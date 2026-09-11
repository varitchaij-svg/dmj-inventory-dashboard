// tests/push-transport.test.js — PWA Push Phase 1 (transport proof)
// ─────────────────────────────────────────────────────────────────────────────
// ขอบเขต Phase 1: register / test-send เข้าเครื่องตัวเอง / unregister
// **ยังไม่ผูก business event ใด ๆ** — ไฟล์นี้จึงคุม 2 อย่างเป็นหลัก:
//   (ก) สิทธิ์ — ใครสมัคร/ส่ง/ถอนได้ และ "การรู้ token ไม่ใช่หลักฐานสิทธิ์"
//   (ข) จุดเชื่อมต่อที่พังแล้วไม่มี error ให้เห็น — cache/lock/ทางแสดงผล/เส้นทางบันทึกงาน
//
// รันฟังก์ชัน **จริง** จาก `.gs` (eval — ไม่ copy เข้า helpers.js) ตามธรรมเนียมเดียวกับ
// auth.test.js / punch-lock.test.js เพราะสำเนาที่ drift จะเขียวทั้งที่ของจริงรั่ว
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS   = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const UI   = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');
const APP  = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const SW   = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');
const CFG  = readFileSync(join(ROOT, 'config.js'), 'utf8');
const VMAIN= readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

// ⚠️ assertion ที่สแกนหา "โค้ด" ต้องตัดคอมเมนต์ออกก่อนเสมอ — ไม่งั้นคำอธิบายที่เอ่ยถึง
//    สิ่งที่เราห้าม (เช่น importScripts) จะทำให้เทสต์แดงทั้งที่โค้ดถูกต้อง และที่แย่กว่าคือ
//    ทำให้คนแก้ไปลบคอมเมนต์ที่มีค่าทิ้งเพื่อให้เทสต์เขียว
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + what);
  return m[0];
}
const fn = (name) => grab(GS, new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'), name);

// ── ดึงของจริงจาก .gs ────────────────────────────────────────────────────────
const SRC = [
  'PUSH_COL', 'PUSH_HEADERS', 'PUSH_SCAN_ROWS', 'PUSH_TEST_TTL_SEC',
].map(v => grab(GS, new RegExp('var ' + v + '\\s*=[\\s\\S]*?;\\n'), v)).join('\n')
  + ['pushEnabled_','pushDeviceSheet_','pushSessionRef_','pushTokenHash_','pushMaskToken_','pushValidDeviceId_',
     'pushValidToken_','pushOff_','pushJson_','pushGate_','pushRateLimitOrNull_','pushReadRows_',
     'pushRowEnabled_','pushRevokeRows_','pushRevokeBindingsForSession_',
     'registerPushDeviceHandler_','unregisterPushDeviceHandler_','sendTestPushHandler_',
     'fcmServiceAccount_','fcmSendToToken_'].map(fn).join('\n');

// ── sandbox ──────────────────────────────────────────────────────────────────
// ชีตปลอมแบบ "นับการเขียนได้" — ข้อสำคัญคือรู้ว่าเขียนกี่ครั้ง (T10: valid → ต้องไม่เขียน)
// ชีตปลอมที่ "นับการเขียนได้" — ข้อสำคัญคือรู้ว่าเขียนกี่ครั้ง (T10: valid → ต้องไม่เขียน)
function makeSheet2(rows) {
  const data = rows.map(r => r.slice());
  const w = { setValue: 0, appendRow: 0 };
  return {
    _data: data, _w: w,
    getLastRow: () => (data.length ? data.length + 1 : 1),
    getRange: (row, col, nRows) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < (nRows || 1); i++) out.push((data[row - 2 + i] || []).slice());
        return out;
      },
      setValue: (v) => { w.setValue++; if (data[row - 2]) data[row - 2][col - 1] = v; },
    }),
    appendRow: (r) => { w.appendRow++; data.push(r.slice()); },
  };
}

const HEADER_LEN = 14;
function deviceRow({ deviceId='dev-aaaaaaaa', staffId='ST0001', token='tok-aaaaaaaaaaaaaaaaaaaaaa',
                     sessionRef='ref1', ver=1, enabled=true }) {
  const r = new Array(HEADER_LEN).fill('');
  r[0]=deviceId; r[1]=staffId; r[2]='HASH:'+token; r[3]=token; r[4]=sessionRef;
  r[5]=ver; r[6]=enabled; r[7]=''; r[8]='';
  return r;
}

function run({ src = SRC, sheetRows = [], session, pushOn = true, fetchImpl, saProp } = {}) {
  const calls = { fetch: 0, lock: 0, release: 0, cachePut: 0 };
  const sheet = makeSheet2(sheetRows);
  const ctx = {
    calls, sheet,
    SHEET_PUSH_DEVICES: 'อุปกรณ์แจ้งเตือน',
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k === 'PUSH_ENABLED' ? (pushOn ? 'true' : 'false')
                        : k === 'FCM_SERVICE_ACCOUNT_JSON' ? (saProp || null) : null),
    })},
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => { calls.cachePut++; } }) },
    LockService: { getScriptLock: () => ({
      tryLock: () => { calls.lock++; return true; },
      releaseLock: () => { calls.release++; },
    })},
    UrlFetchApp: { fetch: (...a) => { calls.fetch++; return fetchImpl ? fetchImpl(...a) : { getResponseCode: () => 200, getContentText: () => '{}' }; } },
    Utilities: {
      computeDigest: () => [1,2,3],
      base64Encode: () => 'B64', DigestAlgorithm: { SHA_256: 'S' }, Charset: { UTF_8: 'U' },
      computeRsaSha256Signature: () => [1,2,3],
    },
    Logger: { log: () => {} },
    sha256Hex_: (s) => 'HASH:' + String(s),
    resolveSession_: () => (session === undefined
      ? { staffId: 'ST0001', role: 'owner', status: 'active' } : session),
    isAdminRole_: (r) => r === 'owner' || r === 'dev',
    unauthorized_: () => ({ __unauthorized: true }),
    forbidden_: (m) => ({ __forbidden: true, error: m }),
    getOrCreateSheet_: () => sheet,
    ContentService: { MimeType: { JSON: 'JSON' },
      createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
  };
  const names = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  const api = new Function(...names, src + `
    return { pushGate_, registerPushDeviceHandler_, unregisterPushDeviceHandler_,
             sendTestPushHandler_, pushRevokeBindingsForSession_, pushValidDeviceId_,
             pushValidToken_, pushMaskToken_, pushEnabled_, fcmSendToToken_, fcmServiceAccount_ };
  `)(...names.map(n => ctx[n]));
  const ss = { getSheetByName: () => (sheetRows === null ? null : sheet) };
  return { api, ss, sheet, calls };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('A. ด่านสิทธิ์ (pushGate_) — backend ตรวจเอง ไม่พึ่งการซ่อนปุ่ม', () => {
  const G = { requireEnabled: true, requireAdmin: true };

  it('ไม่มี session → ปฏิเสธ **ทั้งที่ REQUIRE_LOGIN ปิดอยู่** (surface ใหม่ deny-by-default)', () => {
    const { api, ss } = run({ session: null });
    expect(api.pushGate_(ss, {}, G).err).toEqual({ __unauthorized: true });
  });

  it('status ว่าง → ปฏิเสธ (sessionInactiveOrNull_ เดิมปล่อยผ่าน — ห้ามใช้เป็นด่านเดียว)', () => {
    const { api, ss } = run({ session: { staffId: 'ST1', role: 'owner', status: '' } });
    expect(api.pushGate_(ss, {}, G).err.__forbidden).toBe(true);
  });

  it('status = disabled / pending → ปฏิเสธ', () => {
    for (const st of ['disabled', 'pending']) {
      const { api, ss } = run({ session: { staffId: 'ST1', role: 'owner', status: st } });
      expect(api.pushGate_(ss, {}, G).err.__forbidden, st).toBe(true);
    }
  });

  it('active แต่ไม่ใช่ owner/dev → ปฏิเสธ register/test (requireAdmin)', () => {
    for (const role of ['saler', 'warehouse', 'frontstore', 'storedevice', 'employee']) {
      const { api, ss } = run({ session: { staffId: 'ST1', role, status: 'active' } });
      expect(api.pushGate_(ss, {}, G).err.__forbidden, role).toBe(true);
    }
  });

  it('owner และ dev ผ่าน', () => {
    for (const role of ['owner', 'dev']) {
      const { api, ss } = run({ session: { staffId: 'ST1', role, status: 'active' } });
      expect(api.pushGate_(ss, {}, G).err, role).toBeUndefined();
    }
  });

  it('PUSH_ENABLED ปิด → requireEnabled คืน off (ไม่มีการส่งใด ๆ)', () => {
    const { api, ss } = run({ pushOn: false });
    expect(api.pushGate_(ss, {}, G).err).toEqual({ ok: false, off: true });
  });

  it('unregister ต้องผ่านได้แม้ PUSH_ENABLED ปิด และแม้ไม่ใช่ owner/dev', () => {
    const { api, ss } = run({ pushOn: false, session: { staffId: 'ST1', role: 'saler', status: 'active' } });
    const g = api.pushGate_(ss, {}, { requireEnabled: false, requireAdmin: false });
    expect(g.err, 'ปิด flag แล้วถอนไม่ได้ = binding ค้างโดยเจ้าตัวเอาออกไม่ได้').toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. register — idempotent และห้ามยึด token ข้ามบัญชี', () => {
  const OK = { deviceId: 'dev-aaaaaaaa', pushToken: 'tok-aaaaaaaaaaaaaaaaaaaaaa', sessionToken: 'sess1' };

  it('ยังไม่มีแถว → เพิ่มใหม่ bindingVersion = 1', () => {
    const { api, ss, sheet } = run({ sheetRows: [] });
    const out = api.registerPushDeviceHandler_(ss, OK);
    expect(out.ok).toBe(true);
    expect(out.created).toBe(true);
    expect(sheet._w.appendRow).toBe(1);
  });

  it('T10 — binding เดิมยัง valid และไม่มีอะไรเปลี่ยน → unchanged **โดยไม่เขียนชีตเลย**', () => {
    const rows = [deviceRow({ sessionRef: 'HASH:sess1'.slice(0, 32) })];
    const { api, ss, sheet } = run({ sheetRows: rows });
    const out = api.registerPushDeviceHandler_(ss, OK);
    expect(out.unchanged, 'ต้องคืน unchanged').toBe(true);
    expect(sheet._w.setValue, 'valid อยู่แล้วยังเขียนซ้ำ = เขียนชีตทุก boot').toBe(0);
    expect(sheet._w.appendRow).toBe(0);
  });

  it('T8a — token ผูกกับ staff อื่นอยู่ → ปฏิเสธ tokenOwnedByOther และ **binding เดิมไม่ถูกแตะ**', () => {
    const rows = [deviceRow({ staffId: 'ST_OTHER', sessionRef: 'refX' })];
    const { api, ss, sheet } = run({ sheetRows: rows });
    const out = api.registerPushDeviceHandler_(ss, OK);
    expect(out.tokenOwnedByOther).toBe(true);
    expect(out.ok).toBe(false);
    expect(sheet._w.setValue, 'การรู้ token ไม่ใช่หลักฐานสิทธิ์ — ห้าม reassign').toBe(0);
    expect(sheet._data[0][1], 'เจ้าของเดิมต้องยังเป็นเจ้าของ').toBe('ST_OTHER');
  });

  it('token ของตัวเองแต่ session เปลี่ยน (re-login) → อัปเดต + bump bindingVersion', () => {
    const rows = [deviceRow({ sessionRef: 'refเก่า', ver: 3 })];
    const { api, ss, sheet } = run({ sheetRows: rows });
    const out = api.registerPushDeviceHandler_(ss, OK);
    expect(out.updated).toBe(true);
    expect(out.bindingVersion).toBe(4);
    expect(sheet._w.setValue).toBeGreaterThan(0);
  });

  it('แถวที่ถูก revoke ไปแล้วของตัวเอง → กลับมาใช้ได้ (ไม่ resurrect เงียบ — ผ่าน register ที่ยืนยันตัวตน)', () => {
    const rows = [deviceRow({ enabled: false, ver: 2 })];
    const { api, ss } = run({ sheetRows: rows });
    const out = api.registerPushDeviceHandler_(ss, OK);
    expect(out.ok).toBe(true);
    expect(out.bindingVersion).toBe(3);
  });

  it('deviceId / token รูปแบบผิด → ปฏิเสธ ไม่เขียนอะไร', () => {
    const bad = [
      { ...OK, deviceId: 'sh' },
      { ...OK, deviceId: 'has space!!' },
      { ...OK, pushToken: 'sml' },
      { ...OK, pushToken: 'has space in token value here' },
      { ...OK, pushToken: 'x'.repeat(5000) },
    ];
    for (const b of bad) {
      const { api, ss, sheet } = run({ sheetRows: [] });
      expect(api.registerPushDeviceHandler_(ss, b).ok, JSON.stringify(b).slice(0, 60)).toBe(false);
      expect(sheet._w.appendRow).toBe(0);
    }
  });

  it('จับล็อกคร่อมการเขียน และปล่อยล็อกทุกทางออก', () => {
    const { api, ss, calls } = run({ sheetRows: [] });
    api.registerPushDeviceHandler_(ss, OK);
    expect(calls.lock).toBe(1);
    expect(calls.release).toBe(1);
  });

  it('register **ไม่ยิง network เลย** (ไม่มี UrlFetchApp ในเส้นทางสมัคร)', () => {
    const { api, ss, calls } = run({ sheetRows: [] });
    api.registerPushDeviceHandler_(ss, OK);
    expect(calls.fetch).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. test-send — ส่งเข้าเครื่องตัวเองเท่านั้น ไม่มี admin override', () => {
  it('ไม่มีอุปกรณ์ → noDevice ไม่ยิง FCM', () => {
    const { api, ss, calls } = run({ sheetRows: [] });
    const out = api.sendTestPushHandler_(ss, { sessionToken: 's' });
    expect(out.noDevice).toBe(true);
    expect(calls.fetch).toBe(0);
  });

  it('เครื่องของ staff อื่น → ไม่ถูกเลือกเป็นปลายทาง', () => {
    const rows = [deviceRow({ staffId: 'ST_OTHER', deviceId: 'dev-other001' })];
    const { api, ss, calls } = run({ sheetRows: rows });
    const out = api.sendTestPushHandler_(ss, { sessionToken: 's' });
    expect(out.noDevice, 'หยิบเครื่องคนอื่นมาส่ง = ผู้รับรั่ว').toBe(true);
    expect(calls.fetch).toBe(0);
  });

  it('ปลอม staffId / recipient / token ใน body → ไม่เปลี่ยนตัวตนผู้รับ', () => {
    const rows = [deviceRow({ staffId: 'ST_OTHER', deviceId: 'dev-other001' })];
    const { api, ss } = run({ sheetRows: rows });
    const out = api.sendTestPushHandler_(ss, {
      sessionToken: 's',
      staffId: 'ST_OTHER', targetStaffId: 'ST_OTHER',
      pushToken: 'tok-attackerbbbbbbbbbbbb', to: 'ST_OTHER',
    });
    expect(out.noDevice).toBe(true);
  });

  it('deviceId ที่ขอต้องเป็นของตัวเอง — ระบุของคนอื่นแล้วไม่เจอ', () => {
    const rows = [deviceRow({ staffId: 'ST0001', deviceId: 'dev-mine0001' }),
                  deviceRow({ staffId: 'ST_OTHER', deviceId: 'dev-other001', token: 'tok-bbbbbbbbbbbbbbbbbbbbbb' })];
    const { api, ss } = run({ sheetRows: rows });
    expect(api.sendTestPushHandler_(ss, { sessionToken: 's', deviceId: 'dev-other001' }).noDevice).toBe(true);
    expect(api.sendTestPushHandler_(ss, { sessionToken: 's', deviceId: 'dev-mine0001' }).noDevice).toBeUndefined();
  });

  it('ยังไม่ตั้ง service account → stage=config และ **ไม่ยิง network**', () => {
    const rows = [deviceRow({})];
    const { api, ss, calls } = run({ sheetRows: rows, saProp: null });
    const out = api.sendTestPushHandler_(ss, { sessionToken: 's' });
    expect(out.ok).toBe(false);
    expect(out.stage).toBe('config');
    expect(calls.fetch, 'ไม่มี credential ก็ยังยิงออกไป = เสียเวลา+log ขยะ').toBe(0);
  });

  it('PUSH_ENABLED ปิด → off ไม่ยิง', () => {
    const { api, ss, calls } = run({ sheetRows: [deviceRow({})], pushOn: false });
    expect(api.sendTestPushHandler_(ss, { sessionToken: 's' }).off).toBe(true);
    expect(calls.fetch).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. logout / revoke — ถอนเฉพาะเครื่องที่ออก ไม่ใช่ทุกเครื่องของคนเดียวกัน', () => {
  it('T7 — ถอน binding ของ session ที่ logout เท่านั้น เครื่องอื่นของคนเดียวกันยังอยู่', () => {
    const ref = 'HASH:sess1'.slice(0, 32);
    const rows = [
      deviceRow({ deviceId: 'dev-phone001', sessionRef: ref }),
      deviceRow({ deviceId: 'dev-tablet01', sessionRef: 'HASH:other'.slice(0, 32), token: 'tok-bbbbbbbbbbbbbbbbbbbbbb' }),
    ];
    const { api, ss, sheet } = run({ sheetRows: rows });
    const n = api.pushRevokeBindingsForSession_(ss, 'sess1', 'logout');
    expect(n).toBe(1);
    expect(sheet._data[0][6], 'เครื่องที่ logout ต้องถูกปิด').toBe(false);
    expect(sheet._data[1][6], 'เครื่องอื่นของ staff เดียวกันต้องไม่ถูกแตะ').toBe(true);
  });

  it('ยังไม่มีชีตอุปกรณ์ → คืน 0 ไม่สร้างชีตเปล่า ไม่ throw', () => {
    const { api } = run({});
    const ssNull = { getSheetByName: () => null };
    expect(api.pushRevokeBindingsForSession_(ssNull, 'sess1', 'logout')).toBe(0);
  });

  it('unregister ถอนได้เฉพาะแถวของตัวเอง', () => {
    const rows = [deviceRow({ staffId: 'ST_OTHER', deviceId: 'dev-other001' })];
    const { api, ss, sheet } = run({ sheetRows: rows });
    const out = api.unregisterPushDeviceHandler_(ss, { sessionToken: 's', deviceId: 'dev-other001' });
    expect(out.revoked).toBe(0);
    expect(sheet._data[0][6], 'ถอนเครื่องคนอื่นได้ = ปิดแจ้งเตือนคนอื่นได้').toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. input validation + ไม่รั่ว secret', () => {
  const { api } = run({});
  it('pushValidDeviceId_ / pushValidToken_ รับเฉพาะรูปแบบที่ตั้งใจ', () => {
    expect(api.pushValidDeviceId_('abcdefgh')).toBe(true);
    expect(api.pushValidDeviceId_('abc')).toBe(false);
    expect(api.pushValidDeviceId_('a'.repeat(65))).toBe(false);
    expect(api.pushValidDeviceId_('bad id')).toBe(false);
    expect(api.pushValidToken_('t'.repeat(30))).toBe(true);
    expect(api.pushValidToken_('t'.repeat(19))).toBe(false);
    expect(api.pushValidToken_('has space')).toBe(false);
  });
  it('pushMaskToken_ ไม่คืน token เต็มไม่ว่ากรณีใด', () => {
    const t = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const m = api.pushMaskToken_(t);
    expect(m).not.toContain(t);
    expect(m.length).toBeLessThan(t.length);
    expect(api.pushMaskToken_('short')).toBe('***');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F. จุดเชื่อมต่อฝั่ง backend (พังแล้วไม่มี error ให้เห็น)', () => {
  it('dispatch ทั้ง 3 action อยู่ **เหนือ** invalidateCache_(true)', () => {
    // ⚠️ ต้องหา "คำสั่งจริง" ไม่ใช่คอมเมนต์ที่เอ่ยถึง — มีคอมเมนต์หลายที่เขียนว่า
    //    "อยู่เหนือ invalidateCache_(true)" ซึ่ง indexOf ธรรมดาจะไปเจอก่อน
    const inv = GS.search(/^\s*invalidateCache_\(true\);/m);
    expect(inv, 'หาคำสั่ง invalidateCache_(true) ใน doPost ไม่เจอ').toBeGreaterThan(0);
    for (const a of ['registerPushDevice', 'unregisterPushDevice', 'sendTestPush']) {
      const i = GS.indexOf(`data.action === '${a}'`);
      expect(i, a + ' ไม่ถูก dispatch').toBeGreaterThan(0);
      expect(i, a + ' ตกไปใต้ invalidateCache_ = ทุกเครื่องโหลด payload ใหม่ทุกครั้งที่สมัคร').toBeLessThan(inv);
    }
  });

  it('ทั้ง section push **ไม่เรียก invalidateCache_ เลย** (ชีตอุปกรณ์ไม่อยู่ใน payload)', () => {
    const sec = GS.slice(GS.indexOf('🔔 PWA Push (FCM) — Phase 1'));
    const hits = (sec.match(/^\s*invalidateCache_\(/gm) || []);
    expect(hits, 'ล้าง payload cache จากเส้นทาง push = bump ts → ทุกเครื่องโหลดใหม่ฟรี').toHaveLength(0);
  });

  it('ชีตอุปกรณ์ต้อง **ไม่อยู่** ใน PAYLOAD_SOURCE_SHEETS_', () => {
    const t = grab(GS, /var PAYLOAD_SOURCE_SHEETS_[\s\S]*?\];/, 'PAYLOAD_SOURCE_SHEETS_');
    expect(t).not.toContain('SHEET_PUSH_DEVICES');
  });

  it('logoutHandler_ ถอน binding **ก่อน** revokeSession_ (ต้องใช้ token คำนวณ sessionRef)', () => {
    const b = fn('logoutHandler_');
    const a = b.indexOf('pushRevokeBindingsForSession_');
    const c = b.indexOf('revokeSession_');
    expect(a, 'logout ไม่ถอน binding = ออกจากระบบแล้วยังได้รับแจ้งเตือน').toBeGreaterThan(-1);
    expect(a).toBeLessThan(c);
  });

  it('unregisterPushDevice อยู่ใน COMMON_ACTIONS_ (ทุก role ถอนเครื่องตัวเองได้)', () => {
    const t = grab(GS, /var COMMON_ACTIONS_[\s\S]*?\];/, 'COMMON_ACTIONS_');
    expect(t).toContain('"unregisterPushDevice"');
    expect(t, 'register/sendTest ต้องไม่อยู่ที่นี่ — เป็น admin-only').not.toContain('"registerPushDevice"');
    expect(t).not.toContain('"sendTestPush"');
  });

  it('payload ที่ส่ง FCM เป็น **data-only** — ห้ามมีคีย์ notification (ไม่งั้นแสดง 2 อัน)', () => {
    const b = fn('fcmSendToToken_');
    expect(b).toContain('data:');
    expect(b, 'ใส่ notification ใน payload = browser แสดงเอง + SW แสดงอีก = 2 อัน')
      .not.toMatch(/notification\s*:/);
  });

  it('INVALID_ARGUMENT ต้อง **ไม่** ถูกนับเป็น token เสีย (payload ผิดก็ได้)', () => {
    const b = fn('fcmSendToToken_');
    const dead = grab(b, /var dead =[^;]*;/, 'dead');
    expect(dead).not.toContain('INVALID_ARGUMENT');
    expect(dead).toContain('UNREGISTERED');
  });

  it('ไม่มี fcm/oauth network call หลุดเข้า pushInappNoti_ หรือเส้นทางบันทึกงานธุรกิจ', () => {
    for (const f of ['pushInappNoti_', 'handleOrder_', 'transferStockBatch', 'updateOrderState',
                     'confirmShipmentReceive', 'createSaleBill']) {
      const b = fn(f);
      expect(b, f + ' มี FCM อยู่ในเส้นทางบันทึกงาน').not.toContain('fcm.googleapis.com');
      expect(b).not.toContain('fcmSendToToken_');
    }
  });

  it('มีแต่ fcmSendToToken_/fcmAccessToken_ เท่านั้นที่ยิงปลายทาง Google auth/FCM', () => {
    const owners = [];
    for (const m of GS.matchAll(/function ([A-Za-z0-9_]+)\([\s\S]*?\n\}/g)) {
      if (/fcm\.googleapis\.com|oauth2\.googleapis\.com/.test(m[0])) owners.push(m[1]);
    }
    expect(owners.sort()).toEqual(['fcmAccessToken_', 'fcmSendToToken_']);
  });

  it('เครื่องมือ owner เป็น read-only จริง (checkPushStatus ไม่เขียน/ไม่ยิง network)', () => {
    const b = fn('checkPushStatus');
    expect(b).not.toContain('setProperty');
    expect(b).not.toContain('UrlFetchApp');
    expect(b).not.toContain('appendRow');
    expect(b, 'ต้องไม่พิมพ์ค่า secret').not.toMatch(/Logger\.log\([^)]*private_key/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('G. service worker — ทางแสดงผลทางเดียว + ไม่ทำ cache เดิมพัง', () => {
  it('มี push และ notificationclick', () => {
    expect(SW).toContain('addEventListener("push"');
    expect(SW).toContain('addEventListener("notificationclick"');
  });

  it('showNotification ถูกเรียก **จุดเดียว** ทั้งไฟล์', () => {
    const n = (SW.match(/showNotification\(/g) || []).length;
    expect(n, 'มีมากกว่า 1 จุด = เสี่ยงแสดงซ้ำ').toBe(1);
  });

  it('ไม่ import Firebase SDK เข้ามาใน SW (จะติดตั้ง push handler ตัวที่ 2)', () => {
    const code = stripComments(SW);
    expect(code).not.toContain('importScripts');
    expect(code).not.toContain('firebase-messaging-sw');
  });

  it('bypass คำขอที่ไม่ใช่ GET (Cache API เก็บ POST ไม่ได้)', () => {
    expect(SW).toContain('e.request.method !== "GET"');
  });

  it('bypass ปลายทาง token/registration — ห้าม cache คำตอบที่อ่อนไหว', () => {
    for (const h of ['fcmregistrations.googleapis.com', 'firebaseinstallations.googleapis.com', 'oauth2.googleapis.com']) {
      expect(SW, h + ' ไม่ถูกกัน → ตกไป cache-first').toContain(h);
    }
  });

  it('bypass ต้องอยู่ **ก่อน** เส้นทาง cache ทั้งหมด', () => {
    const bypass = SW.indexOf('e.request.method !== "GET"');
    expect(bypass).toBeLessThan(SW.indexOf('stale-while-revalidate — iOS-safe'));
    expect(bypass).toBeLessThan(SW.lastIndexOf('caches.match(e.request)'));
  });

  it('CACHE_NAME เดินหน้าจาก baseline dmj-v59 (ห้ามย้อนเลข)', () => {
    const m = SW.match(/const CACHE_NAME = "dmj-v(\d+)"/);
    expect(m).toBeTruthy();
    expect(Number(m[1]), 'ย้อนเลข = เครื่องที่ cache ของเก่าไว้ยังเสิร์ฟของเดิม').toBeGreaterThan(59);
  });

  it('ยังไม่แตะ VENDOR_CACHE / dmj-babel ในขั้น activate (ไม่ล้างของที่แพง)', () => {
    expect(SW).toContain('k !== VENDOR_CACHE');
    expect(SW).toContain("!k.startsWith(\"dmj-babel\")");
  });

  it('notificationclick เปิดได้เฉพาะ same-origin และไม่รัน business mutation', () => {
    const blk = grab(SW, /addEventListener\("notificationclick"[\s\S]*?\n\}\);/, 'notificationclick');
    expect(blk).toContain('u.origin === self.location.origin');
    for (const bad of ['fetch(', 'transferStock', 'updateOrderState', 'confirmShipmentReceive']) {
      expect(blk, 'คลิกแจ้งเตือนต้องไม่เปลี่ยนข้อมูลธุรกิจ').not.toContain(bad);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('H. client — ปลอดภัยต่อการ boot และอ่านคำตอบจริง', () => {
  it('config เริ่มต้นปิดอยู่ และไม่มีค่าที่ "เดา" มาใส่', () => {
    const blk = grab(CFG, /const DMJ_FCM_CONFIG = \{[\s\S]*?\n\};/, 'DMJ_FCM_CONFIG');
    expect(blk).toContain('enabled: false');
    for (const k of ['apiKey', 'projectId', 'messagingSenderId', 'appId', 'vapidPublicKey']) {
      expect(blk, k + ' ต้องเป็นค่าว่าง ห้ามเดา').toMatch(new RegExp(k + ':\\s*""'));
    }
  });

  it('dmjPushConfig คืน null ถ้าปิด หรือค่าใดว่าง (ไม่ยิง network ด้วย config ครึ่ง ๆ)', () => {
    const src = grab(UI, /function dmjPushConfig\(\)[\s\S]*?\n\}/, 'dmjPushConfig');
    const mk = (cfg) => new Function('DMJ_FCM_CONFIG', src + '\nreturn dmjPushConfig();')(cfg);
    const full = { enabled: true, apiKey: 'a', projectId: 'p', messagingSenderId: 'm', appId: 'i', vapidPublicKey: 'v' };
    expect(mk(full)).toBeTruthy();
    expect(mk({ ...full, enabled: false })).toBeNull();
    for (const k of ['apiKey', 'projectId', 'messagingSenderId', 'appId', 'vapidPublicKey']) {
      expect(mk({ ...full, [k]: '' }), k).toBeNull();
    }
  });

  it('getToken ต้องส่ง serviceWorkerRegistration เดิม (ห้ามให้ SDK register SW ตัวที่ 2)', () => {
    const src = grab(UI, /async function dmjPushGetToken\(\)[\s\S]*?\n\}/, 'dmjPushGetToken');
    expect(src).toContain('serviceWorkerRegistration');
    expect(src).toContain('getRegistration("/")');
  });

  it('ทุก sync helper ของ push อ่านคำตอบผ่าน dmjJson (บทเรียนข้อ 13)', () => {
    const src = grab(UI, /async function _pushPost\([\s\S]*?\n\}/, '_pushPost');
    expect(src).toContain('dmjJson(res)');
    expect(src).not.toContain('res.json()');
  });

  it('อ่านคำตอบไม่ได้ → ธง unreadable ไม่ใช่ "ไม่สำเร็จ"', () => {
    const src = grab(UI, /async function _pushPost\([\s\S]*?\n\}/, '_pushPost');
    expect(src).toContain('unreadable: true');
  });

  it('SDK โหลดแบบ lazy และล้มเหลวแล้วคืน null ไม่ throw', () => {
    const src = grab(UI, /function dmjPushLoadSdk\(\)[\s\S]*?\n\}/, 'dmjPushLoadSdk');
    expect(src).toContain('createElement("script")');
    expect(src).toContain('return null');
  });

  it('ไม่มีการขอ permission อัตโนมัติตอน boot — เรียกได้จากปุ่มเท่านั้น', () => {
    // effect ตอนเปิดแอปต้องเช็คว่า granted อยู่แล้วเท่านั้น ห้ามเรียก requestPermission
    const eff = grab(APP, /usE\(\(\) => \{\s*\n\s*if \(authPhase !== "ready"\) return;[\s\S]*?\}, \[authPhase\]\);/, 'boot push effect');
    expect(eff).toContain('Notification.permission !== "granted"');
    expect(eff, 'boot ห้ามเด้งขอสิทธิ์เอง').not.toContain('dmjPushRequestPermission');
    expect(eff).toContain('syncRegisterPushDevice');
  });

  it('boot ตรวจกับ server (register idempotent) ไม่ใช่เทียบ token string ในเครื่อง', () => {
    const eff = grab(APP, /usE\(\(\) => \{\s*\n\s*if \(authPhase !== "ready"\) return;[\s\S]*?\}, \[authPhase\]\);/, 'boot push effect');
    expect(eff).toContain('syncRegisterPushDevice');
    expect(eff, 'ต้องไม่ตัดสินจาก hint ในเครื่องว่า binding ยังใช้ได้')
      .not.toMatch(/dmjPushReadLast\(\)[\s\S]{0,80}return/);
  });

  it('logout ถอน binding **ก่อน** ลบ session token และส่ง token ไปด้วยตรง ๆ', () => {
    const src = grab(APP, /const logoutClearSession = usC\(\(\) => \{[\s\S]*?\}, \[resetHandoff\]\);/, 'logoutClearSession');
    const a = src.indexOf('dmjPushDisableForLogout');
    const b = src.indexOf('lsDel(SESSION_TOKEN_KEY)');
    expect(a).toBeGreaterThan(-1);
    expect(a, 'ลบ token ก่อน = คำขอถอนออกไปโดยไม่มีสิทธิ์').toBeLessThan(b);
    expect(src).toContain('dmjPushDisableForLogout(tok)');
  });

  it('ออฟไลน์ถอนไม่สำเร็จ → จด pending ไม่รายงานว่าสำเร็จ', () => {
    const src = grab(UI, /async function dmjPushDisableForLogout\([\s\S]*?\n\}/, 'dmjPushDisableForLogout');
    expect(src).toContain('DMJ_PUSH_PENDING_KEY');
    expect(src).toContain('out.pending = true');
    expect(src).toContain('out.serverRevoked = !!(d && d.ok)');
  });

  it('การ์ดทดสอบซ่อนจาก role อื่น (ชั้นเสริม — ด่านจริงอยู่ที่ backend)', () => {
    expect(VMAIN).toContain('{isAdminRole(role) && <PushTestCard/>}');
    expect(APP).toMatch(/<ConnectView\s*\n\s*role=\{role\}/);
  });

  it('ปุ่ม "ถอนอุปกรณ์" ต้องกดได้แม้ระบบปิด (ไม่ disable ตาม cfg)', () => {
    const card = grab(VMAIN, /function PushTestCard\(\)[\s\S]*?\n\}\n/, 'PushTestCard');
    expect(card).toContain('disabled={busy} onClick={doUnregister}');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// I. boot revalidation — รัน effect จริงจาก app.jsx ด้วย mocks
// ───────────────────────────────────────────────────────────────────────────
// ⚠️ **"ตอนปิดอยู่ไม่ยิง API" ไม่ใช่หลักฐานว่าตรวจ binding เป็น** — ต้องพิสูจน์ฝั่ง
//    enabled ด้วยว่ามันเรียก syncRegisterPushDevice จริง ไม่งั้นเรากำลังทดสอบแค่
//    "โค้ดที่ไม่เคยทำงาน" แล้วเข้าใจว่าผ่าน
const BOOT_EFFECT = grab(
  APP,
  /usE\(\(\) => \{\s*\n\s*if \(authPhase !== "ready"\) return;[\s\S]*?\}, \[authPhase\]\);/,
  'boot push effect'
);

// ⚠️ noNotification เป็นธงแยก **ห้ามใช้ `permission: undefined`** แทน — ค่า undefined
//    จะไป trigger default parameter (`permission = 'granted'`) แล้วเทสต์กลายเป็นทดสอบ
//    เคสตรงข้ามกับที่ตั้งใจ โดยชื่อเทสต์ยังอ่านว่าถูก
async function runBootEffect({
  authPhase = 'ready', config = { projectId: 'p' }, permission = 'granted',
  noNotification = false,
  tokenRes = { ok: true, token: 'tok-bootaaaaaaaaaaaaaaaa' },
  registerRes = { ok: true, bindingVersion: 2 },
} = {}) {
  const calls = [];
  let captured = null, timerFn = null;
  const ctx = {
    authPhase,
    usE: (fnArg) => { captured = fnArg; },
    dmjPushConfig: () => config,
    Notification: noNotification ? undefined : { permission },
    dmjPushFlushPendingCleanup: async () => { calls.push('flush'); },
    dmjPushGetToken: async () => { calls.push('getToken'); return tokenRes; },
    syncRegisterPushDevice: async () => { calls.push('register'); return registerRes; },
    dmjPushWriteLast: () => { calls.push('writeLast'); },
    dmjPushClearLast: () => { calls.push('clearLast'); },
    dmjPushDeviceId: () => 'dev-boot0001',
    navigator: { userAgent: 'vitest' },
    setTimeout: (f) => { timerFn = f; return 1; },
    clearTimeout: () => {},
  };
  const names = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  new Function(...names, BOOT_EFFECT)(...names.map(n => ctx[n]));
  if (captured) captured();                 // รัน effect body → ตั้ง timer
  if (timerFn) await timerFn();             // fast-forward หน่วง 4 วิ
  return calls;
}

describe('I. boot revalidation (รัน effect จริง + mocks)', () => {
  it('config ปิดอยู่ → ไม่แตะอะไรเลย (ไม่ getToken ไม่ register)', async () => {
    expect(await runBootEffect({ config: null })).toEqual([]);
  });

  it('ยังไม่ได้อนุญาต notification → ไม่ทำอะไร และ **ไม่ขอสิทธิ์เอง**', async () => {
    expect(await runBootEffect({ permission: 'default' })).toEqual([]);
    expect(await runBootEffect({ permission: 'denied' })).toEqual([]);
    expect(BOOT_EFFECT, 'boot ห้ามเด้ง prompt ขอสิทธิ์').not.toContain('dmjPushRequestPermission');
  });

  it('เบราว์เซอร์ไม่มี Notification เลย → ไม่ throw และไม่ทำอะไร', async () => {
    expect(await runBootEffect({ noNotification: true })).toEqual([]);
  });

  it('ยังไม่เข้าแอป (authPhase ≠ ready) → ไม่ทำอะไร', async () => {
    expect(await runBootEffect({ authPhase: 'needLogin' })).toEqual([]);
  });

  it('✅ เปิดใช้งาน + อนุญาตแล้ว → **ตรวจ binding กับ server จริง** (flush → getToken → register → จำผล)',
    async () => {
      expect(await runBootEffect()).toEqual(['flush', 'getToken', 'register', 'writeLast']);
    });

  it('binding ยัง valid (unchanged) → ยัง register เพื่อ "ถาม" แต่ฝั่ง server ไม่เขียนชีต', async () => {
    const calls = await runBootEffect({ registerRes: { ok: true, unchanged: true, bindingVersion: 1 } });
    expect(calls).toContain('register');
    expect(calls).toContain('writeLast');
  });

  it('server ปฏิเสธ (ถูกลดสิทธิ์/ระงับ) → ล้าง hint ในเครื่อง ไม่วน retry ไม่ยึด binding คืน', async () => {
    const calls = await runBootEffect({ registerRes: { ok: false, forbidden: true } });
    expect(calls).toEqual(['flush', 'getToken', 'register', 'clearLast']);
  });

  it('อุปกรณ์ผูกบัญชีอื่น → ล้าง hint เช่นกัน (ไม่พยายามยึด)', async () => {
    const calls = await runBootEffect({ registerRes: { ok: false, tokenOwnedByOther: true } });
    expect(calls).toContain('clearLast');
    expect(calls).not.toContain('writeLast');
  });

  it('ขอ token ไม่สำเร็จ → หยุดเงียบ ไม่ยิง register ด้วย token ว่าง', async () => {
    const calls = await runBootEffect({ tokenRes: { ok: false, reason: 'token-failed' } });
    expect(calls).toEqual(['flush', 'getToken']);
  });

  it('getToken โยน exception → ไม่หลุดออกไปทำแอปพัง', async () => {
    let threw = false;
    try {
      const calls = [];
      const ctx = {
        authPhase: 'ready', usE: (f) => { ctx._cb = f; },
        dmjPushConfig: () => ({ projectId: 'p' }),
        Notification: { permission: 'granted' },
        dmjPushFlushPendingCleanup: async () => {},
        dmjPushGetToken: async () => { throw new Error('boom'); },
        syncRegisterPushDevice: async () => { calls.push('register'); return { ok: true }; },
        dmjPushWriteLast: () => {}, dmjPushClearLast: () => {},
        dmjPushDeviceId: () => 'd', navigator: { userAgent: 't' },
        setTimeout: (f) => { ctx._t = f; return 1; }, clearTimeout: () => {},
      };
      const names = Object.keys(ctx).filter(k => !k.startsWith('_'));
      // eslint-disable-next-line no-new-func
      new Function(...names, BOOT_EFFECT)(...names.map(n => ctx[n]));
      ctx._cb(); await ctx._t();
      expect(calls).toEqual([]);
    } catch (e) { threw = true; }
    expect(threw, 'exception หลุดออกจาก effect = เปิดแอปแล้วพัง').toBe(false);
  });

  it('cleanup ของ effect ยกเลิก timer (ออกจากแท็บก่อนครบ 4 วิ ต้องไม่ยิงตามมา)', () => {
    expect(BOOT_EFFECT).toContain('clearTimeout');
    expect(BOOT_EFFECT).toContain('dead = true');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('J. vendor SDK — pin เวอร์ชัน + license ครบ', () => {
  const V = (f) => join(ROOT, 'vendor', f);
  it('ไฟล์ที่ config อ้างถึงมีอยู่จริงทั้ง 2 ตัว', () => {
    const blk = grab(CFG, /const DMJ_FCM_CONFIG = \{[\s\S]*?\n\};/, 'DMJ_FCM_CONFIG');
    for (const key of ['sdkAppUrl', 'sdkMessagingUrl']) {
      const m = blk.match(new RegExp(key + ':\\s*"([^"]+)"'));
      expect(m, key + ' หายไปจาก config').toBeTruthy();
      const rel = m[1].replace(/^\//, '');
      expect(existsSync(join(ROOT, rel)), m[1] + ' ไม่มีไฟล์จริง → SDK โหลดไม่ได้').toBe(true);
    }
  });

  it('เป็น bundle ของ Firebase จริงและ pin เวอร์ชันไว้ (ไม่ใช่ไฟล์เปล่า)', () => {
    const app = readFileSync(V('firebase-app-compat.js'), 'utf8');
    const msg = readFileSync(V('firebase-messaging-compat.js'), 'utf8');
    expect(app.length).toBeGreaterThan(10000);
    expect(msg.length).toBeGreaterThan(10000);
    expect(app, 'ไม่พบเวอร์ชันที่ pin ฝังในไฟล์').toContain('12.18.0');
    expect(app).toContain('SDK_VERSION');
    expect(msg).toContain('messaging-compat');
  });

  it('มีสำเนา license (Apache-2.0 §4 บังคับเมื่อแจกจ่าย)', () => {
    const lic = readFileSync(V('LICENSE-firebase.txt'), 'utf8');
    expect(lic).toContain('Apache License');
    expect(lic.length).toBeGreaterThan(5000);
  });

  it('README บันทึกที่มา/เวอร์ชัน/แฮชไว้ และแฮชตรงกับไฟล์จริง', () => {
    const rd = readFileSync(V('README.md'), 'utf8');
    expect(rd).toContain('12.18.0');
    expect(rd).toContain('registry.npmjs.org/firebase');
    for (const f of ['firebase-app-compat.js', 'firebase-messaging-compat.js']) {
      const want = createHash('sha256').update(readFileSync(V(f))).digest('hex');
      expect(rd, 'sha256 ของ ' + f + ' ใน README ไม่ตรงกับไฟล์จริง').toContain(want);
    }
  });
});
