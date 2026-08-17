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

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const COLS     = grab(/const SHEET_STOCK_CHECK = "[^"]*";/) + '\n'
               + grab(/var STOCK_CHECK_HEADERS_ = \[[\s\S]*?\];/) + '\n'
               + grab(/var COL_CHK_FS_STATUS = 9[\s\S]*?COL_CHK_WH_AT = 14;/);
const F_READ   = grab(/function readStockCheckRequests_\(\) \{[\s\S]*?\n\}/);
const F_DONE   = grab(/function completeStockCheckRequest_\(reqId, actor, side, roleHint\) \{[\s\S]*?\n\}/);
const F_SUM    = grab(/function stockCheckCountSummary_\(ss, row\) \{[\s\S]*?\n\}/);
const C_PROD   = grab(/const SHEET_PRODUCTS  = "[^"]*";/) + '\n'
               + grab(/const COL_PROD_SKU    = 2;/) + '\n'
               + grab(/const COL_PROD_QTYWH  = 8;/);

// ชีตจำลอง — rows[0] = header, ข้อมูลเริ่ม rows[1] · เก็บ setValue เพื่อตรวจว่าเขียนคอลัมน์ไหน
function makeSheet(rows) {
  return {
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    getLastColumn: () => Math.max(...rows.map((r) => r.length)),
    getRange: (r, c) => ({
      setValue: (v) => { while (rows[r - 1].length < c) rows[r - 1].push(''); rows[r - 1][c - 1] = v; },
      setValues: (vals) => { rows[r - 1] = vals[0].slice(); },
    }),
    _rows: rows,
  };
}

let currentSheet;
let notis;

function buildEnv() {
  notis = [];
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
  };
  const names = Object.keys(globals);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names,
    COLS + '\n' + F_READ + '\n' + F_DONE +
    '\nreturn { readStockCheckRequests_, completeStockCheckRequest_ };');
  return factory(...names.map((n) => globals[n]));
}

const HEADER = ['reqId','timestamp','requester','skuList','nameList','status','completedBy','completedAt',
  'fsStatus','fsBy','fsAt','whStatus','whBy','whAt'];

// แถวเต็ม 14 คอลัมน์
function row14(reqId, status, fs, wh) {
  return [reqId, '2026-08-01 09:00', 'owner', '["A1","A2"]', '["ของ A","ของ B"]',
    status, '', '', fs, '', '', wh, '', ''];
}
// แถวเก่า 8 คอลัมน์ (ยังไม่มี fs/wh) — ทดสอบ migration
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
