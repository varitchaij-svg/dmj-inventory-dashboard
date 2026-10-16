// tests/transfer-history.test.js — ค้นประวัติใบส่งจากชีตปัจจุบันและ archive
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const UI = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(re, source = BACKEND) {
  const m = source.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ: ' + re);
  return m[0];
}

const COLS = grab(/const COL_SHIP_REF\s*=\s*1;[\s\S]*?const COL_SHIP_PREPAREDBY\s*=\s*15;[^\n]*/);
const PARSE_DAY = grab(/function parseShipDayMs_\(s\) \{[\s\S]*?\n\}/);
const DEDUP = grab(/function shipDedupKey_\(row\) \{[\s\S]*?\n\}/);
const QUERY_DAY = grab(/function transferHistoryDayStartMs_\(raw\) \{[\s\S]*?\n\}/);
const BUILD_QUERY = grab(/function transferHistoryBuildQuery_\(params\) \{[\s\S]*?\n\}/);
const SEARCH_ROWS = grab(/function transferHistorySearchRows_\(mainRows, archiveRows, query\) \{[\s\S]*?\n\}/);
const READ_SHEET = grab(/function readTransferHistorySheet_\(ss, name, firstDataRow\) \{[\s\S]*?\n\}/);
const CAN_READ = grab(/function transferHistoryCanRead_\(session\) \{[\s\S]*?\n\}/);

// eval ฟังก์ชันจริงจาก Apps Script พร้อมคอลัมน์และ parser วันที่ที่ใช้จริง
const M = new Function([
  COLS, PARSE_DAY, DEDUP, QUERY_DAY, BUILD_QUERY, SEARCH_ROWS, READ_SHEET, CAN_READ,
  'function isAdminRole_(role) { return role === "owner" || role === "dev"; }',
  'return { COL_SHIP_REF, COL_SHIP_DATE, COL_SHIP_STATUS, COL_SHIP_FROM, COL_SHIP_TO,',
  'COL_SHIP_SKU, COL_SHIP_NAME, COL_SHIP_QTY, COL_SHIP_PREPARED, COL_SHIP_RECVQTY,',
  'COL_SHIP_RECVSTATUS, COL_SHIP_RECVAT, COL_SHIP_RECVBY, COL_SHIP_PREPAREDBY,',
  'parseShipDayMs_, shipDedupKey_, transferHistoryBuildQuery_, transferHistorySearchRows_, readTransferHistorySheet_, transferHistoryCanRead_ };',
].join('\n'))();

function shipRow({ ref, date, sku, qty, to = 'ดูเหมือนจริง', recvQty = '', recvStatus = '', recvAt = '' }) {
  const r = new Array(15).fill('');
  r[M.COL_SHIP_REF - 1] = ref;
  r[M.COL_SHIP_DATE - 1] = date;
  r[M.COL_SHIP_STATUS - 1] = 'สำเร็จ';
  r[M.COL_SHIP_FROM - 1] = 'คลังสินค้าสาย5';
  r[M.COL_SHIP_TO - 1] = to;
  r[M.COL_SHIP_SKU - 1] = sku;
  r[M.COL_SHIP_NAME - 1] = 'ตัวอย่างสินค้า';
  r[M.COL_SHIP_QTY - 1] = qty;
  r[M.COL_SHIP_PREPARED - 1] = qty;
  r[M.COL_SHIP_RECVQTY - 1] = recvQty;
  r[M.COL_SHIP_RECVSTATUS - 1] = recvStatus;
  r[M.COL_SHIP_RECVAT - 1] = recvAt;
  r[M.COL_SHIP_RECVBY - 1] = 'หน้าร้าน';
  r[M.COL_SHIP_PREPAREDBY - 1] = 'คลัง';
  return r;
}

describe('transferHistoryBuildQuery_ — ตรวจตัวกรองก่อนอ่านชีต', () => {
  it('แยกรหัสหลายตัวแบบ case-insensitive และตัดรหัสซ้ำ', () => {
    const q = M.transferHistoryBuildQuery_({ skus: 'dec00022, DEC01022\ndec00022' });
    expect(q.ok).toBe(true);
    expect(q.skus).toEqual(['DEC00022', 'DEC01022']);
  });

  it('ต้องมีรหัสสินค้าและจำกัดจำนวนรหัสต่อคำขอ', () => {
    expect(M.transferHistoryBuildQuery_({ skus: ' , \n' }).ok).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => 'SKU' + i).join(',');
    expect(M.transferHistoryBuildQuery_({ skus: many }).error).toContain('50');
  });

  it('ตรวจวันผิดรูปแบบและช่วงวันที่ย้อนกลับ', () => {
    expect(M.transferHistoryBuildQuery_({ skus: 'A1', from: '2026-02-30' }).ok).toBe(false);
    expect(M.transferHistoryBuildQuery_({ skus: 'A1', from: '2026-07-25', to: '2026-07-01' }).ok).toBe(false);
  });
});

describe('transferHistorySearchRows_ — รวมชีตหลักกับ archive และกรองจริง', () => {
  const jul14 = shipRow({ ref: 'TF-202607047', date: '14/07/2026', sku: 'DEC00022', qty: 20 });
  const jul23 = shipRow({ ref: 'TF-202607079', date: '23/07/2026 15:00', sku: 'DEC01022', qty: 30,
    recvQty: 12, recvStatus: 'รับไม่ครบ', recvAt: '23/07/2026 16:00' });
  const aug01 = shipRow({ ref: 'TF-202608001', date: '01/08/2026', sku: 'DEC00022', qty: 5, to: 'Central' });

  it('รวมสองรหัส, เรียงล่าสุดก่อน และไม่บวกซ้ำแถวที่อยู่ทั้งสองชีต', () => {
    const q = M.transferHistoryBuildQuery_({
      skus: 'DEC00022,DEC01022', from: '2026-07-01', to: '2026-07-31',
      location: 'ดูเหมือนจริง', page: 1, pageSize: 50,
    });
    const result = M.transferHistorySearchRows_([jul14, jul23], [jul14, jul23], q);
    expect(result.total).toBe(2);
    expect(result.totalQty).toBe(50);
    expect(result.list.map(x => x.sku)).toEqual(['DEC01022', 'DEC00022']);
    expect(result.list[0].source).toBe('main');
    expect(result.list[0].receivedQty).toBe(12);
  });

  it('กรองตามช่วงวันและสถานะรับไม่ครบ', () => {
    const q = M.transferHistoryBuildQuery_({
      skus: 'DEC00022 DEC01022', from: '2026-07-20', to: '2026-07-31',
      location: 'ดูเหมือนจริง', status: 'short',
    });
    const result = M.transferHistorySearchRows_([jul14, jul23, aug01], [], q);
    expect(result.total).toBe(1);
    expect(result.list[0].refNum).toBe('TF-202607079');
    expect(result.list[0].receivedStatus).toBe('รับไม่ครบ');
  });

  it('ค้น SKU แบบตรง ไม่จับรหัสที่แค่มี prefix เหมือนกัน', () => {
    const q = M.transferHistoryBuildQuery_({ skus: 'DEC0002' });
    expect(M.transferHistorySearchRows_([jul14], [], q).total).toBe(0);
  });

  it('แบ่งหน้า แต่สรุปจำนวนรวมทั้งผลลัพธ์ทุกหน้า', () => {
    const q = M.transferHistoryBuildQuery_({ skus: 'DEC00022 DEC01022', page: 2, pageSize: 1 });
    const result = M.transferHistorySearchRows_([jul14, jul23], [], q);
    expect(result.total).toBe(2);
    expect(result.totalQty).toBe(50);
    expect(result.totalPages).toBe(2);
    expect(result.page).toBe(2);
    expect(result.list).toHaveLength(1);
    expect(result.list[0].sku).toBe('DEC00022');
  });
});

describe('readTransferHistorySheet_ — ใช้หัวตารางต่างกันของสองชีต', () => {
  it('อ่านเฉพาะแถวข้อมูลและอ่านถึงคอลัมน์ผู้จัด', () => {
    const calls = [];
    const sheet = { getLastRow: () => 4, getRange: (...args) => {
      calls.push(args);
      return { getDisplayValues: () => [['r3'], ['r4']] };
    } };
    const ss = { getSheetByName: name => name === 'main' ? sheet : null };
    expect(M.readTransferHistorySheet_(ss, 'main', 3)).toEqual([['r3'], ['r4']]);
    expect(calls).toEqual([[3, 1, 2, M.COL_SHIP_PREPAREDBY]]);
    expect(M.readTransferHistorySheet_(ss, 'missing', 2)).toEqual([]);
  });
});

describe('transferHistoryCanRead_ — session จริงและ role ที่หน้าเดิมเปิดได้', () => {
  it.each(['owner', 'dev', 'employee'])('อนุญาต session active ของ %s', role => {
    expect(M.transferHistoryCanRead_({ status: 'active', role })).toBe(true);
  });

  it('ปฏิเสธ session หมดอายุและ role ที่ไม่มีแท็บประวัติโอน', () => {
    expect(M.transferHistoryCanRead_({ status: 'revoked', role: 'owner' })).toBe(false);
    expect(M.transferHistoryCanRead_({ status: 'active', role: 'warehouse' })).toBe(false);
    expect(M.transferHistoryCanRead_(null)).toBe(false);
  });
});

describe('page integration — ไม่โหลดประวัติตอนเข้าแท็บ', () => {
  const view = grab(/function TransferView\(\)[\s\S]*?\n\}/, UI);
  const parser = new Function(
    grab(/function parseTransferHistorySkus\(raw\) \{[\s\S]*?\n\}/, UI) +
    '\nreturn parseTransferHistorySkus;'
  )();

  it('รับรหัสหลายตัวและดึงซ้ำได้เฉพาะผ่านปุ่มค้นหา', () => {
    expect(parser(' dec00022, DEC01022\ndec00022 ')).toEqual(['DEC00022', 'DEC01022']);
    expect(view).toMatch(/onSubmit=\{handleSearch\}/);
    expect(view).toMatch(/runSearch\(filters, 1\)/);
    const effects = view.match(/\buE\([\s\S]*?\);/g) || [];
    expect(effects.join('\n')).not.toContain('syncGetTransferHistory');
    expect(view).not.toMatch(/\bdata\./);
  });

  it('ใช้ GET ที่แนบ sessionToken และฝั่ง GAS ตรวจ session จาก server', () => {
    expect(UI).toMatch(/action: "transferHistory"/);
    expect(UI).toMatch(/sessionToken: tok/);
    const dispatch = grab(/if \(e && e\.parameter && e\.parameter\.action === 'transferHistory'\) \{[\s\S]*?\n    \}/);
    expect(dispatch).toContain('resolveSession_');
    expect(dispatch).toContain('transferHistoryCanRead_');
  });

  it('payload เปิดแอปไม่อ่านชีตประวัติโอนแบบเก่า', () => {
    const batch = grab(/const B = batchReadFormatted_\(\[([\s\S]*?)\n    \]\);/);
    expect(batch).not.toContain('SHEET_TRANSFERS_HIST');
    expect(BACKEND).not.toMatch(/const transfers = readTransfers_\(B\[SHEET_TRANSFERS_HIST\]\)/);
    expect(APP).toMatch(/const NO_DATA_TABS = \[[^\]]*"transfers"/);
    expect(APP).toMatch(/<TransferView\/>/);
  });
});
