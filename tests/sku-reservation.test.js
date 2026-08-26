// tests/sku-reservation.test.js — Phase 3 · SKU Reservation Service (D05)
// ─────────────────────────────────────────────────────────────────────────────
// eval ฟังก์ชันจริงจาก appsscript_complete.gs (ไม่ copy) + fake Sheet/Lock harness
// คุม: pure core (skuPartsGs_/maxModelForPrefixCore_/composeSku_) + behavioral
//      reserveFormHandler_ (idempotency · L freeze · per-prefix model · concurrency)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

// ── fake Sheet (in-memory) ──
class FakeSheet {
  constructor(headers, rows = []) { this.h = headers.slice(); this.rows = [headers.slice(), ...rows.map(r => r.slice())]; }
  getLastRow() { return this.rows.length; }
  appendRow(r) { const row = r.slice(); while (row.length < this.h.length) row.push(''); this.rows.push(row); }
  getRange(r, c, nr, nc) {
    const self = this;
    if (nr === undefined) { // single cell
      return {
        setNumberFormat() { return this; },
        setValue(v) { self.rows[r - 1][c - 1] = v; return this; },
        getValues() { return [[self.rows[r - 1][c - 1]]]; },
      };
    }
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) { const rr = self.rows[r - 1 + i] || []; out.push(rr.slice(c - 1, c - 1 + nc)); }
        return out;
      },
      setValue() {}, setNumberFormat() { return this; },
    };
  }
}

// ── load registry+reservation block with GAS stubs ──
function load({ session = { staffId: 'S1', role: 'warehouse', status: 'active' }, skus = {}, enabled = true,
                prefixRows = [], familyRows = [], formRows = [] } = {}) {
  const start = SRC.indexOf('// ── D06 · Prefix Registry');
  const block = SRC.slice(start);
  const ret = `; return {
    skuPartsGs_, maxModelForPrefixCore_, composeSku_, reserveFormHandler_,
    formRegListFromRows_, readFormRegistryRows_,
    SHEET_PREFIX_REGISTRY, SHEET_FAMILY_REGISTRY, SHEET_FORM_REGISTRY,
    PREFIX_REG_HEADERS, FAMILY_REG_HEADERS, FORM_REG_HEADERS, FORM_REG_COL
  };`;
  const sheets = {};
  const stubs = {
    // GAS globals used at call time
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => (enabled ? 'true' : 'false') }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { flush() {} },
    Utilities: { formatDate: () => '2026-08-26 10:00' },
    // helpers defined elsewhere in .gs — stub them
    ok: (data) => ({ ok: true, ...data }),
    error: (msg) => ({ error: msg }),
    unauthorized_: () => ({ unauth: true }),
    resolveSession_: () => session,
    isAdminRole_: (r) => r === 'owner' || r === 'dev',
    collectExistingSkus_: () => skus,
    writeAuditLog_() {}, auditDetail_: (x) => JSON.stringify(x), invalidateCache_() {},
    getOrCreateSheet_: (ss, name, headers) => { if (!sheets[name]) sheets[name] = new FakeSheet(headers); return sheets[name]; },
  };
  // eslint-disable-next-line no-new-func
  const api = new Function(...Object.keys(stubs), block + ret)(...Object.values(stubs));
  // seed sheets
  if (prefixRows.length) sheets[api.SHEET_PREFIX_REGISTRY] = new FakeSheet(api.PREFIX_REG_HEADERS, prefixRows);
  if (familyRows.length) sheets[api.SHEET_FAMILY_REGISTRY] = new FakeSheet(api.FAMILY_REG_HEADERS, familyRows);
  sheets[api.SHEET_FORM_REGISTRY] = new FakeSheet(api.FORM_REG_HEADERS, formRows);
  const ss = { getSheetByName: (n) => sheets[n] || null, _sheets: sheets };
  return { api, ss, sheets };
}

// prefix registry row (8 cols): prefix,status,label,...
const pRow = (prefix, status = 'ACTIVE') => [prefix, status, '', '', '', '', '', ''];

describe('D05 SKU reservation — pure cores', () => {
  const { api } = load();

  it('skuPartsGs_: parse [Prefix][Variant2][Model3]', () => {
    expect(api.skuPartsGs_('R01025')).toEqual({ prefix: 'R', variant: '01', model: '025' });
    expect(api.skuPartsGs_('ol19001')).toEqual({ prefix: 'OL', variant: '19', model: '001' });
    expect(api.skuPartsGs_('NAMETAG')).toBe(null);
    expect(api.skuPartsGs_('R1025')).toBe(null);   // ไม่เข้ารูป
  });

  it('composeSku_: ประกอบตาม grammar · pad variant 1 หลัก', () => {
    expect(api.composeSku_('R', '01', '025')).toBe('R01025');
    expect(api.composeSku_('r', '1', '025')).toBe('R01025');   // pad + uppercase
    expect(api.composeSku_('R', '01', '25')).toBe('');         // model ไม่ครบ 3
    expect(api.composeSku_('', '01', '025')).toBe('');
  });

  it('maxModelForPrefixCore_: นับทั้ง legacy SKU + form rows (กัน collision)', () => {
    const skus = ['R01024', 'R10024', 'OL19001', 'NAMETAG'];   // R ถึง model 024
    expect(api.maxModelForPrefixCore_('R', skus, [])).toBe(24);
    // form registry มี R model 030 อยู่แล้ว → ต้องเห็น 30 (มากกว่า legacy)
    const formRows = [[ '', '', '', '', 'R', '030', 'COLOR', 'ACTIVE', '', '', '', '', '', '' ]];
    expect(api.maxModelForPrefixCore_('R', skus, formRows)).toBe(30);
    expect(api.maxModelForPrefixCore_('ZZ', skus, [])).toBe(0);   // prefix ใหม่ = 0 → เลขแรก 001
  });
});

describe('D05 reserveForm — behavioral', () => {
  it('reserve: prefix ACTIVE → สร้าง Form + model = max+1 (per prefix)', () => {
    const { api, ss } = load({ prefixRows: [pRow('R')], skus: { R01024: true, R10024: true } });
    const r = api.reserveFormHandler_(ss, { prefix: 'R', baseName: 'กุหลาบดอกเดี่ยว', axis: 'COLOR', sessionToken: 't' }, 'สมชาย');
    expect(r.ok).toBe(true);
    expect(r.model).toBe('025');           // 024 + 1
    expect(r.prefix).toBe('R');
    expect(r.formId).toBe('FRM00001');
    expect(r.familyId).toBe(null);
  });

  it('🔒 L freeze: prefix "L" reject แม้ถูกใส่ในทะเบียน (ต้องไม่ ACTIVE)', () => {
    // แม้ทะเบียนจะมี L (เป็น FROZEN) — reserve ต้องปฏิเสธ
    const { api, ss } = load({ prefixRows: [pRow('L', 'FROZEN')], skus: {} });
    const r = api.reserveFormHandler_(ss, { prefix: 'L', baseName: 'ลิลลี่', axis: 'NONE', sessionToken: 't' }, 'a');
    expect(r.ok).toBeUndefined();
    expect(r.error).toContain('L');
  });

  it('prefix ไม่อยู่ในทะเบียน → reject (no raw prefix — D11)', () => {
    const { api, ss } = load({ prefixRows: [pRow('R')], skus: {} });
    const r = api.reserveFormHandler_(ss, { prefix: 'ZZ', baseName: 'x', axis: 'NONE', sessionToken: 't' }, 'a');
    expect(r.error).toBeTruthy();
    expect(r.ok).toBeUndefined();
  });

  it('🔁 idempotency: formReqId เดิม → คืน Form เดิม ไม่สร้างซ้ำ', () => {
    const { api, ss } = load({ prefixRows: [pRow('R')], skus: {} });
    const req = { prefix: 'R', baseName: 'กุหลาบ', axis: 'COLOR', formReqId: 'REQ-1', sessionToken: 't' };
    const r1 = api.reserveFormHandler_(ss, req, 'a');
    const r2 = api.reserveFormHandler_(ss, req, 'a');   // ยิงซ้ำ reqId เดิม
    expect(r1.model).toBe('001');
    expect(r2.dedup).toBe(true);
    expect(r2.formId).toBe(r1.formId);
    expect(r2.model).toBe(r1.model);
    // ต้องมี Form แค่ 1 แถว (ไม่สร้างซ้ำ)
    expect(api.readFormRegistryRows_(ss).length).toBe(1);
  });

  it('⚡ concurrency (sequential ในล็อกเดียว): 2 คำขอ prefix เดียว → คนละ model ไม่ชน', () => {
    const { api, ss } = load({ prefixRows: [pRow('R')], skus: { R01005: true } }); // legacy max 005
    const a = api.reserveFormHandler_(ss, { prefix: 'R', baseName: 'A', axis: 'COLOR', formReqId: 'A', sessionToken: 't' }, 'u');
    const b = api.reserveFormHandler_(ss, { prefix: 'R', baseName: 'B', axis: 'COLOR', formReqId: 'B', sessionToken: 't' }, 'u');
    expect(a.model).toBe('006');
    expect(b.model).toBe('007');           // re-read เห็น form A แล้ว → 006+1
    expect(a.formId).not.toBe(b.formId);
  });

  it('family_id: ระบุ family ที่ไม่มีจริง → reject', () => {
    const { api, ss } = load({ prefixRows: [pRow('R')], familyRows: [['FAM00001', 'ไฮเดรนเยีย', 'ACTIVE', '', '', '', '', '']] });
    const bad = api.reserveFormHandler_(ss, { prefix: 'R', baseName: 'x', axis: 'COLOR', familyId: 'FAM99999', sessionToken: 't' }, 'a');
    expect(bad.error).toBeTruthy();
    const good = api.reserveFormHandler_(ss, { prefix: 'R', baseName: 'x', axis: 'COLOR', familyId: 'FAM00001', sessionToken: 't' }, 'a');
    expect(good.ok).toBe(true);
    expect(good.familyId).toBe('FAM00001');
  });

  it('ไม่ล็อกอิน (no session) → reject (ไม่สร้าง Form)', () => {
    const { api, ss } = load({ session: null, prefixRows: [pRow('R')] });
    const r = api.reserveFormHandler_(ss, { prefix: 'R', baseName: 'x', axis: 'NONE' }, 'a');
    expect(r.error).toBeTruthy();
    expect(r.ok).toBeUndefined();
  });

  it('registry ปิดอยู่ → reject (SAFE ROLLOUT)', () => {
    const { api, ss } = load({ enabled: false, prefixRows: [pRow('R')] });
    const r = api.reserveFormHandler_(ss, { prefix: 'R', baseName: 'x', axis: 'NONE', sessionToken: 't' }, 'a');
    expect(r.error).toBeTruthy();
  });
});

describe('Phase B wiring + drift guard', () => {
  it('reserveForm ถูก route ใน doPost + warehouse มีสิทธิ์', () => {
    expect(SRC).toContain("data.action === 'reserveForm'");
    const wh = SRC.match(/warehouse:\s*\[[\s\S]*?\]\.concat/)[0];
    expect(wh).toContain('reserveForm');
  });

  it('skuPartsGs_ regex ตรงกับ parseSkuParts ฝั่ง frontend (grammar เดียวกัน)', () => {
    const gs = SRC.match(/function skuPartsGs_[\s\S]*?\n\}/)[0];
    const jsx = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
    // ทั้งคู่ใช้ ^([A-Z]{1,3})(\d{2})(\d{3})$
    expect(gs).toContain('^([A-Z]{1,3})(\\d{2})(\\d{3})$');
    expect(jsx).toContain('^([A-Z]{1,3})(\\d{2})(\\d{3})$');
  });

  it('reserveFormHandler_ จับ LockService + เช็ค prefix ACTIVE + idempotent formReqId', () => {
    const fn = SRC.match(/function reserveFormHandler_[\s\S]*?\n\}\n/)[0];
    expect(fn).toContain('LockService.getScriptLock');
    expect(fn).toContain("!== 'ACTIVE'");
    expect(fn).toContain('REQID');
    expect(fn).toContain('collectExistingSkus_');   // นับ legacy SKU กัน collision
  });
});
