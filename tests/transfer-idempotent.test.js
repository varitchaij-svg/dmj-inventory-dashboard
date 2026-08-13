// tests/transfer-idempotent.test.js — กด "ส่งทั้งหมด" แล้วขึ้นว่าไม่สำเร็จ ทั้งที่ของโอนไปแล้ว
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน order-idempotent.test.js / auth.test.js: **ไม่ copy โค้ดเข้า helpers.js** แต่ eval
// ฟังก์ชันจริงจากต้นทาง เพราะนี่คือตรรกะที่กัน "โอนของสองเด้ง" — สำเนา drift แล้วเทสต์จะเขียว
// ทั้งที่ของจริงโอนซ้ำ (สต็อกคลังหายไปฟรี ๆ + เอกสารโอนใน ZORT ซ้ำ)
//
// ที่มา (ส.ค. 2026): พนักงานกด "ส่งทั้งหมด" 77 รายการ → มีแจ้งเตือนเข้า, ZORT สร้างรายการโอน
//   เรียบร้อย แต่หน้าจอขึ้น "ส่งไม่สำเร็จ" และรายการทั้ง 77 ยังค้างอยู่
//   ต้นเหตุ: ชุดใหญ่ใช้เวลานานกว่าเพดานเวลาของ dmjFetch (60 วิ) → browser ตัดสายทั้งที่ GAS
//   ยังเขียนชีต + ยิง ZORT ต่อจนจบ · frontend เดิมแปลว่า "ล้มเหลว" ทันที
//   ที่อันตรายกว่าคือถ้าพนักงานกดซ้ำ ตัวกันซ้ำรายชิ้น (shp2_, 90 วิ) หมดอายุไปแล้ว = โอนสองเด้ง
//
// สิ่งที่คุมไว้:
//   1. findTidInShipments_ หา tid ในชีตโอนเจอ/ไม่เจอถูกต้อง + อ่านเฉพาะช่วงท้ายชีต
//   2. shipResultsFromSheetItems จับคู่ sku กลับเป็นผลรายตัวแบบ 1 ต่อ 1 (ไม่ใช้แถวซ้ำ)
//   3. meta: transferStockBatch ต้องรับ tid, เช็คซ้ำก่อนเขียน, เก็บผลไว้ตอบซ้ำ
//   4. meta: doGet ต้องมี action=transferCheck และ doPost ต้องส่ง tid เข้า transferStockBatch
//   5. meta: frontend ต้องส่ง tid + ถาม transferCheck ก่อนขึ้น "ส่งไม่สำเร็จ"
//   6. meta: ปุ่มเคลียร์ของที่ส่งแล้ว ต้อง **ไม่** เรียกการโอนซ้ำ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const VM = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// ── ฟังก์ชันจริงจาก .gs ──────────────────────────────────────────────────────
const { findTidInShipments_, COL_SHIP_TID, TFB_TID_SCAN_ROWS } = (() => {
  const cols = grab(SRC, /const COL_SHIP_REF\s*=[\s\S]*?const COL_SHIP_PREPAREDBY\s*=\s*\d+;/);
  const consts = grab(SRC, /const TFB_REPLAY_TTL_SEC[\s\S]*?const TFB_TID_SCAN_ROWS\s*=\s*\d+;/);
  const fn = grab(SRC, /function findTidInShipments_\(ss, tid\) \{[\s\S]*?\n\}/);
  // eslint-disable-next-line no-new-func
  return new Function(
    `const SHEET_TRANSFERS = "รายการโอนสินค้า";\n${cols}\n${consts}\n${fn}\n` +
    `return { findTidInShipments_, COL_SHIP_TID, TFB_TID_SCAN_ROWS };`
  )();
})();

// ── ฟังก์ชันจริงจาก views-analytics.jsx ──────────────────────────────────────
const shipResultsFromSheetItems = (() => {
  const fn = grab(VA, /function shipResultsFromSheetItems\(transferItems, sheetItems\) \{[\s\S]*?\n\}/);
  // eslint-disable-next-line no-new-func
  return new Function(`${fn}\nreturn shipResultsFromSheetItems;`)();
})();

// ชีตปลอม: rows[i] = แถวที่ 2+i (แถว 1 เป็นหัวตาราง) · แต่ละแถวคือ array ตามคอลัมน์จริง
function fakeShipSheet(rows) {
  const calls = [];
  return {
    calls,
    getLastRow: () => 1 + rows.length,
    getRange(row, col, numRows, numCols) {
      calls.push({ row, col, numRows, numCols });
      const out = [];
      for (let i = 0; i < numRows; i++) {
        const r = rows[row - 2 + i] || [];
        out.push(Array.from({ length: numCols }, (_, c) => r[c] ?? ''));
      }
      return { getValues: () => out };
    },
  };
}
function fakeSs(sheet) {
  return { getSheetByName: () => sheet };
}
// สร้างแถวชีตโอน: A=ref … F=sku … H=qty … P=tid
function shipRow({ ref = 'TF-1', sku = 'AA001', qty = 5, tid = '' } = {}) {
  const r = new Array(COL_SHIP_TID).fill('');
  r[0] = ref; r[5] = sku; r[7] = qty; r[COL_SHIP_TID - 1] = tid;
  return r;
}

describe('findTidInShipments_ — หาชุดที่โอนไปแล้วจากชีต (ของจริงที่ถาวร)', () => {
  it('เจอทุกแถวที่มี tid เดียวกัน พร้อมเลขที่รายการ', () => {
    const sh = fakeShipSheet([
      shipRow({ ref: 'TF-OLD', sku: 'ZZ999', qty: 1, tid: 'TBold' }),
      shipRow({ ref: 'TF-9', sku: 'AA001', qty: 5, tid: 'TBx' }),
      shipRow({ ref: 'TF-9', sku: 'BB002', qty: 7, tid: 'TBx' }),
    ]);
    const hit = findTidInShipments_(fakeSs(sh), 'TBx');
    expect(hit).not.toBeNull();
    expect(hit.refNum).toBe('TF-9');
    expect(hit.items).toEqual([{ sku: 'AA001', qty: 5 }, { sku: 'BB002', qty: 7 }]);
  });

  it('ไม่เจอ tid → คืน null (frontend ต้องแปลว่า "ยังไม่ลง" ได้อย่างมั่นใจ)', () => {
    const sh = fakeShipSheet([shipRow({ tid: 'TBa' })]);
    expect(findTidInShipments_(fakeSs(sh), 'TBb')).toBeNull();
  });

  it('tid ว่าง → คืน null ทันที ไม่ไปแมตช์กับแถวเก่าที่คอลัมน์ P ว่างยกแผง', () => {
    const sh = fakeShipSheet([shipRow({ tid: '' }), shipRow({ tid: '' })]);
    expect(findTidInShipments_(fakeSs(sh), '')).toBeNull();
    expect(sh.calls.length).toBe(0);   // ไม่แตะชีตเลย
  });

  it('ค่าที่มีช่องว่างติดมาจากชีต ต้องยังจับคู่ได้', () => {
    const sh = fakeShipSheet([shipRow({ tid: '  TBx \n' })]);
    expect(findTidInShipments_(fakeSs(sh), 'TBx')).not.toBeNull();
  });

  it('ไม่มีชีต / ชีตว่าง → null ไม่ throw', () => {
    expect(findTidInShipments_({ getSheetByName: () => null }, 'TBx')).toBeNull();
    expect(findTidInShipments_(fakeSs(fakeShipSheet([])), 'TBx')).toBeNull();
  });

  it('อ่านเฉพาะช่วงท้ายชีต ไม่เกิน TFB_TID_SCAN_ROWS แถว (ชีตโอนโตทุกวัน)', () => {
    const many = Array.from({ length: 5000 }, (_, i) => shipRow({ sku: 'S' + i, tid: 'TBz' }));
    const sh = fakeShipSheet(many);
    findTidInShipments_(fakeSs(sh), 'TBz');
    expect(sh.calls.length).toBe(1);
    expect(sh.calls[0].numRows).toBeLessThanOrEqual(TFB_TID_SCAN_ROWS);
    expect(sh.calls[0].row).toBeGreaterThan(2);         // เริ่มอ่านจากท้าย ไม่ใช่หัวชีต
    expect(sh.calls[0].numCols).toBe(COL_SHIP_TID);     // ต้องครอบถึงคอลัมน์ tid
  });

  it('ชีตสั้นกว่าเพดาน → เริ่มอ่านที่แถว 2 ไม่หลุดไปแถวหัวตาราง', () => {
    const sh = fakeShipSheet([shipRow({ tid: 'TBz' })]);
    findTidInShipments_(fakeSs(sh), 'TBz');
    expect(sh.calls[0].row).toBe(2);
  });
});

describe('shipResultsFromSheetItems — กางผลรายตัวกลับจากชีต (ตอน cache ผลหมดอายุ)', () => {
  const items = [
    { orderId: 'R3', sku: 'AA001', qty: 5 },
    { orderId: 'R4', sku: 'BB002', qty: 7 },
  ];

  it('จับคู่ sku+จำนวนตรงกัน → ได้ผลรายตัวครบ พร้อม orderId เดิม', () => {
    const out = shipResultsFromSheetItems(items, [{ sku: 'AA001', qty: 5 }, { sku: 'BB002', qty: 7 }]);
    expect(out).toEqual([
      { sku: 'AA001', orderId: 'R3', requested: 5, transferred: 5 },
      { sku: 'BB002', orderId: 'R4', requested: 7, transferred: 7 },
    ]);
  });

  it('คลังไม่พอ (จำนวนในชีตน้อยกว่าที่สั่ง) → ยังจับคู่ได้ และรายงานจำนวนที่โอนจริง', () => {
    const out = shipResultsFromSheetItems(items, [{ sku: 'AA001', qty: 2 }]);
    expect(out).toEqual([{ sku: 'AA001', orderId: 'R3', requested: 5, transferred: 2 }]);
  });

  it('SKU เดียวกัน 2 ใบ ต้องใช้คนละแถว — แถวเดียวห้ามเคลียร์ทั้งคู่', () => {
    const two = [
      { orderId: 'R3', sku: 'AA001', qty: 5 },
      { orderId: 'R9', sku: 'AA001', qty: 5 },
    ];
    const out = shipResultsFromSheetItems(two, [{ sku: 'AA001', qty: 5 }]);
    expect(out).toHaveLength(1);
    expect(out[0].orderId).toBe('R3');   // ใบที่สองไม่มีแถวรองรับ → คงไว้ในรายการ
  });

  it('ตัวที่ไม่มีแถวโอนรองรับ ต้องไม่โผล่ในผล (จะได้ไม่ถูกลบทิ้งทั้งที่ยังไม่ได้ส่ง)', () => {
    const out = shipResultsFromSheetItems(items, [{ sku: 'BB002', qty: 7 }]);
    expect(out.map(r => r.orderId)).toEqual(['R4']);
  });

  it('เทียบ sku แบบไม่สนตัวพิมพ์/ช่องว่าง', () => {
    const out = shipResultsFromSheetItems([{ orderId: 'R3', sku: ' aa001 ', qty: 5 }],
                                          [{ sku: 'AA001', qty: 5 }]);
    expect(out).toHaveLength(1);
  });

  it('ไม่มีรายการจากชีตเลย → คืน array ว่าง (ไม่เดาว่าสำเร็จ)', () => {
    expect(shipResultsFromSheetItems(items, [])).toEqual([]);
    expect(shipResultsFromSheetItems(items, undefined)).toEqual([]);
  });
});

// ── meta: จุดเชื่อมต่อที่ "พังแล้วไม่มี error ให้เห็น" ────────────────────────
describe('meta — เส้นทางกันโอนซ้ำต้องยังต่อกันครบ', () => {
  const fn = grab(SRC, /function transferStockBatch\(ss, list, actor, clientLoadedAt, tid\) \{[\s\S]*?\n\}\n\n\/\/ สร้าง ZORT Transfer/);

  it('transferStockBatch รับ tid และเช็ค "ทำไปแล้วหรือยัง" ก่อนเขียนอะไร', () => {
    expect(fn).toMatch(/cache\.get\('tfb_'\s*\+\s*tid\)/);
    expect(fn).toMatch(/findTidInShipments_\(ss, tid\)/);
    // ต้องเช็คก่อนอ่าน/เขียนชีตสินค้า ไม่งั้นการเช็คไม่มีความหมาย
    expect(fn.indexOf("cache.get('tfb_'")).toBeLessThan(fn.indexOf('sheet.getDataRange()'));
  });

  it('transferStockBatch เก็บผลไว้ตอบซ้ำ (ไม่งั้น transferCheck ตอบไม่ได้)', () => {
    expect(fn).toMatch(/cache\.put\('tfb_'\s*\+\s*tid/);
  });

  it('การเช็คซ้ำอยู่ "ในล็อก" — สองคำขอ tid เดียวกันพร้อมกันต้องได้ผลเดียวกัน', () => {
    expect(fn.indexOf('lock.tryLock')).toBeLessThan(fn.indexOf("cache.get('tfb_'"));
  });

  it('doPost ส่ง tid ต่อเข้า transferStockBatch (ไม่ส่ง = ตัวกันซ้ำไม่ทำงานเลย)', () => {
    expect(SRC).toMatch(/transferStockBatch\(ss, data\.list \|\| \[\], actor, data\.clientLoadedAt, data\.tid\)/);
  });

  it('doGet มี action=transferCheck ให้ frontend ถามก่อนขึ้นแดง', () => {
    expect(SRC).toMatch(/e\.parameter\.action === 'transferCheck'/);
    expect(SRC).toMatch(/function transferCheckHandler_\(tid\)/);
  });

  it('logTransferBatch_ เขียน tid ลงคอลัมน์ P จริง (ไม่งั้นเช็คจากชีตไม่เจอตลอดกาล)', () => {
    const lg = grab(SRC, /function logTransferBatch_\(ss, items, zortNumber, actor, tid\) \{[\s\S]*?\n\}/);
    expect(lg).toMatch(/tid \|\| ""/);
    expect(lg).toMatch(/rows\.length, COL_SHIP_TID/);
  });

  it('SHIP_HEADERS กว้างเท่าคอลัมน์ tid พอดี (หัวตารางกับข้อมูลต้องไม่เหลื่อมกัน)', () => {
    const headers = grab(SRC, /const SHIP_HEADERS = \[[\s\S]*?\];/);
    // eslint-disable-next-line no-new-func
    const arr = new Function(`${headers}\nreturn SHIP_HEADERS;`)();
    expect(arr.length).toBe(COL_SHIP_TID);
  });

  it('COL_SHIP_TID ต้องต่อท้ายคอลัมน์เดิม ไม่ทับ "ผู้จัด" (บทเรียนข้อ 5)', () => {
    const prepBy = Number(grab(SRC, /const COL_SHIP_PREPAREDBY\s*=\s*\d+/).match(/\d+/)[0]);
    expect(COL_SHIP_TID).toBe(prepBy + 1);
  });
});

describe('meta — frontend ต้องไม่ประกาศว่า "ส่งไม่สำเร็จ" ก่อนถามของจริง', () => {
  const doShipAll = grab(VA, /const doShipAll = async \(\) => \{[\s\S]*?\n  \};/);

  it('ส่ง tid ไปกับการโอนทั้งชุด', () => {
    expect(VA).toMatch(/transferStockBatch: true, list: items, tid: tid \|\| ""/);
    expect(doShipAll).toMatch(/tid = getShipTid\(ready\)/);
    expect(doShipAll).toMatch(/syncStockTransferBatch\(transferItems, tid\)/);
  });

  it('อ่านคำตอบไม่ได้ → ถาม transferCheck ก่อน แล้วค่อยตัดสิน', () => {
    expect(doShipAll).toMatch(/batchRes\.unreadable/);
    expect(doShipAll).toMatch(/await syncTransferCheck\(tid\)/);
    expect(doShipAll.indexOf('syncTransferCheck')).toBeLessThan(doShipAll.indexOf('const batchOk'));
  });

  it('ถามไม่ได้คำตอบ (chk = null) ต้องไม่ชวนให้กดส่งซ้ำ — ยังไม่รู้ว่าโอนไปหรือยัง', () => {
    const unknownBranch = grab(doShipAll, /\} else if \(batchRes && batchRes\.unreadable\) \{[\s\S]*?\n      \}/);
    expect(unknownBranch).not.toMatch(/อีกครั้งได้เลย/);
    expect(unknownBranch).toMatch(/เช็คของที่ส่งไปแล้ว/);
  });

  it('tid คงค่าเดิมตลอดชุดเดิม และถูกล้างเมื่อชุดจบแล้วเท่านั้น', () => {
    const getTid = grab(VA, /function getShipTid\(orders\) \{[\s\S]*?\n\}/);
    expect(getTid).toMatch(/cur\.key === key/);            // ชุดเดิม = tid เดิม
    expect(getTid).toMatch(/SHIP_TID_MAX_AGE_MS/);         // มีอายุ ไม่ค้างข้ามวัน
    expect(doShipAll).toMatch(/clearShipTid\(\)/);
    // ต้องล้างหลังรู้ผลรายตัวแล้วเท่านั้น — ล้างก่อนถาม = ลองใหม่แล้วโอนซ้ำ
    expect(doShipAll.indexOf('clearShipTid()')).toBeGreaterThan(doShipAll.indexOf('const batchOk'));
  });

  it('เพดานเวลาของการโอนทั้งชุดต้องยาวกว่าค่า default 60 วิ ของ dmjFetch', () => {
    const sync = grab(VA, /async function syncStockTransferBatch\(items, tid\) \{[\s\S]*?\n\}/);
    const ms = Number(sync.match(/dmjTimeoutMs:\s*(\d+)/)[1]);
    expect(ms).toBeGreaterThan(60000);
    expect(sync).toMatch(/await dmjJson\(res\)/);        // ห้ามกลับไปใช้ res.json() (บทเรียนข้อ 13)
    expect(sync).toMatch(/unreadable: true/);
  });
});

describe('meta — ปุ่ม "เช็คของที่ส่งไปแล้ว" ต้องไม่ตัดสต็อกซ้ำ และไม่เคลียร์เหมารวม', () => {
  const apply = grab(VA, /const applyReconcile = async \(\) => \{[\s\S]*?\n  \};/);
  const find  = grab(VA, /const findAlreadyShipped = \(rows\) => \{[\s\S]*?\n  \};/);
  const open  = grab(VA, /const openReconcile = async \(\) => \{[\s\S]*?\n  \};/);

  it('ลบ order + มาร์คส่งแล้วเท่านั้น — ห้ามเรียกการโอนใด ๆ', () => {
    expect(apply).toMatch(/syncDeleteOrders/);
    expect(apply).not.toMatch(/syncStockTransferBatch|syncStockDeduct/);
  });

  it('เคลียร์เฉพาะรายการที่ผู้ใช้ติ๊กเลือก — ไม่ใช่ทุกอันที่แมตช์', () => {
    expect(apply).toMatch(/\.filter\(m => m\.pick\)/);
  });

  it('ตัดสินจากประวัติการโอนจริง อ่านสดจากชีตก่อน ไม่ใช่เดาจากหน้าจอ', () => {
    expect(open).toMatch(/await syncRecentTransfers\(RECONCILE_DAYS\)/);
    expect(open).toMatch(/data\.shipments/);      // ถามสดไม่ได้ → ถอยไปใช้ของในเครื่อง
    expect(find).toMatch(/!s\.receivedAt/);
  });

  it('ตัวที่ไม่มีแถวโอนรองรับ ต้องเข้ากอง unmatched เสมอ (= ยังไม่ได้ส่ง คงไว้)', () => {
    expect(find).toMatch(/unmatched\.push\(o\); return;/);
    expect(find).toMatch(/return \{ matches, unmatched, pending \};/);
    // unmatched ต้องไม่ถูกส่งต่อไปให้ applyReconcile ลบ
    expect(apply).not.toMatch(/unmatched/);
  });

  it('จับคู่ 1 ต่อ 1 — แถวโอนแถวเดียวห้ามเคลียร์ order หลายใบ', () => {
    expect(find).toMatch(/used = true/);
    expect(find).toMatch(/!s\.used/);
  });

  it('ไม่แตะรายการ MTO (ไม่ได้โอนสต็อกคลังตั้งแต่แรก)', () => {
    expect(find).toMatch(/!o\.product\?\.isMTO/);
  });
});

describe('meta — กดส่งทีละใบก็ต้องไม่ขึ้นแดงมั่ว (เส้นทางที่ไม่มี tid กันซ้ำ)', () => {
  const finalize = grab(VA, /const finalizeShip = async \(order, matItems\) => \{[\s\S]*?\n  \};/);
  const deduct = grab(VA, /async function syncStockDeduct\(sku, qty, name\) \{[\s\S]*?\n\}/);

  it('syncStockDeduct อ่านผลด้วย dmjJson และบอกได้ว่า "อ่านไม่ได้"', () => {
    expect(deduct).toMatch(/await dmjJson\(res\)/);
    expect(deduct).toMatch(/unreadable: true/);
    expect(deduct).not.toMatch(/res\.json\(\)/);
  });

  it('อ่านคำตอบไม่ได้ → ห้ามบอกว่า "คลังไม่พอ" และห้ามชวนกดส่งซ้ำ', () => {
    expect(finalize).toMatch(/if \(unreadable\)/);
    const branch = grab(finalize, /if \(unreadable\) \{[\s\S]*?\n    \}/);
    expect(branch).toMatch(/เช็คของที่ส่งไปแล้ว/);
    expect(branch).toMatch(/อย่ากดส่งซ้ำ/);
    expect(branch).not.toMatch(/คลังไม่พอ/);
    // ต้องตัดจบก่อนถึงเส้นทาง "คลังไม่พอ/ไม่พบสินค้า" เดิม
    expect(finalize.indexOf('if (unreadable)')).toBeLessThan(finalize.indexOf('if (!transferOk)'));
  });
});

// ── กดส่งครั้งเดียวแต่ได้ TF ซ้ำ + สต็อกหักซ้ำ (ส.ค. 2026) ──────────────────
// อาการ: กดส่งของทีละใบครั้งเดียว แต่ขึ้นรายการโอนซ้ำ (OE002 qty 1 แล้ว qty 0 = order เดียว
//   ถูกส่ง 2 ครั้งซ้อน · ครั้งแรกหักหน่วยสุดท้าย ครั้งที่ 2 เจอคลัง 0 → โอน 0 ชิ้น)
// ต้นเหตุ: ปุ่ม ✅ ใน ConfirmModal ไม่มีตัวกันดับเบิลแท็บ → onConfirm ยิง 2 ครั้งใน tick เดียว
//   → doShip อ่าน order จาก closure เดิมทั้งคู่ (setShipConfirm(null) เป็น async) → finalizeShip ×2
//   → transferStock ×2 (ทีละใบไม่มี tid กันซ้ำฝั่ง GAS) = TF ซ้ำ + สต็อกหักซ้ำ
describe('meta — กันส่งของ/ลบ "สองเด้ง" จากดับเบิลแท็บ ConfirmModal', () => {
  const modal = grab(VM, /function ConfirmModal\(\{[\s\S]*?\n\}/);

  it('ConfirmModal กันการกด ✅ ซ้ำด้วย ref (synchronous) ไม่ใช่ state', () => {
    // ต้องเป็น ref — state อัปเดต async การกดครั้งที่ 2 ใน tick เดียวจะยังเห็น false แล้วยิงซ้ำ
    expect(modal).toMatch(/React\.useRef\(false\)/);
    // handler ต้องเช็ค ref แล้ว return ก่อนเรียก onConfirm
    const handler = grab(modal, /const handleConfirm = \(\) => \{[\s\S]*?\n  \};/);
    expect(handler).toMatch(/if \(confirmedRef\.current\) return/);
    expect(handler.indexOf('confirmedRef.current = true'))
      .toBeLessThan(handler.indexOf('onConfirm'));
  });

  it('ปุ่ม ✅ เรียก handleConfirm (ตัวกัน) ไม่ใช่ onConfirm ตรง ๆ', () => {
    // เรียก onConfirm ตรง = ตัวกันถูกข้าม (บั๊กกลับมาเงียบ ๆ)
    expect(modal).toMatch(/onClick=\{handleConfirm\}/);
    expect(modal).not.toMatch(/onClick=\{onConfirm\}/);
  });

  it('รีเซ็ตตัวกันทุกครั้งที่เปิดโมดัลใหม่ (ไม่งั้นครั้งที่ 2 กดไม่ได้เลย)', () => {
    expect(modal).toMatch(/if \(open\) \{ confirmedRef\.current = false/);
  });

  it('finalizeShip มี re-entry guard แยกอีกชั้น (เผื่อ caller อื่น) และปล่อยล็อกทุกทางออก', () => {
    const finalize = grab(VA, /const finalizeShip = async \(order, matItems\) => \{[\s\S]*?\n  \};/);
    // ตัดทันทีถ้ากำลังโอน order เดียวกันอยู่ (ref = synchronous, ต้องอยู่ก่อน setSending)
    expect(finalize).toMatch(/if \(shipInflightRef\.current\.has\(order\.id\)\) return/);
    expect(finalize.indexOf('shipInflightRef.current.add'))
      .toBeLessThan(finalize.indexOf('setSending(order.id)'));
    // ปล่อยล็อกครบทุกทางออก: unreadable, !transferOk, และจบสำเร็จ (นับ delete = 3)
    const deletes = (finalize.match(/shipInflightRef\.current\.delete\(order\.id\)/g) || []).length;
    expect(deletes, 'ต้องปล่อยล็อกทุกทางออก (unreadable/ไม่พอ/สำเร็จ) ไม่งั้นกดส่งซ้ำไม่ได้ตลอดไป')
      .toBe(3);
  });
});

// ── "ZORT โอนไปแล้ว แต่ระบบเราไม่มี/ไม่หัก" ──────────────────────────────────
// ลำดับจริงของ transferStockBatch: หักสต็อก → flush → ยิง ZORT → เขียนชีตโอน → audit
// ⚠️ ลำดับนี้คือฐานของเครื่องมือซ่อมทั้งหมด — สลับเมื่อไหร่ การวินิจฉัยจะผิดทันที
//    (เช่นถ้าย้าย ZORT ไปก่อนหักสต็อก "ZORT มี แต่ audit ไม่มี" จะไม่ได้แปลว่ายังไม่หัก)
describe('เครื่องมือตรวจ/ซ่อมเมื่อ ZORT กับชีตเราไม่ตรงกัน', () => {
  const batch = grab(SRC, /function transferStockBatch\(ss, list, actor, clientLoadedAt, tid\) \{[\s\S]*?\n\}\n\n\/\/ สร้าง ZORT Transfer/);

  it('ลำดับ หักสต็อก → ยิง ZORT → เขียนชีตโอน → audit ต้องไม่สลับ', () => {
    const iDeduct = batch.indexOf('sheet.getRange(row, COL_PROD_QTYFS, 1, 2)');
    const iZort   = batch.indexOf('createZortTransferBatch_');
    const iLog    = batch.indexOf('logTransferBatch_');
    const iAudit  = batch.indexOf('writeAuditLogBatch_');
    expect(iDeduct).toBeGreaterThan(-1);
    expect(iDeduct).toBeLessThan(iZort);
    expect(iZort).toBeLessThan(iLog);
    expect(iLog).toBeLessThan(iAudit);
  });

  it('เครื่องมือตรวจต้องรันเองได้จาก GAS editor (ชื่อห้ามลงท้าย _ — บทเรียนข้อ 1)', () => {
    ['checkZortTransfer', 'repairZortTransferLog', 'applyZortTransferStock'].forEach(n => {
      expect(SRC).toMatch(new RegExp('function ' + n + '\\('));
      expect(SRC).not.toMatch(new RegExp('function ' + n + '_\\('));
    });
  });

  it('checkZortTransfer อ่านอย่างเดียว — ห้ามเขียน/ยิง ZORT', () => {
    const f = grab(SRC, /function checkZortTransfer\(number\) \{[\s\S]*?\n\}/);
    expect(f).not.toMatch(/setValue|setValues|logTransferBatch_\(|writeAuditLog/);
    expect(f).not.toMatch(/AddTransfer/);
  });

  it('repairZortTransferLog เขียนแค่ชีตโอน — ห้ามแตะสต็อก และห้ามเขียนซ้ำ', () => {
    const f = grab(SRC, /function repairZortTransferLog\(number\) \{[\s\S]*?\n\}/);
    expect(f).toMatch(/countTransferLogRows_/);       // กันเขียนซ้ำ
    expect(f).toMatch(/logTransferBatch_/);
    expect(f).not.toMatch(/COL_PROD_QTYWH|COL_PROD_QTYFS/);
    expect(f).not.toMatch(/AddTransfer|pushStockToZort_/);
  });

  // ที่มา (ส.ค. 2026): TF-202608035 ถูกสคริปต์ตัดกลางคันตอนเขียนชุด 75 SKU → เขียนไปได้แค่ 23
  // แถว เดิม repairZortTransferLog เจอ "มีแถวไหนของเลขที่นี้อยู่แล้ว" ก็ข้ามทั้งชุดทันที
  // (countTransferLogRows_(...).rows เป็นค่าความจริงแล้ว return ก่อนเขียนอะไรเลย) →
  // 52 SKU ที่ขาดไม่มีวันถูกเติมแม้จะรันซ้ำกี่ครั้งก็ตาม ต้องกรองเหลือเฉพาะ SKU ที่ยังไม่มี
  it('repairZortTransferLog ต้องเติมเฉพาะ SKU ที่ขาด ไม่ข้ามทั้งชุดเมื่อมีแค่บางแถว (partial write)', () => {
    const f = grab(SRC, /function repairZortTransferLog\(number\) \{[\s\S]*?\n\}/);
    // ต้องสร้างชุด SKU ที่บันทึกแล้วจาก log.skus แล้วกรอง t.items เหลือเฉพาะที่ยังไม่มี
    expect(f).toMatch(/log\.skus\.forEach/);
    expect(f).toMatch(/t\.items\.filter/);
    // ต้อง "เขียนเมื่อไม่มีอะไรขาด (missing.length===0)" ไม่ใช่ "เขียนเมื่อไม่มีแถวเลย (log.rows===0)"
    expect(f).not.toMatch(/if \(countTransferLogRows_\(ss, t\.number\)\.rows\) \{\s*\n\s*Logger\.log\('⏭️/);
    expect(f).toMatch(/if \(!missing\.length\)/);
    expect(f).toMatch(/logTransferBatch_\(ss, missing\.map/);
  });

  it('checkZortTransfer ต้องแยกเคส "บันทึกไม่ครบ" ออกจาก "บันทึกครบแล้ว" — ห้ามเหมาว่ามีแถวใดแถวหนึ่งคือครบ', () => {
    const f = grab(SRC, /function checkZortTransfer\(number\) \{[\s\S]*?\n\}/);
    expect(f).toMatch(/log\.rows < t\.items\.length/);
    expect(f).toMatch(/repairZortTransferLog\("' \+ t\.number \+ '"\)"? จะเติมเฉพาะ SKU ที่ขาด|เติมเฉพาะ SKU ที่ขาด/);
  });

  // ที่มา (ส.ค. 2026): 52 SKU ของ TF-202608035 ที่หายไปแล้วถูก repairZortTransferLog เติม
  // กลับเป็น "รอรับ" เสมอ — แต่บางตัวพนักงานอาจเคยกดรับไปแล้วก่อนแถวจะหาย confirmShipmentReceive
  // เขียน Audit Log ทุกครั้งที่กดรับจริง (action="รับสินค้า") ใช้ร่องรอยนี้กู้สถานะกลับได้
  describe('กู้สถานะ "รับของแล้ว" จาก Audit Log', () => {
    it('matchTransferReceiptsFromAudit_ ต้องไม่แตะแถวที่มีสถานะรับอยู่แล้ว (COL_SHIP_RECVAT ไม่ว่าง)', () => {
      const f = grab(SRC, /function matchTransferReceiptsFromAudit_\(ss, t\) \{[\s\S]*?\n\}/);
      expect(f).toMatch(/if \(rowInfo\.recvAt\) \{ out\[sku\] = \{ matched: false, reason: 'already_set'/);
    });

    it('matchTransferReceiptsFromAudit_ ต้องเทียบจำนวนที่ส่ง (sentQty) ก่อนจับคู่ ไม่เดาเมื่อชนกัน', () => {
      const f = grab(SRC, /function matchTransferReceiptsFromAudit_\(ss, t\) \{[\s\S]*?\n\}/);
      expect(f).toMatch(/e\.sentQty === skuSet\[sku\]/);
      expect(f).toMatch(/entries\.length > 1.*ambiguous/);
    });

    it('auditReceiptEntriesForSkus_ อ่านเฉพาะ action="รับสินค้า" และกรองตามเวลาที่โอน (กันจับคู่ข้ามรอบเก่า)', () => {
      const f = grab(SRC, /function auditReceiptEntriesForSkus_\(ss, skuSet, sinceMs\) \{[\s\S]*?\n\}/);
      expect(f).toMatch(/'รับสินค้า'/);
      expect(f).toMatch(/when < sinceMs/);
      expect(f).toMatch(/\^\(รับครบ\|รับไม่ครบ\)/);
    });

    it('applyTransferReceiptsFromAudit เขียนเฉพาะ SKU ที่จับคู่ได้ชัดเจน (matched===true) เท่านั้น', () => {
      const f = grab(SRC, /function applyTransferReceiptsFromAudit\(number\) \{[\s\S]*?\n\}/);
      expect(f).toMatch(/m\[sku\]\.matched/);
      expect(f).toMatch(/COL_SHIP_RECVQTY/);
      expect(f).toMatch(/COL_SHIP_RECVSTATUS/);
      expect(f).toMatch(/COL_SHIP_RECVAT/);
      expect(f).toMatch(/COL_SHIP_RECVBY/);
      expect(f).toMatch(/LockService\.getScriptLock\(\)/);
      expect(f).not.toMatch(/COL_PROD_QTYWH|COL_PROD_QTYFS|AddTransfer|pushStockToZort_/);
    });

    it('previewTransferReceiptsFromAudit อ่านอย่างเดียว — ห้ามเขียน', () => {
      const f = grab(SRC, /function previewTransferReceiptsFromAudit\(number\) \{[\s\S]*?\n\}/);
      expect(f).not.toMatch(/setValue|setValues/);
    });

    it('doGet มี action=previewTransferReceipts และ applyTransferReceipts', () => {
      expect(SRC).toMatch(/e\.parameter\.action === 'previewTransferReceipts'/);
      expect(SRC).toMatch(/e\.parameter\.action === 'applyTransferReceipts'/);
      expect(SRC).toMatch(/function previewTransferReceiptsHandler_\(number\) \{/);
      expect(SRC).toMatch(/function applyTransferReceiptsHandler_\(number\) \{/);
    });
  });

  it('applyZortTransferStock ต้องปฏิเสธเมื่อหักไปแล้ว และห้ามยิง ZORT ซ้ำ', () => {
    const f = grab(SRC, /function applyZortTransferStock\(number\) \{[\s\S]*?\n\}\n\n\/\/ doGet action=zortTransfer/);
    expect(f).toMatch(/auditTransferSkusOnDate_/);
    expect(f).toMatch(/already_deducted/);
    expect(f).toMatch(/already_logged/);
    // ⚠️ ห้ามยิง ZORT — เอกสารโอนมีอยู่แล้ว ยิงซ้ำ = ของย้ายสองรอบ
    expect(f).toMatch(/ไม่ได้ยิง ZORT ซ้ำ/);
    expect(f).not.toMatch(/createZortTransfer|AddTransfer|pushStockToZort_/);
    // ต้องจับล็อก + ไม่ปล่อยสต็อกติดลบ เหมือนเส้นทางโอนปกติ
    expect(f).toMatch(/LockService\.getScriptLock\(\)/);
    expect(f).toMatch(/Math\.min\(it\.qty, wh\)/);
    // เขียน audit เพื่อให้รันซ้ำครั้งหน้าถูกบล็อก (ไม่งั้นกันซ้ำได้ครั้งเดียว)
    expect(f).toMatch(/writeAuditLogBatch_\(/);
  });

  it('zortFindTransfer_ อ่าน "จำนวน" จาก list[].number ไม่ใช่ list[].qty', () => {
    const f = grab(SRC, /function zortFindTransfer_\(number, days\) \{[\s\S]*?\n\}/);
    expect(f).toMatch(/qty: Number\(it\.number\)/);
    // เลขที่เอกสารมาจาก t.number — คนละตัวกับ it.number (ZORT ใช้ชื่อซ้ำกัน)
    expect(f).toMatch(/t\.number \|\| t\.id/);
  });

  it('เทียบเลขที่แบบตัดขีดออก — ผู้ใช้พิมพ์ TF-202608035 แทน TF-20260803-005 ได้', () => {
    const f = grab(SRC, /function zortFindTransfer_\(number, days\) \{[\s\S]*?\n\}/);
    expect(f).toMatch(/replace\(\/\[\^A-Z0-9\]\/g, ''\)/);
  });

  it('doGet มี action=zortTransfer และบอกด้วยว่าชีตเรามีบันทึกหรือยัง', () => {
    expect(SRC).toMatch(/e\.parameter\.action === 'zortTransfer'/);
    const h = grab(SRC, /function zortTransferHandler_\(number\) \{[\s\S]*?\n\}/);
    expect(h).toMatch(/sheetLogged/);
    expect(h).toMatch(/fromZort: true/);
  });

  // สำรองไว้เมื่อ GAS editor ของเจ้าของใช้ไม่ได้ (แคชค้าง/เปิดผิดโปรเจกต์) — เรียกผ่าน URL
  // แทนได้ ต้องห่อ repairZortTransferLog ตรง ๆ ไม่ประกอบ query ใหม่ (กัน logic แยกทาง)
  it('doGet มี action=repairTransferLog เป็นทางเลือกเรียกซ่อมชีตโอนผ่าน URL', () => {
    expect(SRC).toMatch(/e\.parameter\.action === 'repairTransferLog'/);
    const h = grab(SRC, /function repairTransferLogHandler_\(number\) \{[\s\S]*?\n\}/);
    expect(h).toMatch(/repairZortTransferLog\(number\)/);
  });

  it('frontend มีทางค้นจากเลขที่ ZORT และเตือนเมื่อชีตเราไม่มีบันทึก', () => {
    const look = grab(VA, /const lookupByZort = async \(\) => \{[\s\S]*?\n  \};/);
    expect(look).toMatch(/syncZortTransferLookup/);
    expect(look).toMatch(/findAlreadyShipped\(r\.list\)/);   // ใช้ตัวจับคู่ตัวเดียวกัน ไม่เขียนใหม่
    expect(VA).toMatch(/zortSheetLogged/);
  });
});

describe('meta — action=recentTransfers (ประวัติจริงว่าอะไรโอนไปแล้ว)', () => {
  it('doGet มี endpoint และอ่านเฉพาะช่วงท้ายชีต', () => {
    expect(SRC).toMatch(/e\.parameter\.action === 'recentTransfers'/);
    const h = grab(SRC, /function recentTransfersHandler_\(days\) \{[\s\S]*?\n\}/);
    expect(h).toMatch(/RECENT_TF_SCAN_ROWS/);
    expect(h).not.toMatch(/getDataRange\(\)/);
  });

  it('ต้องไม่อ่านผ่าน payload cache — คนถามคือคนที่ไม่แน่ใจว่าของไปหรือยัง', () => {
    const h = grab(SRC, /function recentTransfersHandler_\(days\) \{[\s\S]*?\n\}/);
    expect(h).not.toMatch(/CacheService|_readChunked_/);
  });

  it('ครอบคลุมทั้งทาง "ส่งทั้งหมด" และ "กดส่งทีละใบ" (เขียนชีตเดียวกัน)', () => {
    const single = grab(SRC, /function transferStock\(ss, sku, qty, productName, actor\) \{[\s\S]*?\n\}/);
    expect(single).toMatch(/logTransfer_\(ss, sku, name, actual, actor\)/);
    expect(SRC).toMatch(/function logTransfer_\(ss, sku, productName, qty, actor\)/);
  });
});
