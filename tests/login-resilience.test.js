// tests/login-resilience.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Phase 7.6 login rollout — เอาการ "กันล็อกอินค้าง/วน" กลับมาทีละก้อน
// (ดู docs/HANDOFF-LOGIN-PERF.md "ส่วนที่ 1" + CLAUDE.md หัวข้อ "Phase 7.6")
//
// รอบก่อน 7.6 ถูก revert เพราะยกกลับทั้งชุดแล้วร้านล่ม → รอบนี้เอากลับ "ปลอดภัยก่อน เสี่ยงท้าย"
// แต่ละก้อนมีเทสต์ล็อกไว้ · component ที่มี timer/React hooks เทสต์ pure ไม่ได้ →
// ใช้ source-scan meta-test ล็อก wiring (แพทเทิร์นเดียวกับ gasjson.test.js SCAN gate)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

// ดึง block จริงจากต้นทาง (เหมือน auth.test.js) — ไม่เจอ = โครงสร้างเปลี่ยน ต้องมาอัปเดตเทสต์
function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// sandbox eval claimLoginHandoffHandler_ จริงจาก .gs + fake CacheService ที่จับ TTL ของ put
function loadHandoff() {
  const store = {};      // key -> raw
  const puts = [];       // {key, ttl}
  const removes = [];    // key
  const cache = {
    get: (k) => (k in store ? store[k] : null),
    put: (k, v, ttl) => { store[k] = v; puts.push({ key: k, ttl }); },
    remove: (k) => { delete store[k]; removes.push(k); },
  };
  const ctx = {
    CacheService: { getScriptCache: () => cache },
    ContentService: {
      createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }),
      MimeType: { JSON: 1 },
    },
    Logger: { log: () => {} },
  };
  const code = [
    'function sha256Hex_(s){ return "sha:" + String(s); }',   // stub — คีย์คาดเดาได้
    grab(GS, /const LOGIN_HANDOFF_CLAIM_GRACE_SEC = \d+;/),
    grab(GS, /function loginHandoffKey_\(id\) \{ return[^\n]*\}/),
    grab(GS, /function claimLoginHandoffHandler_\(data\) \{[\s\S]*?\n\}/),
    'return { claimLoginHandoffHandler_, loginHandoffKey_, sha256Hex_, GRACE: LOGIN_HANDOFF_CLAIM_GRACE_SEC };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const api = new Function(...Object.keys(ctx), code)(...Object.values(ctx));
  return { api, store, puts, removes };
}

// ── ก้อน A (ข้อ 2): จอ checking ต้องมีทางออกเสมอ ──────────────────────────────
describe('Phase 7.6 ก้อน A — จอ checking มีทางออก', () => {
  it('มี component CheckingScreen', () => {
    expect(APP).toMatch(/function CheckingScreen\s*\(\s*\{\s*onGiveUp\s*\}\s*\)/);
  });

  it('CheckingScreen นับวินาทีจริง (setInterval + state secs)', () => {
    const body = APP.slice(APP.indexOf('function CheckingScreen'), APP.indexOf('function CheckingScreen') + 900);
    expect(body).toMatch(/setInterval/);
    expect(body).toMatch(/setSecs/);
    // เก็บเวลาเริ่มด้วย Date.now() แล้วคำนวณ elapsed — ไม่ใช่ +1 ต่อ tick (กันเพี้ยนตอน tab ถูกพัก)
    expect(body).toMatch(/Date\.now\(\)/);
  });

  it('เตือน "ช้ากว่าปกติ" ที่ 12 วิ และปุ่มกลับล็อกอินที่ 30 วิ', () => {
    const body = APP.slice(APP.indexOf('function CheckingScreen'), APP.indexOf('function CheckingScreen') + 1200);
    expect(body).toMatch(/secs\s*>=\s*12/);
    expect(body).toMatch(/secs\s*>=\s*30/);
    // ปุ่มที่ 30 วิ ต้องเรียก onGiveUp (ไม่ใช่ปุ่มตกแต่งที่กดแล้วไม่เกิดอะไร)
    expect(body).toMatch(/onClick=\{onGiveUp\}/);
  });

  it('เส้นทาง render "checking" ใช้ CheckingScreen — ไม่ใช่สปินเนอร์เปล่าเดิม', () => {
    const idx = APP.indexOf('if (authPhase === "checking")');
    expect(idx).toBeGreaterThan(0);
    const block = APP.slice(idx, idx + 800);
    expect(block).toMatch(/<CheckingScreen\b/);
    expect(block).toMatch(/onGiveUp=/);
  });

  it('onGiveUp ลบ code/state ออกจาก URL แล้ว setAuthPhase("needLogin")', () => {
    const idx = APP.indexOf('if (authPhase === "checking")');
    const block = APP.slice(idx, idx + 800);
    // ต้องล้าง ?code= กัน effect แลก code ยิงซ้ำ + พาไปหน้าล็อกอิน
    expect(block).toMatch(/searchParams\.delete\(["']code["']\)/);
    expect(block).toMatch(/setAuthPhase\(["']needLogin["']\)/);
  });
});

// ── ก้อน B (ข้อ 4): handoff ต้องไม่ถูกกินทิ้งถาวรเมื่อคำตอบหายกลางทาง ──────────
describe('Phase 7.6 ก้อน B — claimLoginHandoff ไม่กิน token ทิ้งถาวร', () => {
  function seed(h, secret, payload) {
    h.store[h.api.loginHandoffKey_(h.api.sha256Hex_(secret))] = JSON.stringify(payload);
  }

  it('claim สำเร็จ → คืน sessionToken + staff', () => {
    const h = loadHandoff();
    seed(h, 'sec1', { sessionToken: 'TOK-1', staff: { staffId: 'ST1' } });
    const out = h.api.claimLoginHandoffHandler_({ handoffSecret: 'sec1' });
    expect(out.ok).toBe(true);
    expect(out.sessionToken).toBe('TOK-1');
    expect(out.staff.staffId).toBe('ST1');
  });

  it('ไม่เรียก cache.remove เลย — เขียนทับด้วย TTL ผ่อนผัน (60s) แทน', () => {
    const h = loadHandoff();
    seed(h, 'sec2', { sessionToken: 'TOK-2', staff: {} });
    h.api.claimLoginHandoffHandler_({ handoffSecret: 'sec2' });
    expect(h.removes.length).toBe(0);                 // ห้าม remove ทิ้ง
    const key = h.api.loginHandoffKey_(h.api.sha256Hex_('sec2'));
    expect(key in h.store).toBe(true);                // token ยังอยู่
    const grace = h.puts.find(p => p.key === key);
    expect(grace).toBeTruthy();
    expect(grace.ttl).toBe(h.api.GRACE);              // TTL สั้น = 60s
  });

  it('claim ซ้ำในช่วงผ่อนผัน → ยังได้ token เดิม (retry ที่คำตอบหาย แลกคืนได้)', () => {
    const h = loadHandoff();
    seed(h, 'sec3', { sessionToken: 'TOK-3', staff: {} });
    const a = h.api.claimLoginHandoffHandler_({ handoffSecret: 'sec3' });
    const b = h.api.claimLoginHandoffHandler_({ handoffSecret: 'sec3' });
    expect(a.sessionToken).toBe('TOK-3');
    expect(b.sessionToken).toBe('TOK-3');
  });

  it('ยังไม่มีผล (ยังล็อกอินไม่เสร็จ) → pending:true ไม่ใช่ error', () => {
    const h = loadHandoff();
    const out = h.api.claimLoginHandoffHandler_({ handoffSecret: 'nope' });
    expect(out.ok).toBe(false);
    expect(out.pending).toBe(true);
  });

  it('ไม่มี secret → error no-secret', () => {
    const h = loadHandoff();
    const out = h.api.claimLoginHandoffHandler_({});
    expect(out.ok).toBe(false);
    expect(out.error).toBe('no-secret');
  });

  it('meta: ต้นทางเลิกใช้ cache.remove ใน claim handler แล้ว', () => {
    const fn = grab(GS, /function claimLoginHandoffHandler_\(data\) \{[\s\S]*?\n\}/);
    expect(fn).not.toMatch(/cache\.remove/);
    expect(fn).toMatch(/LOGIN_HANDOFF_CLAIM_GRACE_SEC/);
  });
});
