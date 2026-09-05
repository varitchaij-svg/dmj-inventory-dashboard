// tests/who-did-it.test.js — ใครสั่ง / ใครจัด / ใครรับ
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของขอให้เห็นชื่อคนทำทุกขั้นของเส้นทางสินค้า:
//   สั่ง (ชีต "ลำดับที่สั่งสินค้า" col L) → จัด (col M) → โอน (ชีตโอน col O)
//   → รับหน้าร้าน (ชีตโอน col N)
//
// ชื่อต้องมาจาก **session ที่ server ยืนยันเอง** ไม่ใช่ค่าที่ client ส่งมา ไม่งั้น
// "ใครทำ" กลายเป็นข้อมูลที่ปลอมได้ ซึ่งแย่กว่าไม่มีเลย (เชื่อผิดโดยไม่รู้ตัว)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const UI = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');
const VMAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

// ── คอลัมน์ต้องไม่ชนกัน (บั๊กที่เกิดบ่อยสุดในโปรเจกต์นี้ — บทเรียนข้อ 5) ──
describe('column index ของชีตสั่งสินค้า', () => {
  const cols = {};
  GS.replace(/const (COL_ORD_\w+)\s*=\s*(\d+);/g, (_, k, v) => { cols[k] = Number(v); return ''; });

  it('ประกาศครบทั้งผู้สั่ง (L=12) และผู้จัด (M=13)', () => {
    expect(cols.COL_ORD_ORDERBY).toBe(12);
    expect(cols.COL_ORD_PREPBY).toBe(13);
  });

  it('ไม่ทับคอลัมน์เดิมที่ใช้อยู่แล้ว', () => {
    const used = Object.entries(cols);
    const seen = new Map();
    used.forEach(([k, v]) => {
      expect(seen.has(v), `คอลัมน์ ${v} ถูกใช้ซ้ำโดย ${seen.get(v)} และ ${k}`).toBe(false);
      seen.set(v, k);
    });
  });

  it('printFlag ยังอยู่ N=14 เหมือนเดิม (ไม่ถูกเลื่อนเพราะแทรกคอลัมน์)', () => {
    expect(cols.COL_ORD_PRINTFLAG).toBe(14);
  });

  it('ผู้สั่ง/ผู้จัด อยู่ก่อน printFlag — เขียนแถวใหม่กว้าง 13 จึงไม่ล้างค่า N', () => {
    expect(cols.COL_ORD_ORDERBY).toBeLessThan(cols.COL_ORD_PRINTFLAG);
    expect(cols.COL_ORD_PREPBY).toBeLessThan(cols.COL_ORD_PRINTFLAG);
  });
});

describe('backend — ผู้สั่ง (handleOrder_)', () => {
  const fn = grab(GS, /function handleOrder_\(params\) \{[\s\S]*?\n\}/, 'handleOrder_');

  it('หาชื่อจาก session ไม่ใช่ params.actor ที่ client ส่งมา', () => {
    expect(fn).toMatch(/resolveSession_\(ss, params\.sessionToken\)/);
    expect(fn).toMatch(/staffActorName_\(sess\)/);
    expect(fn).not.toMatch(/params\.actor/);
  });

  it('ยังไม่ล็อกอิน → เว้นว่าง ไม่ใส่ชื่อเดา ๆ', () => {
    // มี session → ชื่อจาก session · ไม่มี → เว้นว่าง (ห้าม fallback ไปชื่อที่ client ส่งมา)
    expect(fn).toMatch(/var orderedBy = sess \? staffActorName_\(sess\) : '';/);
  });

  // F02 — action=order เป็น doGet จึงไม่ผ่านด่าน canDoOrNull_ ของ doPost ต้องกันบัญชีที่ถูกระงับเอง
  // (เส้นทางนี้เขียนชีตจริง ปล่อยผ่าน = คนที่เจ้าของกดระงับแล้วยังสั่งของเข้าคิวคลังได้)
  it('บัญชีที่ไม่ active สั่งของไม่ได้ — และตัดสินก่อนคว้า ScriptLock', () => {
    expect(fn).toMatch(/sessionInactiveOrNull_\(sess\)/);
    const iBlock = fn.indexOf('sessionInactiveOrNull_(sess)');
    const iLock  = fn.indexOf('lock = LockService.getScriptLock()');
    expect(iBlock).toBeGreaterThan(-1);
    expect(iLock).toBeGreaterThan(-1);
    // คว้าล็อกมาแล้วค่อยปฏิเสธ = ไปกันคนอื่นที่สั่งของถูกต้องอยู่โดยเปล่าประโยชน์
    expect(iBlock).toBeLessThan(iLock);
  });

  it('session พังต้องไม่ทำให้สั่งของไม่ได้ (ห่อ try/catch)', () => {
    expect(fn).toMatch(/try \{[\s\S]*?resolveSession_[\s\S]*?\} catch/);
  });

  it('เขียนแถวกว้าง 13 คอลัมน์ (เดิม 11) และมี orderedBy อยู่ในนั้น', () => {
    expect(fn).toMatch(/getRange\(nextRow, 1, 1, 13\)/);
    expect(fn).toMatch(/imageUrl, '', orderedBy, ''/);
  });
});

describe('backend — ผู้จัด (updateOrderState)', () => {
  const fn = grab(GS, /function updateOrderState\(ss, body\) \{[\s\S]*?\n\}\n/, 'updateOrderState');

  it('บันทึกผู้จัดทั้ง 2 เส้นทาง (orderId และ match by sku+date)', () => {
    const hits = fn.match(/COL_ORD_PREPBY\)\.setValue\(actor\)/g) || [];
    expect(hits.length).toBe(2);
  });

  it('กด "พิมพ์ label" อย่างเดียวไม่นับว่าเป็นคนจัด', () => {
    // เงื่อนไขต้องผูกกับ preparedQty/status เท่านั้น ไม่ใช่ printFlag
    expect(fn).toMatch(/if \(body\.preparedQty != null \|\| body\.status\)/);
    expect(fn).not.toMatch(/body\.printFlag[^)]*\)\s*\n?\s*sheet\.getRange\([^)]*COL_ORD_PREPBY/);
  });
});

describe('backend — actor ที่ verify แล้วต้องไปถึงทุก handler', () => {
  it('doPost ทับ data.actor ด้วยชื่อจาก session (ไม่ใช่แค่ตัวแปร actor)', () => {
    // updateOrderState รับ `data` ทั้งก้อนแล้วอ่าน body.actor เอง — ถ้าไม่ทับ
    // ชื่อผู้จัด/audit log ของ handler กลุ่มนี้จะยังเป็นค่าที่ client ส่งมา = ปลอมได้
    expect(GS).toMatch(/actor = staffActorName_\(_sess\) \|\| actor;[\s\S]{0,400}data\.actor = actor;/);
  });
});

describe('backend — readOrders_ ส่งชื่อออกไปให้ frontend', () => {
  const fn = grab(GS, /function readOrders_\(rowsOpt\) \{[\s\S]*?\n\}/, 'readOrders_');

  it('อ่านผู้สั่งจาก index 11 (L) และผู้จัดจาก index 12 (M)', () => {
    expect(fn).toMatch(/orderedBy:\s*String\(r\[11\]/);
    expect(fn).toMatch(/preparedBy:\s*String\(r\[12\]/);
  });

  it('printFlag ยังอ่านจาก index 13 (N) เหมือนเดิม', () => {
    expect(fn).toMatch(/printFlag:\s*r\[13\]/);
  });
});

describe('frontend — ส่ง sessionToken ไปกับการสั่ง', () => {
  const placeOrder = grab(VMAIN, /const placeOrder = async \(\) => \{[\s\S]*?\n  \};/, 'placeOrder');

  it('placeOrder แนบ sessionToken (doGet ไม่ผ่าน dmjFetch จึงไม่มีใครแนบให้)', () => {
    expect(placeOrder).toMatch(/sessionToken=\$\{encodeURIComponent\(localStorage\.getItem\('dmj_session_token'\)/);
  });
});

describe('frontend — WhoDidIt แสดงผลเหมือนกันทุกหน้า', () => {
  it('อยู่ใน ui.jsx (โหลดก่อนไฟล์ view ทุกตัว)', () => {
    expect(UI).toMatch(/function WhoDidIt\(/);
  });

  it('ไม่มีชื่อเลย → คืน null (ไม่โชว์ช่องว่างให้สงสัยว่าข้อมูลหาย)', () => {
    const fn = grab(UI, /function WhoDidIt\(\{[\s\S]*?\n\}/, 'WhoDidIt');
    expect(fn).toMatch(/if \(!items\.length\) return null;/);
  });

  it('รองรับครบทั้ง 3 บทบาท', () => {
    const fn = grab(UI, /function WhoDidIt\(\{[\s\S]*?\n\}/, 'WhoDidIt');
    expect(fn).toMatch(/orderedBy/);
    expect(fn).toMatch(/preparedBy/);
    expect(fn).toMatch(/receivedBy/);
  });

  it('ถูกใช้จริงในหน้ารายการสั่ง + สรุปออเดอร์ + ติดตามของ', () => {
    const uses = VANA.match(/<WhoDidIt/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });

  it('หน้ารายการสั่งส่งทั้งผู้สั่งและผู้จัดเข้าไป', () => {
    expect(VANA).toMatch(/<WhoDidIt orderedBy=\{order\.orderedBy\} preparedBy=\{order\.preparedBy\}/);
  });

  it('หน้าติดตามของ (shipment) ส่งผู้จัดและผู้รับ', () => {
    expect(VANA).toMatch(/<WhoDidIt preparedBy=\{s\.preparedBy\} receivedBy=\{s\.receivedBy\}/);
  });
});

describe('frontend — ไทม์ไลน์รวม order+shipment ต้องพาชื่อไปด้วย', () => {
  it('รายการฝั่ง order แนบ orderedBy/preparedBy ตอนสร้าง item', () => {
    expect(VANA).toMatch(/orderedBy: o\.orderedBy, preparedBy: o\.preparedBy/);
  });

  it('ค้นหาด้วยชื่อคนได้ (hay รวมทั้ง 3 ช่อง)', () => {
    expect(VANA).toMatch(/it\.orderedBy\|\|""[\s\S]{0,60}it\.preparedBy\|\|""[\s\S]{0,60}it\.receivedBy\|\|""/);
  });
});

describe('frontend — เตือนก่อนสั่งซ้ำว่าใครสั่งไว้แล้ว', () => {
  it('CategoryView สร้างแมพ SKU → รายชื่อคนสั่งที่ยังค้าง', () => {
    const fn = grab(VMAIN, /const pendingOrderByMap = uM\(\(\) => \{[\s\S]*?\n  \}, \[data\.orders\]\);/, 'pendingOrderByMap');
    expect(fn).toMatch(/o\.status === "รอ"/);
    expect(fn).toMatch(/if \(!o\.sku \|\| !o\.orderedBy\) return;/);   // แถวเก่าไม่มีชื่อ → ข้าม
    expect(fn).toMatch(/indexOf\(o\.orderedBy\) < 0/);                 // ไม่ซ้ำชื่อ
  });

  it('ส่งเข้า OrderModal เป็น prop pendingOrderBy', () => {
    expect(VMAIN).toMatch(/pendingOrderBy=\{pendingOrderByMap\[/);
    expect(VMAIN).toMatch(/function OrderModal\(\{[^}]*pendingOrderBy/);
  });

  it('แบนเนอร์โชว์ชื่อคนสั่งเมื่อมีข้อมูล', () => {
    expect(VMAIN).toMatch(/pendingOrderBy && pendingOrderBy\.length > 0/);
  });
});
