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

// ── ก้อน C (ข้อ 3): poll handoff backoff + TTL 30 นาที ────────────────────────
describe('Phase 7.6 ก้อน C — poll backoff + TTL', () => {
  // eval delayFor จริงจากใน effect (pure one-liner) — ไม่ copy
  const delayLine = grab(APP, /const delayFor = \(n\) => [^\n;]*;/);
  // eslint-disable-next-line no-new-func
  const delayFor = new Function('return ' + delayLine.replace(/^const delayFor = /, '').replace(/;$/, ''))();

  it('ถอยห่าง 4วิ×3 → 8วิ → 15วิ (cap)', () => {
    expect(delayFor(0)).toBe(4000);
    expect(delayFor(1)).toBe(4000);
    expect(delayFor(2)).toBe(4000);
    expect(delayFor(3)).toBe(8000);
    expect(delayFor(4)).toBe(15000);
    expect(delayFor(50)).toBe(15000); // cap ไม่โตต่อ
  });

  it('meta: ยังมี in-flight guard + รีเซ็ต attempt ตอน wake (ผู้ใช้กลับมารอ)', () => {
    const idx = APP.indexOf('const delayFor = (n) =>');
    const block = APP.slice(idx - 400, idx + 900);
    expect(block).toMatch(/inFlight/);                       // กันยิงซ้อน
    expect(block).toMatch(/attempt = 0;\s*run\(\)/);         // wake รีเซ็ตความถี่
    expect(block).not.toMatch(/setInterval/);                // เลิก interval คงที่แล้ว
  });

  it('meta: TTL client (app.jsx) = server (.gs) = 30 นาที และ client ≤ server', () => {
    const ms = Number(grab(APP, /LINE_HANDOFF_TTL_MS = \d+ \* 60 \* 1000/).match(/= (\d+)/)[1]);
    const sec = Number(grab(GS, /LOGIN_HANDOFF_TTL_SEC = \d+;/).match(/= (\d+)/)[1]);
    expect(ms).toBe(30);            // นาที ฝั่ง client
    expect(sec).toBe(1800);         // วินาที ฝั่ง server = 30 นาที
    expect(ms * 60).toBeLessThanOrEqual(sec); // client ต้องไม่เกิน server (ไม่งั้น claim หมดอายุก่อน)
  });
});

// ── ก้อน D (ข้อ 5): resolveSession_ cache + throttle + ล้าง cache ตอน revoke/เปลี่ยน role ──
function fakeSheet(rows) {  // rows = data rows (0-indexed) — header อยู่แถว 1 โดยปริยาย
  return {
    _rows: rows,
    getLastRow: () => rows.length + 1,
    getRange: (r, c, nR, nC) => {
      if (nR === undefined) {  // single cell
        return { setValue: (v) => { rows[r - 2][c - 1] = v; } };
      }
      return {
        getValues: () => {
          const out = [];
          for (let i = 0; i < nR; i++) {
            const src = rows[(r - 2) + i] || [];
            out.push(src.slice(c - 1, c - 1 + nC));
          }
          return out;
        },
      };
    },
  };
}

function loadSession() {
  const store = {};
  const cache = {
    get: (k) => (k in store ? store[k] : null),
    put: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; },
  };
  const ctx = {
    store,
    CacheService: { getScriptCache: () => cache },
    Utilities: {
      DigestAlgorithm: { MD5: 1 },
      // แฮชปลอมแบบ deterministic ต่อ string (คีย์ต่าง token ต้องไม่ชนกัน)
      computeDigest: (_a, s) => String(s).split('').map(c => c.charCodeAt(0) & 0xFF),
    },
    perfSess_: () => {},
  };
  const code = [
    grab(GS, /const SESSION_CACHE_TTL_SEC = \d+;/),
    grab(GS, /const SESSION_LASTSEEN_THROTTLE_MS = [^\n;]*;/),
    grab(GS, /function sessionCacheKey_\(token\) \{[\s\S]*?\n\}/),
    grab(GS, /function sessionCacheClear_\(token\) \{[\s\S]*?\n\}/),
    grab(GS, /function sessionCacheClearForStaff_\(ss, staffId\) \{[\s\S]*?\n\}/),
    grab(GS, /function staffRowToObj_\(row\) \{[\s\S]*?\n\}/),
    grab(GS, /function findStaffRowById_\(sh, staffId\) \{[\s\S]*?\n\}/),
    grab(GS, /function resolveSession_\(ss, token\) \{[\s\S]*?\n {2}} catch[\s\S]*?\n\}/),
    grab(GS, /function revokeSession_\(ss, token\) \{[\s\S]*?\n\}/),
    // sessionsSheet_/staffSheet_ ถูก stub ให้คืน fake sheet ที่แนบมากับ ss
    'function sessionsSheet_(ss){ return ss.sessions; }',
    'function staffSheet_(ss){ return ss.staff; }',
    'return { resolveSession_, revokeSession_, sessionCacheClearForStaff_, sessionCacheKey_, store };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(ctx), code)(...Object.values(ctx));
}

describe('Phase 7.6 ก้อน D — resolveSession_ cache + ล้างตอน revoke/เปลี่ยน role', () => {
  const DAY = 86400000;
  function mkSS(sessionRows, staffRows) {
    return { sessions: fakeSheet(sessionRows), staff: fakeSheet(staffRows) };
  }
  // staff cols: staffId,provider,providerUserId,displayName,lineDisplayName,role,status,...
  const staff = (id, role, status) => [id, 'line', 'uid'+id, 'ชื่อ'+id, 'L'+id, role, status || 'active', '', Date.now(), Date.now(), ''];
  // session cols: token,staffId,createdAt,expiresAt,lastSeenAt,revoked
  const sess = (tok, id, opts) => [tok, id, Date.now()-DAY, (opts&&opts.exp)||Date.now()+30*DAY, (opts&&opts.seen)||'', (opts&&opts.rev)||false];

  it('token ถูกต้อง → คืน staff obj (role/staffId ตรง)', () => {
    const S = loadSession();
    const ss = mkSS([sess('TOK1','ST1')], [staff('ST1','saler')]);
    const out = S.resolveSession_(ss, 'TOK1');
    expect(out.staffId).toBe('ST1');
    expect(out.role).toBe('saler');
  });

  it('เรียกครั้งที่ 2 อ่านจาก cache — ไม่แตะชีตซ้ำ (พิสูจน์: แก้ชีตแล้วยังได้ค่าเดิม)', () => {
    const S = loadSession();
    const ss = mkSS([sess('TOK1','ST1')], [staff('ST1','saler')]);
    expect(S.resolveSession_(ss, 'TOK1').role).toBe('saler');
    ss.staff._rows[0][5] = 'owner';                 // แอบแก้ role ในชีตหลัง cache แล้ว
    expect(S.resolveSession_(ss, 'TOK1').role).toBe('saler'); // ยังได้ค่าเดิมจาก cache
  });

  it('revoke ล้าง cache — logout แล้ว resolveSession_ คืน null ทันที', () => {
    const S = loadSession();
    const ss = mkSS([sess('TOK1','ST1')], [staff('ST1','saler')]);
    expect(S.resolveSession_(ss, 'TOK1')).toBeTruthy();   // cache แล้ว
    S.revokeSession_(ss, 'TOK1');                          // logout → ล้าง cache + mark revoked
    expect(S.resolveSession_(ss, 'TOK1')).toBeNull();     // ต้องไม่คืน session เดิม
  });

  it('เปลี่ยน role/status → sessionCacheClearForStaff_ ล้างทุก token ของคนนั้น', () => {
    const S = loadSession();
    const ss = mkSS([sess('TOK1','ST1'), sess('TOK2','ST1')], [staff('ST1','saler')]);
    S.resolveSession_(ss, 'TOK1'); S.resolveSession_(ss, 'TOK2');
    expect(S.store[S.sessionCacheKey_('TOK1')]).toBeTruthy();
    expect(S.store[S.sessionCacheKey_('TOK2')]).toBeTruthy();
    S.sessionCacheClearForStaff_(ss, 'ST1');
    expect(S.store[S.sessionCacheKey_('TOK1')]).toBeUndefined();
    expect(S.store[S.sessionCacheKey_('TOK2')]).toBeUndefined();
  });

  it('lastSeenAt: เพิ่งเห็น (<10 นาที) → ไม่เขียนซ้ำ · ว่าง → เขียน', () => {
    const S = loadSession();
    // เพิ่งเห็นเมื่อกี้ → ไม่ควรเขียน (token คนละตัว กัน cache hit ข้ามเคส)
    const fresh = mkSS([sess('TA','ST1',{seen: Date.now()-1000})], [staff('ST1','saler')]);
    S.resolveSession_(fresh, 'TA');
    expect(fresh.sessions._rows[0][4]).not.toBeInstanceOf(Date);  // ไม่ถูกเขียนทับด้วย new Date()
    // lastSeenAt ว่าง → ต้องเขียน
    const stale = mkSS([sess('TB','ST1',{seen: ''})], [staff('ST1','saler')]);
    S.resolveSession_(stale, 'TB');
    expect(stale.sessions._rows[0][4]).toBeInstanceOf(Date);
  });

  it('session revoked/หมดอายุ → null (ไม่ cache)', () => {
    const S = loadSession();
    expect(S.resolveSession_(mkSS([sess('T','ST1',{rev:true})], [staff('ST1','saler')]), 'T')).toBeNull();
    expect(S.resolveSession_(mkSS([sess('T','ST1',{exp:Date.now()-1000})], [staff('ST1','saler')]), 'T')).toBeNull();
  });

  it('meta: จุด invalidate ครบ 3 — revoke, saveStaff, ตั้ง role จาก editor', () => {
    expect(grab(GS, /function revokeSession_\(ss, token\) \{[\s\S]*?\n\}/)).toMatch(/sessionCacheClear_/);
    const save = grab(GS, /function saveStaffHandler_\(ss, data, actor\) \{[\s\S]*?\n\}/);
    expect(save).toMatch(/sessionCacheClearForStaff_\(ss, data\.staffId\)/);
    // ตั้ง role จาก GAS editor
    expect(GS).toMatch(/sessionCacheClearForStaff_\(ss, all\[hit\]\.staffId\)/);
  });
});
