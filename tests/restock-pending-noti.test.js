// tests/restock-pending-noti.test.js
// ─────────────────────────────────────────────────────────────────────────────
// แจ้งเตือน 2 ตัวที่เพิ่มให้ตำแหน่งที่เดิมแทบไม่ได้รับอะไรเลย (frontstore/saler/storedevice):
//   1. fsNeedsRestock_    — "ของหมดหน้าร้าน แต่คลังยังมี" (ยิงจาก syncZortBoth ทุก 2 ชม.)
//   2. shipPendingAging_  — "ส่งไปแล้วยังไม่มีใครกดรับ" (ยิงจาก archiveReceivedShipments ตี 3)
//
// eval ฟังก์ชันจริงจาก .gs ตรง ๆ (ไม่ copy เข้า helpers.js — หลักเดียวกับ auth.test.js)
// เพราะทั้งคู่เป็นตัวตัดสิน "ใครได้รู้เรื่องอะไร" ที่ถ้าสำเนา drift แล้วจะเงียบสนิท
//
// สิ่งที่คุมหนักที่สุดคือ **จุดเชื่อมต่อ** ไม่ใช่สูตร — เกณฑ์ที่ไม่ตรงกับ UI ปลายทาง
// ทำให้ "กดตามแจ้งเตือนไปแล้วไม่เจอสิ่งที่แจ้งเตือนพูดถึง" ซึ่งหน้าจอดูปกติทุกประการ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VMAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function evalGs(names, extra = '') {
  const src = names.map((n) => {
    const m = GS.match(new RegExp(`(?:function ${n}\\([\\s\\S]*?\\n\\}|var ${n} = [^;]+;)`));
    if (!m) throw new Error('หาไม่เจอใน .gs: ' + n);
    return m[0];
  }).join('\n');
  return new Function(`${extra}\n${src}\nreturn { ${names.join(', ')} };`)();
}

// ── 1. ของหมดหน้าร้าน แต่คลังยังมี ─────────────────────────────────────────
const { fsNeedsRestock_, FS_REORDER_MAX } = evalGs(['FS_REORDER_MAX', 'fsNeedsRestock_']);

describe('fsNeedsRestock_ — "หมดหน้าร้าน แต่คลังมี"', () => {
  it('หมดหน้าร้าน + คลังมีของ = ต้องแจ้ง (นี่คือเคสหลักทั้งหมด)', () => {
    expect(fsNeedsRestock_('ดอกไม้', 0, 25, 0)).toBe(true);
  });

  it('คลังไม่มีของ = ไม่แจ้ง — สั่งไม่ได้ แจ้งไปก็ทำอะไรไม่ได้', () => {
    // เคสนี้เป็นเรื่องของ PO ซึ่งแจ้ง owner/warehouse ผ่าน "สต็อกใกล้หมด" อยู่แล้ว
    expect(fsNeedsRestock_('ดอกไม้', 0, 0, 0)).toBe(false);
    expect(fsNeedsRestock_('ดอกไม้', 0, -3, 0)).toBe(false);
  });

  it('หน้าร้านยังมีของ = ไม่แจ้ง', () => {
    expect(fsNeedsRestock_('ดอกไม้', 5, 25, 0)).toBe(false);
    expect(fsNeedsRestock_('ดอกไม้', 1, 25, 0)).toBe(false);
  });

  it('หน้าร้านติดลบ (ขายเกิน) = แจ้ง — ยิ่งต้องเติมด่วน', () => {
    expect(fsNeedsRestock_('ดอกไม้', -2, 25, 0)).toBe(true);
  });

  it('สินค้าสั่งทำ (Made to Order) ไม่นับ — ไม่ได้วางขายหน้าร้าน', () => {
    expect(fsNeedsRestock_('งานพิเศษ Made to Order', 0, 25, 0)).toBe(false);
  });

  it('หมวด "ไม่มีรหัสสินค้า" ไม่นับ — ไม่ใช่สินค้าจริง สั่งไม่ได้', () => {
    expect(fsNeedsRestock_('ไม่มีรหัสสินค้า', 0, 25, 0)).toBe(false);
  });

  it('หมวดว่าง/ไม่มีข้อมูล ยังนับตามปกติ (ไม่ตัดทิ้งเพราะข้อมูลไม่ครบ)', () => {
    expect(fsNeedsRestock_('', 0, 25, 0)).toBe(true);
    expect(fsNeedsRestock_(undefined, 0, 25, 0)).toBe(true);
  });

  it('เจ้าของปรับเกณฑ์ขึ้นได้ — 0 → 3 แล้วของที่เหลือ 2 ชิ้นเข้าเกณฑ์', () => {
    expect(fsNeedsRestock_('ดอกไม้', 2, 25, 0)).toBe(false);
    expect(fsNeedsRestock_('ดอกไม้', 2, 25, 3)).toBe(true);
    expect(fsNeedsRestock_('ดอกไม้', 4, 25, 3)).toBe(false);
  });

  it('⚠️ เกณฑ์ถูก clamp ที่ FS_REORDER_MAX เสมอ — เกินนี้ปลายทางไม่โชว์', () => {
    // ตั้ง 99 แล้วแจ้งของที่หน้าร้านเหลือ 50 ชิ้น = กดเข้าไปในตัวกรอง "ควรสั่ง" แล้วไม่เจอ
    // เพราะตัวกรองนั้นเอาแค่ ≤12 → แจ้งเตือนพูดถึงของที่ปลายทางไม่มี (เงียบสนิท)
    expect(fsNeedsRestock_('ดอกไม้', 50, 25, 99)).toBe(false);
    expect(fsNeedsRestock_('ดอกไม้', FS_REORDER_MAX, 25, 99)).toBe(true);
    expect(fsNeedsRestock_('ดอกไม้', FS_REORDER_MAX + 1, 25, 99)).toBe(false);
  });
});

describe('fsNeedsRestock_ — จุดเชื่อมต่อกับ UI ปลายทาง (meta)', () => {
  it('FS_REORDER_MAX ตรงกับ needsReorder ใน CategoryView เป๊ะ', () => {
    // แจ้งเตือนพาไปหยุดที่ตัวกรอง "🛒 ควรสั่ง" — เกณฑ์สองฝั่งไม่ตรงกันเมื่อไหร่
    // = แจ้งของที่ตัวกรองปลายทางกรองทิ้ง ผู้ใช้เห็นลิสต์ที่ไม่มีของที่แจ้งไป
    const fn = VMAIN.match(/const needsReorder = uC\(\(p\) => \{[\s\S]*?\}, \[\]\);/)[0];
    const m = fn.match(/qtyStore\|\|0\) <= (\d+)/);
    expect(m, 'อ่านเกณฑ์จาก needsReorder ไม่ได้ (สูตรถูกแก้รูปแบบ?)').not.toBeNull();
    expect(Number(m[1]), 'เกณฑ์ .gs กับ .jsx ไม่ตรงกัน').toBe(FS_REORDER_MAX);
    expect(fn, 'needsReorder ต้องยังเช็คว่าคลังมีของ').toMatch(/qtyWH\|\|0\) > 0/);
  });

  it('CategoryView รับ view "reorder" จริง และล้างตัวกรองที่ซ่อนของก่อนเสมอ', () => {
    const hook = VMAIN.match(/useViewIntent\("categories",[\s\S]*?\n {2}\}\);/);
    expect(hook, 'CategoryView ไม่มี useViewIntent รับ').not.toBeNull();
    const b = hook[0];
    expect(b).toMatch(/v !== "reorder"/);
    expect(b).toMatch(/setReorderFilter\(true\)/);
    // ค้างอยู่ในหมวด/โหมดของฉัน/คำค้น → กดแล้วเห็นจอว่าง แยกไม่ออกจากแอปพัง
    ['setActive("")', 'setMineOnly(false)', 'setGlobalSearch("")'].forEach((s) => {
      expect(b, 'ไม่ได้ล้าง ' + s).toContain(s);
    });
  });

  it('audience ของ "หมดหน้าร้าน" ครอบคน 3 ตำแหน่งที่เดิมไม่เคยได้อะไรเลย', () => {
    const b = GS.match(/pushInappNoti_\(\{[^}]*ของหมดหน้าร้าน[\s\S]*?\}\);/)[0];
    ['frontstore', 'saler', 'storedevice'].forEach((r) => {
      expect(b, 'ขาด role ' + r).toMatch(new RegExp(`audience: '[^']*${r}`));
    });
    // ⚠️ ไม่มี warehouse โดยตั้งใจ — คนคลังไม่ได้กดสั่งแทนหน้าร้าน และจะได้ "ออเดอร์ใหม่"
    //    อยู่แล้วตอนหน้าร้านกดสั่งจริง · ใส่เข้าไป = แจ้ง 2 เด้งเรื่องเดียวกัน
    expect(b).not.toMatch(/audience: '[^']*warehouse/);
    expect(b).toMatch(/tab: 'categories', view: 'reorder'/);
  });

  it('ทุก role ใน audience มีแท็บ categories จริง (ไม่งั้นกดแล้วไม่มีอะไรเกิดขึ้น)', () => {
    // NotiBell กันด้วย allowedTabIds.includes(t) แล้ว return เงียบ ๆ — ยิงไปหา role
    // ที่ไม่มีแท็บปลายทาง = แจ้งเตือนกดไม่ติดโดยไม่มี error ให้เห็น
    const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
    const b = GS.match(/pushInappNoti_\(\{[^}]*ของหมดหน้าร้าน[\s\S]*?\}\);/)[0];
    const roles = b.match(/audience: 'role:([^']+)'/)[1].split(',');
    const tabsBlock = APP.match(/const ROLE_TABS = \{[\s\S]*?\n\};/)[0];
    roles.forEach((r) => {
      const row = tabsBlock.match(new RegExp(`${r}:\\s*\\[([\\s\\S]*?)\\]`));
      expect(row, 'ไม่เจอ role ' + r + ' ใน ROLE_TABS').not.toBeNull();
      expect(row[1], `role ${r} ไม่มีแท็บ categories`).toContain('"categories"');
    });
  });

  it('เกาะการอ่านชีตรอบเดิม ไม่เปิดชีตเพิ่ม', () => {
    // ตัวสแกนนี้รันทุก 2 ชม. — อ่านชีตสินค้าซ้ำอีกรอบคือค่าใช้จ่ายที่ไม่ต้องจ่าย
    const blk = GS.match(/var fsRestockItems = \[\];[\s\S]*?Front-store restock/)[0];
    expect(blk).toMatch(/fsRestockItems\.push/);
    expect(blk, 'ไม่ควรเปิดชีตเพิ่มในบล็อกนี้').not.toMatch(/getSheetByName\(SHEET_PRODUCT_META/);
  });
});

// ── 2. ของที่ส่งไปแล้วยังไม่มีใครกดรับ ──────────────────────────────────────
const SHIP_COLS = `
var COL_SHIP_REF = 1, COL_SHIP_DATE = 2, COL_SHIP_SKU = 6, COL_SHIP_NAME = 7,
    COL_SHIP_QTY = 8, COL_SHIP_RECVAT = 13;
`;
const { shipPendingAging_, SHIP_PENDING_ALERT_DAYS } =
  evalGs(['SHIP_PENDING_ALERT_DAYS', 'parseShipDayMs_', 'shipPendingAging_'], SHIP_COLS);

const NOW = new Date(2026, 7, 20, 10, 0, 0).getTime();   // 20 ส.ค. 2026
// สร้างแถวชีตโอนแบบเดียวกับของจริง (1-indexed → array 0-indexed)
function shipRow({ ref = 'TF-1', date = '', sku = 'VAS001', name = 'แจกัน', qty = 10, recvAt = '' }) {
  const r = new Array(16).fill('');
  r[COL(1)] = ref; r[COL(2)] = date; r[COL(6)] = sku; r[COL(7)] = name;
  r[COL(8)] = qty; r[COL(13)] = recvAt;
  return r;
}
function COL(n) { return n - 1; }
const HEAD = [shipRow({ sku: '' }), shipRow({ sku: '' })];   // หัวตาราง 2 แถว

describe('shipPendingAging_ — ของค้างรับ', () => {
  it('ค้างเกินเกณฑ์ = เข้ารายการ พร้อมอายุที่ถูกต้อง', () => {
    const rows = [...HEAD, shipRow({ date: '15/08/2026' })];
    const out = shipPendingAging_(rows, NOW, 3);
    expect(out).toHaveLength(1);
    expect(out[0].ageDays).toBe(5);
    expect(out[0].sku).toBe('VAS001');
    expect(out[0].refNum).toBe('TF-1');
    expect(out[0].qty).toBe(10);
  });

  it('ยังไม่ถึงเกณฑ์ = ไม่นับ (ปกติหน้าร้านรับภายในวันเดียวกับที่รถมาส่ง)', () => {
    const rows = [...HEAD, shipRow({ date: '18/08/2026' })];
    expect(shipPendingAging_(rows, NOW, 3)).toHaveLength(0);
  });

  it('กดรับแล้ว = ปิดเคส ไม่ต้องทวง (แม้จะเก่ามาก)', () => {
    const rows = [...HEAD, shipRow({ date: '01/01/2026', recvAt: '02/01/2026 09:00' })];
    expect(shipPendingAging_(rows, NOW, 3)).toHaveLength(0);
  });

  it('วันที่เป็น พ.ศ. ต้องอ่านออก (บทเรียนข้อ 11)', () => {
    // ชีตโอนบางแถวเขียนด้วย toLocaleString("th-TH") = ปี 2569 — อ่านตรง ๆ จะได้อนาคต 543 ปี
    // แล้วถูกตัดทิ้งทั้งหมด = ของค้างจริงไม่มีวันถูกเตือน โดยไม่มี error ให้เห็น
    const rows = [...HEAD, shipRow({ date: '15/08/2569' })];
    const out = shipPendingAging_(rows, NOW, 3);
    expect(out).toHaveLength(1);
    expect(out[0].ageDays).toBe(5);
  });

  it('อ่านวันที่ไม่ออก = ข้าม ไม่เดาอายุ', () => {
    const rows = [...HEAD, shipRow({ date: '' }), shipRow({ date: 'เมื่อวาน' })];
    expect(shipPendingAging_(rows, NOW, 3)).toHaveLength(0);
  });

  it('วันที่อนาคต / เก่าเกิน 400 วัน = ข้าม (วันที่เพี้ยน ไม่โชว์เลขมั่ว)', () => {
    const rows = [...HEAD, shipRow({ date: '25/08/2026' }), shipRow({ date: '01/01/2020' })];
    expect(shipPendingAging_(rows, NOW, 3)).toHaveLength(0);
  });

  it('แถวไม่มี SKU / หัวตาราง 2 แถว ไม่ถูกนับ', () => {
    const rows = [...HEAD, shipRow({ date: '15/08/2026', sku: '' })];
    expect(shipPendingAging_(rows, NOW, 3)).toHaveLength(0);
    expect(shipPendingAging_(HEAD, NOW, 3)).toHaveLength(0);
    expect(shipPendingAging_([], NOW, 3)).toHaveLength(0);
  });

  it('เรียงค้างนานสุดขึ้นก่อน — หัวข้อแจ้งเตือนอ่าน "นานสุด" จากตัวแรก', () => {
    const rows = [...HEAD,
      shipRow({ date: '17/08/2026', sku: 'A' }),
      shipRow({ date: '01/08/2026', sku: 'B' }),
      shipRow({ date: '10/08/2026', sku: 'C' })];
    const out = shipPendingAging_(rows, NOW, 3);
    expect(out.map((x) => x.sku)).toEqual(['B', 'C', 'A']);
    expect(out[0].ageDays).toBe(19);
  });
});

describe('ของค้างรับ — จุดเชื่อมต่อ (meta)', () => {
  it('เกณฑ์ตรงกับป้ายแดง "ค้าง N วัน" ในหน้าติดตาม', () => {
    // สองที่พูดคนละเลข = คนอ่านไม่รู้ว่าอันไหนคือเกณฑ์จริง (แจ้งตอน 3 วันแต่ป้ายแดงตอน 5)
    const m = VANA.match(/const ageTone = age == null \? null : age >= (\d+)/);
    expect(m, 'อ่านเกณฑ์สีแดงจากหน้าติดตามไม่ได้').not.toBeNull();
    expect(Number(m[1])).toBe(SHIP_PENDING_ALERT_DAYS);
  });

  it('ยิง 2 แถวแยกกัน — คนกดรับได้ไปหน้าที่กดรับได้ · คนตามของไปหน้าติดตาม', () => {
    const fn = GS.match(/function notifyPendingReceives_\([\s\S]*?\n\}/)[0];
    expect(fn).toMatch(/audience: 'role:frontstore,employee'[\s\S]*?tab: 'orders', view: 'shipped'/);
    expect(fn).toMatch(/audience: 'role:warehouse,owner'[\s\S]*?tab: 'tracking'/);
    // dedupKey ต้องคนละคีย์ ไม่งั้นตัวที่ยิงทีหลังถูก dedup ทิ้งเงียบ ๆ (ฝั่งนั้นไม่ได้รับเลย)
    const keys = [...fn.matchAll(/dedupKey: '([^']+)'/g)].map((m) => m[1]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('เรียกก่อนทางออกลัดของ archiveReceivedShipments', () => {
    // วันที่ไม่มีอะไรต้อง archive = ไม่มีใครกดรับเลย = วันที่ของค้างเยอะที่สุดพอดี
    // วางไว้หลัง early-return เมื่อไหร่ = เงียบสนิทในวันที่ควรเตือนที่สุด
    const fn = GS.match(/function archiveReceivedShipments\(\)[\s\S]*?\n\}\n/)[0];
    const iCall = fn.indexOf('notifyPendingReceives_(data');
    const iReturn = fn.indexOf('if (!toArchive.length)');
    expect(iCall, 'archiveReceivedShipments ไม่ได้เรียก notifyPendingReceives_').toBeGreaterThan(0);
    expect(iReturn).toBeGreaterThan(0);
    expect(iCall).toBeLessThan(iReturn);
    // ต้องห่อ try/catch — แจ้งเตือนพลาดห้ามขวางงาน archive (หลักเดียวกับ pushInappNoti_)
    expect(fn).toMatch(/try \{ notifyPendingReceives_\(data[\s\S]*?catch/);
  });

  it('ไม่อ่านชีตซ้ำ — ใช้แถวที่ archiveReceivedShipments อ่านมาแล้ว', () => {
    const fn = GS.match(/function notifyPendingReceives_\([\s\S]*?\n\}/)[0];
    expect(fn).not.toMatch(/getDataRange|getSheetByName|openById/);
  });

  it('ไม่ยิง LINE — เรื่องนี้ไม่คุ้ม quota (กระดิ่งอย่างเดียวพอ)', () => {
    const fn = GS.match(/function notifyPendingReceives_\([\s\S]*?\n\}/)[0];
    expect(fn).not.toMatch(/sendLineMessage_|enqueueNoti_|UrlFetchApp/);
  });
});
