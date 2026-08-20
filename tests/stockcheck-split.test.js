// tests/stockcheck-split.test.js — คำขอเช็คสต็อกแยกฝั่งหน้าร้าน/คลัง + แจ้งเตือนเจ้าของ/saler
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของแจ้ง (ส.ค. 2026): หน้าร้านนับเสร็จแล้วติ๊ก "เช็คเสร็จ" → คำขอฝั่งคลังที่ยังไม่เสร็จ
// **หายไปทันที** เพราะเดิมคำขอมีสถานะเดียว (status) ปิดใบเดียวจบทั้ง 2 ฝั่ง · ต้องแยกกัน
// และแจ้งเตือนเจ้าของ + saler ว่า "ฝั่งไหนเช็คเสร็จแล้ว"
//
// เทสต์ eval ฟังก์ชันจริงจาก `.gs` มารันกับชีต/ของจำลอง (ไม่ copy ตรรกะ — เหมือน auth.test.js)
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const VMAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const COLS     = grab(/const SHEET_STOCK_CHECK = "[^"]*";/) + '\n'
               + grab(/var STOCK_CHECK_HEADERS_ = \[[\s\S]*?\];/) + '\n'
               + grab(/var COL_CHK_FS_STATUS = 9[\s\S]*?COL_CHK_SUPPLIERS = 15;/);
const F_READ    = grab(/function readStockCheckRequests_\(\) \{[\s\S]*?\n\}/);
const F_DONE    = grab(/function completeStockCheckRequest_\(reqId, actor, side, roleHint\) \{[\s\S]*?\n\}/);
const F_SUM     = grab(/function stockCheckCountSummary_\(ss, row\) \{[\s\S]*?\n\}/);
const F_PREVIEW = grab(/function stockCheckPreviewText_\(suppliers, names\) \{[\s\S]*?\n\}/);
const F_GETSHEET = grab(/function getOrCreateStockCheckSheet_\(ss\) \{[\s\S]*?\n\}/);
const F_CREATE  = grab(/function createStockCheckRequest_\(skus, names, actor, suppliers\) \{[\s\S]*?\n\}/);
const C_PROD   = grab(/const SHEET_PRODUCTS  = "[^"]*";/) + '\n'
               + grab(/const COL_PROD_SKU    = 2;/) + '\n'
               + grab(/const COL_PROD_QTYWH  = 8;/);

// ชีตจำลอง — rows[0] = header, ข้อมูลเริ่ม rows[1] · เก็บ setValue เพื่อตรวจว่าเขียนคอลัมน์ไหน
// + appendRow (ให้ createStockCheckRequest_ เขียนแถวใหม่ได้)
function makeSheet(rows) {
  return {
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    getLastColumn: () => Math.max(...rows.map((r) => r.length)),
    getRange: (r, c) => ({
      setValue: (v) => { while (rows[r - 1].length < c) rows[r - 1].push(''); rows[r - 1][c - 1] = v; },
      setValues: (vals) => { rows[r - 1] = vals[0].slice(); },
    }),
    appendRow: (vals) => { rows.push(vals.slice()); },
    _rows: rows,
  };
}

let currentSheet;
let notis;
let lineMsgs;

function buildEnv() {
  notis = [];
  lineMsgs = [];
  const globals = {
    SHEET_ID: 'x',
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => currentSheet }) },
    Utilities: { formatDate: () => '2026-08-15 10:00' },
    ContentService: {
      createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }),
      MimeType: { JSON: 'json' },
    },
    pushInappNoti_: (o) => { notis.push(o); },
    invalidateCache_: () => {},
    sendLineGroup_: (msg) => { lineMsgs.push(msg); },
  };
  const names = Object.keys(globals);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names,
    COLS + '\n' + F_PREVIEW + '\n' + F_GETSHEET + '\n' + F_CREATE + '\n' + F_READ + '\n' + F_DONE +
    '\nreturn { readStockCheckRequests_, completeStockCheckRequest_, createStockCheckRequest_, stockCheckPreviewText_ };');
  return factory(...names.map((n) => globals[n]));
}

const HEADER = ['reqId','timestamp','requester','skuList','nameList','status','completedBy','completedAt',
  'fsStatus','fsBy','fsAt','whStatus','whBy','whAt','supplierList'];

// แถวเต็ม 14 คอลัมน์ (ก่อนมีคอลัมน์ 15 supplierList) — ยังต้องอ่านได้ปกติ (migration-safe)
function row14(reqId, status, fs, wh) {
  return [reqId, '2026-08-01 09:00', 'owner', '["A1","A2"]', '["ของ A","ของ B"]',
    status, '', '', fs, '', '', wh, '', ''];
}
// แถวเต็ม 15 คอลัมน์ (มี supplierList) — ของจริงหลัง ส.ค. 2026
function row15(reqId, status, fs, wh, suppliers) {
  return [reqId, '2026-08-01 09:00', 'owner', '["A1","A2"]', '["ของ A","ของ B"]',
    status, '', '', fs, '', '', wh, '', '', JSON.stringify(suppliers || [])];
}
// แถวเก่า 8 คอลัมน์ (ยังไม่มี fs/wh/supplierList) — ทดสอบ migration
function row8(reqId, status) {
  return [reqId, '2026-08-01 09:00', 'owner', '["A1"]', '["ของ A"]', status, '', ''];
}

describe('readStockCheckRequests_ — อ่านสถานะ 2 ฝั่ง + migration', () => {
  it('แถวใหม่ 14 คอลัมน์: อ่าน fsStatus/whStatus ตรงตามที่เขียน', () => {
    currentSheet = makeSheet([HEADER, row14('CHK-001', 'pending', 'done', 'pending')]);
    const { readStockCheckRequests_ } = buildEnv();
    const r = readStockCheckRequests_()[0];
    expect(r.fsStatus).toBe('done');
    expect(r.whStatus).toBe('pending');
  });

  it('แถวเก่า status=pending → ทั้ง 2 ฝั่ง pending', () => {
    currentSheet = makeSheet([HEADER, row8('CHK-OLD', 'pending')]);
    const { readStockCheckRequests_ } = buildEnv();
    const r = readStockCheckRequests_()[0];
    expect(r.fsStatus).toBe('pending');
    expect(r.whStatus).toBe('pending');
  });

  it('แถวเก่า status=done → ทั้ง 2 ฝั่ง done (คำขอที่ปิดไปแล้วก่อนอัปเดต)', () => {
    currentSheet = makeSheet([HEADER, row8('CHK-DONE', 'done')]);
    const { readStockCheckRequests_ } = buildEnv();
    const r = readStockCheckRequests_()[0];
    expect(r.fsStatus).toBe('done');
    expect(r.whStatus).toBe('done');
  });

  it('แถว 15 คอลัมน์: อ่าน suppliers ตามที่เขียน', () => {
    currentSheet = makeSheet([HEADER, row15('CHK-001', 'pending', 'pending', 'pending', ['GX2312', 'ACME'])]);
    const { readStockCheckRequests_ } = buildEnv();
    const r = readStockCheckRequests_()[0];
    expect(r.suppliers).toEqual(['GX2312', 'ACME']);
  });

  it('แถว 14 คอลัมน์ (ก่อนมี supplierList) → suppliers เป็น [] (migration-safe ไม่พัง)', () => {
    currentSheet = makeSheet([HEADER, row14('CHK-OLD2', 'pending', 'pending', 'pending')]);
    const { readStockCheckRequests_ } = buildEnv();
    const r = readStockCheckRequests_()[0];
    expect(r.suppliers).toEqual([]);
  });
});

describe('completeStockCheckRequest_ — ปิดทีละฝั่ง ไม่กระทบอีกฝั่ง', () => {
  let env;
  beforeEach(() => {
    currentSheet = makeSheet([HEADER, row14('CHK-001', 'pending', 'pending', 'pending')]);
    env = buildEnv();
  });

  it('หน้าร้าน (fs) ปิด → fs=done · wh ยัง pending · สถานะรวมยัง pending', () => {
    const res = env.completeStockCheckRequest_('CHK-001', 'นายเอ (หน้าร้าน)', 'fs');
    expect(res.success).toBe(true);
    const r = env.readStockCheckRequests_()[0];
    expect(r.fsStatus).toBe('done');
    expect(r.whStatus).toBe('pending');   // ⭐ คลังต้องยังค้าง ไม่หายไป
    expect(r.status).toBe('pending');
  });

  it('คลัง (wh) ปิดต่อ → ครบ 2 ฝั่ง → สถานะรวม done', () => {
    env.completeStockCheckRequest_('CHK-001', 'นายเอ (หน้าร้าน)', 'fs');
    const res = env.completeStockCheckRequest_('CHK-001', 'นายบี (คลัง)', 'wh');
    expect(res.fsDone).toBe(true);
    expect(res.whDone).toBe(true);
    const r = env.readStockCheckRequests_()[0];
    expect(r.status).toBe('done');
  });

  it('reqId ไม่มี → success:false', () => {
    const res = env.completeStockCheckRequest_('CHK-999', 'x', 'fs');
    expect(res.success).toBe(false);
  });
});

describe('แจ้งเตือนเจ้าของ + saler ว่าฝั่งไหนเช็คเสร็จ', () => {
  beforeEach(() => {
    currentSheet = makeSheet([HEADER, row14('CHK-001', 'pending', 'pending', 'pending')]);
  });

  it('ปิดฝั่งหน้าร้าน → ยิงกระดิ่งหา owner+saler+storedevice บอก "หน้าร้าน" + "รอคลังเช็ค"', () => {
    const env = buildEnv();
    env.completeStockCheckRequest_('CHK-001', 'นายเอ (หน้าร้าน)', 'fs');
    expect(notis.length).toBe(1);
    const n = notis[0];
    expect(n.audience).toBe('role:owner,saler,storedevice');
    expect(n.title).toContain('หน้าร้าน');
    expect(n.body).toContain('รอคลังเช็ค');
    expect(n.dedupKey).toBe('stockcheck-done-fs-CHK-001');
  });

  it('ปิดฝั่งคลังเป็นฝั่งที่ 2 → บอก "ครบทั้ง 2 ฝั่งแล้ว"', () => {
    const env = buildEnv();
    env.completeStockCheckRequest_('CHK-001', 'นายเอ (หน้าร้าน)', 'fs');
    env.completeStockCheckRequest_('CHK-001', 'นายบี (คลัง)', 'wh');
    const last = notis[notis.length - 1];
    expect(last.title).toContain('คลัง');
    expect(last.body).toContain('ครบทั้ง 2 ฝั่ง');
  });

  it('คำขอมี supplierList (row15) → เนื้อความแจ้งเตือนเป็นรหัสร้าน ไม่ใช่ชื่อสินค้า', () => {
    currentSheet = makeSheet([HEADER, row15('CHK-002', 'pending', 'pending', 'pending', ['GX2312'])]);
    const env = buildEnv();
    env.completeStockCheckRequest_('CHK-002', 'นายเอ (หน้าร้าน)', 'fs');
    expect(notis[0].body).toContain('GX2312');
    expect(notis[0].body).not.toContain('ของ A');
  });

  it('side ว่าง + roleHint=frontstore (client เก่า/ยังไม่ล็อกอิน) → ปิดเฉพาะ fs ไม่แตะ wh', () => {
    const env = buildEnv();
    const res = env.completeStockCheckRequest_('CHK-001', 'x', '', 'frontstore');
    expect(res.success).toBe(true);
    expect(res.fsDone).toBe(true);
    expect(res.whDone).toBe(false);
    const r = env.readStockCheckRequests_()[0];
    expect(r.fsStatus).toBe('done');
    expect(r.whStatus).toBe('pending');  // ⭐ คลังต้องยังค้าง — บั๊กที่เจ้าของแจ้ง
    // เดา side ได้แล้ว → ยิงกระดิ่งบอก "หน้าร้าน" ตามปกติ
    expect(notis.length).toBe(1);
    expect(notis[0].title).toContain('หน้าร้าน');
  });

  it('side ว่าง + roleHint=warehouse → ปิดเฉพาะ wh ไม่แตะ fs', () => {
    const env = buildEnv();
    const res = env.completeStockCheckRequest_('CHK-001', 'x', '', 'warehouse');
    expect(res.success).toBe(true);
    const r = env.readStockCheckRequests_()[0];
    expect(r.whStatus).toBe('done');
    expect(r.fsStatus).toBe('pending');
  });

  it('side ว่าง + เดา role ไม่ได้ (owner/ชื่อ session) → fail-safe: ไม่ปิดทั้งใบ ไม่ทำข้อมูลหาย', () => {
    const env = buildEnv();
    const res = env.completeStockCheckRequest_('CHK-001', 'สมชาย (เจ้าของร้าน)', '', 'owner');
    expect(res.success).toBe(false);     // ตอบให้รีเฟรชแทนการเดา
    const r = env.readStockCheckRequests_()[0];
    expect(r.fsStatus).toBe('pending');  // ⭐ ทั้ง 2 ฝั่งต้องยังค้าง — ห้ามปิดทั้งใบ
    expect(r.whStatus).toBe('pending');
    expect(notis.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// รหัสร้านค้า (supplier) แทนรายชื่อสินค้าในแจ้งเตือน (เจ้าของสั่ง ส.ค. 2026)
// ─────────────────────────────────────────────────────────────────────────────
describe('stockCheckPreviewText_ — โชว์รหัสร้านแทนรายชื่อสินค้า', () => {
  let fn;
  beforeEach(() => { fn = buildEnv().stockCheckPreviewText_; });

  it('มี supplier → โชว์รหัสร้าน ไม่ใช่ชื่อสินค้า', () => {
    const out = fn(['GX2312'], ['เพิ่ม 78', 'เพิ่ม 68']);
    expect(out).toBe('🏭 GX2312');
    expect(out).not.toContain('เพิ่ม');
  });

  it('หลายร้าน → คั่นด้วย ", " เกิน 3 ร้าน → "และอีก N ร้าน"', () => {
    const out = fn(['A', 'B', 'C', 'D', 'E'], []);
    expect(out).toBe('🏭 A, B, C และอีก 2 ร้าน');
  });

  it('ไม่มี supplier (คำขอเก่าก่อน ส.ค. 2026) → ถอยไปใช้รายชื่อสินค้าแบบเดิม', () => {
    const out = fn([], ['เพิ่ม 78', 'เพิ่ม 68', 'เพิ่ม 68', 'X']);
    expect(out).toBe('เพิ่ม 78, เพิ่ม 68, เพิ่ม 68 และอีก 1 รายการ');
    expect(out).not.toContain('🏭');
  });

  it('suppliers เป็น undefined/null ไม่พัง → fallback ชื่อสินค้า', () => {
    expect(fn(undefined, ['A'])).toBe('A');
    expect(fn(null, [])).toBe('');
  });
});

describe('createStockCheckRequest_ — เขียน supplierList + แจ้งเตือนใช้รหัสร้าน', () => {
  it('เขียนคอลัมน์ 15 (supplierList) เป็น JSON ของ suppliers ที่ส่งมา', () => {
    currentSheet = makeSheet([HEADER]);
    const env = buildEnv();
    env.createStockCheckRequest_(['A1', 'A2'], ['ของ A', 'ของ B'], 'owner', ['GX2312', 'ACME']);
    const written = currentSheet._rows[1];
    expect(JSON.parse(written[14])).toEqual(['GX2312', 'ACME']);
  });

  it('แจ้งเตือนในแอป (fs+wh) ใช้รหัสร้านในเนื้อความ ไม่ใช่ชื่อสินค้า', () => {
    currentSheet = makeSheet([HEADER]);
    const env = buildEnv();
    env.createStockCheckRequest_(['A1'], ['เพิ่ม 78'], 'owner', ['GX2312']);
    expect(notis.length).toBe(2); // fs + wh
    notis.forEach((n) => {
      expect(n.body).toContain('GX2312');
      expect(n.body).not.toContain('เพิ่ม 78');
    });
  });

  it('LINE message ก็ใช้รหัสร้านเดียวกัน (best-effort — ไม่ throw ถ้า sendLineGroup_ ล้ม)', () => {
    currentSheet = makeSheet([HEADER]);
    const env = buildEnv();
    env.createStockCheckRequest_(['A1'], ['เพิ่ม 78'], 'owner', ['GX2312']);
    expect(lineMsgs.length).toBe(1);
    expect(lineMsgs[0]).toContain('GX2312');
  });

  it('ไม่ส่ง suppliers (client เก่า/ไม่เลือกร้าน) → ยังทำงานได้ ถอยไปใช้ชื่อสินค้า', () => {
    currentSheet = makeSheet([HEADER]);
    const env = buildEnv();
    env.createStockCheckRequest_(['A1'], ['เพิ่ม 78'], 'owner', undefined);
    expect(notis[0].body).toContain('เพิ่ม 78');
    const written = currentSheet._rows[1];
    expect(JSON.parse(written[14])).toEqual([]);
  });
});

describe('จุดเชื่อมต่อในโค้ดจริง (พังแล้วเงียบ)', () => {
  it('payload filter ส่งคำขอที่ยังมีฝั่งใดค้าง (ไม่ใช่ status==="pending" เดิม)', () => {
    expect(SRC).toContain('r.fsStatus !== "done" || r.whStatus !== "done"');
  });
  it('dispatch ส่ง data.side + roleHint (เดา side เมื่อ client เก่าไม่ส่ง side)', () => {
    expect(SRC).toContain('completeStockCheckRequest_(data.reqId, actor, data.side, (_sess && _sess.role) || data.actor)');
  });
  it('completeStockCheckRequest_ ไม่มีเส้นทาง "ปิดทั้งใบ" เมื่อ side ว่างอีกต่อไป (fail-safe)', () => {
    // เดา side ไม่ได้ → return error ไม่เขียนอะไร · กัน regression กลับไปปิดทั้งใบ
    expect(F_DONE).toMatch(/if \(!side\) \{[\s\S]*?success: false/);
    expect(F_DONE).not.toContain('ปิดทั้งใบ (client เก่า)');
  });
  it('frontend กรอง myPendingChecks ตาม role (fs/wh) แยกกัน', () => {
    expect(APP).toContain('r.fsStatus !== "done"');
    expect(APP).toContain('r.whStatus !== "done"');
  });
  it('frontend ส่ง side ตรงตามแท็บ (stockcount→wh, frontstore→fs)', () => {
    expect(APP).toContain("side:'wh'");
    expect(APP).toContain("side:'fs'");
  });
  it('แบนเนอร์ใช้ myPendingChecks ไม่ใช่ pendingChecks ตรง ๆ', () => {
    expect(APP).toContain('myPendingChecks.length > 0');
    expect(APP).toContain('setActiveCheckRequest(myPendingChecks[0])');
  });
  it('dispatch ส่ง data.suppliers เข้า createStockCheckRequest_ (ไม่งั้นแจ้งเตือนไม่มีรหัสร้านให้ใช้)', () => {
    expect(SRC).toContain('createStockCheckRequest_(data.skus, data.names, actor, data.suppliers)');
  });
  it('ฝั่งที่ส่งคำขอ (views-main.jsx) ส่ง suppliers จริง ไม่ใช่แค่ skus/names', () => {
    expect(VMAIN).toContain('suppliers: Array.from(checkSuppliers)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// พอครบ 2 ฝั่ง → ส่ง "จำนวนที่นับได้จริง" (ร้าน/คลัง ต่อ SKU) ให้เจ้าของเห็นในกระดิ่ง
// (เจ้าของสั่ง ส.ค. 2026: "พอ 2 ฝั่งกดเสร็จ ส่งเลขจำนวนจริงให้เจ้าของเห็น")
// ─────────────────────────────────────────────────────────────────────────────
describe('stockCheckCountSummary_ — สรุปเลขที่นับได้จริง (ร้าน/คลัง)', () => {
  // product sheet จำลอง: idx1=SKU (COL_PROD_SKU=2) · idx6=หน้าร้าน(G) · idx7=คลัง(H, COL_PROD_QTYWH=8)
  function prodSheet(rows) {
    return { getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }) };
  }
  // แถวสินค้า: [A, SKU, C, D, E, F, store(G), wh(H)]
  function prow(sku, store, wh) { return ['', sku, '', '', '', '', store, wh]; }

  function buildSumEnv(productRows) {
    const psheet = prodSheet([['id','sku','name','d','e','f','store','wh'], ...productRows]);
    // ss.getSheetByName(SHEET_PRODUCTS) → product sheet จำลอง
    const ss = { getSheetByName: () => psheet };
    // C_PROD ประกาศ SHEET_PRODUCTS/COL_PROD_SKU/COL_PROD_QTYWH เอง — ห้ามส่งเป็น param ซ้ำ
    // eslint-disable-next-line no-new-func
    const factory = new Function(C_PROD + '\n' + F_SUM + '\nreturn { stockCheckCountSummary_ };');
    const mod = factory();
    return { fn: mod.stockCheckCountSummary_, ss };
  }
  it('คืน "SKU ร้านX/คลังY" ต่อ SKU ตามลำดับในคำขอ', () => {
    const { fn, ss } = buildSumEnv([prow('A1', 12, 130), prow('A2', 8, 63)]);
    const row = ['CHK-1', 't', 'owner', JSON.stringify(['A1', 'A2']), '[]'];
    const out = fn(ss, row);
    expect(out).toContain('A1 ร้าน12/คลัง130');
    expect(out).toContain('A2 ร้าน8/คลัง63');
    expect(out).toContain(' · ');
  });

  it('เทียบ SKU แบบ uppercase/trim (ชีตสินค้าเก็บตัวเล็ก/มีช่องว่างได้)', () => {
    const { fn, ss } = buildSumEnv([prow('a1', 5, 7)]);
    const out = fn(ss, ['CHK-1', 't', 'o', JSON.stringify([' A1 ']), '[]']);
    expect(out).toContain('A1 ร้าน5/คลัง7');
  });

  it('เกิน 6 SKU → โชว์ 6 ตัวแรก + "และอีก N รายการ"', () => {
    const rows = [];
    const skus = [];
    for (let i = 1; i <= 9; i++) { rows.push(prow('S' + i, i, i * 10)); skus.push('S' + i); }
    const { fn, ss } = buildSumEnv(rows);
    const out = fn(ss, ['CHK-1', 't', 'o', JSON.stringify(skus), '[]']);
    expect(out).toContain('S1 ร้าน1/คลัง10');
    expect(out).toContain('S6 ร้าน6/คลัง60');
    expect(out).not.toContain('S7 ร้าน');   // ตัวที่ 7 เป็นต้นไปถูกยุบ
    expect(out).toContain('และอีก 3 รายการ');
  });

  it('SKU ในคำขอที่ไม่มีในชีตสินค้า → ข้าม ไม่พัง', () => {
    const { fn, ss } = buildSumEnv([prow('A1', 1, 2)]);
    const out = fn(ss, ['CHK-1', 't', 'o', JSON.stringify(['A1', 'GHOST']), '[]']);
    expect(out).toContain('A1 ร้าน1/คลัง2');
    expect(out).not.toContain('GHOST');
  });

  it('skuList ว่าง/พังพาร์ส → คืน "" (best-effort ไม่ throw)', () => {
    const { fn, ss } = buildSumEnv([prow('A1', 1, 2)]);
    expect(fn(ss, ['CHK-1', 't', 'o', '[]', '[]'])).toBe('');
    expect(fn(ss, ['CHK-1', 't', 'o', 'not-json', '[]'])).toBe('');
  });
});

describe('จุดเชื่อมต่อ: noti ครบ 2 ฝั่งแนบเลขที่นับได้', () => {
  it('completeStockCheckRequest_ เรียก stockCheckCountSummary_ เฉพาะตอนครบ 2 ฝั่ง แล้วแนบใน body', () => {
    expect(F_DONE).toContain('stockCheckCountSummary_(ss, r)');
    expect(F_DONE).toContain('bothDone && typeof stockCheckCountSummary_');
    expect(F_DONE).toContain('📊 นับได้: ');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 📋 ติดตามความคืบหน้าคำขอเช็คสต็อก (TrackingView) — owner/dev/saler
// เจ้าของสั่ง (ส.ค. 2026): กดให้เช็คแล้วต้องรู้ "ตอนนี้เช็คถึงไหนแล้ว" ไม่ใช่แค่รู้ว่าส่งคำขอไปแล้ว
// ─────────────────────────────────────────────────────────────────────────────
function grabVana(re) {
  const m = VANA.match(re);
  if (!m) throw new Error('หาโค้ดใน views-analytics.jsx ไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}
const F_PARSETS  = grabVana(/function parseStockCheckTsMs\(s\) \{[\s\S]*?\n\}/);
const F_SIDEPROG = grabVana(/function stockCheckSideProgress\(skusSorted, reqTsMs, checkedAtMap, done\) \{[\s\S]*?\n\}/);
// ตัดเอาเฉพาะตัว view ทั้งฟังก์ชัน (ถึง top-level function ตัวถัดไป) — เหมือน grabFn ใน
// stockcheck-instant-patch.test.js · ห้ามใช้ regex จับคู่วงเล็บปีกกาเอง เพราะ TrackingView
// ยาวหลายร้อยบรรทัดมี "}\n\n" ซ้อนอยู่ข้างในหลายจุด (arrow function/uM/JSX) จะตัดสั้นเกินไป
function grabView(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('หา view ในต้นทางไม่เจอ: ' + name);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}
const TRACKING_VIEW = grabView(VANA, 'TrackingView');

function loadTrackHelpers() {
  // eslint-disable-next-line no-new-func
  const factory = new Function(F_PARSETS + '\n' + F_SIDEPROG +
    '\nreturn { parseStockCheckTsMs, stockCheckSideProgress };');
  return factory();
}

describe('parseStockCheckTsMs — parse "yyyy-MM-dd HH:mm" ของ req.timestamp (คนละรูปแบบกับ parseCheckDateMs)', () => {
  const { parseStockCheckTsMs } = loadTrackHelpers();
  it('parse ปีค.ศ. ปกติได้ตรง (ไม่ใช่ new Date() ดิบ ที่ตีความ local/UTC ไม่แน่นอน)', () => {
    const ms = parseStockCheckTsMs('2026-08-14 10:30');
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // สิงหาคม = index 7
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(30);
  });
  it('รูปแบบผิด/ว่าง → NaN ไม่พัง', () => {
    expect(Number.isNaN(parseStockCheckTsMs(''))).toBe(true);
    expect(Number.isNaN(parseStockCheckTsMs('14/8/2569 10:30'))).toBe(true); // คนละรูปแบบ (นี่คือของ parseCheckDateMs)
  });
});

describe('stockCheckSideProgress — นับเช็คแล้ว/ทั้งหมด + SKU ถัดไป', () => {
  const { parseStockCheckTsMs, stockCheckSideProgress } = loadTrackHelpers();
  const reqTs = parseStockCheckTsMs('2026-08-14 10:00');

  it('done=true → checked เท่า total เสมอ ไม่สนใจ checkedAtMap (ปิดฝั่งแล้วถือว่าครบ)', () => {
    const r = stockCheckSideProgress(['A1', 'A2'], reqTs, {}, true);
    expect(r).toEqual({ checked: 2, total: 2, next: null });
  });

  it('SKU ที่เช็คหลังยิงคำขอ (at >= reqTs) → นับว่าเช็คแล้ว', () => {
    const after = parseStockCheckTsMs('2026-08-14 11:00');
    const r = stockCheckSideProgress(['A1', 'A2'], reqTs, { A1: after }, false);
    expect(r.checked).toBe(1);
    expect(r.next).toBe('A2'); // ตัวถัดไปตามลำดับที่ยังไม่เช็ค
  });

  it('SKU ที่เช็คก่อนยิงคำขอ (ของเก่า) → ไม่นับว่าเช็คแล้วสำหรับคำขอนี้', () => {
    const before = parseStockCheckTsMs('2026-08-14 09:00');
    const r = stockCheckSideProgress(['A1'], reqTs, { A1: before }, false);
    expect(r.checked).toBe(0);
    expect(r.next).toBe('A1');
  });

  it('ยังไม่เช็คสักตัว → next = ตัวแรกตามลำดับที่ส่งมา', () => {
    const r = stockCheckSideProgress(['B1', 'A1'], reqTs, {}, false);
    expect(r.checked).toBe(0);
    expect(r.next).toBe('B1');
  });

  it('เช็คครบทุกตัวแล้วแต่ยังไม่กดปิดฝั่ง (done=false) → next เป็น null', () => {
    const after = parseStockCheckTsMs('2026-08-14 11:00');
    const r = stockCheckSideProgress(['A1', 'A2'], reqTs, { A1: after, A2: after }, false);
    expect(r.checked).toBe(2);
    expect(r.next).toBeNull();
  });
});

describe('การเรียง SKU ก่อนหา "ถัดไป" — ต้องเรียงจริง ไม่ใช่แค่เรียกฟังก์ชันเฉย ๆ', () => {
  const F_CMP = VMAIN.match(/function compareSku\(a, b\) \{[\s\S]*?\n\}/)[0];
  it('ห่อ string เป็น {sku} ก่อนเทียบ → เรียงลำดับได้ถูกจริง (regression: ส่ง string ดิบจะไม่เรียงเลย)', () => {
    // eslint-disable-next-line no-new-func
    const { compareSku } = new Function(F_CMP + '\nreturn { compareSku };')();
    const skus = ['B1025', 'A1025', 'A1003'];
    const sorted = skus.slice().sort((a, b) => compareSku({ sku: a }, { sku: b }));
    expect(sorted).toEqual(['A1003', 'A1025', 'B1025']);
    // ยืนยันว่าถ้าไม่ห่อ (ส่ง string ตรง ๆ) จะไม่ได้เรียงอะไรเลย — คือบั๊กที่กันไว้
    const unsorted = skus.slice().sort(compareSku);
    expect(unsorted).toEqual(skus); // เท่าเดิมเป๊ะ เพราะ a.sku undefined ทั้งคู่ตลอด
  });
});

describe('จุดเชื่อมต่อ TrackingView (พังแล้วเงียบ)', () => {
  it('ส่วนติดตามความคืบหน้ากันเฉพาะ owner/saler (ไม่ใช่ทุก role เห็น)', () => {
    expect(TRACKING_VIEW).toMatch(/const isCheckTracker = role === "owner" \|\| role === "saler";/);
  });
  it('ใช้ data.stockCheckRequests ตัวเดียวกับที่ทำแบนเนอร์ของหน้าร้าน/คลัง (ไม่ยิง endpoint ใหม่)', () => {
    expect(TRACKING_VIEW).toContain('data.stockCheckRequests');
  });
  it('ฝั่งหน้าร้านใช้ frontStoreCheckedAt + parseCheckDateMs (รองรับ พ.ศ.) ไม่ใช่ new Date() ดิบ', () => {
    expect(TRACKING_VIEW).toContain('parseCheckDateMs(p.frontStoreCheckedAt)');
  });
  it('ฝั่งคลังอ่านจาก storage.verifiedLockMap (ก้อนเดียวกับที่ StockCountView ใช้ทำคิว "ควรนับก่อน")', () => {
    expect(TRACKING_VIEW).toContain('data.storage && data.storage.verifiedLockMap');
    expect(TRACKING_VIEW).toContain('parseCheckDateMs(e.lastCheck)');
  });
  it('เรียง SKU ด้วย compareSku ก่อนหา "ถัดไป" (ลำดับเดียวกับที่ขึ้นจอตอนนับจริง)', () => {
    // ⚠️ compareSku(a,b) รับ object ที่มี .sku ไม่ใช่ string ดิบ — req.skus เป็น string[] ล้วน
    // ต้องห่อเป็น {sku:a} ก่อนเทียบเสมอ ไม่งั้น a.sku===undefined ทั้งคู่ = ไม่ได้เรียงจริง (เงียบสนิท)
    expect(TRACKING_VIEW).toContain('compareSku({ sku: a }, { sku: b })');
    expect(TRACKING_VIEW).not.toContain('.sort(compareSku)'); // ส่ง string ตรง ๆ ให้ compareSku = บั๊ก
  });
  it('⚠️ ป้าย "ถัดไป" ต้องกำกับว่าเป็นการประมาณ ไม่ใช่ตำแหน่งจริงของคนนับ (ห้ามพูดเหมือนรู้แน่ชัด)', () => {
    expect(TRACKING_VIEW).toMatch(/ถัดไป.*ไม่ใช่ตำแหน่งจริงของคนนับ|ประมาณ/);
  });
});
