// tests/durable-telemetry.test.js — Track B: Durable Observability (Option C)
// ─────────────────────────────────────────────────────────────────────────────
// eval ฟังก์ชันจริงจาก appsscript_complete.gs (ไม่ copy — เหมือน auth.test.js) แล้ว stub
// GAS globals (CacheService/PropertiesService/Logger) เพื่อทดสอบ:
//   · FAIL-OPEN: telemetry พัง (cache throw/flag throw/malformed) → business ไม่พัง
//   · corrId + summary (zortMs/driveMs/cacheKind/sessN) ถูกเก็บถูกต้อง
//   · dedup by id (1 record = 1 แถว · คนละ execution = คนละแถว)
//   · schema/column order + bounded length (กัน row ระเบิด)
//   · ไม่มี PII (phone/email/token/body) ในเส้นทาง telemetry
//   · parser (perf-report.mjs) อ่าน corrId/cache ได้แบบ backward-compatible
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseStart, parseEnd } from '../scripts/perf-report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

// ── brace-matched function extractor (ไม่ copy โค้ด — ดึงตัวจริง) ──
function grabFn(name) {
  const start = GS.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('หาฟังก์ชันไม่เจอ: ' + name);
  let i = GS.indexOf('{', start), depth = 0;
  for (let j = i; j < GS.length; j++) {
    if (GS[j] === '{') depth++;
    else if (GS[j] === '}') { depth--; if (depth === 0) return GS.slice(start, j + 1); }
  }
  throw new Error('brace ไม่ครบ: ' + name);
}
function grabConst(name) {
  const re = new RegExp('var ' + name + '\\s*=\\s*[^;]+;');
  const m = GS.match(re);
  if (!m) throw new Error('หา const ไม่เจอ: ' + name);
  return m[0];
}

// ── mutable cache/props stubs (ให้ test ฉีด failure ได้) ──
function makeCtx(opts) {
  opts = opts || {};
  const store = new Map();
  const cache = {
    get: (k) => { if (opts.cacheGetThrow) throw new Error('cache.get boom'); return store.has(k) ? store.get(k) : null; },
    put: (k, v) => { if (opts.cachePutThrow) throw new Error('cache.put boom'); store.set(k, v); },
    remove: (k) => store.delete(k),
  };
  const ctx = {
    _store: store,
    CacheService: { getScriptCache: () => cache },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => { if (opts.propThrow) throw new Error('prop boom'); return (opts.props || {})[k] || null; },
    }) },
    Logger: { log: () => {} },
    Date: Date, Math: Math, JSON: JSON, String: String, Number: Number, Array: Array,
  };
  // eval constants + functions into ctx
  const src = [
    grabConst('SHEET_PERF_TELEMETRY'), 'var PERF_TEL_SCHEMA_VER=1;',
    grabConst('_PERF_TEL_ON_KEY'), grabConst('_PERF_TEL_BUF_PREFIX'),
    grabConst('_PERF_TEL_SHARDS'), grabConst('_PERF_TEL_SHARD_MAX'), grabConst('_PERF_TEL_MAX_ROWS'),
    'var PERF_TEL_HEADERS_=' + (GS.match(/var PERF_TEL_HEADERS_\s*=\s*(\[[\s\S]*?\]);/)[1]) + ';',
    'var _PERF_REQ=null;',
    grabFn('perfReqBegin_'), grabFn('perfReqEnd_'), grabFn('perfZort_'), grabFn('perfDrive_'),
    grabFn('perfCache_'), grabFn('perfSess_'),
    grabFn('_perfTelShard_'), grabFn('_perfTelOn_'), grabFn('perfTelemetryCapture_'),
    grabFn('perfTelemetryRowsFromRecords_'),
    // expose
    'ctx._perfTelOn_=_perfTelOn_; ctx.perfTelemetryCapture_=perfTelemetryCapture_;',
    'ctx.perfTelemetryRowsFromRecords_=perfTelemetryRowsFromRecords_; ctx._perfTelShard_=_perfTelShard_;',
    'ctx.perfReqBegin_=perfReqBegin_; ctx.perfReqEnd_=perfReqEnd_; ctx.perfZort_=perfZort_;',
    'ctx.perfDrive_=perfDrive_; ctx.perfCache_=perfCache_; ctx.perfSess_=perfSess_;',
    'ctx.getReq=function(){return _PERF_REQ;}; ctx.readBuf=function(){var o=[];for(var s=0;s<_PERF_TEL_SHARDS;s++){var r=ctx.CacheService.getScriptCache().get(_PERF_TEL_BUF_PREFIX+s);if(r)o=o.concat(JSON.parse(r));}return o;};',
    'ctx.HEADERS=PERF_TEL_HEADERS_; ctx.SCHEMA=PERF_TEL_SCHEMA_VER;',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  new Function('ctx', 'CacheService', 'PropertiesService', 'Logger',
    'with(ctx){' + src + '}')(ctx, ctx.CacheService, ctx.PropertiesService, ctx.Logger);
  return ctx;
}

describe('Track B — durable telemetry (fail-open)', () => {
  it('flag OFF (default) → capture ไม่เขียน buffer เลย', () => {
    const c = makeCtx({ props: {} });
    c.perfReqBegin_('doGet', 'payload', '');
    c.perfReqEnd_();
    expect(c.readBuf().length).toBe(0);
  });

  it('flag ON → 1 request = 1 record ใน buffer', () => {
    const c = makeCtx({ props: { PERF_TELEMETRY_ENABLED: 'true' } });
    c.perfReqBegin_('doGet', 'payload', 'cid123');
    c.perfReqEnd_();
    const buf = c.readBuf();
    expect(buf.length).toBe(1);
    expect(buf[0].corrId).toBe('cid123');
    expect(buf[0].kind).toBe('doGet');
  });

  it('summary เก็บ zortMs/driveMs/sessN/cacheKind ครบ', () => {
    const c = makeCtx({ props: { PERF_TELEMETRY_ENABLED: 'true' } });
    c.perfReqBegin_('doPost', 'order', '');
    c.perfZort_('AddOrder', 850, 1, true);
    c.perfZort_('GetOrderDetail', 150, 1, true);
    c.perfDrive_('attPhoto', 400, true);
    c.perfSess_(30);
    c.perfCache_('MISS');
    c.perfReqEnd_();
    const r = c.readBuf()[0];
    expect(r.zortMs).toBe(1000);
    expect(r.driveMs).toBe(400);
    expect(r.sessN).toBe(1);
    expect(r.cacheKind).toBe('MISS');
  });

  // ── FAIL-OPEN (Phase 6): telemetry พังห้ามทำ request พัง ──
  it('cache.put throw → perfReqEnd_ ไม่ throw (business ต่อได้)', () => {
    const c = makeCtx({ props: { PERF_TELEMETRY_ENABLED: 'true' }, cachePutThrow: true });
    c.perfReqBegin_('doGet', 'payload', '');
    expect(() => c.perfReqEnd_()).not.toThrow();
  });
  it('cache.get throw → capture ไม่ throw', () => {
    const c = makeCtx({ props: { PERF_TELEMETRY_ENABLED: 'true' }, cacheGetThrow: true });
    c.perfReqBegin_('doGet', 'payload', '');
    expect(() => c.perfReqEnd_()).not.toThrow();
  });
  it('property read throw → _perfTelOn_ = false (ไม่พัง, ไม่เขียน)', () => {
    const c = makeCtx({ propThrow: true });
    expect(c._perfTelOn_()).toBe(false);
    c.perfReqBegin_('doGet', 'x', '');
    expect(() => c.perfReqEnd_()).not.toThrow();
    expect(c.readBuf().length).toBe(0);
  });
  it('capture(null) ไม่ throw', () => {
    const c = makeCtx({ props: { PERF_TELEMETRY_ENABLED: 'true' } });
    expect(() => c.perfTelemetryCapture_(null, 0)).not.toThrow();
  });

  // ── bounded length (กัน row ระเบิดจาก error/message ยาว) ──
  it('field ยาวเกินถูกตัด (action≤48, corrId≤64, lockSummary≤200)', () => {
    const c = makeCtx({ props: { PERF_TELEMETRY_ENABLED: 'true' } });
    c.perfReqBegin_('doPost', 'A'.repeat(500), 'B'.repeat(500));
    const req = c.getReq();
    for (let i = 0; i < 60; i++) req.lock.push('lockentry' + i);
    c.perfReqEnd_();
    const r = c.readBuf()[0];
    expect(r.action.length).toBeLessThanOrEqual(48);
    expect(r.corrId.length).toBeLessThanOrEqual(64);
    expect(r.lockSummary.length).toBeLessThanOrEqual(200);
  });

  // ── burst / buffer cap ──
  it('burst หลายร้อย request → buffer ไม่โตไม่จำกัด (cap ต่อ shard)', () => {
    const c = makeCtx({ props: { PERF_TELEMETRY_ENABLED: 'true' } });
    for (let i = 0; i < 2000; i++) { c.perfReqBegin_('doGet', 'payload', 'c' + i); c.perfReqEnd_(); }
    const buf = c.readBuf();
    expect(buf.length).toBeLessThanOrEqual(8 * 80);   // _PERF_TEL_SHARDS × _PERF_TEL_SHARD_MAX
  });

  // ── dedup / idempotency (Phase 7) ──
  it('perfTelemetryRowsFromRecords_: id ซ้ำ → 1 แถว · id ต่าง → หลายแถว', () => {
    const c = makeCtx({});
    const dup = [{ id: 'a', ts: 1 }, { id: 'a', ts: 1 }, { id: 'b', ts: 2 }];
    const rows = c.perfTelemetryRowsFromRecords_(dup, 'v1');
    expect(rows.length).toBe(2);
    expect(rows.map(r => r[0]).sort()).toEqual(['a', 'b']);
  });
  it('row มีคอลัมน์ครบตาม header + schemaVer ท้ายสุด + column order คงที่', () => {
    const c = makeCtx({});
    const rows = c.perfTelemetryRowsFromRecords_([{ id: 'a', ts: 5, corrId: 'x', kind: 'doGet',
      action: 'payload', durMs: 100, cacheKind: 'HIT', sessN: 1, sessMs: 20,
      lockSummary: '', zortMs: 0, driveMs: 0 }], 'sha1');
    expect(rows[0].length).toBe(c.HEADERS.length);
    expect(rows[0][0]).toBe('a');                       // id first
    expect(rows[0][c.HEADERS.length - 1]).toBe(c.SCHEMA); // schemaVer last
    expect(rows[0][c.HEADERS.length - 2]).toBe('sha1');   // deployVer
  });
  it('records ที่ไม่มี id ถูกข้าม (ไม่สร้างแถวขยะ)', () => {
    const c = makeCtx({});
    expect(c.perfTelemetryRowsFromRecords_([{ ts: 1 }, null, { id: '', ts: 2 }], '').length).toBe(0);
  });

  // ── PII / data hygiene (Phase 11): record ต้องไม่พก field อ่อนไหว ──
  it('record ประกอบจาก whitelist เท่านั้น — ไม่มี phone/email/token/body', () => {
    const c = makeCtx({ props: { PERF_TELEMETRY_ENABLED: 'true' } });
    const req = c.perfReqBegin_('doPost', 'createSaleBill', 'bill1');
    // จำลองว่ามีคน "เผลอ" ยัด field อ่อนไหวลง _PERF_REQ — ต้องไม่หลุดเข้า record
    req.phone = '0812345678'; req.email = 'a@b.com'; req.sessionToken = 'SECRET'; req.body = '{...}';
    c.perfReqEnd_();
    const r = c.readBuf()[0];
    const keys = Object.keys(r);
    ['phone', 'email', 'sessionToken', 'token', 'body', 'postData', 'authorization'].forEach(k =>
      expect(keys).not.toContain(k));
    expect(JSON.stringify(r)).not.toContain('SECRET');
    expect(JSON.stringify(r)).not.toContain('0812345678');
  });
  it('source: perfTelemetryCapture_ ไม่อ้างถึง field อ่อนไหวใด ๆ', () => {
    const body = grabFn('perfTelemetryCapture_');
    [/\bphone\b/i, /\bemail\b/i, /sessionToken/i, /postData/i, /authorization/i, /\.body\b/].forEach(re =>
      expect(re.test(body)).toBe(false));
  });

  // ── wiring meta ──
  it('perfReqEnd_ เรียก perfTelemetryCapture_ จริง (durable hook ต่ออยู่)', () => {
    expect(grabFn('perfReqEnd_')).toMatch(/perfTelemetryCapture_\(/);
  });
  it('capture ไม่เขียนชีตบน hot path (ไม่มี SpreadsheetApp/getRange/appendRow ใน capture)', () => {
    const body = grabFn('perfTelemetryCapture_');
    expect(/SpreadsheetApp|appendRow|getRange|setValues/.test(body)).toBe(false);
  });
  it('capture ไม่ใช้ getScriptLock/getUserLock/getDocumentLock (ไม่แย่ง business/build lock)', () => {
    const body = grabFn('perfTelemetryCapture_');
    expect(/getScriptLock|getUserLock|getDocumentLock/.test(body)).toBe(false);
  });
});

// ── perf-report.mjs backward-compat (Phase 8) ──
describe('Track B — perf-report parser compat', () => {
  it('parseStart อ่าน corrId (ต่อท้าย) ได้ + ไม่มี corrId = ไม่มี key (เดิมไม่พัง)', () => {
    expect(parseStart('[perfB] START kind=doGet id=z action=payload t=5'))
      .toEqual({ kind: 'doGet', id: 'z', action: 'payload', t: 5 });
    expect(parseStart('[perfB] START kind=doGet id=z action=payload t=5 corrId=cid9'))
      .toEqual({ kind: 'doGet', id: 'z', action: 'payload', t: 5, corrId: 'cid9' });
  });
  it('parseEnd อ่าน cache/corrId (ต่อท้าย) ได้ + ไม่มี = ไม่มี key', () => {
    expect(parseEnd('[perfB] END kind=doGet id=z action=payload durMs=10 sessN=0 sessMs=0'))
      .toEqual({ kind: 'doGet', id: 'z', action: 'payload', durMs: 10, sessN: 0, sessMs: 0 });
    const withx = parseEnd('[perfB] END kind=doGet id=z action=payload durMs=10 sessN=0 sessMs=0 cache=HIT corrId=cid9');
    expect(withx.cacheKind).toBe('HIT');
    expect(withx.corrId).toBe('cid9');
  });
});
