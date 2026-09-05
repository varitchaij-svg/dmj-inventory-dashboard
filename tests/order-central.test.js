// tests/order-central.test.js — ป้ายเสริม "ส่ง Central" บนใบสั่งของ (ส.ค. 2026)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง: คลัง/หน้าร้าน/เซล อยากติดป้าย "ส่งไปขายที่ Central" ให้ใบสั่งของบางใบได้
// จากหน้า "รายการสั่งของ" (คนละจุดกับหน้าสร้างออเดอร์ที่ใช้บ่อยสุด — ไม่อยากเพิ่มความซับซ้อน
// ที่นั่น เพราะเคสนี้เกิดนาน ๆ ครั้ง) เป็นแค่ "ป้ายเสริม" คนละตัวกับ carryMode (หิ้ว/รอขึ้นรถ
// คอลัมน์ A) ไม่แทนที่กัน · สลับกลับได้เหมือนปุ่ม 🚶/🚛 · เห็นร่วมกันทุกเครื่อง (บันทึกลงชีต
// คอลัมน์ P ต่อท้าย cid — บทเรียนข้อ 5 ห้ามแทรกกลาง)
//
// เหมือน order-idempotent.test.js/order-rowshift.test.js: **ไม่ copy โค้ดเข้า helpers.js**
// eval ฟังก์ชันจริงจาก .gs — เจอบั๊กจริงระหว่างพัฒนาฟีเจอร์นี้: syncOrderUpdate (.jsx) มี
// allowlist ฟิลด์ที่ส่งไป GAS อยู่แล้ว (status/preparedQty/printFlag/carryMode) เพิ่ม field
// ใหม่แล้วลืมเติมในนั้น = ปุ่มกดติด ค้างสถานะใน localStorage แต่ค่าไม่เคยถูกส่งไปชีตเลย
// **โดยไม่มี error ให้เห็น** (เครื่องอื่นเปิดแอปมาจะไม่เห็นป้ายเลย) — เทสต์ชุดนี้ล็อกจุดนั้นไว้
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

describe('column index — COL_ORD_CENTRAL', () => {
  const cols = {};
  GS.replace(/(?:var|const) (COL_ORD_\w+)\s*=\s*(\d+);/g, (_, k, v) => { cols[k] = Number(v); return ''; });

  it('อยู่ที่ P (16) ต่อท้าย cid (O=15)', () => {
    expect(cols.COL_ORD_CID).toBe(15);
    expect(cols.COL_ORD_CENTRAL).toBe(16);
  });

  it('ไม่ชนกับคอลัมน์อื่นที่ใช้อยู่แล้ว', () => {
    const seen = new Map();
    Object.entries(cols).forEach(([k, v]) => {
      expect(seen.has(v), `คอลัมน์ ${v} ถูกใช้ซ้ำโดย ${seen.get(v)} และ ${k}`).toBe(false);
      seen.set(v, k);
    });
  });
});

describe('backend — readOrders_ อ่าน toCentral จาก col P (index 15)', () => {
  const { readOrders_ } = (() => {
    const fn = grab(GS, /function readOrders_\(rowsOpt\) \{[\s\S]*?\n\}/, 'readOrders_');
    const Logger = { log: () => {} };
    // eslint-disable-next-line no-new-func
    return new Function('Logger', `${fn}\nreturn { readOrders_ };`)(Logger);
  })();

  // แถวจำลอง A..P — readOrders_ ข้าม index 0 เสมอ (header)
  function row({ type = 'รอขึ้นรถ', sku = 'OL00001', name = 'มะกอก', qty = 6, central = '' } = {}) {
    const r = new Array(16).fill('');
    r[0] = type; r[5] = sku; r[6] = name; r[7] = qty; r[15] = central;
    return r;
  }

  it('col P = "1" → toCentral: true', () => {
    const out = readOrders_([[], row({ central: '1' })]);
    expect(out[0].toCentral).toBe(true);
  });

  it('col P ว่าง (แถวเก่าก่อนมีฟีเจอร์นี้) → toCentral: false ไม่ throw', () => {
    const out = readOrders_([[], row({ central: '' })]);
    expect(out[0].toCentral).toBe(false);
  });

  it('เป็นคนละฟิลด์กับ carryMode (col A) — ติดป้าย Central แล้ว carryMode ยังอ่านถูกต้องปกติ', () => {
    const out = readOrders_([[], row({ type: 'หิ้ว', central: '1' })]);
    expect(out[0].carryMode).toBe('carry');
    expect(out[0].toCentral).toBe(true);
    const out2 = readOrders_([[], row({ type: 'รอขึ้นรถ', central: '1' })]);
    expect(out2[0].carryMode).toBe('truck');
    expect(out2[0].toCentral).toBe(true);
  });
});

describe('backend — updateOrderState เขียน toCentral ลง COL_ORD_CENTRAL โดยไม่แตะ COL_ORD_TYPE', () => {
  const fn = grab(GS, /function updateOrderState\(ss, body\) \{[\s\S]*?\n\}\n/, 'updateOrderState');

  it('เขียนก็ต่อเมื่อ toCentral != null (M2 pattern — กัน false ถูกข้าม) ทั้ง 2 เส้นทาง', () => {
    const hits = fn.match(/if \(body\.toCentral != null\) sheet\.getRange\((?:sheetRow|row), COL_ORD_CENTRAL\)\.setValue\(body\.toCentral \? 1 : ""\);/g) || [];
    // orderId ตรง + fallback match by sku+date (เหมือน carryMode/printFlag ข้างบน)
    expect(hits.length).toBe(2);
  });

  it('ไม่ปนกับ COL_ORD_TYPE (carryMode) — เขียนคนละคอลัมน์กันเด็ดขาด', () => {
    expect(fn).not.toMatch(/COL_ORD_TYPE\)\.setValue\([^;]*toCentral/);
    expect(fn).not.toMatch(/COL_ORD_CENTRAL\)\.setValue\([^;]*carryMode/);
  });

  it('before/after audit เก็บ toCentral ด้วย ไม่ใช่แค่เขียนเงียบ ๆ', () => {
    const beforeHits = fn.match(/toCentral: (?:sheet\.getRange\([^)]*COL_ORD_CENTRAL\)\.getValue\(\) \|\| ""|data\[i\]\[COL_ORD_CENTRAL - 1\] \|\| "")/g) || [];
    expect(beforeHits.length).toBe(2);
    const afterHits = fn.match(/carryMode: body\.carryMode, toCentral: body\.toCentral/g) || [];
    expect(afterHits.length).toBe(2);
  });
});

describe('meta — จุดเชื่อมต่อที่ถ้าหลุดแล้วปุ่มกดติดแต่ค่าไม่เคยลงชีตเลย', () => {
  it('syncOrderUpdate ต้องส่ง toCentral ไปด้วย (allowlist ฟิลด์ฝั่ง frontend)', () => {
    // จับได้จริงระหว่างพัฒนา: เพิ่ม field ใหม่แล้วลืมเติมในนี้ → GAS ไม่เห็น field เลย
    const fn = grab(VANA, /async function syncOrderUpdate\(order, updates\) \{[\s\S]*?\n\}/, 'syncOrderUpdate');
    expect(fn).toMatch(/toCentral:\s*updates\.toCentral/);
  });

  it('setToCentral ต้อง patch ทั้ง local state (onPatch) และเขียนชีตจริง (syncOrderUpdate)', () => {
    // F06 — เดิมเขียน onPatch + syncOrderUpdate ตรง ๆ แล้ว "ไม่เคยดูผล" · ตอนนี้เดินผ่าน
    // saveOrderField ตัวกลางที่ await ผลจริงและถอย optimistic กลับเมื่อบันทึกไม่ผ่าน
    // เช็คทั้ง 2 ชั้น: ปุ่มเรียกตัวกลางจริง และตัวกลางยัง patch+เขียนชีตครบ
    const call = grab(VANA, /const setToCentral = v => saveOrderField\(.*?\);/, 'setToCentral');
    expect(call).toMatch(/\{toCentral: v\}/);
    expect(call).toMatch(/\{toCentral: order\.toCentral\}/);   // ค่าเดิมไว้ถอยกลับ
    const fn = grab(VANA, /const saveOrderField = async \([\s\S]*?\n  \};/, 'saveOrderField');
    expect(fn).toMatch(/onPatch\(order\.id, updates\)/);
    expect(fn).toMatch(/await syncOrderUpdate\(order, updates\)/);
  });

  it('ปุ่มกดถูกกั้นด้วย role list (คลัง/หน้าร้าน/เซล/owner) ไม่เปิดให้ทุก role', () => {
    expect(VANA).toMatch(/const canToggleCentral = \["warehouse", "frontstore", "saler", "owner"\]\.indexOf\(role\) >= 0;/);
  });

  it('ปุ่มถูกห่อด้วย canToggleCentral จริง ไม่ใช่แค่ประกาศตัวแปรทิ้งไว้เฉย ๆ', () => {
    expect(VANA).toMatch(/\{canToggleCentral && \(\s*\n\s*<button className="order-action-btn" onClick=\{\(\) => setToCentral\(!order\.toCentral\)\}/);
  });

  it('ป้ายบนการ์ด (badge) โชว์ตาม order.toCentral ตรง ๆ ไม่ผูกกับ canToggleCentral — ต้องเห็นร่วมกันทุกเครื่องแม้เครื่องนั้นกดปุ่มไม่ได้', () => {
    expect(VANA).toMatch(/\{order\.toCentral \? <span[\s\S]{0,300}Central[\s\S]{0,20}<\/span> : null\}/);
  });

  it('ปุ่ม toggle เรียก setToCentral ไม่ใช่ setCarryMode (กันสับสน 2 ฟีเจอร์ปนกัน)', () => {
    expect(VANA).toMatch(/onClick=\{\(\) => setToCentral\(!order\.toCentral\)\}/);
  });
});
