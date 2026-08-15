// tests/frontstore-clear.test.js — ล้างค่านับหน้าร้านเก่าที่ไม่ตรงกับระบบ
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (ส.ค. 2026): เจ้าของแจ้งว่าหน้า "เช็คหน้าร้าน" ขึ้น "ไม่ตรง 3852 รายการ" — ส่วนใหญ่
// เพราะขายไปหลังนับ ยอดระบบเลื่อน ค่านับเก่าเลยไม่ตรง · ต้องการล้างค่านับเก่าให้กลับเป็น
// "รอเช็ค" เพื่อเริ่มนับใหม่ **โดยไม่แตะจำนวนสต็อกจริง/ZORT**
//
// ⚠️ จุดตายที่เทสต์นี้คุม: ห้ามเผลอไป push ZORT (updateFrontStore ทำ) — Number("")||0 = 0
//    = จะ set สต็อกหน้าร้านจริงเป็น 0 ทั้ง 3 พันตัว · ตัวนี้ต้องแตะแค่ col D (จำนวนนับ) + I (วันที่)
//
// eval `clearFrontStoreChecks` ตัวจริงจาก `.gs` มารันกับชีตจำลอง (ไม่ copy ตรรกะ — เหมือน auth.test.js)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const MAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const F_CLEAR = grab(SRC, /function clearFrontStoreChecks\(ss, skus, actor\) \{[\s\S]*?\n\}/);

// เก็บ side-effect ที่ห้ามเกิด/ต้องเกิด ระหว่าง eval
let audits = [];
let cacheInvalidated = 0;
const stubs = `
  const SHEET_FRONTSTORE_QTY = "จำนวนหน้าร้าน";
  const ok = (o) => ({ ok: true, data: o });
  const error = (m) => ({ ok: false, error: m });
  const auditDetail_ = (o) => JSON.stringify(o);
  const writeAuditLog_ = (actor, action, sku, detail) => { __audits.push({ actor, action, sku, detail }); };
  const invalidateCache_ = () => { __cache.n++; };
  const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  const SpreadsheetApp = { flush: () => {} };
`;
function build() {
  // eslint-disable-next-line no-new-func
  return new Function('__audits', '__cache',
    stubs + F_CLEAR + '\nreturn { clearFrontStoreChecks };')(audits, { get n() { return cacheInvalidated; }, set n(v) { cacheInvalidated = v; } });
}

// ชีตจำลอง: row 1 = header · ข้อมูลเริ่ม row 2 · col B(index1)=sku D(3)=นับ I(8)=วันที่
const W = 11;
function mkRow(sku, checked, date) {
  const r = new Array(W).fill('');
  r[1] = sku; r[3] = checked; r[8] = date;
  return r;
}
function makeSheet(dataRows) {
  const rows = [new Array(W).fill('h'), ...dataRows.map(r => r.slice())];
  return {
    _rows: rows,
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (startRow, startCol, numRows /* , numCols=1 */) => ({
      setValues: (vals) => {
        for (let i = 0; i < numRows; i++) rows[startRow - 1 + i][startCol - 1] = vals[i][0];
      },
    }),
  };
}
function ssWith(sheet) { return { getSheetByName: (n) => (n === 'จำนวนหน้าร้าน' ? sheet : null) }; }

describe('clearFrontStoreChecks — ล้างค่านับเก่า ไม่แตะสต็อก/ZORT', () => {
  it('ล้างเฉพาะ SKU ที่ส่งมาและมีค่านับอยู่ (col D + I → ว่าง)', () => {
    audits = []; cacheInvalidated = 0;
    const { clearFrontStoreChecks } = build();
    const sheet = makeSheet([
      mkRow('AAA001', 5, '01/08/2026 10:00'),  // ขอล้าง + มีค่า → ล้าง
      mkRow('BBB002', 9, '01/08/2026 11:00'),  // ไม่ได้ขอล้าง → คงไว้
      mkRow('CCC003', '', ''),                 // ขอล้างแต่ไม่มีค่า → ไม่ต้องทำอะไร
    ]);
    const res = clearFrontStoreChecks(ssWith(sheet), ['AAA001', 'CCC003'], 'สมชาย (หน้าร้าน)');
    expect(res.ok).toBe(true);
    expect(res.data.cleared).toBe(1);
    // AAA001 ถูกล้าง
    expect(sheet._rows[1][3]).toBe('');
    expect(sheet._rows[1][8]).toBe('');
    // BBB002 (ไม่ได้ขอ) คงค่าเดิมเป๊ะ
    expect(sheet._rows[2][3]).toBe(9);
    expect(sheet._rows[2][8]).toBe('01/08/2026 11:00');
  });

  it('SKU เทียบแบบ trim + ตัวพิมพ์ใหญ่ (client ส่งพิมพ์เล็ก/มีช่องว่างได้)', () => {
    audits = []; cacheInvalidated = 0;
    const { clearFrontStoreChecks } = build();
    const sheet = makeSheet([mkRow('AAA001', 5, 'x')]);
    const res = clearFrontStoreChecks(ssWith(sheet), [' aaa001 '], 'owner');
    expect(res.data.cleared).toBe(1);
    expect(sheet._rows[1][3]).toBe('');
  });

  it('skus ว่าง/ไม่ส่ง → cleared 0 ไม่แตะชีต ไม่ล้าง cache', () => {
    audits = []; cacheInvalidated = 0;
    const { clearFrontStoreChecks } = build();
    const sheet = makeSheet([mkRow('AAA001', 5, 'x')]);
    expect(clearFrontStoreChecks(ssWith(sheet), [], 'owner').data.cleared).toBe(0);
    expect(clearFrontStoreChecks(ssWith(sheet), null, 'owner').data.cleared).toBe(0);
    expect(sheet._rows[1][3]).toBe(5); // คงเดิม
    expect(cacheInvalidated).toBe(0);
  });

  it('มีการล้างจริง → เขียน audit 1 แถวสรุป + ล้าง cache', () => {
    audits = []; cacheInvalidated = 0;
    const { clearFrontStoreChecks } = build();
    const sheet = makeSheet([mkRow('AAA001', 5, 'x'), mkRow('BBB002', 7, 'y')]);
    clearFrontStoreChecks(ssWith(sheet), ['AAA001', 'BBB002'], 'สมหญิง (คลังสินค้า)');
    expect(audits).toHaveLength(1); // สรุปต่อการล้าง ไม่ใช่ 1 แถวต่อ SKU
    expect(audits[0].action).toBe('ล้างค่าเช็คหน้าร้าน');
    expect(cacheInvalidated).toBe(1);
  });

  it('ไม่พบชีต → error', () => {
    audits = []; cacheInvalidated = 0;
    const { clearFrontStoreChecks } = build();
    const res = clearFrontStoreChecks({ getSheetByName: () => null }, ['AAA001'], 'owner');
    expect(res.ok).toBe(false);
  });
});

// ── META: จุดเชื่อมต่อที่พังแล้วเงียบ ──────────────────────────────────────────
describe('clearFrontStoreChecks — จุดเชื่อมต่อ', () => {
  it('.gs: ห้าม push ZORT ในเส้นทางนี้ (ป้องกัน set สต็อกจริงเป็น 0)', () => {
    expect(/pushStockToZort_/.test(F_CLEAR)).toBe(false);
  });
  it('.gs: dispatch ใน doPost + อยู่ใน POST_FLAG_ACTIONS_ + COMMON_ACTIONS_', () => {
    expect(/data\.clearFrontStoreChecks\)\s*\{[\s\S]*?clearFrontStoreChecks\(ss, data\.skus, actor\)/.test(SRC)).toBe(true);
    const flags = grab(SRC, /var POST_FLAG_ACTIONS_ = \[[\s\S]*?\];/);
    expect(flags.includes('"clearFrontStoreChecks"')).toBe(true);
    const common = grab(SRC, /var COMMON_ACTIONS_ = \[[\s\S]*?\];/);
    expect(common.includes('"clearFrontStoreChecks"')).toBe(true);
  });
  it('.gs: action audit "ล้างค่าเช็คหน้าร้าน" มีหมวดใน STAFF_PERF_CATEGORIES_', () => {
    const cats = grab(SRC, /const STAFF_PERF_CATEGORIES_ = \[[\s\S]*?\];/);
    expect(cats.includes('ล้างค่าเช็คหน้าร้าน')).toBe(true);
  });
  it('.jsx: syncClearFrontStoreChecks อ่านคำตอบด้วย dmjJson (บทเรียนข้อ 13) + ส่ง skus', () => {
    const fn = grab(MAIN, /async function syncClearFrontStoreChecks\(skus\) \{[\s\S]*?\n\}/);
    expect(fn.includes('clearFrontStoreChecks: true')).toBe(true);
    expect(fn.includes('dmjJson(res)')).toBe(true);
    expect(fn.includes('skus')).toBe(true);
  });
});
