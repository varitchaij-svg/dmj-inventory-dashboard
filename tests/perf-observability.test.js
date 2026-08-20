// tests/perf-observability.test.js — Phase B backend observability
// ─────────────────────────────────────────────────────────────────────────────
// คุม 2 อย่าง:
//   (A) parser ที่แปลง log → 7 metrics ทำงานถูก (unit test บริสุทธิ์)
//   (B) meta-test สแกน appsscript_complete.gs จริง — ยืนยันว่า instrumentation
//       ถูก wire เข้าจุดที่ตั้งใจ, เป็น log-only + fail-safe, และ **ไม่แตะพฤติกรรมเดิม**
//       (lock args เท่าเดิม · perf helper ไม่เขียนชีต/Property/Cache)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseStart, parseEnd, parseLock, parseZort, parseDrive, parseDouble, parseDoGet,
  maxConcurrency, analyze, formatReport,
} from '../scripts/perf-report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

// ── ดึง body ของฟังก์ชัน top-level ตามชื่อ (นับวงเล็บปีกกา) ──
function fnBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('ไม่พบฟังก์ชัน ' + name);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('วงเล็บไม่ปิดสำหรับ ' + name);
}

// ════════════════════════════════════════════════════════════════════════════
// (A) parser
// ════════════════════════════════════════════════════════════════════════════
describe('perf-report parsers', () => {
  it('parseStart / parseEnd', () => {
    expect(parseStart('[perfB] START kind=doPost id=abc123 action=punch t=1699999999999'))
      .toEqual({ kind: 'doPost', id: 'abc123', action: 'punch', t: 1699999999999 });
    expect(parseEnd('[perfB] END kind=doPost id=abc123 action=punch durMs=250 sessN=2 sessMs=40 lock=punch:w0:h240'))
      .toEqual({ kind: 'doPost', id: 'abc123', action: 'punch', durMs: 250, sessN: 2, sessMs: 40 });
  });
  it('action ว่างได้ (payload path / linebot ก่อนตั้ง action)', () => {
    expect(parseStart('[perfB] START kind=doGet id=z t=5')).toBe(null); // ไม่มี action= → รูปแบบผิด → null
    expect(parseStart('[perfB] START kind=doGet id=z action= t=5'))
      .toEqual({ kind: 'doGet', id: 'z', action: '', t: 5 });
  });
  it('parseLock got true/false', () => {
    expect(parseLock('[perfB] LOCK tag=punch got=true waitMs=12 holdMs=340 id=x'))
      .toEqual({ tag: 'punch', got: true, waitMs: 12, holdMs: 340 });
    expect(parseLock('[perfB] LOCK tag=saleBill got=false waitMs=15000 holdMs=0 id=x').got).toBe(false);
  });
  it('parseZort / parseDrive / parseDouble / parseDoGet', () => {
    expect(parseZort('[perfB] ZORT tag=AddTransfer ms=850 attempt=2 ok=false id=x'))
      .toEqual({ tag: 'AddTransfer', ms: 850, attempt: 2, ok: false });
    expect(parseDrive('[perfB] DRIVE tag=attPhoto ms=1400 ok=true id=x'))
      .toEqual({ tag: 'attPhoto', ms: 1400, ok: true });
    expect(parseDouble('[perfB] DOUBLE-RESOLVE id=x action=me')).toEqual({ id: 'x', action: 'me' });
    expect(parseDoGet('[perf] doGet HIT variant=full_v3 รวม=123ms ส่ง=4200KB build=0ms'))
      .toEqual({ kind: 'HIT', variant: 'full_v3', totalMs: 123 });
  });
});

describe('maxConcurrency (sweep line)', () => {
  it('request ที่ต่อกันพอดี (จบ=เริ่ม) ไม่ทับกัน', () => {
    expect(maxConcurrency([{ start: 0, end: 10 }, { start: 10, end: 20 }]).max).toBe(1);
  });
  it('สามอันทับกันจริง → 3', () => {
    const r = maxConcurrency([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 8, end: 12 }]);
    expect(r.max).toBe(3);
    expect(r.at).toBe(8);
  });
  it('interval ยาว 0ms (start==end) ยังนับเป็น 1', () => {
    expect(maxConcurrency([{ start: 100, end: 100 }]).max).toBe(1);
  });
  it('ว่าง → 0', () => {
    expect(maxConcurrency([]).max).toBe(0);
  });
});

describe('analyze() รวมทุก metric', () => {
  const log = [
    '[perfB] START kind=doPost id=a action= t=1000',
    '[perfB] DOUBLE-RESOLVE id=a action=me',
    '[perfB] END kind=doPost id=a action=me durMs=60000 sessN=2 sessMs=800',
    '[perfB] START kind=doPost id=b action=punch t=1500',
    '[perfB] DRIVE tag=attPhoto ms=1400 ok=true id=b',
    '[perfB] LOCK tag=punch got=true waitMs=9000 holdMs=3000 id=b',
    '[perfB] END kind=doPost id=b action=punch durMs=13000 sessN=2 sessMs=120',
    '[perfB] DOUBLE-RESOLVE id=b action=punch',
    '[perfB] START kind=doPost id=c action=transferStockBatch t=2000',
    '[perfB] ZORT tag=AddTransfer ms=800 attempt=1 ok=false id=c',
    '[perfB] ZORT tag=AddTransfer ms=1200 attempt=2 ok=true id=c',
    '[perfB] LOCK tag=transferBatch got=true waitMs=0 holdMs=5000 id=c',
    '[perfB] END kind=doPost id=c action=transferStockBatch durMs=298600 sessN=1 sessMs=50',
    '[perf] doGet HIT variant=full_v3 รวม=200ms ส่ง=4200KB',
    '[perf] doGet STALE variant=full_v3 รวม=300ms ส่ง=4200KB',
    '[perf] doGet HIT variant=lite_v3 รวม=150ms ส่ง=4000KB',
  ].join('\n');
  const a = analyze(log);

  it('① concurrency: a[1000,61000] b[1500,14500] c[2000,300600] ทับกัน → 3', () => {
    expect(a.concurrency.max).toBe(3);
  });
  it('③ action durations แยกตาม action + เรียง max ก่อน', () => {
    const slow = a.actions[0];
    expect(slow.action).toBe('transferStockBatch');
    expect(slow.max).toBe(298600);
    const me = a.actions.find(x => x.action === 'me');
    expect(me.max).toBe(60000);
  });
  it('④ double-resolve นับได้ + แยกตาม action', () => {
    expect(a.resolveSession.doubleResolves).toBe(2);
    expect(a.resolveSession.doubleByAction).toEqual({ me: 1, punch: 1 });
    expect(a.resolveSession.sessPerReq.max).toBe(2);
  });
  it('② lock hold/wait สรุปต่อ tag', () => {
    const punch = a.locks.find(l => l.tag === 'punch');
    expect(punch.wait.max).toBe(9000);
    expect(punch.hold.max).toBe(3000);
  });
  it('⑤ ZORT retries นับ attempt>1', () => {
    const z = a.zort.find(x => x.tag === 'AddTransfer');
    expect(z.retries).toBe(1);   // attempt=2 ครั้งเดียว
    expect(z.fail).toBe(1);      // ok=false ครั้งแรก
    expect(z.max).toBe(1200);
  });
  it('⑥ Drive latency (เฉพาะ ok นับ ms, fail แยก)', () => {
    const d = a.drive.find(x => x.tag === 'attPhoto');
    expect(d.max).toBe(1400);
    expect(d.fail).toBe(0);
  });
  it('⑦ cache mix', () => {
    expect(a.cacheMix).toEqual({ HIT: 2, STALE: 1 });
  });
  it('formatReport ไม่ throw + มีหัวข้อครบ', () => {
    const r = formatReport(a);
    expect(r).toContain('concurrency');
    expect(r).toContain('lock wait/hold');
    expect(r).toContain('ZORT');
    expect(r).toContain('cache mix');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (B) meta-tests: instrumentation ถูก wire จริง + log-only + fail-safe + ไม่แตะ behavior
// ════════════════════════════════════════════════════════════════════════════
const PERF_HELPERS = ['perfReqBegin_', 'perfReqEnd_', 'perfReqAction_', 'perfSess_', 'perfLock_', 'perfZort_', 'perfDrive_'];

describe('perf helpers เป็น log-only + fail-safe', () => {
  it('ทุก helper มีอยู่จริง', () => {
    for (const h of PERF_HELPERS) expect(GS).toContain('function ' + h + '(');
  });
  it('ทุก helper ห่อ try/catch (ไม่มีทาง throw ออกไปทำ request ล่ม)', () => {
    for (const h of PERF_HELPERS) {
      const body = fnBody(GS, h);
      expect(body, h + ' ต้องมี try').toMatch(/try\s*\{/);
      expect(body, h + ' ต้องมี catch').toMatch(/catch\s*\(/);
    }
  });
  it('helper ไม่เขียนชีต/Property/Cache — Logger.log อย่างเดียว (กัน instrumentation กลายเป็น bottleneck/แก้ข้อมูล)', () => {
    const forbidden = [/\.setValue\(/, /\.appendRow\(/, /setProperty\(/, /CacheService/, /\.getRange\(/, /UrlFetchApp/, /SpreadsheetApp/];
    for (const h of PERF_HELPERS) {
      const body = fnBody(GS, h);
      for (const re of forbidden) expect(body, h + ' ห้ามมี ' + re).not.toMatch(re);
    }
  });
});

describe('instrument points ถูก wire เข้าเส้นทางจริง', () => {
  it('doPost: begin + action + end (finally)', () => {
    const b = fnBody(GS, 'doPost');
    expect(b).toContain("perfReqBegin_('doPost')");
    expect(b).toContain('perfReqAction_(_postAction)');
    expect(b).toMatch(/finally\s*\{[\s\S]*perfReqEnd_\(\)/);
  });
  it('doGet: begin(action) + end (finally)', () => {
    const b = fnBody(GS, 'doGet');
    expect(b).toMatch(/perfReqBegin_\('doGet'/);
    expect(b).toMatch(/finally\s*\{[\s\S]*perfReqEnd_\(\)/);
  });
  it('resolveSession_: วัดผ่าน perfSess_ ใน finally (ครอบทุกทางออก)', () => {
    const b = fnBody(GS, 'resolveSession_');
    expect(b).toMatch(/finally\s*\{[\s\S]*perfSess_\(/);
  });
  it('lock wait/hold: punch + 3 write paths มี perfLock_', () => {
    for (const fn of ['punchHandler_', 'transferStock', 'transferStockBatch', 'createSaleBill']) {
      expect(fnBody(GS, fn), fn + ' ต้องมี perfLock_').toContain('perfLock_(');
    }
  });
  it('saveAttPhoto_: วัด Drive upload latency', () => {
    expect(fnBody(GS, 'saveAttPhoto_')).toContain("perfDrive_('attPhoto'");
  });
  it('ZORT latency: createZortTransferBatch_ + fetchAllZortProducts_', () => {
    expect(fnBody(GS, 'createZortTransferBatch_')).toContain("perfZort_('AddTransfer'");
    expect(fnBody(GS, 'fetchAllZortProducts_')).toContain("perfZort_('GetProducts'");
  });
});

describe('ไม่แตะ behavior เดิม (lock args + control flow เท่าเดิม)', () => {
  it('lock timeout เดิมทุกตัวยังอยู่ครบ (ไม่เปลี่ยน lock strategy/timeout)', () => {
    expect(fnBody(GS, 'punchHandler_')).toContain('lock.waitLock(10000)');
    expect(fnBody(GS, 'transferStock')).toContain('lock.tryLock(8000)');
    expect(fnBody(GS, 'transferStockBatch')).toContain('lock.tryLock(15000)');
    expect(fnBody(GS, 'createSaleBill')).toContain('lock.tryLock(10000)');
  });
  it('ZORT retry loop เดิมยังเป็น 3 / MAX_RETRIES (ไม่เปลี่ยน retry)', () => {
    expect(fnBody(GS, 'createZortTransferBatch_')).toContain('attempt <= 3');
    expect(fnBody(GS, 'fetchAllZortProducts_')).toContain('attempt <= MAX_RETRIES');
  });
  it('resolveSession_ ยังเขียน lastSeenAt เหมือนเดิม (ไม่ใช่ F1 — ยังไม่แก้)', () => {
    expect(fnBody(GS, 'resolveSession_')).toMatch(/getRange\(i \+ 2, 5\)\.setValue\(new Date\(\)\)/);
  });
});
