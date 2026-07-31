// tests/inapp-noti.test.js
// ─────────────────────────────────────────────────────────────────────────────
// แจ้งเตือนในแอป (กระดิ่ง 🔔) — ตรรกะที่พลาดแล้วพังเงียบ ๆ ไม่มี error ให้เห็น:
//   1. audience — ใครควรเห็นแถวไหน (พลาด = เห็นแจ้งเตือนของคนอื่น / ไม่เห็นของตัวเอง)
//   2. readBy   — อ่านแล้วหรือยัง (พลาด = ตัวเลขแดงไม่ยอมลด หรือลดทั้งที่ยังไม่อ่าน)
//   3. notiAgo  — ข้อความเวลาสัมพัทธ์ที่พนักงานอ่าน
//
// ส่วนที่แตะ Sheet/Drive ไม่ทดสอบที่นี่ (ต้องมี GAS runtime) — เทสต์เฉพาะ pure logic
// ที่ copy ไว้ใน helpers.js โดยมี drift-guard.test.js คอยกันสำเนาเพี้ยนจากต้นทางอีกชั้น
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inappAudienceMatch, inappIsRead, notiAgo } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const UI = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');

describe('inappAudienceMatch — ใครเห็นแจ้งเตือนแถวไหน', () => {
  it('"all" / ค่าว่าง = เห็นทุกคน', () => {
    expect(inappAudienceMatch('all', 'ST0001', 'warehouse')).toBe(true);
    expect(inappAudienceMatch('', 'ST0001', 'frontstore')).toBe(true);
    expect(inappAudienceMatch(null, 'ST0009', 'saler')).toBe(true);
  });

  it('role: เห็นเฉพาะตำแหน่งที่ระบุ', () => {
    const a = 'role:warehouse,employee,owner';
    expect(inappAudienceMatch(a, 'ST0001', 'warehouse')).toBe(true);
    expect(inappAudienceMatch(a, 'ST0002', 'employee')).toBe(true);
    expect(inappAudienceMatch(a, 'ST0003', 'owner')).toBe(true);
    expect(inappAudienceMatch(a, 'ST0004', 'frontstore')).toBe(false);
    expect(inappAudienceMatch(a, 'ST0005', 'saler')).toBe(false);
    expect(inappAudienceMatch(a, 'ST0006', 'storedevice')).toBe(false);
  });

  it('dev เห็นทุกอย่างที่ยิงหา owner (convention เดียวกับ viewRole)', () => {
    expect(inappAudienceMatch('role:owner', 'ST0001', 'dev')).toBe(true);
    expect(inappAudienceMatch('role:owner,warehouse', 'ST0001', 'dev')).toBe(true);
    // ยิงหา dev ตรง ๆ ก็ยังได้ (เผื่ออนาคตมีแจ้งเตือนเฉพาะคนดูแลระบบ)
    expect(inappAudienceMatch('role:dev', 'ST0001', 'dev')).toBe(true);
    // แต่ dev ไม่ควรเห็นของ role อื่นที่ไม่ใช่ owner
    expect(inappAudienceMatch('role:frontstore', 'ST0001', 'dev')).toBe(false);
  });

  it('owner ไม่ถูกนับเป็น dev (ทิศทางเดียว — dev→owner เท่านั้น)', () => {
    expect(inappAudienceMatch('role:dev', 'ST0001', 'owner')).toBe(false);
  });

  it('staff: เห็นเฉพาะ staffId ที่ระบุ', () => {
    const a = 'staff:ST0001,ST0007';
    expect(inappAudienceMatch(a, 'ST0001', 'warehouse')).toBe(true);
    expect(inappAudienceMatch(a, 'ST0007', 'owner')).toBe(true);
    expect(inappAudienceMatch(a, 'ST0002', 'owner')).toBe(false);
    // owner/dev ก็ไม่เห็นแจ้งเตือนส่วนตัวของคนอื่น — audience staff ไม่มีข้อยกเว้นให้ admin
    expect(inappAudienceMatch(a, 'ST0002', 'dev')).toBe(false);
  });

  it('เว้นวรรครอบ comma ไม่ทำให้พลาด (คนแก้ชีตด้วยมือ)', () => {
    expect(inappAudienceMatch('role: warehouse , owner ', 'ST0001', 'owner')).toBe(true);
    expect(inappAudienceMatch('staff: ST0001 , ST0002', 'ST0002', 'saler')).toBe(true);
  });

  it('รูปแบบที่อ่านไม่ออก = ไม่เห็น (fail closed ไม่ใช่ fail open)', () => {
    expect(inappAudienceMatch('warehouse', 'ST0001', 'warehouse')).toBe(false);
    expect(inappAudienceMatch('group:abc', 'ST0001', 'warehouse')).toBe(false);
  });

  it('role ว่าง/ยังไม่ได้ตั้งตำแหน่ง = ไม่เห็นของที่ยิงตาม role', () => {
    expect(inappAudienceMatch('role:warehouse', 'ST0001', null)).toBe(false);
    expect(inappAudienceMatch('role:warehouse', 'ST0001', '')).toBe(false);
  });
});

describe('inappIsRead — อ่านแล้วหรือยัง', () => {
  it('ว่าง = ยังไม่อ่าน', () => {
    expect(inappIsRead('', 'ST0001')).toBe(false);
    expect(inappIsRead(null, 'ST0001')).toBe(false);
  });

  it('เจอ staffId ในลิสต์ = อ่านแล้ว', () => {
    expect(inappIsRead('ST0001', 'ST0001')).toBe(true);
    expect(inappIsRead('ST0002,ST0001,ST0003', 'ST0001')).toBe(true);
    expect(inappIsRead('ST0002, ST0001', 'ST0001')).toBe(true);
  });

  it('ไม่เจอ = ยังไม่อ่าน', () => {
    expect(inappIsRead('ST0002,ST0003', 'ST0001')).toBe(false);
  });

  it('ไม่ match แบบ substring (ST0001 ต้องไม่ทำให้ ST00011 นับว่าอ่านแล้ว)', () => {
    expect(inappIsRead('ST00011', 'ST0001')).toBe(false);
    expect(inappIsRead('ST0001', 'ST00011')).toBe(false);
  });

  it('ไม่มี staffId = ยังไม่อ่านเสมอ (กันนับมั่วตอน session พัง)', () => {
    expect(inappIsRead('ST0001', null)).toBe(false);
    expect(inappIsRead('ST0001', '')).toBe(false);
  });
});

describe('notiAgo — เวลาสัมพัทธ์', () => {
  afterEach(() => vi.useRealTimers());

  const at = (msAgo) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T10:00:00Z'));
    return notiAgo(Date.now() - msAgo);
  };

  it('ไม่มี timestamp = ข้อความว่าง', () => expect(notiAgo(0)).toBe(''));
  it('< 1 นาที', () => expect(at(30 * 1000)).toBe('เมื่อสักครู่'));
  it('นาที', () => expect(at(5 * 60000)).toBe('5 นาทีที่แล้ว'));
  it('ชั่วโมง', () => expect(at(3 * 3600000)).toBe('3 ชม.ที่แล้ว'));
  it('วัน', () => expect(at(2 * 86400000)).toBe('2 วันที่แล้ว'));
  it('เวลาในอนาคต (นาฬิกาเครื่องเพี้ยน) ไม่คืนค่าติดลบ', () => {
    expect(at(-60 * 60000)).toBe('เมื่อสักครู่');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Meta-test: จุดเชื่อมต่อที่ลืมแล้วระบบเงียบสนิทโดยไม่มี error
// ─────────────────────────────────────────────────────────────────────────────
describe('การเชื่อมต่อ (meta)', () => {
  it('markNotiRead อยู่ใน COMMON_ACTIONS_ — กระดิ่งอยู่ทุก role ทุกแท็บ', () => {
    const m = GS.match(/var COMMON_ACTIONS_ = \[[\s\S]*?\];/);
    expect(m, 'หา COMMON_ACTIONS_ ไม่เจอ').toBeTruthy();
    expect(m[0]).toContain('markNotiRead');
  });

  it('doPost dispatch markNotiRead อยู่เหนือ invalidateCache_ (กดอ่านต้องไม่ล้าง cache ทั้งก้อน)', () => {
    const iDispatch = GS.indexOf(`data.action === 'markNotiRead'`);
    const iInvalidate = GS.indexOf('invalidateCache_(true);');
    expect(iDispatch, 'ไม่มี dispatch markNotiRead ใน doPost').toBeGreaterThan(0);
    expect(iInvalidate).toBeGreaterThan(0);
    expect(iDispatch).toBeLessThan(iInvalidate);
  });

  it('doGet มี action=inappNoti', () => {
    expect(GS).toContain(`e.parameter.action === 'inappNoti'`);
    expect(GS).toContain('function listInappNotiHandler_');
  });

  it('ทั้ง 2 endpoint ตรวจ session จริง ไม่เชื่อ role จาก client', () => {
    const handler = GS.match(/function listInappNotiHandler_[\s\S]*?\n}/)[0];
    expect(handler).toContain('resolveSession_');
    expect(handler).toContain('unauthorized_()');
    const marker = GS.match(/function markInappNotiReadHandler_[\s\S]*?\n}/)[0];
    expect(marker).toContain('resolveSession_');
    // markRead ต้องเช็ค audience ด้วย — ไม่งั้นยิง id มั่วมาปั๊มสถานะแถวของคนอื่นได้
    expect(marker).toContain('inappAudienceMatch_');
  });

  it('pushInappNoti_ gate ด้วย INAPP_NOTI_ENABLED และไม่ throw', () => {
    const fn = GS.match(/function pushInappNoti_\(opts\)[\s\S]*?\n}/)[0];
    expect(fn).toContain('inappNotiEnabled_()');
    expect(fn).toContain('try {');
    expect(fn).toContain('catch (e)');
    expect(fn).not.toContain('throw ');
  });

  it('purgeInappNoti_ ลบจากล่างขึ้นบน (ลบจากบนลงล่าง = index เลื่อน ลบผิดแถว)', () => {
    const fn = GS.match(/function purgeInappNoti_\(ss\)[\s\S]*?\n}/)[0];
    expect(fn).toMatch(/for \(var i = vals\.length - 1; i >= 0/);
  });

  it('ล้างของเก่าพ่วงกับ dailyAttendanceMaintenance (ไม่ต้องตั้ง trigger ใหม่)', () => {
    const fn = GS.match(/function dailyAttendanceMaintenance\(\)[\s\S]*?\n}/)[0];
    expect(fn).toContain('purgeInappNoti_');
  });

  it('setupInappNoti/disableInappNoti ไม่ลงท้าย _ (ต้องโผล่ใน dropdown ของ GAS editor)', () => {
    expect(GS).toContain('function setupInappNoti()');
    expect(GS).toContain('function disableInappNoti()');
  });

  it('frontend poll ผ่าน sessionToken + มี wake-up ตอนกลับมาหน้าจอ (iOS แช่แข็ง timer)', () => {
    expect(UI).toContain('action=inappNoti');
    expect(UI).toContain('dmj_session_token');
    expect(UI).toContain('visibilitychange');
  });

  it('app.jsx วางกระดิ่งไว้และกัน nav ไปแท็บที่ role นั้นไม่มีสิทธิ์', () => {
    expect(APP).toContain('<NotiBell');
    expect(APP).toMatch(/allowedTabIds\.includes\(t\)/);
  });

  it('ทุก tab ที่แจ้งเตือนชี้ไป มีอยู่จริงใน TABS', () => {
    const tabIds = new Set([...APP.matchAll(/\{\s*id:\s*"([a-z]+)"/g)].map(m => m[1]));
    const targets = [...GS.matchAll(/pushInappNoti_\(\{[\s\S]*?tab:\s*'([a-z]*)'/g)]
      .map(m => m[1]).filter(Boolean);
    expect(targets.length, 'ไม่เจอ call site ของ pushInappNoti_ เลย').toBeGreaterThan(0);
    const unknown = [...new Set(targets)].filter(t => !tabIds.has(t));
    expect(unknown, 'tab ปลายทางที่ไม่มีใน TABS: ' + unknown.join(', ')).toEqual([]);
  });
});
