// tests/shipment-archive.test.js — อายุของรายการโอน + การกู้แถวที่ถูก archive เร็วเกินไป
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (ส.ค. 2026): หน้าร้านหาใบ TF ที่เพิ่งกดรับ "เมื่อวาน" ไม่เจอ แล้วเข้าใจกันว่าข้อมูลหาย
// ของจริงคือ `archiveReceivedShipments` (trigger ตี 3) ย้ายทุกแถวที่สถานะ "รับครบ" ออกไป
// **ทันที ไม่รอเลย** เข้าชีต "ประวัติรับสินค้า" ซึ่ง**ไม่มีหน้าไหนในเว็บอ่าน** → หายจากจอ
// ทั้งที่ข้อมูลยังอยู่ครบ · การเช็คซ้ำว่าได้ของครบจริงไหมเป็นขั้นตอนปกติของหน้าร้าน
//
// เทสต์ชุดนี้ eval ฟังก์ชันจริงจาก `.gs` (ไม่ copy เข้า helpers.js — แพทเทิร์นเดียวกับ
// auth.test.js/qtyloc.test.js) เพราะตรรกะ "อะไรควรอยู่บนหน้าจอ อะไรควรถูกเก็บ" ตัดสิน
// ว่าพนักงานเห็นของหรือไม่เห็น — สำเนาที่ drift แล้วเทสต์ยังเขียวคือสิ่งที่ต้องกันที่สุด
//
// สิ่งที่คุมไว้:
//   1. ของที่เพิ่งรับ (ยังไม่ครบ 30 วัน) ต้อง **ไม่ถูก** archive — เคสที่พังจริง
//   2. ของที่ยังไม่มีใครกดรับเลย ต้องไม่ถูก archive ไม่ว่าจะเก่าแค่ไหน (ยังรอ action)
//   3. ปี พ.ศ. ในชีตต้องอ่านออก (บทเรียนข้อ 11) ไม่งั้นของปี 2569 ดูเหมือนอนาคต 543 ปี
//   4. คีย์กันซ้ำต้องแยกใบโอนคนละใบออกจากกันจริง (กู้กลับแล้วต้องไม่เกิดของซ้ำ)
//   5. meta-test: archiveReceivedShipments ต้องยังเช็คอายุอยู่ (กันใครแก้กลับไปย้ายทันที)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// ── eval ฟังก์ชันจริงจาก .gs พร้อม column constants ที่มันต้องใช้ ──
const COLS = grab(/const COL_SHIP_REF\s+= 1;[\s\S]*?const COL_SHIP_RECVBY\s+= 14;[^\n]*/);
const KEEP_DAYS = grab(/const SHIP_ARCHIVE_KEEP_DAYS = \d+;/);
const PEND_DAYS = grab(/const PENDING_CLEANUP_KEEP_DAYS = \d+;/);
const F_PARSE   = grab(/function parseShipDayMs_\(s\) \{[\s\S]*?\n\}/);
const F_RECVAT  = grab(/function parseShipRecvAt_\(s\) \{[\s\S]*?\n\}/);
const F_CLOSE   = grab(/function shipCloseMs_\(row\) \{[\s\S]*?\n\}/);
const F_DEDUP   = grab(/function shipDedupKey_\(row\) \{[\s\S]*?\n\}/);
const F_NORM    = grab(/function normalizeShipRow_\(row, width\) \{[\s\S]*?\n\}/);

// eslint-disable-next-line no-new-func
const M = new Function(
  [COLS, KEEP_DAYS, PEND_DAYS, F_PARSE, F_RECVAT, F_CLOSE, F_DEDUP, F_NORM].join('\n') +
  '\nreturn { SHIP_ARCHIVE_KEEP_DAYS, PENDING_CLEANUP_KEEP_DAYS, parseShipDayMs_, parseShipRecvAt_,' +
  ' shipCloseMs_, shipDedupKey_, normalizeShipRow_,' +
  ' COL_SHIP_REF, COL_SHIP_DATE, COL_SHIP_SKU, COL_SHIP_QTY, COL_SHIP_RECVAT, COL_SHIP_RECVSTATUS };'
)();

const DAY = 24 * 60 * 60 * 1000;

// สร้างแถวชีตโอน 15 คอลัมน์ตาม SHIP_HEADERS (index 0 = คอลัมน์ A)
function shipRow({ ref = 'TF-20260803-005', date = '03/08/2026', sku = 'OL00001',
                   qty = 10, recvQty = '', recvStatus = '', recvAt = '' } = {}) {
  const r = new Array(15).fill('');
  r[M.COL_SHIP_REF - 1]        = ref;
  r[M.COL_SHIP_DATE - 1]       = date;
  r[2]                         = 'สำเร็จ';
  r[M.COL_SHIP_SKU - 1]        = sku;
  r[M.COL_SHIP_QTY - 1]        = qty;
  r[M.COL_SHIP_RECVQTY_IDX]    = undefined; // ไม่ใช้ — กันพลาดเรื่อง index
  r[10]                        = recvQty;   // K จำนวนที่รับ
  r[M.COL_SHIP_RECVSTATUS - 1] = recvStatus;
  r[M.COL_SHIP_RECVAT - 1]     = recvAt;
  return r;
}

// จำลองเงื่อนไข "ย้ายเข้าประวัติไหม" ให้ตรงกับลูปใน archiveReceivedShipments
function wouldArchive(row, nowMs) {
  const sku = String(row[M.COL_SHIP_SKU - 1] || '').trim();
  if (!sku) return false;
  const status = String(row[M.COL_SHIP_RECVSTATUS - 1] || '').trim();
  if (status !== 'รับครบ' && status !== 'รับไม่ครบ') return false;
  const closeMs = M.shipCloseMs_(row);
  if (closeMs != null && (nowMs - closeMs) < M.SHIP_ARCHIVE_KEEP_DAYS * DAY) return false;
  return true;
}

describe('อายุของที่ปิดเคสแล้ว — ต้องอยู่บนหน้าจอให้หน้าร้านเช็คซ้ำได้ก่อน', () => {
  const now = new Date(2026, 7, 6, 10, 0).getTime(); // 6 ส.ค. 2026 10:00

  it('ของที่กดรับ "เมื่อวาน" ต้องไม่ถูกย้ายเข้าประวัติ — เคสที่พังจริง', () => {
    // นี่คือเคสที่ทำให้เจ้าของหาใบ TF ไม่เจอ: กดรับเย็นวันที่ 5, ตี 3 วันที่ 6 หายทันที
    const row = shipRow({ recvStatus: 'รับครบ', recvQty: 10, recvAt: '05/08/2026 17:30' });
    expect(wouldArchive(row, now)).toBe(false);
  });

  it('ของที่กดรับวันนี้เองก็ต้องไม่ถูกย้าย', () => {
    const row = shipRow({ recvStatus: 'รับครบ', recvQty: 10, recvAt: '06/08/2026 09:00' });
    expect(wouldArchive(row, now)).toBe(false);
  });

  it('"รับไม่ครบ" ใช้เกณฑ์อายุเดียวกัน ไม่ถูกย้ายก่อนครบกำหนด', () => {
    // เดิมรับไม่ครบรอแค่ 7 วัน — ซึ่งเป็นเคสที่ยิ่งต้องเช็คซ้ำมากกว่ารับครบด้วยซ้ำ
    const row = shipRow({ recvStatus: 'รับไม่ครบ', recvQty: 6, recvAt: '20/07/2026 11:00' });
    expect(wouldArchive(row, now)).toBe(false);
  });

  it('ของที่รับไปนานกว่า 30 วันแล้ว ถึงจะถูกย้ายเข้าประวัติ', () => {
    const row = shipRow({ recvStatus: 'รับครบ', recvQty: 10, recvAt: '01/07/2026 09:00' });
    expect(wouldArchive(row, now)).toBe(true);
  });

  it('ของที่ยังไม่มีใครกดรับเลย ไม่ถูกย้ายไม่ว่าจะเก่าแค่ไหน (ยังรอ action จริง)', () => {
    const row = shipRow({ date: '01/01/2026', recvStatus: '', recvAt: '' });
    expect(wouldArchive(row, now)).toBe(false);
  });

  it('แถวว่าง (ไม่มี SKU) ไม่ถูกนับเป็นรายการ', () => {
    expect(wouldArchive(new Array(15).fill(''), now)).toBe(false);
  });

  it('เก็บไว้ 30 วัน = ครอบคลุม "ทั้งเดือน" ตามที่เจ้าของขอ', () => {
    expect(M.SHIP_ARCHIVE_KEEP_DAYS).toBeGreaterThanOrEqual(28);
  });
});

describe('parseShipDayMs_ — อ่านวันที่ในชีตให้ถูก', () => {
  it('อ่าน dd/MM/yyyy แบบไม่มีเวลาได้', () => {
    expect(M.parseShipDayMs_('03/08/2026')).toBe(new Date(2026, 7, 3, 0, 0).getTime());
  });

  it('อ่าน dd/MM/yyyy HH:mm ได้', () => {
    expect(M.parseShipDayMs_('05/08/2026 17:30')).toBe(new Date(2026, 7, 5, 17, 30).getTime());
  });

  it('ปี พ.ศ. ต้องถูกลบ 543 (บทเรียนข้อ 11) ไม่งั้นกลายเป็นอนาคต 543 ปี', () => {
    // ถ้าไม่ลบ ของจะ "ใหม่ตลอดกาล" → ไม่มีวันถูก archive และเรียงวันที่เพี้ยนทั้งหน้า
    expect(M.parseShipDayMs_('05/08/2569 17:30')).toBe(new Date(2026, 7, 5, 17, 30).getTime());
  });

  it('อ่านไม่ออก → null (ให้ตัวเรียกตัดสินใจเอง ไม่เดาเป็น 0 = 1970)', () => {
    expect(M.parseShipDayMs_('')).toBeNull();
    expect(M.parseShipDayMs_('ไม่ใช่วันที่')).toBeNull();
    expect(M.parseShipDayMs_(null)).toBeNull();
  });

  it('parseShipRecvAt_ ยังคืน Date เหมือนเดิม (ของเดิมเรียกใช้อยู่)', () => {
    const d = M.parseShipRecvAt_('05/08/2026 17:30');
    expect(d instanceof Date).toBe(true);
    expect(d.getFullYear()).toBe(2026);
    expect(M.parseShipRecvAt_('')).toBeNull();
  });
});

describe('shipCloseMs_ — เวลาที่ถือว่าปิดเคส', () => {
  it('ใช้เวลายืนยันรับเป็นหลัก', () => {
    const row = shipRow({ date: '01/08/2026', recvAt: '05/08/2026 17:30' });
    expect(M.shipCloseMs_(row)).toBe(new Date(2026, 7, 5, 17, 30).getTime());
  });

  it('ไม่มีเวลารับ → ถอยไปใช้วันที่ทำรายการ', () => {
    const row = shipRow({ date: '01/08/2026', recvAt: '' });
    expect(M.shipCloseMs_(row)).toBe(new Date(2026, 7, 1, 0, 0).getTime());
  });

  it('อ่านไม่ออกทั้งคู่ → null (ตัวเรียกถือว่าเก่าจริง ย้ายได้)', () => {
    const row = shipRow({ date: '', recvAt: '' });
    expect(M.shipCloseMs_(row)).toBeNull();
  });
});

describe('shipDedupKey_ — กันของซ้ำตอนย้ายแถวไป-กลับ', () => {
  it('ใบโอนคนละใบ = คนละคีย์', () => {
    const a = M.shipDedupKey_(shipRow({ ref: 'TF-20260803-005' }));
    const b = M.shipDedupKey_(shipRow({ ref: 'TF-20260804-001' }));
    expect(a).not.toBe(b);
  });

  it('ใบเดียวกัน SKU เดียวกัน จำนวนเท่ากัน = คีย์เดียวกัน (กู้ซ้ำแล้วไม่เกิดของซ้ำ)', () => {
    expect(M.shipDedupKey_(shipRow({}))).toBe(M.shipDedupKey_(shipRow({})));
  });

  it('SKU ต่างกันในใบเดียวกัน = คนละคีย์', () => {
    const a = M.shipDedupKey_(shipRow({ sku: 'OL00001' }));
    const b = M.shipDedupKey_(shipRow({ sku: 'R01025' }));
    expect(a).not.toBe(b);
  });

  it('SKU พิมพ์เล็ก/ใหญ่ต่างกัน = คีย์เดียวกัน', () => {
    expect(M.shipDedupKey_(shipRow({ sku: 'ol00001' })))
      .toBe(M.shipDedupKey_(shipRow({ sku: 'OL00001' })));
  });

  it('ไม่มี SKU → คีย์ว่าง (ตัวเรียกข้ามแถวนี้ ไม่เอาไปเทียบ)', () => {
    expect(M.shipDedupKey_(new Array(15).fill(''))).toBe('');
  });
});

describe('normalizeShipRow_ — setValues บังคับให้ทุกแถวกว้างเท่ากัน', () => {
  it('แถวสั้นกว่าถูกเติมช่องว่างจนครบ', () => {
    expect(M.normalizeShipRow_(['a', 'b'], 5)).toEqual(['a', 'b', '', '', '']);
  });

  it('แถวยาวกว่าถูกตัดให้พอดี (ไม่งั้น setValues โยน error ทั้งชุด)', () => {
    expect(M.normalizeShipRow_(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
  });

  it('กว้างเท่ากันอยู่แล้ว → ได้ค่าเดิมครบ', () => {
    expect(M.normalizeShipRow_(['a', 'b', 'c'], 3)).toEqual(['a', 'b', 'c']);
  });
});

describe('meta-test — กันโค้ดจริงถอยกลับไปพฤติกรรมเดิมเงียบ ๆ', () => {
  const archSrc = grab(/function archiveReceivedShipments\(\)[\s\S]*?\n\}\n/);

  it('archiveReceivedShipments ต้องเช็คอายุก่อนย้ายเสมอ', () => {
    // ถ้าใครลบเงื่อนไขนี้ออก จะกลับไปย้าย "รับครบ" ทันทีเหมือนเดิม แล้วของหายจากจอ
    // อีกรอบโดยไม่มี error ให้เห็น — บั๊กแบบที่ผู้ใช้เจอก่อนใครเสมอ
    expect(archSrc).toContain('SHIP_ARCHIVE_KEEP_DAYS');
    expect(archSrc).toContain('shipCloseMs_');
  });

  it('ไม่มีเส้นทางไหนย้าย "รับครบ" ออกทันทีโดยไม่ดูอายุ', () => {
    expect(archSrc).not.toMatch(/status === "รับครบ"\s*\)\s*\{\s*toArchive\.push/);
  });

  it('ของที่ยังไม่มีใครกดรับ ต้องถูกข้ามในลูป archive', () => {
    expect(archSrc).toMatch(/status !== "รับครบ" && status !== "รับไม่ครบ"/);
  });

  it('SHIP_PARTIAL_ARCHIVE_DAYS (เกณฑ์ 7 วันแบบเก่า) ถูกถอดออกแล้ว', () => {
    // เหลือค้างไว้ = มีสองเกณฑ์ในไฟล์เดียว คนแก้ทีหลังจะไม่รู้ว่าอันไหนมีผลจริง
    expect(SRC).not.toContain('SHIP_PARTIAL_ARCHIVE_DAYS');
  });

  it('เครื่องมือของเจ้าของต้องไม่ลงท้าย _ (ต้องโผล่ใน dropdown ของ GAS editor)', () => {
    const fns = new Set([...SRC.matchAll(/^function ([A-Za-z0-9_]+)\(/gm)].map((m) => m[1]));
    ['restoreArchivedShipments', 'cleanupOldPendingShipments', 'previewShipmentCleanup']
      .forEach((n) => expect(fns.has(n), n + ' ต้องมีอยู่จริง').toBe(true));
    ['restoreArchivedShipments_', 'cleanupOldPendingShipments_', 'previewShipmentCleanup_']
      .forEach((n) => expect(fns.has(n)).toBe(false));
  });

  it('previewShipmentCleanup อ่านอย่างเดียว — ห้ามเขียน/ลบอะไรทั้งสิ้น', () => {
    // ถ้าเผลอให้มันเขียน เจ้าของจะ "ลองดูเฉย ๆ" ไม่ได้อีกเลย
    const fn = grab(/function previewShipmentCleanup\(\)[\s\S]*?\n\}\n/);
    expect(fn).not.toMatch(/setValues|setValue|deleteRow|appendRow|clearContent|invalidateCache_/);
  });

  it('restore/cleanup ต้อง invalidateCache_ ไม่งั้นหน้าเว็บยังเห็นของเก่าไปอีก 3 นาที', () => {
    const restore = grab(/function restoreArchivedShipments\(\)[\s\S]*?\n\}\n/);
    const cleanup = grab(/function cleanupOldPendingShipments\(\)[\s\S]*?\n\}\n/);
    expect(restore).toContain('invalidateCache_()');
    expect(cleanup).toContain('invalidateCache_()');
  });

  it('cleanup ย้ายเข้าประวัติก่อนลบเสมอ (ย้าย ไม่ใช่ลบทิ้ง)', () => {
    const cleanup = grab(/function cleanupOldPendingShipments\(\)[\s\S]*?\n\}\n/);
    const iWrite = cleanup.indexOf('setValues');
    const iDel   = cleanup.indexOf('deleteRow');
    expect(iWrite).toBeGreaterThan(-1);
    expect(iDel).toBeGreaterThan(-1);
    expect(iWrite, 'ต้องเขียนลงประวัติก่อนลบออกจากชีตหลัก').toBeLessThan(iDel);
  });

  it('cleanup แตะเฉพาะแถวที่ยังไม่เคยกดรับ (มีเวลารับแล้วต้องข้าม)', () => {
    const cleanup = grab(/function cleanupOldPendingShipments\(\)[\s\S]*?\n\}\n/);
    expect(cleanup).toMatch(/if \(recvAt\) continue;/);
  });
});
