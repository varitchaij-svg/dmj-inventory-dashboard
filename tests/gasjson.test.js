// tests/gasjson.test.js — อ่านคำตอบจาก GAS ให้ปลอดภัย (dmjJson / dmjErrText)
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (ส.ค. 2026): พนักงานหน้าร้านกดสั่งของแล้วเจอข้อความ
//     Unexpected token '<', "<!DOCTYPE "... is not valid JSON
// เพราะ GAS ตอบกลับเป็น "หน้า HTML" (deployment ล่ม/หมดอายุ/ต้องขอสิทธิ์ใหม่)
// แต่โค้ดเอาเข้า res.json() ตรง ๆ · ที่แย่กว่าคือ syncFrontStoreData คืน success:true
// ทุกครั้งโดยไม่เคยอ่านคำตอบเลย → หน้าจอขึ้น "✅ บันทึกแล้ว" ทั้งที่ไม่มีอะไรถูกบันทึก
//
// ไม่ copy โค้ดเข้า helpers.js — eval ฟังก์ชันจริงจาก ui.jsx (แนวเดียวกับ auth.test.js)
// เพราะเป็นด่านสุดท้ายที่กันไม่ให้ "บันทึกไม่สำเร็จ" ถูกรายงานว่าสำเร็จ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');
const VIEWS_MAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

// eval ฟังก์ชันจริงจาก ui.jsx (ทั้งคู่เป็น plain JS ไม่มี JSX)
const { dmjJson, dmjErrText } = (function () {
  const code = [
    grab(UI, /async function dmjJson\(res\) \{[\s\S]*?\n\}/, 'dmjJson'),
    grab(UI, /function dmjErrText\(e\) \{[\s\S]*?\n\}/, 'dmjErrText'),
    'return { dmjJson: dmjJson, dmjErrText: dmjErrText };',
  ].join('\n');
  // console.warn ถูกเรียกใน dmjJson — stub ให้เงียบระหว่างเทสต์
  return new Function('console', code)({ warn() {} });
})();

// Response ปลอมแบบง่าย ๆ (dmjJson ใช้แค่ .text() / .status / .url)
const fakeRes = (body, status = 200, url = 'https://script.google.com/macros/s/x/exec') => ({
  status, url, text: async () => body,
});

describe('dmjJson — คำตอบที่เป็น JSON จริง', () => {
  it('parse JSON ปกติได้', async () => {
    expect(await dmjJson(fakeRes('{"success":true,"data":{"updated":1}}')))
      .toEqual({ success: true, data: { updated: 1 } });
  });

  it('คำตอบว่า success:false ก็ยัง parse ผ่าน (ให้ตัวเรียกตัดสินใจเอง ไม่ throw)', async () => {
    const d = await dmjJson(fakeRes('{"success":false,"error":"ไม่พบชีต จำนวนหน้าร้าน"}'));
    expect(d.success).toBe(false);
    expect(d.error).toBe('ไม่พบชีต จำนวนหน้าร้าน');
  });

  it('ตัวเลข/array ที่เป็น JSON ถูกต้องก็ผ่าน', async () => {
    expect(await dmjJson(fakeRes('[1,2,3]'))).toEqual([1, 2, 3]);
  });
});

describe('dmjJson — คำตอบที่ไม่ใช่ JSON (ต้นเหตุของบั๊ก)', () => {
  it('หน้า HTML → throw เป็น error ภาษาไทย ไม่ใช่ "Unexpected token"', async () => {
    const html = '<!DOCTYPE html><html><head><title>Error</title></head><body>Sorry…</body></html>';
    await expect(dmjJson(fakeRes(html, 404))).rejects.toThrow(/ระบบหลังบ้าน/);
  });

  it('หน้า HTML → ติดธง dmjKind + เก็บ status/ต้นข้อความไว้ไล่สาเหตุ', async () => {
    const html = '<!DOCTYPE html><html><body>login</body></html>';
    const err = await dmjJson(fakeRes(html, 302)).catch((e) => e);
    expect(err.dmjKind).toBe('badjson');
    expect(err.dmjStatus).toBe(302);
    expect(err.dmjBody).toContain('<!DOCTYPE');
    // ข้อความที่พนักงานเห็นต้องไม่มีศัพท์เทคนิคดิบ ๆ ของ JSON.parse
    expect(err.message).not.toMatch(/Unexpected token|JSON\.parse|is not valid JSON/);
  });

  it('HTML ที่มีช่องว่าง/บรรทัดว่างนำหน้า ก็ยังจับได้ว่าเป็น HTML', async () => {
    const err = await dmjJson(fakeRes('\n\n  <html><body>x</body></html>')).catch((e) => e);
    expect(err.dmjKind).toBe('badjson');
    expect(err.message).toMatch(/ระบบหลังบ้าน/);
  });

  it('คำตอบว่าง (GAS ตัดกลางคัน) → throw ไม่ใช่คืน undefined เงียบ ๆ', async () => {
    const err = await dmjJson(fakeRes('')).catch((e) => e);
    expect(err.dmjKind).toBe('badjson');
  });

  it('เก็บต้นข้อความไม่เกิน 300 ตัวอักษร (กัน console/ log บวม)', async () => {
    const err = await dmjJson(fakeRes('<' + 'x'.repeat(5000))).catch((e) => e);
    expect(err.dmjBody.length).toBeLessThanOrEqual(300);
  });
});

describe('dmjErrText — แปลง error เป็นข้อความที่พนักงานอ่านรู้เรื่อง', () => {
  it('error จาก dmjJson ใช้ข้อความไทยเดิม ไม่ถูกเขียนทับ', async () => {
    const err = await dmjJson(fakeRes('<!DOCTYPE html>')).catch((e) => e);
    expect(dmjErrText(err)).toBe(err.message);
  });

  it('เน็ตหลุด (TypeError: Failed to fetch) → บอกให้เช็คสัญญาณ', () => {
    expect(dmjErrText(new TypeError('Failed to fetch'))).toMatch(/ต่อเน็ตไม่ได้/);
  });

  it('iOS Safari ใช้ข้อความ "Load failed" → ต้องจับได้เหมือนกัน', () => {
    const e = new Error('Load failed');
    expect(dmjErrText(e)).toMatch(/ต่อเน็ตไม่ได้/);
  });

  it('timeout (AbortError) → บอกว่าเซิร์ฟเวอร์ตอบช้า', () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    expect(dmjErrText(e)).toMatch(/ตอบช้า/);
  });

  it('ไม่มี error เลย → ยังคืนข้อความ ไม่ใช่ undefined/ค่าว่าง', () => {
    expect(dmjErrText(null)).toBeTruthy();
    expect(dmjErrText(undefined)).toBeTruthy();
  });
});

// ── meta-test: กันโค้ดถอยกลับไปเป็นแบบที่ทำให้เกิดบั๊กนี้ ──────────────────────
describe('meta — จุดเชื่อมต่อในโค้ดจริง', () => {
  const syncFs = grab(
    VIEWS_MAIN,
    /async function syncFrontStoreData\(entries\) \{[\s\S]*?\n\}/,
    'syncFrontStoreData'
  );

  it('syncFrontStoreData ต้องอ่านคำตอบจริงด้วย dmjJson', () => {
    expect(syncFs).toContain('dmjJson');
  });

  it('syncFrontStoreData ต้องไม่คืน success:true แบบตายตัวโดยไม่เช็คคำตอบ', () => {
    // เดิมคือ `await dmjFetch(...); return { success: true };` → "บันทึกแล้ว" ทั้งที่ไม่ได้บันทึก
    expect(syncFs).toMatch(/d\.success\s*===\s*false/);
  });

  it('placeOrder (ปุ่มยืนยันสั่ง) ต้องไม่ parse ด้วย r.json() ดิบ ๆ', () => {
    const placeOrder = grab(VIEWS_MAIN, /const placeOrder = async \(\) => \{[\s\S]*?\n  \};/, 'placeOrder');
    expect(placeOrder).toContain('dmjJson');
    expect(placeOrder).not.toMatch(/\.then\(r => r\.json\(\)\)/);
  });

  it('placeOrder ต้องส่งชื่อสินค้าไปด้วย (handleOrder_ เขียนลงคอลัมน์ G ของชีตสั่งสินค้า)', () => {
    const placeOrder = grab(VIEWS_MAIN, /const placeOrder = async \(\) => \{[\s\S]*?\n  \};/, 'placeOrder');
    expect(placeOrder).toMatch(/name=\$\{encodeURIComponent\(product\.name/);
  });

  it('dmjJson/dmjErrText ต้องอยู่ใน ui.jsx (โหลดก่อนไฟล์ view ทุกตัว)', () => {
    expect(UI).toMatch(/async function dmjJson\(/);
    expect(UI).toMatch(/function dmjErrText\(/);
  });
});

// ── meta-test: ห้ามยิง updateFrontStore ซ้อนกัน ────────────────────────────────
// GAS ปฏิเสธ execution ที่ซ้อนกันด้วย "หน้า HTML" ไม่ใช่ JSON — ถ้า auto-save (debounce 2 วิ)
// กับปุ่มยืนยันสั่งยิงพร้อมกันเมื่อไหร่ บั๊ก "Unexpected token '<'" จะกลับมาทันที
describe('meta — OrderModal ต้องต่อคิวคำขอ ไม่ยิงขนาน', () => {
  const saveFs = grab(VIEWS_MAIN, /const saveFsQty = \(n\) => \{[\s\S]*?\n  \};/, 'saveFsQty');
  const placeOrder = grab(VIEWS_MAIN, /const placeOrder = async \(\) => \{[\s\S]*?\n  \};/, 'placeOrder');

  it('saveFsQty ต่อคิวกับงานที่ค้างอยู่ผ่าน fsInflightRef', () => {
    expect(saveFs).toMatch(/fsInflightRef\.current\s*\|\|\s*Promise\.resolve\(\)/);
    expect(saveFs).toMatch(/fsInflightRef\.current\s*=\s*p/);
  });

  it('saveFsQty ข้ามงานซ้ำเมื่อค่าถูกบันทึกไปแล้วระหว่างรอคิว', () => {
    expect(saveFs).toMatch(/fsSavedRef\.current === n/);
  });

  it('placeOrder ต้องรองานบันทึกหน้าร้านที่ค้างอยู่ก่อนยิง action=order', () => {
    expect(placeOrder).toMatch(/await fsInflightRef\.current/);
  });

  it('dmjJson เก็บ error ล่าสุดไว้ให้เจ้าของเปิดดูย้อนหลังได้', () => {
    expect(UI).toContain('dmj_last_backend_error');
  });
});

// ── meta-test: สั่งของต้องไม่ซ้ำ และต้องรู้ว่าสั่งไปแล้ว ──────────────────────
// อาการที่เจ้าของแจ้ง: "ไม่ขึ้นว่าสั่งแล้ว แต่ของถูกสั่ง" = GAS เขียนชีตเสร็จแล้วแต่ตอบ HTML
// → เว็บไม่รู้ว่าสำเร็จ · ห้ามแก้ด้วยการยิงซ้ำ (action=order ไม่ idempotent = สั่งซ้ำ 2 ใบ)
describe('meta — placeOrder ต้องเช็คชีต ไม่ใช่ยิงซ้ำ', () => {
  const placeOrder = grab(VIEWS_MAIN, /const placeOrder = async \(\) => \{[\s\S]*?\n  \};/, 'placeOrder');

  it('อ่านคำตอบไม่ได้ → ไปเช็คชีตว่าออเดอร์ลงไปแล้วหรือยัง', () => {
    expect(placeOrder).toMatch(/await verifyOrderLanded\(before\)/);
  });

  it('ห้ามมี loop ยิงซ้ำอัตโนมัติใน placeOrder (สั่งซ้ำ 2 ใบ)', () => {
    expect(placeOrder).not.toMatch(/for \(\s*(let|var)\s+attempt/);
  });

  it('verifyOrderLanded เทียบยอด "รอ" ที่เพิ่มขึ้น ไม่ parse วันที่ในชีต (ปี พ.ศ.)', () => {
    const verify = grab(VIEWS_MAIN, /const verifyOrderLanded = async \(before\) => \{[\s\S]*?\n  \};/, 'verifyOrderLanded');
    expect(verify).toMatch(/total >= before \+ qty/);
    expect(verify).not.toMatch(/new Date\(|parseCheckDateMs/);
  });
});

describe('meta — ป้าย "สั่งแล้ว" ต้องมาจากข้อมูลจริง และห้ามนับซ้ำ', () => {
  const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');

  it('app.jsx เปิดทาง _dmjRefetchOrders ให้ view เรียกหลังสั่งสำเร็จ', () => {
    expect(APP).toContain('window._dmjRefetchOrders = fetchOrdersOnly');
  });

  it('fetchOrdersOnly ประทับ ordersFetchedAt ทุกครั้งที่อัปเดต orders', () => {
    expect(APP).toMatch(/orders: d\.orders, ordersFetchedAt: Date\.now\(\)/);
  });

  it('fetchFromSheet ก็ประทับ ordersFetchedAt ด้วย (ไม่งั้น optimistic entry ค้างค้ำ)', () => {
    expect(APP).toMatch(/ordersFetchedAt: Date\.now\(\)[\s\S]{0,80}setData\(enriched\)/);
  });

  it('pendingOrderQtyMap ตัด optimistic entry ที่ชีตตามมาทันแล้ว (กันนับซ้ำ 2 เด้ง)', () => {
    const map = grab(VIEWS_MAIN, /const pendingOrderQtyMap = uM\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/, 'pendingOrderQtyMap');
    expect(map).toMatch(/o\.ts > fetchedAt/);
    expect(map).toMatch(/data\.ordersFetchedAt/);
  });

  it('onOrderSuccess ต้องประทับ ts ให้ optimistic entry (ไม่มี ts = ตัดไม่ได้)', () => {
    expect(VIEWS_MAIN).toMatch(/orderQty: qty, status:"รอ", ts: Date\.now\(\)/);
  });
});
