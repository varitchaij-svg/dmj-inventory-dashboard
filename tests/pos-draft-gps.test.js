// tests/pos-draft-gps.test.js — F08 (งานขายค้างหาย) + F09 (พิกัด/ข้อความหน้าลงเวลา)
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (รายงานตรวจระบบ 5 ก.ย. 2026 · ประเด็น F08 และ F09)
//
// F08 — `PosView` เก็บ cart/ลูกค้า/จัดส่งใน `useState` ล้วน และ App mount เฉพาะ activeTab
//       → เซลกรอกหลายสินค้าแล้วไปดูสต๊อกอีกแท็บ กลับมาต้องกรอกใหม่ทั้งใบ
//       เกณฑ์ปิดงาน: "เปลี่ยนแท็บ/รีโหลดได้ผลตามกติกาที่บอกผู้ใช้" +
//                    "ไม่มี draft ของคนก่อนหลงมาบนเครื่องกลาง"
//
// F09 — `doPunch` คอมเมนต์เขียนว่า "ขอพิกัดสด ณ ตอนกด" แต่โค้ดหยิบค่าที่ขอไว้ **ตอนเปิดหน้า**
//       มาใช้เลยเมื่อ state เป็น ok → ค้างหน้าไว้แล้วเดินไปอีกจุด ได้พิกัดของจุดเดิม
//       เกณฑ์ปิดงาน: "เปิดหน้าค้างแล้วเปลี่ยนตำแหน่งใช้ค่าตามอายุที่กำหนด" +
//                    "timeout แล้วแสดงรายการที่บันทึกจริงได้"
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const VATT = readFileSync(join(ROOT, 'views-attendance.jsx'), 'utf8');

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + what);
  return m[0];
}

// ── รันตัวจัดการ draft จริงจาก .jsx (ไม่ copy) กับ localStorage ปลอม ──
const DRAFT_SRC = [
  grab(VANA, /const LS_POS_DRAFT = "[^"]*";/, 'LS_POS_DRAFT'),
  grab(VANA, /const POS_DRAFT_TTL_MS = [^;]*;/, 'POS_DRAFT_TTL_MS'),
  grab(VANA, /function posDraftRead\(\) \{[\s\S]*?\n\}/, 'posDraftRead'),
  grab(VANA, /function posDraftWrite\(d\) \{[\s\S]*?\n\}/, 'posDraftWrite'),
  grab(VANA, /function posDraftClear\(\) \{[\s\S]*?\n\}/, 'posDraftClear'),
].join('\n\n');

function loadDraft(store) {
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  // eslint-disable-next-line no-new-func
  return new Function('localStorage',
    DRAFT_SRC + '\nreturn { posDraftRead, posDraftWrite, posDraftClear, LS_POS_DRAFT, POS_DRAFT_TTL_MS };')(localStorage);
}

describe('F08 — เก็บ/อ่านงานขายค้าง', () => {
  let store, D;
  beforeEach(() => { store = {}; D = loadDraft(store); });

  it('ไม่มีอะไรเก็บไว้ → คืน null', () => {
    expect(D.posDraftRead()).toBeNull();
  });

  it('เขียนแล้วอ่านกลับได้ครบ', () => {
    D.posDraftWrite({ at: Date.now(), cart: [{ sku: 'A1', qty: 2 }], cust: { name: 'ลูกค้า' } });
    const d = D.posDraftRead();
    expect(d.cart).toHaveLength(1);
    expect(d.cust.name).toBe('ลูกค้า');
  });

  it('ตะกร้าว่าง → ไม่นับเป็นงานค้าง (ไม่เสนอใบเปล่าให้กู้)', () => {
    D.posDraftWrite({ at: Date.now(), cart: [] });
    expect(D.posDraftRead()).toBeNull();
  });

  it('เกิน TTL (12 ชม. = คนละกะ) → ไม่เสนอ', () => {
    D.posDraftWrite({ at: Date.now() - (D.POS_DRAFT_TTL_MS + 1000), cart: [{ sku: 'A1' }] });
    expect(D.posDraftRead()).toBeNull();
  });

  it('ยังไม่เกิน TTL → เสนอ', () => {
    D.posDraftWrite({ at: Date.now() - (D.POS_DRAFT_TTL_MS - 60000), cart: [{ sku: 'A1' }] });
    expect(D.posDraftRead()).not.toBeNull();
  });

  it('JSON พัง / ไม่มี at / cart ไม่ใช่ array → คืน null ไม่ throw', () => {
    store[D.LS_POS_DRAFT] = '{ไม่ใช่ json';
    expect(D.posDraftRead()).toBeNull();
    D.posDraftWrite({ cart: [{ sku: 'A' }] });          // ไม่มี at
    expect(D.posDraftRead()).toBeNull();
    store[D.LS_POS_DRAFT] = JSON.stringify({ at: Date.now(), cart: 'ไม่ใช่ array' });
    expect(D.posDraftRead()).toBeNull();
  });

  it('clear ลบทิ้งจริง', () => {
    D.posDraftWrite({ at: Date.now(), cart: [{ sku: 'A1' }] });
    D.posDraftClear();
    expect(D.posDraftRead()).toBeNull();
  });

  it('localStorage โควตาเต็ม (setItem throw) → ไม่ทำให้ขายไม่ได้', () => {
    // eslint-disable-next-line no-new-func
    const T = new Function('localStorage',
      DRAFT_SRC + '\nreturn { posDraftWrite };')({ setItem: () => { throw new Error('quota'); } });
    expect(() => T.posDraftWrite({ at: Date.now(), cart: [{ sku: 'A' }] })).not.toThrow();
  });
});

describe('F08 — เกณฑ์ปิดงาน: ไม่มี draft ของคนก่อนหลงมาบนเครื่องกลาง', () => {
  const POS = grab(VANA, /function PosView\(\{ data, role \}\) \{[\s\S]*?\n\}\n\nfunction /, 'PosView');

  it('⚠️ ห้าม auto-restore — ต้องเก็บไว้ที่ draftOffer แล้วรอผู้ใช้กด', () => {
    expect(POS).toMatch(/const \[draftOffer, setDraftOffer\] = uS\(posDraftRead\);/);
    // ถ้ามีการยัดเข้า cart ตอน mount = กู้เอง → บิลของคนก่อนโผล่บนจอคนถัดไป
    expect(POS, 'ห้ามตั้งค่าเริ่มต้นของ cart จาก draft').not.toMatch(/uS\(\(\) => *\(posDraftRead\(\)/);
    expect(POS).toMatch(/const restoreDraft = \(\) => \{/);
    expect(POS).toMatch(/const discardDraft = \(\) => \{ posDraftClear\(\); setDraftOffer\(null\); \};/);
  });

  it('แบนเนอร์โชว์เฉพาะตอนตะกร้าว่าง + มีปุ่มกู้และปุ่มทิ้ง', () => {
    expect(POS).toMatch(/\{draftOffer && !cart\.length && \(/);
    expect(POS).toMatch(/onClick=\{restoreDraft\}/);
    expect(POS).toMatch(/onClick=\{discardDraft\}/);
    expect(POS).toContain('↩️ กู้บิลนี้');
    expect(POS).toContain('🗑️ ทิ้ง');
  });

  it('แบนเนอร์บอกจำนวนรายการ/เวลา/ชื่อคนกรอก (ตัดสินได้ว่าเป็นของตัวเองไหม)', () => {
    expect(POS).toMatch(/\(draftOffer\.cart \|\| \[\]\)\.length/);
    expect(POS).toMatch(/draftOffer\.at \? " · " \+ new Date\(draftOffer\.at\)/);
    expect(POS).toMatch(/draftOffer\.by \? " · โดย " \+ draftOffer\.by/);
    expect(POS).toContain('ยังไม่มีอะไรถูกบันทึก');
  });

  it('บันทึก draft ทุกครั้งที่ตะกร้า/ลูกค้า/จัดส่งเปลี่ยน · ตะกร้าว่าง = ลบทิ้ง', () => {
    const eff = grab(POS, /uE\(\(\) => \{\n    if \(result\) return;[\s\S]*?\n  \}, \[cart[^\]]*\]\);/, 'draft save effect');
    // ⚠️ ตะกร้าว่างทั้งที่ยังมี draftOffer = เพิ่งเปิดหน้า ยังไม่มีใครตัดสินใจ — ห้ามล้าง
    // (ล้างตรงนั้น = effect รอบ mount กินงานค้างทิ้งก่อนผู้ใช้ทันเห็นแบนเนอร์ด้วยซ้ำ)
    expect(eff).toContain('if (!cart.length) { if (!draftOffer) posDraftClear(); return; }');
    expect(eff).toContain('posDraftWrite({');
    ['cart', 'cust', 'ship', 'manualDiscount', 'saleMode', 'channel', 'payMethod'].forEach((k) => {
      expect(eff, 'ต้องเก็บ ' + k).toContain(k);
    });
  });

  it('⚠️ ตะกร้าว่างทั้งที่ยังมี draftOffer → ไม่ล้าง (กัน effect รอบ mount กินงานค้างทิ้ง)', () => {
    const POS2 = grab(VANA, /function PosView\(\{ data, role \}\) \{[\s\S]*?\n\}\n\nfunction /, 'PosView');
    const eff = grab(POS2, /uE\(\(\) => \{\n    if \(result\) return;[\s\S]*?\n  \}, \[cart[^\]]*\]\);/, 'draft save effect');
    expect(eff, 'ล้างทันทีตอนตะกร้าว่าง = เปลี่ยนแท็บกลับมาแล้วรีโหลด งานค้างหายเลย')
      .not.toMatch(/if \(!cart\.length\) \{ posDraftClear\(\); return; \}/);
    expect(eff).toMatch(/\[cart[^\]]*draftOffer\]/);   // ต้องอยู่ใน deps ไม่งั้นอ่านค่าค้าง
  });

  it('อยู่หน้าสรุปหลังออกบิล (result) → ไม่นับเป็นงานค้าง', () => {
    const eff = grab(POS, /uE\(\(\) => \{\n    if \(result\) return;[\s\S]*?\n  \}, \[cart[^\]]*\]\);/, 'draft save effect');
    expect(eff.indexOf('if (result) return;')).toBeGreaterThan(-1);
  });

  it('resetAll (ปิดบิลแล้ว) ล้าง draft ทิ้ง', () => {
    const fn = grab(VANA, /function resetAll\(\) \{[\s\S]*?\n  \}/, 'resetAll');
    expect(fn).toContain('posDraftClear();');
    expect(fn).toContain('setDraftOffer(null)');
  });

  it('⚠️ กู้โหมด/ช่องทาง/วิธีชำระเป็นชุดเดียวกัน (กู้ครึ่ง ๆ = "เงินสด" ค้างในโหมดออนไลน์)', () => {
    const fn = grab(POS, /const restoreDraft = \(\) => \{[\s\S]*?\n  \};/, 'restoreDraft');
    const i = fn.indexOf('setSaleMode(d.saleMode)');
    expect(i).toBeGreaterThan(-1);
    expect(fn.indexOf('setChannel(')).toBeGreaterThan(i);
    expect(fn.indexOf('setPayMethod(')).toBeGreaterThan(i);
    // ต้องอยู่ในเงื่อนไขเดียวกัน — ไม่กู้โหมดก็ต้องไม่กู้ช่องทาง
    expect(fn).toMatch(/if \(d\.saleMode === "online" \|\| d\.saleMode === "store"\) \{/);
  });
});

describe('F09 — พิกัดต้องสดพอ ตอนกดปุ่มลงเวลา', () => {
  const DOPUNCH = grab(VATT, /const doPunch = async \(type\) => \{[\s\S]*?\n  \};/, 'doPunch');

  it('attGetPosition ติดเวลาที่อ่านได้ (`at`) มาด้วย', () => {
    const fn = grab(VATT, /function attGetPosition\(timeoutMs\) \{[\s\S]*?\n\}/, 'attGetPosition');
    expect(fn).toMatch(/accuracy: p\.coords\.accuracy, at: Date\.now\(\)/);
  });

  it('มีเพดานอายุพิกัด และ doPunch ใช้ตัดสินจริง', () => {
    expect(VATT).toMatch(/const ATT_GPS_MAX_AGE_MS = /);
    expect(DOPUNCH).toMatch(/const fresh = gps\.state === "ok" && gps\.at && \(Date\.now\(\) - gps\.at\) <= ATT_GPS_MAX_AGE_MS;/);
    expect(DOPUNCH).toMatch(/const p = fresh \? gps : await attGetPosition\(8000\);/);
    // ของเดิม: ok = ใช้เลย ไม่ดูอายุ — ต้องไม่กลับมา
    expect(DOPUNCH).not.toMatch(/gps\.state === "ok" \? gps : await attGetPosition/);
  });

  it('ขอพิกัดใหม่แล้วอัปเดต state (จอบอกตรงกับที่ส่งไปจริง)', () => {
    expect(DOPUNCH).toMatch(/if \(!fresh && p\) setGps\(\{ state: "ok", \.\.\.p \}\)/);
  });

  it('หน้าจอเตือนเมื่อพิกัดที่ถืออยู่เก่ากว่าเพดาน', () => {
    expect(VATT).toMatch(/gps\.state === "ok" && gps\.at && \(clock\.getTime\(\) - gps\.at\) > ATT_GPS_MAX_AGE_MS/);
    expect(VATT).toContain('พิกัดนี้อ่านไว้เมื่อ');
  });

  it('เพดานอายุอยู่ในช่วงที่สมเหตุผล (30 วิ – 5 นาที)', () => {
    const m = VATT.match(/const ATT_GPS_MAX_AGE_MS = ([^;]+);/);
    // eslint-disable-next-line no-eval
    const v = eval(m[1]);
    expect(v).toBeGreaterThanOrEqual(30 * 1000);
    expect(v).toBeLessThanOrEqual(5 * 60 * 1000);
  });
});
