// tests/login-resilience.test.js — เส้นทางล็อกอินต้องไม่ค้าง ไม่วน และบอกความคืบหน้าเสมอ
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (รายงานจากผู้ใช้จริง 6 ส.ค. 2026 — iPhone ทั้ง PWA และ Safari): ล็อกอินแล้ว
// (ก) ค้างหน้า "กำลังรอผล" (ข) วนกลับไปหน้าล็อกอินซ้ำ (ค) ขึ้นข้อความ error อ่านไม่ออก
// (ง) ช้ามากแต่สุดท้ายเข้าได้ — สาเหตุคือ Phase 7.5 (timeout + dmjJson) **ไม่ได้ครอบ
// เส้นทางล็อกอินเลยแม้แต่จุดเดียว** เพราะ `postAuthAction` ใช้ fetch/res.json() ดิบ
//
// เทสต์ชุดนี้คุมของที่ "พังแล้วไม่มี error ให้เห็น" เป็นหลัก:
//   1. เพดานเวลาหลุด → ผู้ใช้ค้างจอสปินเนอร์ถาวร (และ ?code= ถูกล้างไปแล้ว รีเฟรชไม่ช่วย)
//   2. TTL 3 ที่ไม่ตรงกัน → คนล็อกอินช้าจะถูกเด้งกลับหน้าล็อกอินโดยไม่มีอะไรบอก
//   3. poll ไม่มี in-flight guard → ยิ่งเซิร์ฟเวอร์ช้า ยิ่งยิงถี่ (ทำร้ายตัวเอง)
//   4. cache session ไม่ถูกล้างตอน revoke → กด "ออกจากระบบ" แล้ว token ยังใช้ได้ต่อ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const UI = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');
const HTML = readFileSync(join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + what);
  return m[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. postAuthAction — ทางผ่านของ authLine / me / logout / claimLoginHandoff
// ═══════════════════════════════════════════════════════════════════════════
describe('postAuthAction — ล็อกอินต้องมีเพดานเวลาและอ่านคำตอบอย่างปลอดภัย', () => {
  const FN = grab(APP, /async function postAuthAction\(body, timeoutMs\)[\s\S]*?\n\}/, 'postAuthAction');

  it('ใช้ dmjFetch ไม่ใช่ fetch ดิบ (ไม่งั้นไม่มีเพดานเวลา = ค้างตลอดกาล)', () => {
    expect(FN).toMatch(/dmjFetch\(/);
    expect(FN).not.toMatch(/await fetch\(/);
  });

  it('ใช้ dmjJson ไม่ใช่ res.json() ดิบ (GAS ตอบหน้า HTML ได้)', () => {
    expect(FN).toMatch(/dmjJson\(/);
    expect(FN).not.toMatch(/res\.json\(\)/);
  });

  it('ส่ง dmjTimeoutMs เสมอ — ค่า default 60 วิ ของ dmjFetch ยาวเกินไปสำหรับจังหวะที่ผู้ใช้ยืนรอ', () => {
    expect(FN).toMatch(/dmjTimeoutMs/);
  });

  // ⚠️ claim ต่างจาก authLine/me ตรงที่มันถูกยิง **ซ้ำเป็นรอบ ๆ** ระหว่างผู้ใช้รอ
  // จึงต้องยอมแพ้เร็วแล้วปล่อยให้รอบถัดไปลองใหม่ ไม่ใช่ถือคำขอค้างไว้ยาว ๆ แบบ one-shot
  it('เพดานของ claimLoginHandoff ต้องสั้นกว่า action ล็อกอินแบบยิงครั้งเดียว', () => {
    const num = (name) => Number(APP.match(new RegExp(name + ' = (\\d+)'))[1]);
    const claim = num('AUTH_CLAIM_TIMEOUT_MS');
    const pollFirst = Number(APP.match(/const delayFor = \(i\) => \(i < 3 \? (\d+)/)[1]);
    expect(claim).toBeLessThan(num('AUTH_TIMEOUT_MS'));
    expect(claim).toBeLessThan(num('AUTH_ME_TIMEOUT_MS'));
    expect(claim).toBeGreaterThan(pollFirst);   // แต่ต้องยาวพอให้ GAS ตอบทันในรอบปกติ
  });

  it('ทุก call site ส่งเพดานเวลาเข้าไปจริง ไม่ปล่อยให้ตกไปใช้ค่า default', () => {
    const calls = APP.match(/postAuthAction\(\{[\s\S]{0,180}?\}, [A-Z_]+\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(5);   // authLine, me×2, logout, claim
  });

  it('ข้อความ error ตอนล็อกอินพังต้องเป็นภาษาไทย ไม่ใช่ e.message ดิบ', () => {
    // เดิมต่อ e.message ตรง ๆ → พนักงานเห็น `Unexpected token '<', "<!DOCTYPE "...`
    const bootstrap = APP.slice(APP.indexOf('const d = await postAuthAction({ action: "authLine"'));
    const near = bootstrap.slice(0, 1600);
    expect(near).toMatch(/dmjErrText\(e\)/);
    expect(near).not.toMatch(/e && e\.message\) \|\| "network"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. TTL ทั้ง 3 ที่ต้องตรงกัน — ไม่ตรง = ผู้ใช้ถูกเด้งกลับหน้าล็อกอินเงียบ ๆ
// ═══════════════════════════════════════════════════════════════════════════
describe('อายุของ login handoff — client กับ server ต้องพูดตรงกัน', () => {
  const stateMs = Number(grab(APP, /LINE_STATE_TTL_MS = ([\d *]+);/, 'LINE_STATE_TTL_MS')
    .match(/= ([\d *]+);/)[1].split('*').reduce((a, b) => a * Number(b.trim()), 1));
  const handoffMs = Number(grab(APP, /LINE_HANDOFF_TTL_MS = ([\d *]+);/, 'LINE_HANDOFF_TTL_MS')
    .match(/= ([\d *]+);/)[1].split('*').reduce((a, b) => a * Number(b.trim()), 1));
  const serverSec = Number(grab(GS, /LOGIN_HANDOFF_TTL_SEC = (\d+)/, 'LOGIN_HANDOFF_TTL_SEC').match(/\d+/)[0]);

  it('state กับ handoff ฝั่ง client ต้องหมดอายุพร้อมกัน', () => {
    // เดิม state 30 นาที แต่ handoff 15 → คนที่ล็อกอินเสร็จนาทีที่ 16-30 ผ่านการเช็ค state ได้
    // แต่ฝั่ง PWA เลิกตามผลไปแล้ว = "วนกลับไปหน้าล็อกอินซ้ำ" โดยไม่มีอะไรบอกว่าทำไม
    expect(handoffMs).toBe(stateMs);
  });

  it('ฝั่ง server ต้องเก็บผลไว้ไม่สั้นกว่าที่ฝั่ง client ยอมรอ', () => {
    expect(serverSec * 1000).toBeGreaterThanOrEqual(handoffMs);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. poll ของ handoff — ห้ามยิงซ้อน ห้ามยิงถี่เท่าเดิมตลอด 30 นาที
// ═══════════════════════════════════════════════════════════════════════════
describe('การตามผลล็อกอิน (handoff poll)', () => {
  const EFFECT = APP.slice(
    APP.indexOf('if (authPhase !== "needLogin" || !handoffWaiting) return;'),
    APP.indexOf('// ── ดึง channelId ของ LINE Login')
  );

  it('มี in-flight guard — GAS ตอบช้ากว่ารอบ poll เป็นเรื่องปกติ', () => {
    expect(EFFECT).toMatch(/busy/);
    expect(EFFECT).toMatch(/if \(stop \|\| busy\) return;/);
  });

  it('ไม่ใช้ setInterval แล้ว (มันไม่รอ tick ก่อนหน้า → คำขอสะสมทับกันเอง)', () => {
    expect(EFFECT).not.toMatch(/setInterval\(/);
    expect(EFFECT).toMatch(/setTimeout\(tick/);
  });

  it('ถอยห่างขึ้นเรื่อย ๆ ไม่ยิงถี่เท่าเดิมตลอด', () => {
    const delays = grab(EFFECT, /const delayFor = \(i\) => [^;]+;/, 'delayFor');
    const nums = (delays.match(/\d{3,}/g) || []).map(Number);
    expect(nums.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThan(nums[i - 1]);
  });

  it('ยังตื่นตาม visibilitychange/focus (iOS แช่แข็ง timer — ห้ามถอด)', () => {
    expect(EFFECT).toMatch(/visibilitychange/);
    expect(EFFECT).toMatch(/window\.addEventListener\("focus"/);
  });

  it('เก็บกวาด timer ตอน unmount (ไม่ปล่อยยิงต่อหลังออกจากหน้า)', () => {
    expect(EFFECT).toMatch(/clearTimeout\(timer\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. จอ "กำลังเข้าสู่ระบบ" ต้องมีทางออกเสมอ
// ═══════════════════════════════════════════════════════════════════════════
describe('จอ checking — ห้ามเป็นทางตัน', () => {
  const SCREEN = APP.slice(
    APP.indexOf('if (authPhase === "checking") {'),
    APP.indexOf('const syncLabel = (() => {')
  );

  it('บอกเวลาที่รออยู่เป็นวินาที (สปินเนอร์เปล่าแยกไม่ออกว่าค้างหรือกำลังมา)', () => {
    expect(SCREEN).toMatch(/checkingSec/);
    expect(SCREEN).toMatch(/วินาที/);
  });

  it('มีปุ่มกลับไปหน้าล็อกอินเมื่อรอนานเกินไป — ตาข่ายที่ไม่พึ่ง timeout ของ fetch', () => {
    // ⚠️ ข้อนี้คือทางออกสุดท้ายจริง ๆ: `?code=` ถูกล้างไปแล้ว (history.replaceState)
    // ถ้าไม่มีปุ่มนี้ ผู้ใช้ต้องปิดแอปเปิดใหม่เท่านั้น
    expect(SCREEN).toMatch(/setAuthPhase\("needLogin"\)/);
    expect(SCREEN).toMatch(/กลับไปหน้าล็อกอิน/);
  });

  it('ตัวนับเวลาต้องรีเซ็ตเมื่อออกจาก phase (ไม่ค้างเลขเก่าไว้รอบหน้า)', () => {
    const eff = grab(APP, /if \(authPhase !== "checking"\) \{ setCheckingSec\(0\); return; \}/, 'ตัวนับ checking');
    expect(eff).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. dmjJsonProgress — แถบความคืบหน้าต้องนับไบต์จริง และใช้ error path เดิม
// ═══════════════════════════════════════════════════════════════════════════
describe('dmjJsonProgress — รายงานไบต์ที่ได้รับจริง', () => {
  function load() {
    const sandbox = {
      console: { warn() {} },
      localStorage: { setItem() {}, getItem() { return null; } },
      TextDecoder: global.TextDecoder,
    };
    const src = grab(UI, /async function dmjJson\(res\) \{[\s\S]*?\n\}/, 'dmjJson')
      + '\n' + grab(UI, /async function dmjJsonProgress\(res, onBytes\) \{[\s\S]*?\n\}/, 'dmjJsonProgress');
    const make = new Function(...Object.keys(sandbox), src + '; return dmjJsonProgress;');
    return make(...Object.values(sandbox));
  }

  // Response ปลอมที่ปล่อยข้อมูลมาเป็นก้อน ๆ เหมือนของจริง
  function streamRes(chunks, status = 200) {
    const enc = new TextEncoder();
    let i = 0;
    return {
      status, url: 'https://example.test/exec',
      body: {
        getReader: () => ({
          read: async () => (i < chunks.length
            ? { done: false, value: enc.encode(chunks[i++]) }
            : { done: true, value: undefined }),
        }),
      },
      text: async () => chunks.join(''),
    };
  }

  it('คืนค่า JSON ที่ถูกต้องเมื่อข้อมูลถูกแบ่งมาหลายก้อน', async () => {
    const dmjJsonProgress = load();
    const d = await dmjJsonProgress(streamRes(['{"a":1,', '"b":[1,2', ',3]}']), () => {});
    expect(d).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('รายงานไบต์สะสมเพิ่มขึ้นเรื่อย ๆ (ตัวเลขที่แถบใช้)', async () => {
    const dmjJsonProgress = load();
    const seen = [];
    await dmjJsonProgress(streamRes(['{"a":1,', '"b":2}']), n => seen.push(n));
    expect(seen.length).toBe(2);
    expect(seen[1]).toBeGreaterThan(seen[0]);
    expect(seen[seen.length - 1]).toBe(13);      // ความยาวจริงของ '{"a":1,"b":2}'
  });

  it('เบราว์เซอร์ที่ไม่รองรับ stream → ถอยไปใช้ dmjJson เดิมทั้งดุ้น', async () => {
    const dmjJsonProgress = load();
    const d = await dmjJsonProgress({ status: 200, url: 'u', text: async () => '{"ok":true}' }, () => {});
    expect(d).toEqual({ ok: true });
  });

  // ⚠️ ข้อนี้คือเหตุผลที่ต้องส่งกลับเข้า dmjJson แทนการ parse เอง — ถ้าเขียน error path
  // ขึ้นมาใหม่ให้ "คล้าย ๆ" ของเดิม ข้อความไทย/dmjKind/การเก็บ log จะค่อย ๆ drift ออกจากกัน
  it('GAS ตอบ HTML → ต้องได้ error ไทยและ dmjKind เดียวกับเส้นทางปกติ', async () => {
    const dmjJsonProgress = load();
    const err = await dmjJsonProgress(streamRes(['<!DOCTYPE ', 'html><body>x'], 404), () => {})
      .catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.dmjKind).toBe('badjson');
    expect(err.message).toMatch(/ระบบหลังบ้าน/);
  });

  it('อ่านไม่จบกลางคัน (เน็ตหลุด) → โยน error ออกไปให้ตัวเรียกจัดการ ไม่กลืนเงียบ', async () => {
    const dmjJsonProgress = load();
    const boom = new Error('network gone');
    const res = {
      status: 200, url: 'u',
      body: { getReader: () => ({ read: async () => { throw boom; } }) },
      text: async () => '',
    };
    await expect(dmjJsonProgress(res, () => {})).rejects.toThrow('network gone');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. แถบความคืบหน้า — ต้องไม่โกหกผู้ใช้
// ═══════════════════════════════════════════════════════════════════════════
describe('LoadProgress — ตัวเลขที่โชว์ต้องมาจากของจริง', () => {
  const COMP = grab(APP, /function LoadProgress\(\{ bytes \}\)[\s\S]*?\n\}/, 'LoadProgress');

  it('ตัวหารมาจากขนาดครั้งล่าสุดที่สำเร็จ ไม่ใช่ค่าคงที่ในโค้ด', () => {
    // hard-code ขนาดไว้ = แถบจะเพี้ยนขึ้นเรื่อย ๆ เมื่อจำนวนสินค้าเพิ่ม
    // (บทเรียนเดียวกับ soldQty/5 ที่ค้างมาจากตอนข้อมูลมีแค่ 5 เดือน)
    expect(COMP).toMatch(/dmj_last_payload_bytes/);
  });

  it('ตันที่ 95% — ห้ามโชว์ 100% ทั้งที่ยังโหลดไม่จบ', () => {
    expect(COMP).toMatch(/Math\.min\(95,/);
  });

  it('ยังไม่ได้ไบต์แรก → ไม่อ้างเปอร์เซ็นต์ (ใช้แถบ indeterminate แทน)', () => {
    expect(COMP).toMatch(/indeterminate/);
    expect(COMP).toMatch(/started/);
  });

  it('CSS ของแถบมีอยู่จริงในหน้าหลัก', () => {
    expect(HTML).toMatch(/\.progress-track\s*\{/);
    expect(HTML).toMatch(/\.progress-fill\.indeterminate\s*\{/);
  });

  it('ขนาดที่บันทึกไว้ต้องมาจากการโหลดที่สำเร็จเท่านั้น', () => {
    const save = APP.slice(APP.indexOf('if (gotBytes > 0)'), APP.indexOf('if (gotBytes > 0)') + 200);
    expect(save).toMatch(/dmj_last_payload_bytes/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. ฝั่ง GAS — cache การตรวจ session (รันฟังก์ชันจริง ไม่ copy)
// ═══════════════════════════════════════════════════════════════════════════
describe('resolveSession_ — cache ต้องเร็วขึ้นโดยไม่ทำให้สิทธิ์ค้าง', () => {
  function build({ sessions, staff }) {
    const cache = new Map();
    const calls = { sessionRead: 0, staffRead: 0, lastSeenWrite: 0 };

    const sessionsSheet_ = () => ({
      getLastRow: () => sessions.length + 1,
      getRange: (row, col, nRows, nCols) => ({
        getValues: () => { calls.sessionRead++; return sessions.map(r => r.slice(0, nCols || 6)); },
        setValue: (v) => { calls.lastSeenWrite++; sessions[row - 2][4] = v; },
      }),
    });
    const staffSheet_ = () => ({
      getRange: () => ({ getValues: () => { calls.staffRead++; return [staff]; } }),
    });

    const sandbox = {
      CacheService: {
        getScriptCache: () => ({
          get: k => (cache.has(k) ? cache.get(k) : null),
          put: (k, v) => cache.set(k, v),
          remove: k => cache.delete(k),
        }),
      },
      Utilities: {
        DigestAlgorithm: { SHA_256: 'sha256' },
        Charset: { UTF_8: 'utf8' },
        // แฮชของเล่น — เทสต์สนใจแค่ว่า "คีย์ต่างกันเมื่อ token ต่างกัน"
        computeDigest: (a, s) => String(s).split('').map(c => c.charCodeAt(0) % 128),
      },
      sessionsSheet_, staffSheet_,
      findStaffRowById_: (sh, id) => (id === staff[0] ? 2 : -1),
      staffRowToObj_: row => ({ staffId: row[0], name: row[3], role: row[5], status: row[6] }),
    };

    const src = [
      grab(GS, /const SESSION_CACHE_TTL_SEC = \d+;/, 'SESSION_CACHE_TTL_SEC'),
      grab(GS, /const SESSION_LASTSEEN_MIN_MS = [^;]+;/, 'SESSION_LASTSEEN_MIN_MS'),
      grab(GS, /function sha256Hex_\(s\) \{[\s\S]*?\n\}/, 'sha256Hex_'),
      grab(GS, /function sessionCacheKey_\(token\) \{[^}]*\}/, 'sessionCacheKey_'),
      grab(GS, /function invalidateSessionCache_\(token\) \{[\s\S]*?\n\}/, 'invalidateSessionCache_'),
      grab(GS, /function resolveSession_\(ss, token\) \{[\s\S]*?\n\}/, 'resolveSession_'),
      grab(GS, /function revokeSession_\(ss, token\) \{[\s\S]*?\n\}/, 'revokeSession_'),
    ].join('\n');
    const make = new Function(...Object.keys(sandbox),
      src + '; return { resolveSession_, revokeSession_, invalidateSessionCache_ };');
    return { api: make(...Object.values(sandbox)), calls, cache };
  }

  const future = new Date(Date.now() + 30 * 24 * 3600e3);
  const fresh = () => ({
    // token, staffId, createdAt, expiresAt, lastSeenAt, revoked
    sessions: [['tok-1', 'ST0001', new Date(), future, new Date(), false]],
    staff: ['ST0001', 'line', 'U1', 'ตั้ม', 'Tum', 'warehouse', 'active', '', '', '', ''],
  });

  it('เรียกซ้ำไม่อ่านชีตเซสชันอีก (คือส่วนที่ทำให้ล็อกอินช้าตอนหลายคนพร้อมกัน)', () => {
    const { api, calls } = build(fresh());
    api.resolveSession_({}, 'tok-1');
    api.resolveSession_({}, 'tok-1');
    api.resolveSession_({}, 'tok-1');
    expect(calls.sessionRead).toBe(1);
  });

  // ⚠️ ข้อนี้คือเหตุผลที่ cache เก็บแค่ staffId ไม่เก็บ staff ทั้งก้อน
  it('ยังอ่านแถวพนักงานสดทุกครั้ง — เจ้าของเปลี่ยน role แล้วต้องมีผลทันที', () => {
    const data = fresh();
    const { api, calls } = build(data);
    expect(api.resolveSession_({}, 'tok-1').role).toBe('warehouse');
    data.staff[5] = 'frontstore';                       // เจ้าของเปลี่ยนตำแหน่งกลางคัน
    expect(api.resolveSession_({}, 'tok-1').role).toBe('frontstore');
    expect(calls.staffRead).toBe(2);
  });

  it('ไม่เขียน lastSeenAt ซ้ำ ๆ ทุก request (การเขียนคือส่วนที่แพงที่สุด)', () => {
    const { api, calls } = build(fresh());   // lastSeenAt = เมื่อกี้นี้เอง
    api.resolveSession_({}, 'tok-1');
    expect(calls.lastSeenWrite).toBe(0);
  });

  it('แต่ยังเขียนเมื่อค่าเดิมเก่าพอ (ไม่งั้นดูไม่ออกว่าใครยังใช้งานอยู่)', () => {
    const data = fresh();
    data.sessions[0][4] = new Date(Date.now() - 60 * 60e3);   // เห็นล่าสุดเมื่อชั่วโมงก่อน
    const { api, calls } = build(data);
    api.resolveSession_({}, 'tok-1');
    expect(calls.lastSeenWrite).toBe(1);
  });

  it('session ที่ถูก revoke → คืน null และห้ามถูก cache ไว้', () => {
    const data = fresh();
    data.sessions[0][5] = true;
    const { api, cache } = build(data);
    expect(api.resolveSession_({}, 'tok-1')).toBe(null);
    expect(cache.size).toBe(0);
  });

  it('session ที่หมดอายุแล้ว → คืน null', () => {
    const data = fresh();
    data.sessions[0][3] = new Date(Date.now() - 1000);
    const { api } = build(data);
    expect(api.resolveSession_({}, 'tok-1')).toBe(null);
  });

  // ⚠️ พลาดข้อนี้ = ช่องโหว่ที่ไม่มี error ให้เห็นเลย: กด "ออกจากระบบ" แล้ว token
  // ที่หลุดออกไปยังใช้งานได้ต่ออีกจนกว่า cache จะหมดอายุเอง
  it('revokeSession_ ต้องล้าง cache ด้วย ไม่ใช่แค่ติ๊กในชีต', () => {
    const data = fresh();
    const { api, cache } = build(data);
    api.resolveSession_({}, 'tok-1');
    expect(cache.size).toBe(1);
    data.sessions[0][5] = true;
    api.revokeSession_({}, 'tok-1');
    expect(cache.size).toBe(0);
    expect(api.resolveSession_({}, 'tok-1')).toBe(null);   // ไม่ใช่ของที่ค้างใน cache
  });

  it('token ต่างกันต้องได้คีย์ cache คนละตัว', () => {
    const data = fresh();
    data.sessions.push(['tok-2', 'ST0001', new Date(), future, new Date(), false]);
    const { api, cache } = build(data);
    api.resolveSession_({}, 'tok-1');
    api.resolveSession_({}, 'tok-2');
    expect(cache.size).toBe(2);
  });

  it('ไม่เก็บ token ดิบไว้เป็นคีย์ cache', () => {
    const { api, cache } = build(fresh());
    api.resolveSession_({}, 'tok-1');
    expect([...cache.keys()].some(k => k.includes('tok-1'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. doPost — action กลุ่มล็อกอินไม่ต้องจ่ายค่าตรวจ session
// ═══════════════════════════════════════════════════════════════════════════
describe('doPost — ข้ามการตรวจ session สำหรับ action ที่ยกเว้นอยู่แล้ว', () => {
  it('ห่อ resolveSession_ ด้วยเงื่อนไข SESSION_EXEMPT_ACTIONS_', () => {
    const near = GS.slice(GS.indexOf('var actor = data.actor || "ไม่ระบุ";'));
    expect(near.slice(0, 900)).toMatch(/if \(!SESSION_EXEMPT_ACTIONS_\[data\.action\]\)/);
  });

  it('claimLoginHandoff อยู่ในรายการยกเว้นจริง (ตัวที่ถูกยิงถี่สุด)', () => {
    const list = grab(GS, /var SESSION_EXEMPT_ACTIONS_ = \{[\s\S]*?\};/, 'SESSION_EXEMPT_ACTIONS_');
    expect(list).toMatch(/claimLoginHandoff: true/);
  });

  it('canDoOrNull_ ยังปล่อยผ่าน action กลุ่มนี้ (ไม่งั้นข้ามแล้วโดนปฏิเสธแทน)', () => {
    const fn = grab(GS, /function canDoOrNull_\(sess, action\) \{[\s\S]*?\n\}/, 'canDoOrNull_');
    expect(fn).toMatch(/if \(!action \|\| SESSION_EXEMPT_ACTIONS_\[action\]\) return null;/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. handoff ต้องไม่หายถาวรเมื่อคำตอบไปไม่ถึงเครื่องผู้ใช้
// ═══════════════════════════════════════════════════════════════════════════
describe('claimLoginHandoffHandler_ — ช่วงผ่อนผันหลังมีคนมารับ', () => {
  const FN = grab(GS, /function claimLoginHandoffHandler_\(data\) \{[\s\S]*?\n\}/, 'claimLoginHandoffHandler_');

  it('ไม่ลบทิ้งทันที — เขียนทับด้วย TTL สั้นแทน', () => {
    // คำตอบรอบนี้อาจถูกตัดกลางทาง (เน็ตร้านหลุด/ลิงก์หมดอายุ) ถ้าลบทันที token หายถาวร
    // ผู้ใช้ต้องล็อกอินใหม่ทั้งรอบโดยไม่มีอะไรบอก = อาการ "วนกลับไปหน้าล็อกอินซ้ำ"
    expect(FN).toMatch(/cache\.put\(key, raw, LOGIN_HANDOFF_GRACE_SEC\)/);
    expect(FN).not.toMatch(/cache\.remove\(key\)/);
  });

  it('ช่วงผ่อนผันต้องสั้นกว่าอายุปกติมาก (ยังคงความเป็น "ใช้ครั้งเดียว")', () => {
    const grace = Number(grab(GS, /LOGIN_HANDOFF_GRACE_SEC = (\d+)/, 'GRACE').match(/\d+/)[0]);
    const ttl = Number(grab(GS, /LOGIN_HANDOFF_TTL_SEC = (\d+)/, 'TTL').match(/\d+/)[0]);
    expect(grace).toBeGreaterThan(0);
    expect(grace).toBeLessThan(ttl / 10);
  });
});

describe('claimHandoff ฝั่ง client', () => {
  const FN = grab(APP, /const claimHandoff = usC\(async \(\) => \{[\s\S]*?\n  \}, \[applyStaffSession\]\);/, 'claimHandoff');

  // เดิม applyStaffSession(undefined) โยน TypeError แล้วถูกกลืนใน catch เงียบ ๆ
  // ทั้งที่ฝั่ง server ปล่อยผลออกมาแล้ว → ผู้ใช้รอต่อจนหมดเวลาโดยไม่รู้ว่าเกิดอะไรขึ้น
  it('ไม่ส่งค่าว่างเข้า applyStaffSession', () => {
    expect(FN).toMatch(/if \(!d\.staff\)/);
    expect(FN.indexOf('if (!d.staff)')).toBeLessThan(FN.indexOf('applyStaffSession(d.staff)'));
  });

  it('บอกผู้ใช้เมื่อได้ session แต่ข้อมูลไม่ครบ แทนที่จะเงียบ', () => {
    expect(FN).toMatch(/setLineError\(/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. บันทึกเวลาเปิดแอป — เครื่องมือที่ใช้ตัดสินว่า "1 นาที" หมดไปกับอะไร
// ═══════════════════════════════════════════════════════════════════════════
describe('dmjMark / dmjSaveTrace — รันของจริงจาก HTML', () => {
  function boot() {
    const src = grab(HTML, /var t0 = Date\.now\(\);[\s\S]*?window\.dmjMark\('html'\);/, 'ตัวจับเวลาใน <head>');
    const store = new Map();
    const win = {
      performance: { timeOrigin: 1_000_000 },
      navigator: { userAgent: 'test-agent', standalone: false },
      matchMedia: () => ({ matches: false }),
    };
    const localStorage = {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    };
    win.localStorage = localStorage;
    new Function('window', 'localStorage', 'navigator', src)(win, localStorage, win.navigator);
    return { win, read: () => JSON.parse(store.get('dmj_boot_trace') || '[]') };
  }

  it('ประทับหมุดแรกทันทีที่หน้าเริ่มโหลด', () => {
    const { win } = boot();
    expect(win.dmjMarks().map(m => m.n)).toEqual(['html']);
  });

  // ⚠️ เคสที่อยากดูที่สุดคือเคสที่แอป "ไม่มีวันโหลดเสร็จ" — ถ้ารอเซฟตอนจบ
  // ก็จะไม่มีอะไรให้ดูเลยพอดีกับตอนที่ต้องการมากที่สุด
  it('บันทึกลงเครื่องทุกหมุด ไม่ใช่รอตอนจบ', () => {
    const { win, read } = boot();
    expect(read().length).toBe(1);
    win.dmjMark('babel');
    expect(read()[0].marks.map(m => m.n)).toEqual(['html', 'babel']);
  });

  it('การเปิดหน้าครั้งเดียวได้ 1 รายการ ไม่ใช่รายการใหม่ทุกหมุด', () => {
    const { win, read } = boot();
    win.dmjMark('a'); win.dmjMark('b'); win.dmjMark('c');
    expect(read().length).toBe(1);
    expect(read()[0].marks.length).toBe(4);
  });

  it('เก็บได้หลายรอบ แต่ไม่เกิน 5 (ไว้เทียบว่าช้าทุกครั้งหรือช้าบางครั้ง)', () => {
    let last = null;
    for (let i = 0; i < 7; i++) { last = boot(); last.win.dmjMark('run' + i); }
    expect(last.read().length).toBeLessThanOrEqual(5);
  });

  it('รอบใหม่อยู่บนสุด (ล่าสุดคือตัวที่คนอยากดู)', () => {
    const a = boot(); a.win.dmjSaveTrace('owner');
    const b = boot(); b.win.dmjSaveTrace('warehouse');
    expect(b.read()[0].label).toBe('warehouse');
  });

  // การเซฟอัตโนมัติทุกหมุดไม่ได้ส่ง label มาด้วย — ถ้าเขียนทับด้วยค่าว่าง
  // ชื่อตำแหน่งที่เพิ่งล็อกอินสำเร็จจะหายทันทีในหมุดถัดไป
  it('label ที่เคยตั้งไว้ต้องไม่ถูกลบโดยการเซฟอัตโนมัติ', () => {
    const { win, read } = boot();
    win.dmjSaveTrace('frontstore');
    win.dmjMark('ข้อมูล เสร็จ');
    expect(read()[0].label).toBe('frontstore');
  });

  it('บันทึกว่าเปิดจากไอคอนหน้าโฮมหรือเบราว์เซอร์ (คนละพฤติกรรมกันบน iOS)', () => {
    const { win, read } = boot();
    win.dmjSaveTrace('x');
    expect(read()[0]).toHaveProperty('standalone');
  });

  it('localStorage ใช้ไม่ได้ (โหมดไม่ระบุตัวตน) ต้องไม่ทำให้แอปพัง', () => {
    const src = grab(HTML, /var t0 = Date\.now\(\);[\s\S]*?window\.dmjMark\('html'\);/, 'ตัวจับเวลา');
    const win = { navigator: { userAgent: 'x' }, matchMedia: () => ({ matches: false }) };
    const ls = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    win.localStorage = ls;
    expect(() => new Function('window', 'localStorage', 'navigator', src)(win, ls, win.navigator)).not.toThrow();
    expect(() => win.dmjMark('babel')).not.toThrow();
  });
});

describe('การต่อหมุดเข้ากับแอป', () => {
  // ⚠️ กับดักที่เจอตอนทำ: app.jsx รันใน global scope — ประกาศ `function dmjMark()`
  // ที่นั่นจะไปทับตัวจริงบน window แล้วหมุดทั้งหมดหายเงียบ ๆ โดยยังดูเหมือนทำงานปกติ
  it('app.jsx ต้องไม่ประกาศฟังก์ชันชื่อ dmjMark ทับของจริง', () => {
    expect(APP).not.toMatch(/function dmjMark\s*\(/);
    expect(APP).toMatch(/function trMark\(name, extra\)/);
  });

  it('trMark ต้องไม่โยนเมื่อไม่มีตัวจริง (browser test ไม่ได้โหลด HTML นี้)', () => {
    const fn = grab(APP, /function trMark\(name, extra\) \{[\s\S]*?\n\}/, 'trMark');
    const make = new Function('window', fn + '; return trMark;');
    expect(() => make(undefined)('x')).not.toThrow();
    expect(() => make({})('x')).not.toThrow();
  });

  it('วัดครบทั้ง 3 ช่วงที่แก้คนละวิธีกัน (โค้ด · ล็อกอิน · ข้อมูล)', () => {
    expect(HTML).toMatch(/dmjMark\('babel'\)/);        // ช่วง A: โหลด/compile โค้ด
    expect(HTML).toMatch(/dmjMark\('jsx-ready'\)/);
    expect(APP).toMatch(/trMark\("auth:" \+ act/);      // ช่วง B: ล็อกอิน
    expect(APP).toMatch(/trMark\("ข้อมูล เริ่มโหลด"/);   // ช่วง C: ดาวน์โหลด payload
    expect(APP).toMatch(/trMark\("ข้อมูล เสร็จ"/);
  });

  it('แยก cache hit ออกจาก compile จริง — ต้องรู้ว่า Babel cache ทำงานไหมบนเครื่องนั้น', () => {
    expect(HTML).toMatch(/dmjMark\('jsx:' \+ src, 'hit'\)/);
    expect(HTML).toMatch(/'compile ' \+ \(Date\.now\(\) - _tc\)/);
  });

  it('เก็บบันทึกตอนโหลดล้มด้วย — รอบที่พังคือรอบที่อยากดูที่สุด', () => {
    expect(APP).toMatch(/trMark\("ข้อมูล ล้ม"/);
  });
});

describe('BootTraceModal — หน้าจอที่พนักงานถ่ายส่งให้เจ้าของ', () => {
  const COMP = grab(APP, /function BootTraceModal\(\{ onClose \}\)[\s\S]*?\n\}\n/, 'BootTraceModal');

  // "รวม 60 วินาที" บอกอะไรไม่ได้เลย · "ดาวน์โหลด 42 วิ" กับ "compile 42 วิ" คือคนละปัญหา
  it('โชว์ส่วนต่างระหว่างหมุด ไม่ใช่แค่เวลาสะสม', () => {
    expect(COMP).toMatch(/d: m\.t - \(i > 0 \? marks\[i - 1\]\.t : 0\)/);
  });

  it('เน้นขั้นที่กินเวลามากสุดให้เห็นทันที', () => {
    expect(COMP).toMatch(/worst/);
  });

  it('รวมปัญหาล่าสุดจากระบบหลังบ้านไว้ในจอเดียวกัน', () => {
    expect(COMP).toMatch(/dmj_last_backend_error/);
  });

  it('เปิดได้จากจอโหลด/จอ error ด้วย — ไม่ต้องเข้าแอปให้สำเร็จก่อน', () => {
    // ตอนที่อยากดูที่สุดคือตอนที่ยังเข้าไม่ได้ ถ้าเปิดได้เฉพาะหลังโหลดเสร็จก็ไร้ประโยชน์
    const loading = APP.slice(APP.indexOf('if (error && !data) {'), APP.indexOf('const syncLabel = (() => {'));
    expect((loading.match(/setShowTrace\(true\)/g) || []).length).toBe(2);
    expect((loading.match(/<BootTraceModal/g) || []).length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Phase 8 ขั้นวัด + คีย์ที่ตัดทิ้งแล้ว
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase 8 — เครื่องมือวัดและคีย์ที่ตายแล้ว', () => {
  it('logPayloadSizes_ เรียกตัววัด "ชื่อคีย์ vs ค่า" จริง (ไม่ใช่มีฟังก์ชันลอยไว้เฉย ๆ)', () => {
    const fn = grab(GS, /function logPayloadSizes_\(data, variant, sentLen\) \{[\s\S]*?\n\}/, 'logPayloadSizes_');
    expect(fn).toMatch(/logProductKeyCost_\(/);
  });

  it('ตัววัดต้องไม่ทำให้เส้นทางเสิร์ฟข้อมูลล้ม', () => {
    const fn = grab(GS, /function logProductKeyCost_\(products, variant\) \{[\s\S]*?\n\}/, 'logProductKeyCost_');
    expect(fn).toMatch(/try \{/);
    expect(fn).toMatch(/catch \(e\)/);
  });

  it('วัด prefix ร่วมของ imageUrl ด้วย — ยืนยันจากโค้ดไม่ได้ ต้องดูของจริง', () => {
    const fn = grab(GS, /function logProductKeyCost_\(products, variant\) \{[\s\S]*?\n\}/, 'logProductKeyCost_');
    expect(fn).toMatch(/imageUrl/);
  });

  it('เลิกส่ง mtoGroups แล้ว — client สร้างใหม่ทับทุกครั้งอยู่แล้ว', () => {
    expect(GS).not.toMatch(/mtoGroups: Object\.values\(mtoMap\)/);
    expect(APP).toMatch(/d\.mtoGroups = Object\.values\(map\)/);   // ตัวที่สร้างทับต้องยังอยู่
  });

  it('เลิกส่ง color แล้ว — เป็น null ทุกแถวเสมอ และ client เติมเองจากชื่อสินค้า', () => {
    expect(GS).not.toMatch(/monthly: \[\], color: null/);
    expect(APP).toMatch(/if \(!p\.color\) p\.color = detectColor\(p\.name\)/);
  });

  it('view ที่ใช้ mtoGroups ยังกันค่าว่างไว้ (เผื่อ mtoBase หลุด)', () => {
    const VIEWS = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
    expect(VIEWS).toMatch(/mtoGroups && mtoGroups\.length > 0/);
  });
});
