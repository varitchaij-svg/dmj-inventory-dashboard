// tests/staging-safety.test.js — STAGING_NO_EXTERNAL: ตัด ZORT/LINE ก่อนถึง network
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา: staging ใช้ชีตสำเนา + ไม่ตั้ง ZORT_*/LINE_* ก็จริง **แต่ยังไม่ปลอดภัยพอ** —
// `getSecret_` ถอยไปใช้ค่า 'PLACEHOLDER_…' ซึ่ง truthy → โค้ดเดินต่อจนถึง
// `UrlFetchApp.fetch` แล้วค่อยโดน 401 ที่ปลายทาง = **มีคำขอออกไปหา api.line.me /
// open-api.zortout.com จริง** ซึ่ง staging ต้องไม่ทำ (ตั้ง property ผิดช่องครั้งเดียว
// = ยิงเข้าระบบจริงทันที)
//
// ไฟล์นี้คุม 3 อย่าง:
//   1. flag ปิด (default) → พฤติกรรม production **เหมือนเดิมเป๊ะ** ต้องยิงตามปกติ
//   2. flag เปิด → **ไม่มี UrlFetchApp ถูกเรียกเลย** ในทุกเส้นทางส่งข้อความ/ZORT
//   3. LINE Login **ต้องไม่ถูกตัด** (ตัดแล้วล็อกอินเข้า staging ไม่ได้ = ทดสอบอะไรไม่ได้)
//
// รันฟังก์ชันจริงจาก `.gs` (eval) ตามธรรมเนียม auth.test.js — ไม่ copy
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
const fn = (n) => grab(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}'), n);

const SENDERS = ['linePush_', 'sendLineMessage_', 'sendLineGroup_',
                 'sendLineGroupMentionAll_', 'replyToLine', 'startLoadingAnimation'];

// รัน sender จริงโดยนับว่ามี UrlFetchApp.fetch ถูกเรียกกี่ครั้ง
function runSender(name, { staging }) {
  let fetches = 0;
  const ctx = {
    stagingNoExternal_: () => staging,
    Logger: { log: () => {} },
    console: { error: () => {}, log: () => {} },
    UrlFetchApp: { fetch: () => { fetches++; return { getResponseCode: () => 200, getContentText: () => '{}' }; } },
    PropertiesService: { getScriptProperties: () => ({
      // ตั้ง LINE_GROUP_ID ไว้ "มีค่า" โดยตั้งใจ — เพื่อพิสูจน์ว่าตอน flag ปิด มันยิงจริง
      getProperty: (k) => (k === 'LINE_GROUP_ID' ? 'Cgroup123' : null),
      setProperty: () => {},
    })},
    LINE_ACCESS_TOKEN: 'PLACEHOLDER_LINE_ACCESS_TOKEN',
    LINE_USER_ID: 'PLACEHOLDER_LINE_USER_ID',
    LINE_ACCESS_TOKEN_2: '',
    lineToken_: () => 'PLACEHOLDER_LINE_ACCESS_TOKEN',
    resolveNotiTarget_: () => 'Uuser123',
    notiBumpQuota_: () => {},
  };
  const names = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  const f = new Function(...names, fn(name) + '\nreturn ' + name + ';')(...names.map(n => ctx[n]));
  const args = {
    linePush_: ['primary', [{ type: 'text', text: 'x' }], 'user'],
    sendLineMessage_: ['x'],
    sendLineGroup_: ['x'],
    sendLineGroupMentionAll_: ['x'],
    replyToLine: ['tok', { type: 'text', text: 'x' }],
    startLoadingAnimation: ['C123'],
  }[name];
  let out, threw = false;
  try { out = f(...args); } catch (e) { threw = true; }
  return { fetches, out, threw };
}

describe('A. flag ปิด (default) — production ต้องทำงานเหมือนเดิมทุกประการ', () => {
  it('ไม่ตั้ง property → stagingNoExternal_() เป็น false', () => {
    const ctx = { PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) } };
    const f = new Function('PropertiesService', fn('stagingNoExternal_') + '\nreturn stagingNoExternal_;')(ctx.PropertiesService);
    expect(f()).toBe(false);
  });

  it("ค่าอื่นที่ไม่ใช่ 'true' ก็ยังเป็น false (กันพิมพ์ผิดแล้วตัด production เงียบ ๆ)", () => {
    for (const v of ['false', 'TRUE', '1', 'yes', '']) {
      const P = { getScriptProperties: () => ({ getProperty: () => v }) };
      const f = new Function('PropertiesService', fn('stagingNoExternal_') + '\nreturn stagingNoExternal_;')(P);
      expect(f(), 'ค่า ' + JSON.stringify(v)).toBe(false);
    }
  });

  it('อ่าน property ไม่ได้ (throw) → false ไม่ใช่ true (fail-open ฝั่ง production)', () => {
    const P = { getScriptProperties: () => { throw new Error('no access'); } };
    const f = new Function('PropertiesService', fn('stagingNoExternal_') + '\nreturn stagingNoExternal_;')(P);
    expect(f()).toBe(false);
  });

  SENDERS.forEach(name => {
    it(`${name}: flag ปิด → ยังยิงจริงตามเดิม`, () => {
      const r = runSender(name, { staging: false });
      expect(r.fetches, name + ' ไม่ยิงตอน flag ปิด = ทำ production พัง').toBe(1);
    });
  });

  it('zortHeaders_: flag ปิด → คืน header ตามเดิม ไม่ throw', () => {
    const ctx = { stagingNoExternal_: () => false, ZORT_STORE: 's', ZORT_APIKEY: 'k', ZORT_SECRET: 'x' };
    const names = Object.keys(ctx);
    const f = new Function(...names, fn('zortHeaders_') + '\nreturn zortHeaders_;')(...names.map(n => ctx[n]));
    expect(f()).toEqual({ storename: 's', apikey: 'k', apisecret: 'x' });
  });
});

describe('B. flag เปิด — ต้องไม่มีคำขอออกไปหาระบบจริงเลย', () => {
  SENDERS.forEach(name => {
    it(`${name}: ไม่เรียก UrlFetchApp แม้แต่ครั้งเดียว`, () => {
      const r = runSender(name, { staging: true });
      expect(r.fetches, name + ' ยังยิงออกไปทั้งที่เปิด staging flag').toBe(0);
    });
  });

  it('linePush_ คืนธง blocked ให้ตัวเรียกรู้ว่าไม่ได้ส่ง (ไม่ใช่รายงานว่าสำเร็จ)', () => {
    const r = runSender('linePush_', { staging: true });
    expect(r.out.ok).toBe(false);
    expect(r.out.blocked).toBe(true);
  });

  it('zortHeaders_ throw → ทุกเส้นทาง ZORT ตัดก่อน fetch (ไม่คืน header เปล่าแล้วเดินต่อ)', () => {
    const ctx = { stagingNoExternal_: () => true, ZORT_STORE: 's', ZORT_APIKEY: 'k', ZORT_SECRET: 'x' };
    const names = Object.keys(ctx);
    const f = new Function(...names, fn('zortHeaders_') + '\nreturn zortHeaders_;')(...names.map(n => ctx[n]));
    expect(() => f()).toThrow(/staging/);
  });
});

describe('C. ขอบเขตของ flag — ตัดเฉพาะที่ต้องตัด', () => {
  it('⚠️ LINE **Login** ต้องไม่ถูกตัด (ไม่งั้นล็อกอินเข้า staging ไม่ได้เลย)', () => {
    for (const name of ['exchangeLineToken_', 'verifyLineIdToken_']) {
      expect(fn(name), name + ' ถูกตัดด้วย = ทดสอบ staging ไม่ได้').not.toContain('stagingNoExternal_');
    }
  });

  it('ทุกฟังก์ชันที่ยิง ZORT ยังผ่าน zortHeaders_ (คอขวดยังครบ)', () => {
    const lines = GS.split('\n');
    const fns = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/^function [A-Za-z0-9_]+\s*\(/.test(lines[i])) continue;
      let j = i + 1;
      while (j < lines.length && lines[j] !== '}') j++;
      fns.push({ name: lines[i].match(/^function ([A-Za-z0-9_]+)/)[1], body: lines.slice(i, j + 1).join('\n') });
    }
    const zortFns = fns.filter(f => /UrlFetchApp\.fetch/.test(f.body) && /ZORT_BASE/.test(f.body));
    expect(zortFns.length, 'ไม่เจอฟังก์ชันที่ยิง ZORT เลย = regex เพี้ยน').toBeGreaterThan(40);
    const uncovered = zortFns.filter(f => !/zortHeaders_\(\)/.test(f.body)).map(f => f.name);
    expect(uncovered, 'ฟังก์ชันพวกนี้ยิง ZORT โดยไม่ผ่าน zortHeaders_ → staging flag ตัดไม่ถึง')
      .toEqual([]);
  });

  it('ทุก sender ของ LINE Messaging มี guard ครบ (เพิ่มตัวใหม่แล้วลืมใส่ = รั่ว)', () => {
    const lines = GS.split('\n');
    const fns = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/^function [A-Za-z0-9_]+\s*\(/.test(lines[i])) continue;
      let j = i + 1;
      while (j < lines.length && lines[j] !== '}') j++;
      fns.push({ name: lines[i].match(/^function ([A-Za-z0-9_]+)/)[1], body: lines.slice(i, j + 1).join('\n') });
    }
    // เฉพาะ Messaging API (bot) — ไม่รวม Login API
    const senders = fns.filter(f => /api\.line\.me\/v2\/bot\//.test(f.body));
    expect(senders.length).toBeGreaterThanOrEqual(SENDERS.length);
    const missing = senders.filter(f => !/stagingNoExternal_\(\)/.test(f.body)).map(f => f.name);
    // testTruckNotification เป็นเครื่องมือทดสอบที่เจ้าของรันเอง ไม่ได้อยู่ในเส้นทางอัตโนมัติ
    const allowed = new Set(['testTruckNotification']);
    expect(missing.filter(n => !allowed.has(n)),
      'sender ของ LINE Messaging ที่ยังไม่มี guard').toEqual([]);
  });

  it('checkPushStatus รายงานสถานะ flag ให้เจ้าของเห็น', () => {
    expect(fn('checkPushStatus')).toContain('STAGING_NO_EXTERNAL');
  });

  it('ไม่มีการตั้งค่า flag นี้อัตโนมัติจากโค้ด (เจ้าของต้องตั้งเองใน Script Properties)', () => {
    expect(GS).not.toMatch(/setProperty\(\s*['"]STAGING_NO_EXTERNAL['"]/);
  });
});
